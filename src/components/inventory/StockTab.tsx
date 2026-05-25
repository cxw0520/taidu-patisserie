import React, { useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { deleteDoc, doc, setDoc, updateDoc, increment, collection, onSnapshot } from 'firebase/firestore';
import { Material, InventoryAdj, Purchase } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Target, CheckCircle2, AlertCircle, Save, Trash2, ArrowRightLeft, Edit2, X, LineChart, Package, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export default function StockTab({ materials, purchases, shopId }: { materials: Material[], purchases: Purchase[], shopId: string }) {
  const [activeView, setActiveView] = useState<'stock' | 'price'>('stock');
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [adjModal, setAdjModal] = useState<Material | null>(null);
  const [unitConvModal, setUnitConvModal] = useState<Material | null>(null);
  const [convData, setConvData] = useState<{ purchaseUnit: string; midUnit: string; unit: string; purchaseUnitRate: number | ''; midUnitRate: number | '' }>({ purchaseUnit: '', midUnit: '', unit: '', purchaseUnitRate: '', midUnitRate: '' });
  const [editingMinAlert, setEditingMinAlert] = useState<{ id: string; value: string } | null>(null);
  const [editingAvgCost, setEditingAvgCost] = useState<{ id: string; value: string } | null>(null);
  const [scrapModal, setScrapModal] = useState<Material | null>(null);
  const [scrapQty, setScrapQty] = useState<number | ''>('');

  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0, vendor: '', vendors: []
  });

  const [vendors, setVendors] = useState<{id: string, name: string}[]>([]);
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shops', shopId, 'vendors'), snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });
    return unsub;
  }, [shopId]);

  const [adjData, setAdjData] = useState({ actualQty: 0, reason: '', inputBig: 0, inputMid: 0, inputSmall: 0 });

  const getParts = (m: Material, stockAmt: number): {v: number, u: string}[] => {
    let printStock = Math.round(stockAmt * 100) / 100;
    const parts: {v: number, u: string}[] = [];
    if (m.purchaseUnit && m.purchaseUnitRate) {
       const b = Math.floor(printStock / m.purchaseUnitRate);
       if (b > 0) { parts.push({ v: b, u: m.purchaseUnit }); printStock = Math.round((printStock - b * m.purchaseUnitRate) * 100) / 100; }
    }
    if (m.midUnit && m.midUnitRate) {
       const c = Math.floor(printStock / m.midUnitRate);
       if (c > 0) { parts.push({ v: c, u: m.midUnit }); printStock = Math.round((printStock - c * m.midUnitRate) * 100) / 100; }
    }
    if (printStock > 0 || parts.length === 0) {
       parts.push({ v: printStock, u: m.unit });
    }
    return parts;
  };

  const formatStock = (m: Material, stockAmt: number) => {
    return getParts(m, stockAmt).map(p => `${fmt(p.v)} ${p.u}`).join(' ');
  };

  const totalInvValue = useMemo(() => {
    return materials.reduce((s, m) => s + (m.stock * m.avgCost), 0);
  }, [materials]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { '食材': 0, '包材': 0, '裝飾品': 0 };
    materials.forEach(m => {
      const cat = m.category || '食材';
      if (totals[cat] !== undefined) {
        totals[cat] += (m.stock || 0) * (m.avgCost || 0);
      } else {
        totals[cat] = (m.stock || 0) * (m.avgCost || 0);
      }
    });
    return totals;
  }, [materials]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newMaterial.id || uid();
    const payload = { ...newMaterial, id };
    if (payload.purchaseUnit && payload.midUnit && payload.purchaseUnitRate && payload.midUnitRate) {
       payload.purchaseUnitRate = payload.purchaseUnitRate * payload.midUnitRate;
    }
    await setDoc(doc(db, 'shops', shopId, 'materials', id), payload as Material, { merge: true });
    setIsAddingMode(false);
    setNewMaterial({ name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0, vendor: '', vendors: [] });
  };

  const openCreateMode = () => {
    setNewMaterial({ name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0, vendor: '', vendors: [] });
    setIsAddingMode(true);
  };

  const openEditMode = (m: Material) => {
    // Forward-compatibility: ensure vendors array exists
    const vendorsArray = m.vendors ? [...m.vendors] : (m.vendor ? [m.vendor] : []);
    setNewMaterial({ ...m, vendors: vendorsArray });
    setIsAddingMode(true);
  };

  const handleAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjModal) return;
    const diff = adjData.actualQty - adjModal.stock;
    const adjRecord: InventoryAdj = {
      id: uid(),
      date: new Date().toISOString().substring(0, 10),
      materialId: adjModal.id,
      systemQty: adjModal.stock,
      actualQty: adjData.actualQty,
      diffQty: diff,
      reason: adjData.reason
    };
    await setDoc(doc(db, 'shops', shopId, 'materials', adjModal.id), {
      ...adjModal,
      stock: adjData.actualQty
    });
    await setDoc(doc(db, 'shops', shopId, 'inventoryAdj', adjRecord.id), adjRecord);
    setAdjModal(null);
    setAdjData({ actualQty: 0, reason: '', inputBig: 0, inputMid: 0, inputSmall: 0 });
  };

  const handleDeleteMaterial = async (material: Material) => {
    const confirmed = confirm(`確定刪除品項「${material.name}」？此動作不可復原。`);
    if (!confirmed) return;
    await deleteDoc(doc(db, 'shops', shopId, 'materials', material.id));
  };

  const handleScrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapModal || scrapQty === '' || scrapQty <= 0) return;
    const newStock = Math.max(0, (scrapModal.stock || 0) - scrapQty);
    await setDoc(doc(db, 'shops', shopId, 'materials', scrapModal.id), { ...scrapModal, stock: newStock });
    setScrapModal(null);
    setScrapQty('');
  };

  const handleSaveConvRate = async () => {
    if (!unitConvModal) return;
    try {
      const payload: Partial<Material> = {
        purchaseUnit: convData.purchaseUnit || undefined,
        midUnit: convData.midUnit || undefined,
        unit: convData.unit || unitConvModal.unit,
        purchaseUnitRate: convData.purchaseUnitRate !== '' ? Number(convData.purchaseUnitRate) : undefined,
        midUnitRate: convData.midUnitRate !== '' ? Number(convData.midUnitRate) : undefined,
      };
      // When all 3 levels exist, purchaseUnitRate is entered as mid-units (e.g. 1箱=10罐).
      // We need to convert it to base units (e.g. 1箱=5000g) for consistent calculations.
      if (payload.purchaseUnit && payload.midUnit && payload.purchaseUnitRate && payload.midUnitRate) {
        payload.purchaseUnitRate = payload.purchaseUnitRate * payload.midUnitRate;
      }
      await setDoc(doc(db, 'shops', shopId, 'materials', unitConvModal.id), payload, { merge: true });
      setUnitConvModal(null);
    } catch (e) {
      console.error(e);
      alert('儲存失敗');
    }
  };

  const handleSaveMinAlert = async (material: Material, newValue: string) => {
    const parsed = parseFloat(newValue);
    if (!isFinite(parsed) || parsed < 0) return;
    await setDoc(doc(db, 'shops', shopId, 'materials', material.id), {
      ...material,
      minAlert: parsed,
    });
    setEditingMinAlert(null);
  };

  const handleSaveAvgCost = async (material: Material, newValue: string) => {
    const parsed = parseFloat(newValue);
    if (!isFinite(parsed) || parsed < 0) return;
    await setDoc(doc(db, 'shops', shopId, 'materials', material.id), {
      ...material,
      avgCost: parsed,
    });
    setEditingAvgCost(null);
  };

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">食材資料庫</h2>
          <p className="text-sm text-coffee-400">登錄原物料與包材，管理安全水位與監控價格異動。</p>
        </div>
        <div className="flex bg-coffee-50 p-1 rounded-xl shadow-inner">
          <button
            onClick={() => setActiveView('stock')}
            className={cn("px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all", activeView === 'stock' ? "bg-white text-coffee-800 shadow-sm" : "text-coffee-500 hover:text-coffee-700 hover:bg-coffee-100/50")}
          >
            <Package className="w-4 h-4" /> 庫存與單位設定
          </button>
          <button
            onClick={() => setActiveView('price')}
            className={cn("px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all", activeView === 'price' ? "bg-white text-coffee-800 shadow-sm" : "text-coffee-500 hover:text-coffee-700 hover:bg-coffee-100/50")}
          >
            <LineChart className="w-4 h-4" /> 單價異動監控
          </button>
        </div>
      </div>

      {activeView === 'stock' ? (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4 w-full">
            <div className="flex flex-wrap gap-2">
            <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-2xl px-4 py-1.5 text-right shadow-sm">
              <div className="text-[8px] font-extrabold text-emerald-600 uppercase tracking-widest">食材庫存價值</div>
              <div className="text-sm font-serif-brand font-bold text-emerald-800">${fmt(categoryTotals['食材'] || 0)}</div>
            </div>
            <div className="bg-sky-50/60 border border-sky-100/80 rounded-2xl px-4 py-1.5 text-right shadow-sm">
              <div className="text-[8px] font-extrabold text-sky-600 uppercase tracking-widest">包材庫存價值</div>
              <div className="text-sm font-serif-brand font-bold text-sky-800">${fmt(categoryTotals['包材'] || 0)}</div>
            </div>
            {(categoryTotals['裝飾品'] || 0) > 0 && (
              <div className="bg-amber-50/60 border border-amber-100/80 rounded-2xl px-4 py-1.5 text-right shadow-sm">
                <div className="text-[8px] font-extrabold text-amber-600 uppercase tracking-widest">裝飾品庫存價值</div>
                <div className="text-sm font-serif-brand font-bold text-amber-800">${fmt(categoryTotals['裝飾品'] || 0)}</div>
              </div>
            )}
            <div className="bg-coffee-50 border border-coffee-100 rounded-2xl px-5 py-1.5 text-right shadow-sm">
              <div className="text-[8px] font-extrabold text-coffee-400 uppercase tracking-widest">目前庫存總值</div>
              <div className="text-sm font-serif-brand font-bold text-coffee-800">${fmt(totalInvValue)}</div>
            </div>
          </div>
          <button
            onClick={isAddingMode ? () => setIsAddingMode(false) : openCreateMode}
            className="bg-coffee-600 text-white px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95 shrink-0 self-stretch sm:self-auto justify-center"
          >
            <Plus className="w-5 h-5" /> 新增材料
          </button>
        </div>

      <AnimatePresence>
        {isAddingMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsAddingMode(false)} 
              className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm"
            />
            
            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              className="glass-panel w-full max-w-2xl bg-white border-0 shadow-2xl rounded-[32px] overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <form onSubmit={handleAddSubmit} className="flex flex-col h-full overflow-hidden">
                <div className="bg-[#faf7f2]/50 border-b border-coffee-100 p-6 flex justify-between items-center">
                  <h3 className="font-bold text-coffee-850 text-xl flex items-center gap-2">
                    {newMaterial.id ? '📝 編輯材料資料' : '✨ 新增材料資料卡'}
                  </h3>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingMode(false)} 
                    className="p-2 text-coffee-400 hover:text-coffee-600 rounded-full hover:bg-coffee-50 transition-colors"
                  >
                    <X className="w-5 h-5"/>
                  </button>
                </div>
                
                <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
                  {/* 1. 基本資料 */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-coffee-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-coffee-500"></div>基本資訊
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-coffee-400 block mb-1">類別 *</label>
                        <select 
                          value={newMaterial.category} 
                          onChange={e => setNewMaterial({...newMaterial, category: e.target.value})} 
                          className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400 font-bold text-coffee-700"
                        >
                          <option value="食材">食材</option>
                          <option value="包材">包材</option>
                          <option value="裝飾品">裝飾品</option>
                          <option value="其他">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-coffee-400 block mb-1">所屬廠商 (可複選)</label>
                        <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-2 border border-coffee-200 rounded-xl bg-white">
                          {vendors.length === 0 && <span className="text-xs text-coffee-300 p-1">尚未建立廠商資料</span>}
                          {vendors.map(v => {
                            const isSelected = newMaterial.vendors?.includes(v.name) || newMaterial.vendor === v.name;
                            return (
                              <label key={v.id} className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border",
                                isSelected ? "bg-coffee-100 text-coffee-800 border-coffee-300" : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                              )}>
                                <input 
                                  type="checkbox" 
                                  className="hidden"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const currentVendors = [...(newMaterial.vendors || [])];
                                    if (newMaterial.vendor && !currentVendors.includes(newMaterial.vendor)) {
                                      currentVendors.push(newMaterial.vendor);
                                    }
                                    
                                    let nextVendors;
                                    if (e.target.checked) {
                                      nextVendors = [...new Set([...currentVendors, v.name])];
                                    } else {
                                      nextVendors = currentVendors.filter(name => name !== v.name);
                                    }
                                    setNewMaterial({ ...newMaterial, vendors: nextVendors, vendor: '' }); // Clear legacy vendor
                                  }} 
                                />
                                {isSelected && <CheckCircle2 className="w-3 h-3 text-coffee-600" />}
                                {v.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-coffee-400 block mb-1">材料名稱 *</label>
                        <input 
                          type="text" 
                          required 
                          value={newMaterial.name} 
                          onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} 
                          className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400 font-bold text-coffee-800" 
                          placeholder="例如: 麵粉" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. 單位設定 */}
                  <div className="space-y-3 p-4 bg-coffee-50/30 rounded-2xl border border-coffee-100/50">
                    <h4 className="text-sm font-bold text-coffee-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-coffee-500"></div>單位換算設定 (由小到大填寫)
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Level 1 */}
                      <div className="space-y-2 relative">
                        <label className="text-[10px] font-bold text-coffee-600 bg-coffee-100 px-2 py-0.5 rounded-md inline-block">第一層：基本單位 *</label>
                        <input 
                          type="text" 
                          required 
                          value={newMaterial.unit} 
                          onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} 
                          className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400 font-bold text-coffee-800" 
                          placeholder="例如: g" 
                        />
                      </div>

                      {/* Level 2 */}
                      <div className="space-y-2 relative">
                        <label className="text-[10px] font-bold text-coffee-500 bg-coffee-50 px-2 py-0.5 rounded-md inline-block">第二層：中單位 (選填)</label>
                        <input 
                          type="text" 
                          value={newMaterial.midUnit || ''} 
                          onChange={e => setNewMaterial({...newMaterial, midUnit: e.target.value})} 
                          className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400 font-bold text-coffee-800" 
                          placeholder="例如: 罐" 
                        />
                        {newMaterial.midUnit && (
                          <div className="mt-2 text-xs font-bold text-coffee-600 bg-white/60 p-1.5 rounded-lg border border-coffee-50 inline-block w-full">
                            1 {newMaterial.midUnit} = 
                            <input 
                              type="number" 
                              step="0.001" 
                              min="0.001" 
                              required 
                              value={newMaterial.midUnitRate || ''} 
                              onChange={e => setNewMaterial({...newMaterial, midUnitRate: parseFloat(e.target.value) || undefined})} 
                              className="w-16 mx-2 border-b border-coffee-300 outline-none text-center bg-transparent focus:border-coffee-650 font-bold" 
                              placeholder="?" 
                            />
                            {newMaterial.unit}
                          </div>
                        )}
                      </div>

                      {/* Level 3 */}
                      <div className="space-y-2 relative">
                        <label className="text-[10px] font-bold text-coffee-500 bg-coffee-50 px-2 py-0.5 rounded-md inline-block">第三層：大單位 (選填)</label>
                        <input 
                          type="text" 
                          value={newMaterial.purchaseUnit || ''} 
                          onChange={e => setNewMaterial({...newMaterial, purchaseUnit: e.target.value})} 
                          className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400 font-bold text-coffee-800" 
                          placeholder="例如: 箱" 
                        />
                        {newMaterial.purchaseUnit && (
                          <div className="mt-2 text-xs font-bold text-coffee-600 bg-white/60 p-1.5 rounded-lg border border-coffee-50 inline-block w-full">
                            1 {newMaterial.purchaseUnit} = 
                            <input 
                              type="number" 
                              step="0.001" 
                              min="0.001" 
                              required 
                              value={newMaterial.purchaseUnitRate || ''} 
                              onChange={e => setNewMaterial({...newMaterial, purchaseUnitRate: parseFloat(e.target.value) || undefined})} 
                              className="w-16 mx-2 border-b border-coffee-300 outline-none text-center bg-transparent focus:border-coffee-650 font-bold" 
                              placeholder="?" 
                            />
                            {newMaterial.midUnit ? newMaterial.midUnit : newMaterial.unit}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {newMaterial.purchaseUnit && newMaterial.midUnit && newMaterial.purchaseUnitRate && newMaterial.midUnitRate && (
                      <div className="text-xs text-mint-750 font-bold bg-mint-50/50 p-2.5 rounded-xl border border-mint-100 mt-2">
                         ↳ 換算總結：1 {newMaterial.purchaseUnit} = {newMaterial.purchaseUnitRate * newMaterial.midUnitRate} {newMaterial.unit}
                      </div>
                    )}
                  </div>

                  {/* 3. 庫存與警示 */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-coffee-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-coffee-500"></div>庫存與提醒設定
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-coffee-400 block mb-1">目前庫存 (選填，直接輸入小單位總數)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="0.01" 
                            value={newMaterial.stock || ''} 
                            onChange={e => setNewMaterial({...newMaterial, stock: parseFloat(e.target.value) || 0})} 
                            className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 pr-12 outline-none focus:border-coffee-400 font-bold font-mono text-coffee-800" 
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-coffee-500 font-bold">{newMaterial.unit || '單位'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-amber-500 block mb-1">最低提醒水位 (以最大單位計算) *</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            required 
                            step="0.01" 
                            min="0" 
                            value={newMaterial.minAlert ?? 0} 
                            onChange={e => setNewMaterial({...newMaterial, minAlert: parseFloat(e.target.value) || 0})} 
                            className="w-full bg-white border border-amber-250 rounded-xl px-4 py-2 pr-12 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 font-bold font-mono text-amber-800" 
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-amber-600 font-bold">{newMaterial.purchaseUnit || newMaterial.midUnit || newMaterial.unit || '單位'}</span>
                        </div>
                        <p className="text-[10px] text-coffee-400 mt-1">例如設定為 2，代表低於 2 {newMaterial.purchaseUnit || newMaterial.midUnit || newMaterial.unit} 時會自動觸發低庫存警告。</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-coffee-100 bg-[#faf7f2]/30 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsAddingMode(false)} 
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-all"
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-coffee-800 text-white rounded-xl py-3 font-bold hover:bg-coffee-900 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                  >
                    <CheckCircle2 className="w-5 h-5"/> 儲存材料資料
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="rounded-[32px] overflow-hidden border border-coffee-50 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm text-left">
            <thead className="bg-[#faf7f2]">
              <tr className="text-coffee-400 font-bold uppercase tracking-wider text-xs border-b border-coffee-100">
                <th className="py-4 px-6">狀態</th>
                <th className="py-4 px-6">名稱</th>
                <th className="py-4 px-6">類別</th>
                <th className="py-4 px-6 text-right">目前庫存</th>
                <th className="py-4 px-6 text-right">單位成本</th>
                <th className="py-4 px-6 text-center">最低庫存量</th>
                <th className="py-4 px-6 text-right">資產總值</th>
                <th className="py-4 px-6 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-50">
              {[...materials].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map(m => {
                const maxRate = m.purchaseUnitRate || m.midUnitRate || 1;
                const maxUnit = m.purchaseUnit || m.midUnit || m.unit;
                const isLow = m.stock <= m.minAlert * maxRate;
                const hasMismatch = m.purchaseUnit && m.purchaseUnit !== m.unit && !m.purchaseUnitRate;

                const currParts = getParts(m, m.stock);

                return (
                  <tr key={m.id} className="hover:bg-coffee-50/50 transition">
                    <td className="py-4 px-6">
                      {isLow ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-danger-brand bg-danger-brand/10 px-2 py-1 rounded-full w-fit">
                          <AlertCircle className="w-3 h-3" /> 庫存即將不足
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-mint-brand bg-mint-brand/10 px-2 py-1 rounded-full w-fit">
                          <CheckCircle2 className="w-3 h-3" /> 存量健康
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-bold text-coffee-800 text-base">
                      {m.vendors && m.vendors.length > 0 ? (
                        <span className="text-coffee-400 font-normal mr-1 text-sm">[{m.vendors.join(', ')}]</span>
                      ) : m.vendor ? (
                        <span className="text-coffee-400 font-normal mr-1 text-sm">[{m.vendor}]</span>
                      ) : null}
                      {m.name}
                    </td>
                    <td className="py-4 px-6"><span className="text-xs font-bold text-coffee-500 bg-coffee-100 px-2 py-1 rounded-lg">{m.category}</span></td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-serif-brand font-bold text-lg text-coffee-900">
                          {currParts.map((p, i) => (
                            <React.Fragment key={i}>
                              {fmt(p.v)}
                              <span className={cn("text-xs font-sans font-medium text-coffee-400 ml-0.5", i < currParts.length - 1 ? "mr-1.5" : "")}>{p.u}</span>
                            </React.Fragment>
                          ))}
                        </span>
                        {(m.purchaseUnit || m.midUnit) && (
                          <span className="text-[10px] text-coffee-300">總數 {fmt(m.stock)}{m.unit}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {editingAvgCost?.id === m.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-coffee-400 text-xs font-bold">$</span>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={editingAvgCost.value}
                              onChange={e => setEditingAvgCost({ id: m.id, value: e.target.value })}
                              onBlur={() => handleSaveAvgCost(m, editingAvgCost.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveAvgCost(m, editingAvgCost.value);
                                if (e.key === 'Escape') setEditingAvgCost(null);
                              }}
                              autoFocus
                              className="w-24 text-right border-b-2 border-rose-brand bg-transparent outline-none font-serif-brand font-bold text-coffee-800"
                            />
                            <span className="text-xs text-coffee-400">/{m.unit}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingAvgCost({ id: m.id, value: String(m.avgCost) })}
                            className="group font-serif-brand font-bold text-coffee-500 hover:text-coffee-800 transition flex items-center gap-1"
                            title="點擊手動修正單位成本"
                          >
                            ${fmt(m.avgCost)}<span className="text-xs font-sans text-coffee-300">/{m.unit}</span>
                            <Edit2 className="w-3 h-3 text-coffee-300 group-hover:text-rose-brand transition opacity-0 group-hover:opacity-100" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setUnitConvModal(m);
                            // When 3-level units exist, purchaseUnitRate in DB is already
                            // multiplied by midUnitRate (e.g. 5000g). Reverse it for display
                            // so user sees intuitive value (e.g. 10 罐).
                            const displayPurchaseRate = (m.purchaseUnitRate && m.midUnit && m.midUnitRate)
                              ? m.purchaseUnitRate / m.midUnitRate
                              : (m.purchaseUnitRate || '');
                            setConvData({
                              purchaseUnit: m.purchaseUnit || '',
                              midUnit: m.midUnit || '',
                              unit: m.unit || '',
                              purchaseUnitRate: displayPurchaseRate,
                              midUnitRate: m.midUnitRate || ''
                            });
                          }}
                          className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors whitespace-nowrap mt-1", hasMismatch ? "text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100" : "text-coffee-400 bg-coffee-50 border border-coffee-100 hover:bg-coffee-100")}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          {hasMismatch ? `單位不一致，點擊設定` : `單位換算與設定`}
                        </button>
                      </div>
                    </td>
                    {/* Editable min alert */}
                    <td className="py-4 px-6 text-center">
                      {editingMinAlert?.id === m.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingMinAlert.value}
                            onChange={e => setEditingMinAlert({ id: m.id, value: e.target.value })}
                            onBlur={() => handleSaveMinAlert(m, editingMinAlert.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveMinAlert(m, editingMinAlert.value);
                              if (e.key === 'Escape') setEditingMinAlert(null);
                            }}
                            autoFocus
                            className="w-20 text-center border-b-2 border-coffee-400 bg-transparent outline-none font-serif-brand font-bold text-coffee-800"
                          />
                          <span className="text-xs text-coffee-400">{maxUnit}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingMinAlert({ id: m.id, value: String(m.minAlert) })}
                          className="group inline-flex items-center gap-1.5 font-serif-brand font-bold text-coffee-600 hover:text-coffee-800 transition"
                          title="點擊編輯最低庫存量"
                        >
                          {fmt(m.minAlert)} <span className="text-xs font-sans font-medium text-coffee-400">{maxUnit}</span>
                          <Edit2 className="w-3 h-3 text-coffee-300 group-hover:text-coffee-500 transition opacity-0 group-hover:opacity-100" />
                        </button>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right font-serif-brand font-bold text-mint-brand text-lg">${fmt(m.stock * m.avgCost)}</td>
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex gap-2 flex-wrap justify-center">
                        <button
                          onClick={() => { 
                            let initialBig = 0;
                            let initialMid = 0;
                            let initialSmall = Math.round(m.stock * 100) / 100;

                            if (m.purchaseUnit && m.purchaseUnitRate) {
                              initialBig = Math.floor(initialSmall / m.purchaseUnitRate);
                              initialSmall = Math.round((initialSmall - initialBig * m.purchaseUnitRate) * 100) / 100;
                            }
                            if (m.midUnit && m.midUnitRate) {
                              initialMid = Math.floor(initialSmall / m.midUnitRate);
                              initialSmall = Math.round((initialSmall - initialMid * m.midUnitRate) * 100) / 100;
                            }

                            setAdjModal(m); 
                            setAdjData({ 
                              actualQty: m.stock, 
                              reason: '',
                              inputBig: initialBig,
                              inputMid: initialMid,
                              inputSmall: initialSmall
                            });  
                          }}
                          className="px-4 py-1.5 bg-coffee-100 text-coffee-600 rounded-full text-xs font-bold hover:bg-coffee-200 transition-colors inline-flex items-center gap-1"
                        >
                          <Target className="w-3 h-3" /> 庫存盤點
                        </button>
                        {m.category === '包材' && (
                          <button
                            onClick={() => { setScrapModal(m); setScrapQty(''); }}
                            className="px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold hover:bg-amber-200 transition-colors inline-flex items-center gap-1"
                          >
                            🗑️ 報廢
                          </button>
                        )}
                        <button
                          onClick={() => openEditMode(m)}
                          className="px-3 py-1.5 bg-coffee-100 text-coffee-700 rounded-full text-xs font-bold hover:bg-coffee-200 transition-colors inline-flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" /> 編輯
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(m)}
                          className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-full text-xs font-bold hover:bg-rose-200 transition-colors inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> 刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-coffee-300 font-bold">尚無材料資料，點擊「新增材料」開始登錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Adjustment Modal */}
      <AnimatePresence>
        {adjModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdjModal(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-md bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold font-serif-brand text-coffee-800">輸入盤點資料</h3>
                <p className="text-sm font-bold text-coffee-400 mt-1">{adjModal.name} ({adjModal.category})</p>
              </div>

              <form onSubmit={handleAdjSubmit} className="space-y-4">
                <div className="p-4 bg-coffee-50 border border-coffee-100 rounded-2xl flex justify-between items-center">
                  <span className="text-xs font-bold text-coffee-400">系統紀錄餘額</span>
                  <span className="font-serif-brand font-bold text-lg text-coffee-800">
                    {formatStock(adjModal, adjModal.stock)}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-coffee-500 mb-1 block">實際盤點輸入</label>
                  <div className="flex flex-wrap items-center gap-2 bg-white border border-coffee-200 rounded-xl px-3 py-2">
                    {adjModal.purchaseUnit && adjModal.purchaseUnitRate && (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" min="0" value={adjData.inputBig === 0 ? '' : adjData.inputBig} onChange={e => {
                          const b = parseFloat(e.target.value) || 0;
                          const newActualQty = b * adjModal.purchaseUnitRate! + adjData.inputMid * (adjModal.midUnitRate || 0) + adjData.inputSmall;
                          setAdjData(p => ({...p, inputBig: b, actualQty: Math.round(newActualQty * 100) / 100}));
                        }} className="w-16 bg-transparent font-serif-brand font-bold text-lg text-rose-brand outline-none text-right" placeholder="0" />
                        <span className="text-coffee-600 font-bold">{adjModal.purchaseUnit}</span>
                        <span className="text-coffee-300 mx-1">+</span>
                      </div>
                    )}
                    {adjModal.midUnit && adjModal.midUnitRate && (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" min="0" value={adjData.inputMid === 0 ? '' : adjData.inputMid} onChange={e => {
                          const mValue = parseFloat(e.target.value) || 0;
                          const newActualQty = adjData.inputBig * (adjModal.purchaseUnitRate || 0) + mValue * adjModal.midUnitRate! + adjData.inputSmall;
                          setAdjData(p => ({...p, inputMid: mValue, actualQty: Math.round(newActualQty * 100) / 100}));
                        }} className="w-16 bg-transparent font-serif-brand font-bold text-lg text-rose-brand outline-none text-right" placeholder="0" />
                        <span className="text-coffee-600 font-bold">{adjModal.midUnit}</span>
                        <span className="text-coffee-300 mx-1">+</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <input type="number" step="0.01" min="0" value={adjData.inputSmall === 0 && adjData.actualQty !== 0 ? '' : adjData.inputSmall} onChange={e => {
                        const s = parseFloat(e.target.value) || 0;
                        const newActualQty = adjData.inputBig * (adjModal.purchaseUnitRate || 0) + adjData.inputMid * (adjModal.midUnitRate || 0) + s;
                        setAdjData(p => ({...p, inputSmall: s, actualQty: Math.round(newActualQty * 100) / 100}));
                      }} className="w-16 bg-transparent font-serif-brand font-bold text-lg text-rose-brand outline-none text-right" placeholder="0" />
                      <span className="text-coffee-600 font-bold">{adjModal.unit}</span>
                    </div>
                  </div>
                  
                  <div className="text-right mt-2 text-xs text-coffee-500 font-bold">
                    = 總計 {fmt(adjData.actualQty)} {adjModal.unit}
                    <span className="text-mint-brand ml-2">({formatStock(adjModal, adjData.actualQty)})</span>
                  </div>
                </div>

                <div className="py-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-coffee-400">差異量</span>
                  <span className={cn("font-serif-brand font-bold", (adjData.actualQty - adjModal.stock) >= 0 ? "text-mint-brand" : "text-rose-brand")}>
                    {(adjData.actualQty - adjModal.stock) >= 0 ? '+' : ''}{fmt(adjData.actualQty - adjModal.stock)} {adjModal.unit}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-coffee-500 mb-1 block">盤盈/盤虧原因</label>
                  <input type="text" required placeholder="例如: 消耗紀錄遺漏/自然損耗" value={adjData.reason} onChange={e => setAdjData({...adjData, reason: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-coffee-400" />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setAdjModal(null)} className="flex-1 py-3 bg-coffee-100 text-coffee-600 rounded-xl font-bold hover:bg-coffee-200">取消</button>
                  <button type="submit" className="flex-1 py-3 bg-coffee-800 text-white rounded-xl font-bold hover:bg-coffee-900 hover:shadow-lg active:scale-95 transition-all">儲存盤點結果</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unit Conversion Modal */}
      <AnimatePresence>
        {unitConvModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setUnitConvModal(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-sm bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-amber-500" /> 單位階層設定
                  </h3>
                  <p className="text-sm text-coffee-400 mt-1">變更「{unitConvModal.name}」的換算</p>
                </div>
                <button onClick={() => setUnitConvModal(null)} className="p-1.5 rounded-full bg-coffee-100 text-coffee-500 hover:bg-coffee-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] text-coffee-400 font-bold mb-1 block">1. 採購單位 (最大, 如: 箱)</label>
                     <input type="text" value={convData.purchaseUnit} onChange={e => setConvData({...convData, purchaseUnit: e.target.value})} className="w-full bg-coffee-50 border border-coffee-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-coffee-400" />
                   </div>
                   <div>
                     <label className="text-[10px] text-coffee-400 font-bold mb-1 block">換算比例 1 (往下層計算)</label>
                     <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-coffee-400 text-xs font-bold">1 =</span>
                       <input type="number" step="0.01" value={convData.purchaseUnitRate === 0 ? '' : convData.purchaseUnitRate} onChange={e => setConvData({...convData, purchaseUnitRate: parseFloat(e.target.value) || ''})} className="w-full pl-10 bg-white border border-coffee-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-coffee-400 font-mono font-bold" />
                     </div>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] text-coffee-400 font-bold mb-1 block">2. 中單位 (第二層, 如: 罐)</label>
                     <input type="text" value={convData.midUnit} onChange={e => setConvData({...convData, midUnit: e.target.value})} className="w-full bg-coffee-50 border border-coffee-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-coffee-400" />
                   </div>
                   <div>
                     <label className="text-[10px] text-coffee-400 font-bold mb-1 block">換算比例 2 (到基本單位)</label>
                     <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-coffee-400 text-xs font-bold">1 =</span>
                       <input type="number" step="0.01" value={convData.midUnitRate === 0 ? '' : convData.midUnitRate} onChange={e => setConvData({...convData, midUnitRate: parseFloat(e.target.value) || ''})} className="w-full pl-10 bg-white border border-coffee-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-coffee-400 font-mono font-bold" />
                     </div>
                   </div>
                 </div>

                 <div>
                   <label className="text-[10px] text-coffee-400 font-bold mb-1 block">3. 基本單位 (最小計算層級, 如: g)</label>
                   <input type="text" value={convData.unit} onChange={e => setConvData({...convData, unit: e.target.value})} className="w-full bg-coffee-50 border border-coffee-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-coffee-400" />
                 </div>
              </div>

              {/* Live preview */}
              {(convData.purchaseUnit || convData.midUnit) && convData.unit && (
                <div className="p-3 bg-mint-brand/10 border border-mint-brand/30 rounded-2xl text-xs font-bold text-mint-brand text-center leading-relaxed">
                  {convData.purchaseUnit && convData.purchaseUnitRate !== '' && convData.midUnit && convData.midUnitRate !== '' ? (
                    <>1 {convData.purchaseUnit} = {convData.purchaseUnitRate} {convData.midUnit} = {Number(convData.purchaseUnitRate) * Number(convData.midUnitRate)} {convData.unit}</>
                  ) : convData.purchaseUnit && convData.purchaseUnitRate !== '' ? (
                    <>1 {convData.purchaseUnit} = {convData.purchaseUnitRate} {convData.unit}</>
                  ) : convData.midUnit && convData.midUnitRate !== '' ? (
                    <>1 {convData.midUnit} = {convData.midUnitRate} {convData.unit}</>
                  ) : null}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setUnitConvModal(null)} className="flex-1 py-3 bg-coffee-100 text-coffee-600 rounded-xl font-bold hover:bg-coffee-200 transition">取消</button>
                <button onClick={handleSaveConvRate} className="flex-1 py-3 bg-coffee-800 text-white rounded-xl font-bold hover:bg-coffee-900 transition active:scale-95 shadow-md">
                  儲存換算設定
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Scrap Modal */}
      <AnimatePresence>
        {scrapModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setScrapModal(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-md bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold font-serif-brand text-coffee-800">🗑️ 包材報廢登記</h3>
                <p className="text-sm font-bold text-coffee-400 mt-1">{scrapModal.name} — 目前庫存: {fmt(scrapModal.stock)} {scrapModal.unit}</p>
              </div>
              <form onSubmit={handleScrapSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-coffee-500 mb-2 block">報廢數量 ({scrapModal.unit})</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={scrapQty}
                      onChange={e => setScrapQty(parseFloat(e.target.value) || '')}
                      className="w-full bg-white border-2 border-amber-200 rounded-xl px-4 py-3 font-bold text-coffee-800 outline-none focus:border-amber-500 pr-16"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-coffee-400">{scrapModal.unit}</span>
                  </div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs font-bold text-amber-700">
                  報廢後剩餘庫存: {fmt(Math.max(0, (scrapModal.stock || 0) - (Number(scrapQty) || 0)))} {scrapModal.unit}
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setScrapModal(null)} className="flex-1 py-3 bg-coffee-100 text-coffee-600 rounded-xl font-bold hover:bg-coffee-200">取消</button>
                  <button type="submit" className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition active:scale-95 shadow-md">確定報廢</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      ) : (
        <MaterialPriceMonitor materials={materials} purchases={purchases} />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 單價異動監控子視圖 (MaterialPriceMonitor)
// -------------------------------------------------------------
function MaterialPriceMonitor({ materials, purchases }: { materials: Material[], purchases: Purchase[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatId, setSelectedMatId] = useState<string | null>(null);

  // 整理每個食材的進貨紀錄
  const matHistory = useMemo(() => {
    const history: Record<string, { date: string, vendor: string, qty: number, amount: number, unitPrice: number }[]> = {};
    materials.forEach(m => history[m.id] = []);

    purchases.forEach(p => {
      p.lines.forEach(l => {
        if (!l.materialId || !history[l.materialId]) return;
        
        let normalizedQty = l.qty;
        const mat = materials.find(m => m.id === l.materialId);
        if (mat) {
          if (l.unit === mat.purchaseUnit && mat.purchaseUnitRate) {
            normalizedQty = l.qty * mat.purchaseUnitRate;
          } else if (l.unit === mat.midUnit && mat.midUnitRate) {
            normalizedQty = l.qty * mat.midUnitRate;
          }
        }
        
        const uPrice = normalizedQty > 0 ? l.amount / normalizedQty : 0;
        
        history[l.materialId].push({
          date: p.date,
          vendor: p.vendor,
          qty: l.qty, // 原進貨數量
          amount: l.amount,
          unitPrice: uPrice // 標準化(最小單位)單價
        });
      });
    });

    // 依日期降冪排序
    Object.keys(history).forEach(k => {
      history[k].sort((a, b) => b.date.localeCompare(a.date));
    });

    return history;
  }, [purchases, materials]);

  const displayMats = useMemo(() => {
    let list = materials;
    if (searchTerm) {
      list = list.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [materials, searchTerm]);

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full min-h-[600px] animate-fade-in">
      <div className="w-full md:w-1/3 bg-white/60 border border-coffee-100 rounded-2xl flex flex-col overflow-hidden shadow-sm h-[600px]">
        <div className="p-4 border-b border-coffee-100 bg-white/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-400" />
            <input 
              type="text" 
              placeholder="搜尋食材名稱..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-coffee-200 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-coffee-400 font-bold text-coffee-800"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {displayMats.map(m => {
            const hist = matHistory[m.id] || [];
            const hasData = hist.length > 0;
            const latest = hist[0];
            const prev = hist.find(h => h.date !== latest?.date && h.unitPrice !== latest?.unitPrice); // 找前一個不同單價的紀錄
            
            let diff = 0;
            let diffPercent = 0;
            if (latest && prev) {
              diff = latest.unitPrice - prev.unitPrice;
              diffPercent = (diff / prev.unitPrice) * 100;
            }

            return (
              <button
                key={m.id}
                onClick={() => setSelectedMatId(m.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl transition-all flex justify-between items-center",
                  selectedMatId === m.id ? "bg-coffee-100/80 shadow-sm border border-coffee-200" : "hover:bg-coffee-50 border border-transparent"
                )}
              >
                <div>
                  <div className="font-bold text-coffee-800 text-sm">{m.name}</div>
                  <div className="text-xs text-coffee-400 mt-1 font-bold">
                    {hasData ? `最後進貨: ${latest.date}` : '尚無進貨紀錄'}
                  </div>
                </div>
                {hasData && (
                  <div className="text-right">
                    <div className="font-mono font-bold text-coffee-800">${fmt(latest.unitPrice)}<span className="text-[10px] text-coffee-400">/{m.unit}</span></div>
                    {diff !== 0 && (
                      <div className={cn("text-[10px] font-bold mt-0.5", diff > 0 ? "text-danger-brand" : "text-mint-600")}>
                        {diff > 0 ? '🔴 +' : '🟢 '}{Math.abs(diffPercent).toFixed(1)}%
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="w-full md:w-2/3 bg-white/60 border border-coffee-100 rounded-2xl flex flex-col p-6 shadow-sm h-[600px] overflow-y-auto custom-scrollbar">
        {!selectedMatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-coffee-300">
            <LineChart className="w-12 h-12 mb-3 opacity-20" />
            <span className="font-bold text-sm">請從左側選擇食材以查看歷史價格異動</span>
          </div>
        ) : (
          <PriceDetails mat={materials.find(m => m.id === selectedMatId)!} history={matHistory[selectedMatId] || []} />
        )}
      </div>
    </div>
  );
}

function PriceDetails({ mat, history }: { mat: Material, history: any[] }) {
  if (history.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-coffee-300 h-full">
        <span className="font-bold">尚無進貨紀錄</span>
      </div>
    );
  }

  // 整理廠商比價資訊
  const vendorPrices: Record<string, { lastDate: string, lastPrice: number }> = {};
  history.forEach(h => {
    if (!vendorPrices[h.vendor]) {
      vendorPrices[h.vendor] = { lastDate: h.date, lastPrice: h.unitPrice };
    }
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border-b border-coffee-100 pb-4">
        <h3 className="text-2xl font-bold text-coffee-900">{mat.name}</h3>
        <p className="text-sm font-bold text-coffee-500 mt-1">基本單位：{mat.unit}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#faf7f2] p-5 rounded-2xl border border-coffee-100 shadow-sm">
          <h4 className="text-xs font-extrabold text-coffee-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-coffee-400"></div>
            歷史進貨明細
          </h4>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-coffee-50">
                <div>
                  <div className="font-bold text-coffee-700">{h.date}</div>
                  <div className="text-[10px] font-bold text-coffee-400">{h.vendor}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-coffee-900 text-base">${fmt(h.unitPrice)}<span className="text-coffee-400 text-[10px]">/{mat.unit}</span></div>
                  <div className="text-[10px] font-bold text-coffee-400 mt-0.5">總額 ${fmt(h.amount)} / 數量 {fmt(h.qty)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#faf7f2] p-5 rounded-2xl border border-coffee-100 shadow-sm self-start">
          <h4 className="text-xs font-extrabold text-coffee-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-coffee-400"></div>
            各廠商最後進貨單價
          </h4>
          <div className="space-y-3">
            {Object.entries(vendorPrices).map(([vendor, data]) => (
              <div key={vendor} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-coffee-50 shadow-sm">
                <div>
                  <div className="font-bold text-coffee-700">{vendor}</div>
                  <div className="text-[10px] font-bold text-coffee-400">最後進貨: {data.lastDate}</div>
                </div>
                <div className="font-mono font-bold text-rose-brand text-base">
                  ${fmt(data.lastPrice)}<span className="text-coffee-400 text-[10px]">/{mat.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
