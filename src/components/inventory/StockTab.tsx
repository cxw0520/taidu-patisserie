import React, { useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Material, InventoryAdj } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Target, CheckCircle2, AlertCircle, Save, Trash2, ArrowRightLeft, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface UnitConvModal {
  material: Material;
  purchaseUnit: string;
}

export default function StockTab({ materials, shopId }: { materials: Material[], shopId: string }) {
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [adjModal, setAdjModal] = useState<Material | null>(null);
  const [unitConvModal, setUnitConvModal] = useState<UnitConvModal | null>(null);
  const [convRate, setConvRate] = useState<number | ''>('');
  const [editingMinAlert, setEditingMinAlert] = useState<{ id: string; value: string } | null>(null);

  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0
  });

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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    const payload = { ...newMaterial, id };
    if (payload.purchaseUnit && payload.midUnit && payload.purchaseUnitRate && payload.midUnitRate) {
       payload.purchaseUnitRate = payload.purchaseUnitRate * payload.midUnitRate;
    }
    await setDoc(doc(db, 'shops', shopId, 'materials', id), payload as Material);
    setIsAddingMode(false);
    setNewMaterial({ name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0 });
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
    setAdjData({ actualQty: 0, reason: '' });
  };

  const handleDeleteMaterial = async (material: Material) => {
    const confirmed = confirm(`確定刪除品項「${material.name}」？此動作不可復原。`);
    if (!confirmed) return;
    await deleteDoc(doc(db, 'shops', shopId, 'materials', material.id));
  };

  const handleSaveConvRate = async () => {
    if (!unitConvModal || convRate === '' || convRate <= 0) return alert('請填寫有效的換算比例');
    const mat = unitConvModal.material;
    await setDoc(doc(db, 'shops', shopId, 'materials', mat.id), {
      ...mat,
      purchaseUnit: unitConvModal.purchaseUnit,
      purchaseUnitRate: convRate,
    }, { merge: true });
    setUnitConvModal(null);
    setConvRate('');
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">庫存與盤點管理</h2>
          <p className="text-sm text-coffee-400">登錄原物料與包材，掌握即時庫存，設定安全水位警示。</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-coffee-50 border border-coffee-100 rounded-2xl px-6 py-2 shadow-sm text-right">
            <div className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest">目前庫存總值</div>
            <div className="text-xl font-serif-brand font-bold text-coffee-800">${fmt(totalInvValue)}</div>
          </div>
          <button
            onClick={() => setIsAddingMode(!isAddingMode)}
            className="bg-coffee-600 text-white px-6 py-2 rounded-2xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" /> 新增材料
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAddingMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <form onSubmit={handleAddSubmit} className="glass-panel relative bg-white/80 mb-6 border-2 border-coffee-100 shadow-md rounded-[24px] overflow-hidden">
              <div className="bg-coffee-50/50 border-b border-coffee-100 p-4 md:px-6 flex justify-between items-center">
                <h3 className="font-bold text-coffee-800 text-lg">新增材料資料卡</h3>
                <button type="button" onClick={() => setIsAddingMode(false)} className="text-coffee-400 hover:text-coffee-600"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="p-4 md:p-6 space-y-6">
                {/* 1. 基本資料 */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-coffee-600 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-coffee-400"></div>基本資訊</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-coffee-400 block mb-1">類別 *</label>
                      <select value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400">
                        <option value="食材">食材</option>
                        <option value="包材">包材</option>
                        <option value="裝飾品">裝飾品</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-coffee-400 block mb-1">材料名稱 *</label>
                      <input type="text" required value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: 麵粉" />
                    </div>
                  </div>
                </div>

                {/* 2. 單位設定 */}
                <div className="space-y-3 p-4 bg-coffee-50/30 rounded-2xl border border-coffee-50">
                  <h4 className="text-sm font-bold text-coffee-600 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-coffee-400"></div>
                    單位換算設定 (由小到大填寫)
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Level 1 */}
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-bold text-coffee-600 bg-coffee-100 px-2 py-0.5 rounded-md inline-block">第一層：基本單位 *</label>
                      <input type="text" required value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: g" />
                    </div>

                    {/* Level 2 */}
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-bold text-coffee-500 bg-coffee-50 px-2 py-0.5 rounded-md inline-block">第二層：中單位 (選填)</label>
                      <input type="text" value={newMaterial.midUnit || ''} onChange={e => setNewMaterial({...newMaterial, midUnit: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: 罐" />
                      {newMaterial.midUnit && (
                        <div className="mt-2 text-xs font-bold text-coffee-500">
                          1 {newMaterial.midUnit} = 
                          <input type="number" step="0.001" min="0.001" required value={newMaterial.midUnitRate || ''} onChange={e => setNewMaterial({...newMaterial, midUnitRate: parseFloat(e.target.value) || undefined})} className="w-16 mx-2 border-b-2 border-coffee-300 outline-none text-center bg-transparent focus:border-coffee-600" placeholder="?" />
                          {newMaterial.unit}
                        </div>
                      )}
                    </div>

                    {/* Level 3 */}
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-bold text-coffee-500 bg-coffee-50 px-2 py-0.5 rounded-md inline-block">第三層：大單位 (選填)</label>
                      <input type="text" value={newMaterial.purchaseUnit || ''} onChange={e => setNewMaterial({...newMaterial, purchaseUnit: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: 箱" />
                      {newMaterial.purchaseUnit && (
                        <div className="mt-2 text-xs font-bold text-coffee-500 flex items-center">
                          1 {newMaterial.purchaseUnit} = 
                          <input type="number" step="0.001" min="0.001" required value={newMaterial.purchaseUnitRate || ''} onChange={e => setNewMaterial({...newMaterial, purchaseUnitRate: parseFloat(e.target.value) || undefined})} className="w-16 mx-2 border-b-2 border-coffee-300 outline-none text-center bg-transparent focus:border-coffee-600" placeholder="?" />
                          {newMaterial.midUnit ? newMaterial.midUnit : newMaterial.unit}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {newMaterial.purchaseUnit && newMaterial.midUnit && newMaterial.purchaseUnitRate && newMaterial.midUnitRate && (
                    <div className="text-xs text-mint-brand font-bold bg-mint-brand/10 p-2 rounded-lg mt-2">
                       ↳ 換算總結：1 {newMaterial.purchaseUnit} = {newMaterial.purchaseUnitRate * newMaterial.midUnitRate} {newMaterial.unit}
                    </div>
                  )}
                </div>

                {/* 3. 庫存與警示 */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-coffee-600 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-coffee-400"></div>庫存設定</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-coffee-400 block mb-1">目前庫存 (選填，直接輸入總數)</label>
                      <div className="relative">
                        <input type="number" step="0.01" value={newMaterial.stock || ''} onChange={e => setNewMaterial({...newMaterial, stock: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 pr-12 outline-none focus:border-coffee-400" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-coffee-400 font-bold">{newMaterial.unit || '單位'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-500 block mb-1">最低庫存提醒水位 (以最大單位計算) *</label>
                      <div className="relative">
                        <input type="number" required step="0.01" min="0" value={newMaterial.minAlert ?? 0} onChange={e => setNewMaterial({...newMaterial, minAlert: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-amber-200 rounded-xl px-4 py-2 pr-12 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-amber-600 font-bold">{newMaterial.purchaseUnit || newMaterial.midUnit || newMaterial.unit || '單位'}</span>
                      </div>
                      <p className="text-[10px] text-coffee-300 mt-1">例如設定為 2，代表低於 2 {newMaterial.purchaseUnit || newMaterial.midUnit || newMaterial.unit} 時會顯示警告。</p>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-coffee-800 text-white rounded-2xl py-3 font-bold hover:bg-coffee-900 transition flex items-center justify-center gap-2 shadow-sm"><CheckCircle2 className="w-5 h-5"/> 建立完成並儲存</button>
              </div>
            </form>
          </motion.div>
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
                    <td className="py-4 px-6 font-bold text-coffee-800 text-base">{m.name}</td>
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
                        <span className="font-serif-brand font-bold text-coffee-500">${fmt(m.avgCost)}<span className="text-xs font-sans text-coffee-300">/{m.unit}</span></span>
                        {hasMismatch && (
                          <button
                            onClick={() => { setUnitConvModal({ material: m, purchaseUnit: m.purchaseUnit! }); setConvRate(''); }}
                            className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-amber-100 transition-colors whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            單位不同 ({m.purchaseUnit})，點擊設定換算
                          </button>
                        )}
                        {m.purchaseUnit && m.purchaseUnit !== m.unit && m.purchaseUnitRate && (
                          <button
                            onClick={() => { setUnitConvModal({ material: m, purchaseUnit: m.purchaseUnit! }); setConvRate(m.purchaseUnitRate || ''); }}
                            className="text-[10px] font-bold text-coffee-400 bg-coffee-50 border border-coffee-100 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-coffee-100 transition-colors whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            1 {m.purchaseUnit} = {m.purchaseUnitRate} {m.unit}
                          </button>
                        )}
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
                      <div className="inline-flex gap-2">
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
                    <ArrowRightLeft className="w-5 h-5 text-amber-500" /> 單位換算設定
                  </h3>
                  <p className="text-sm text-coffee-400 mt-1">「{unitConvModal.material.name}」</p>
                </div>
                <button onClick={() => setUnitConvModal(null)} className="p-1.5 rounded-full bg-coffee-100 text-coffee-500 hover:bg-coffee-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
                <p className="text-xs font-bold text-amber-700">⚠️ 單位不一致提醒</p>
                <p className="text-xs text-amber-600">
                  庫存單位為 <span className="font-bold">「{unitConvModal.material.unit}」</span>，
                  但食材成本分頁的購買單位為 <span className="font-bold">「{unitConvModal.purchaseUnit}」</span>。
                  請填寫換算比例以正確計算每單位庫存成本。
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-coffee-500 block mb-2">換算比例</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-serif-brand font-bold text-coffee-800">1</div>
                    <div className="text-xs text-coffee-400 mt-0.5">{unitConvModal.purchaseUnit}</div>
                  </div>
                  <div className="text-coffee-400 font-bold">=</div>
                  <div className="flex-1">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="填入數量"
                      value={convRate}
                      onChange={e => setConvRate(parseFloat(e.target.value) || '')}
                      className="w-full text-center text-2xl font-serif-brand font-bold text-coffee-800 border-b-2 border-coffee-300 focus:border-coffee-600 bg-transparent outline-none py-1"
                    />
                    <div className="text-xs text-coffee-400 mt-0.5 text-center">{unitConvModal.material.unit}</div>
                  </div>
                </div>
                {convRate !== '' && convRate > 0 && (
                  <p className="text-xs text-mint-brand font-bold mt-3 text-center bg-mint-brand/10 rounded-xl py-2">
                    1 {unitConvModal.purchaseUnit} = {convRate} {unitConvModal.material.unit}
                  </p>
                )}
              </div>

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
    </div>
  );
}
