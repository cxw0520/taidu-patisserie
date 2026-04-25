import React, { useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { Material, Purchase, PurchaseLine, Vendor } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Eye, Pencil, Plus, Search, Store, Trash2, Users, Phone, Mail } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export default function PurchasingTab({
  purchases,
  materials,
  selectedYear,
  shopId
}: {
  purchases: Purchase[],
  materials: Material[],
  selectedYear: number,
  shopId: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMatModalOpen, setIsMatModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [vendorDetail, setVendorDetail] = useState<{ vendor: string; month: string } | null>(null);
  const [isVendorDbOpen, setIsVendorDbOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Partial<Vendor> | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isNewVendorMode, setIsNewVendorMode] = useState(false);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shops', shopId, 'vendors'), snap => {
      setVendors(snap.docs.map(d => d.data() as Vendor));
    });
    return unsub;
  }, [shopId]);

  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0
  });

  const [formData, setFormData] = useState<Partial<Purchase>>({
    date: new Date().toISOString().substring(0, 10),
    vendor: '',
    lines: [],
    notes: ''
  });

  const vendorStats = useMemo(() => {
    const stats: Record<string, number> = {};
    purchases.filter(p => p.date.startsWith(selectedMonth)).forEach(p => {
      stats[p.vendor] = (stats[p.vendor] || 0) + p.totalAmount;
    });
    return Object.entries(stats).map(([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total);
  }, [purchases, selectedMonth]);

  const vendorPurchases = useMemo(() => {
    if (!vendorDetail) return [];
    return purchases
      .filter(p => p.vendor === vendorDetail.vendor && p.date.startsWith(vendorDetail.month))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [purchases, vendorDetail]);

  const selectedMonthTotal = useMemo(() => {
    return vendorStats.reduce((sum, v) => sum + v.total, 0);
  }, [vendorStats]);

  const materialMap = useMemo(() => {
    const m: Record<string, Material> = {};
    materials.forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const openCreateModal = () => {
    setEditingPurchase(null);
    setFormData({
      date: new Date().toISOString().substring(0, 10),
      vendor: '',
      lines: [],
      notes: ''
    });
    setIsNewVendorMode(false);
    setIsModalOpen(true);
  };

  const openEditModal = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      id: purchase.id,
      date: purchase.date,
      vendor: purchase.vendor,
      lines: purchase.lines.map(l => ({ ...l })),
      notes: purchase.notes || ''
    });
    setIsNewVendorMode(false);
    setIsModalOpen(true);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    await setDoc(doc(db, 'shops', shopId, 'materials', id), { ...newMaterial, id });
    setIsMatModalOpen(false);
    setNewMaterial({ name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0 });
  };

  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...(prev.lines || []), { id: uid(), materialId: '', qty: 0, amount: 0, purchaseQty: 0 }]
    }));
  };

  const updateLine = (id: string, updates: Partial<PurchaseLine>) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines?.map(l => l.id === id ? { ...l, ...updates } : l)
    }));
  };

  const removeLine = (id: string) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines?.filter(l => l.id !== id)
    }));
  };

  const collectLineDeltas = (lines: PurchaseLine[], factor: 1 | -1) => {
    const deltaByMaterial: Record<string, { qty: number; amount: number }> = {};
    lines.forEach(line => {
      if (!line.materialId) return;
      if (!deltaByMaterial[line.materialId]) deltaByMaterial[line.materialId] = { qty: 0, amount: 0 };
      deltaByMaterial[line.materialId].qty += line.qty * factor;
      deltaByMaterial[line.materialId].amount += line.amount * factor;
    });
    return deltaByMaterial;
  };

  const applyMaterialUpdates = async (deltaByMaterial: Record<string, { qty: number; amount: number }>) => {
    const batch = writeBatch(db);
    Object.entries(deltaByMaterial).forEach(([materialId, delta]) => {
      const mat = materialMap[materialId];
      if (!mat) return;
      const nextStock = Math.max(0, mat.stock + delta.qty);
      const currentTotalValue = mat.stock * mat.avgCost;
      const nextTotalValue = Math.max(0, currentTotalValue + delta.amount);
      const nextAvgCost = nextStock > 0 ? nextTotalValue / nextStock : 0;
      batch.set(
        doc(db, 'shops', shopId, 'materials', mat.id),
        { ...mat, stock: nextStock, avgCost: Number.isFinite(nextAvgCost) ? nextAvgCost : 0 }
      );
    });
    await batch.commit();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lines || formData.lines.length === 0) return alert('請加入至少一個進貨品項');
    if (!formData.vendor || !formData.date) return alert('請填寫完整資訊');

    const hasError = formData.lines.some(l => !l.materialId || l.qty <= 0 || l.amount < 0);
    if (hasError) return alert('明細資料有誤（數量必須大於 0，金額不能為負數）');

    const normalizedLines = formData.lines as PurchaseLine[];
    const totalAmt = normalizedLines.reduce((s, l) => s + l.amount, 0);

    const purchaseId = editingPurchase?.id || uid();
    const payload: Purchase = {
      id: purchaseId,
      date: formData.date!,
      year: Number(formData.date!.substring(0, 4)),
      vendor: formData.vendor!,
      lines: normalizedLines,
      totalAmount: totalAmt,
      notes: formData.notes || ''
    };

    let deltaByMaterial: Record<string, { qty: number; amount: number }> = {};
    if (editingPurchase) {
      const revertOld = collectLineDeltas(editingPurchase.lines, -1);
      const applyNew = collectLineDeltas(payload.lines, 1);
      const ids = new Set([...Object.keys(revertOld), ...Object.keys(applyNew)]);
      ids.forEach(id => {
        deltaByMaterial[id] = {
          qty: (revertOld[id]?.qty || 0) + (applyNew[id]?.qty || 0),
          amount: (revertOld[id]?.amount || 0) + (applyNew[id]?.amount || 0),
        };
      });
    } else {
      deltaByMaterial = collectLineDeltas(payload.lines, 1);
    }

    await applyMaterialUpdates(deltaByMaterial);
    await setDoc(doc(db, 'shops', shopId, 'purchases', purchaseId), payload);

    if (formData.vendor && !vendors.find(v => v.name === formData.vendor)) {
      const vId = uid();
      await setDoc(doc(db, 'shops', shopId, 'vendors', vId), { id: vId, name: formData.vendor });
    }

    setIsModalOpen(false);
    setEditingPurchase(null);
    setFormData({ date: new Date().toISOString().substring(0, 10), vendor: '', lines: [], notes: '' });
  };

  const handleDeletePurchase = async (purchase: Purchase) => {
    if (!confirm(`確定刪除 ${purchase.vendor} 的進貨單？`)) return;
    const revertDelta = collectLineDeltas(purchase.lines, -1);
    await applyMaterialUpdates(revertDelta);
    await deleteDoc(doc(db, 'shops', shopId, 'purchases', purchase.id));
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor?.name) return alert('請填寫廠商名稱');
    const vId = editingVendor.id || uid();
    const payloadStart: Partial<Vendor> = {
      id: vId,
      name: editingVendor.name,
      phone: editingVendor.phone || '',
      email: editingVendor.email || '',
      category: editingVendor.category || '',
      notes: editingVendor.notes || ''
    };
    await setDoc(doc(db, 'shops', shopId, 'vendors', vId), payloadStart as Vendor);
    setEditingVendor(null);
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    if (!confirm(`確定刪除廠商：${vendor.name}？(注意：已存在的進貨記錄仍會保留其名稱)`)) return;
    await deleteDoc(doc(db, 'shops', shopId, 'vendors', vendor.id));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">進貨紀錄與廠商帳款</h2>
          <p className="text-sm text-coffee-400">登錄/編輯進貨單，系統自動更新庫存與平均成本。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsVendorDbOpen(true)}
            className="bg-white border border-coffee-200 text-coffee-700 px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-coffee-50 transition shadow-sm active:scale-95"
          >
            <Users className="w-5 h-5" /> 廠商資料庫
          </button>
          <button
            onClick={openCreateModal}
            className="bg-coffee-600 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" /> 新增進貨單
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel p-4 md:p-6 bg-white/50 border border-coffee-50 shadow-sm rounded-[24px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
              <Store className="w-5 h-5 text-coffee-400" /> 各廠商進貨分析
            </h3>
            <div className="flex items-center gap-4">
              <div className="text-right flex items-center gap-2">
                <span className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest hidden sm:inline">本月總進貨:</span>
                <span className="text-xl font-serif-brand font-bold text-rose-brand">${fmt(selectedMonthTotal)}</span>
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white border border-coffee-200 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-500 transition-colors"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[360px]">
              <thead>
                <tr className="text-xs text-coffee-400 font-bold uppercase border-b border-coffee-100">
                  <th className="py-3 px-4">廠商（點擊看明細）</th>
                  <th className="py-3 px-4 text-right">單月總金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-50">
                {vendorStats.map(stat => (
                  <tr key={stat.vendor} className="hover:bg-coffee-50/50">
                    <td className="py-4 px-4">
                      <button
                        onClick={() => setVendorDetail({ vendor: stat.vendor, month: selectedMonth })}
                        className="font-bold text-coffee-800 hover:text-coffee-600 underline underline-offset-2 inline-flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        {stat.vendor}
                      </button>
                    </td>
                    <td className="py-4 px-4 text-right font-serif-brand font-bold text-rose-brand">${fmt(stat.total)}</td>
                  </tr>
                ))}
                {vendorStats.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-coffee-300 font-bold">該月份無進貨紀錄</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel p-4 md:p-6 bg-white border border-coffee-50 shadow-sm overflow-y-auto max-h-[600px] rounded-[24px]">
          <h3 className="text-lg font-bold text-coffee-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-coffee-400" /> 近期進貨紀錄
          </h3>
          <div className="space-y-3">
            {purchases.slice(0, 20).map(p => (
              <div key={p.id} className="p-4 bg-coffee-50/50 rounded-2xl border border-coffee-50 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-coffee-800 line-clamp-1">{p.vendor}</span>
                  <span className="text-xs font-bold text-coffee-400 whitespace-nowrap">{p.date}</span>
                </div>
                <div className="flex justify-between items-end gap-2">
                  <span className="text-xs text-coffee-500 line-clamp-1 flex-1">
                    {p.lines.map(l => materialMap[l.materialId]?.name || '（已刪除材料）').join(', ')}
                  </span>
                  <span className="font-serif-brand font-bold text-rose-brand">${fmt(p.totalAmount)}</span>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => openEditModal(p)} className="text-xs font-bold px-2 py-1 rounded-lg bg-coffee-100 text-coffee-700 inline-flex items-center gap-1"><Pencil className="w-3 h-3" />編輯</button>
                  <button onClick={() => handleDeletePurchase(p)} className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-100 text-rose-700 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />刪除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {vendorDetail && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVendorDetail(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="glass-panel w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white border-0 shadow-2xl rounded-[28px] relative z-10">
              <div className="p-5 border-b border-coffee-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-coffee-800">{vendorDetail.vendor}</h3>
                  <p className="text-sm text-coffee-400">{vendorDetail.month} 進貨明細</p>
                </div>
                <button onClick={() => setVendorDetail(null)} className="p-2 rounded-full bg-coffee-100 text-coffee-700">✕</button>
              </div>
              <div className="p-4 overflow-auto max-h-[70vh]">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left border-b border-coffee-100 text-coffee-500">
                      <th className="p-2">日期</th>
                      <th className="p-2">品項明細</th>
                      <th className="p-2 text-right">總金額</th>
                      <th className="p-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorPurchases.map(p => (
                      <tr key={p.id} className="border-b border-coffee-50 align-top">
                        <td className="p-2 font-semibold">{p.date}</td>
                        <td className="p-2">
                          <div className="space-y-1">
                            {p.lines.map(line => {
                              const mat = materialMap[line.materialId];
                              return (
                                <div key={line.id} className="text-xs">
                                  <span className="font-semibold">{mat?.name || '（已刪除材料）'}</span>
                                  <span className="ml-2 text-coffee-500">
                                    {line.purchaseQty ? `${fmt(line.purchaseQty)} ${line.purchaseUnit}` : `${fmt(line.qty)} ${mat?.unit || ''}`}
                                  </span>
                                  <span className="ml-2 text-rose-700">${fmt(line.amount)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-2 text-right font-serif-brand font-bold text-rose-brand">${fmt(p.totalAmount)}</td>
                        <td className="p-2 text-right">
                          <div className="inline-flex gap-2">
                            <button onClick={() => { setVendorDetail(null); openEditModal(p); }} className="text-xs font-bold px-2 py-1 rounded bg-coffee-100 text-coffee-700">編輯</button>
                            <button onClick={() => handleDeletePurchase(p)} className="text-xs font-bold px-2 py-1 rounded bg-rose-100 text-rose-700">刪除</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {vendorPurchases.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-coffee-300">此月份無資料</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border-0 shadow-2xl rounded-[32px] overflow-hidden relative z-10"
            >
              <div className="p-6 md:p-8 border-b border-coffee-50 bg-[#faf7f2]/50 flex justify-between items-center">
                <h3 className="text-xl md:text-2xl font-bold font-serif-brand text-coffee-800">{editingPurchase ? '編輯進貨單' : '新增進貨單'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-coffee-300 hover:text-coffee-600 bg-white rounded-full"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <label className="text-xs font-bold text-coffee-400 uppercase ml-1">進貨日期</label>
                    <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full mt-1 bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:border-mint-brand" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-coffee-400 uppercase ml-1">廠商名稱</label>
                    <div className="flex gap-2 mt-1">
                      {isNewVendorMode || (!vendors.length && vendors !== null) ? (
                        <div className="flex-1 flex gap-2">
                          <input autoFocus type="text" required value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })} placeholder="輸入新廠商名稱" className="w-full bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:border-mint-brand" />
                          {vendors.length > 0 && (
                            <button type="button" onClick={() => { setIsNewVendorMode(false); setFormData({...formData, vendor: ''}); }} className="whitespace-nowrap px-4 bg-coffee-100 text-coffee-600 rounded-2xl font-bold flex-shrink-0 hover:bg-coffee-200 transition">取消</button>
                          )}
                        </div>
                      ) : (
                        <select required value={formData.vendor} onChange={e => {
                          if (e.target.value === '__NEW__') {
                            setIsNewVendorMode(true);
                            setFormData({ ...formData, vendor: '' });
                          } else {
                            setFormData({ ...formData, vendor: e.target.value });
                          }
                        }} className="w-full bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:border-mint-brand">
                          <option value="" disabled>請選擇廠商...</option>
                          {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                          <option value="__NEW__" className="font-bold text-mint-700 bg-mint-50">＋ 填寫新廠商名稱</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <label className="text-xs font-bold text-coffee-400 uppercase ml-1">進貨品項清單</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setIsMatModalOpen(true)} className="text-xs font-bold text-coffee-600 bg-coffee-100 px-3 py-2 rounded-full hover:bg-coffee-200 transition-colors shadow-sm">新增材料資料卡</button>
                      <button type="button" onClick={addLine} className="text-xs font-bold text-mint-brand bg-mint-brand/10 px-4 py-2 rounded-full flex items-center gap-1 hover:bg-mint-brand/20"><Plus className="w-3 h-3" /> 新增品項</button>
                    </div>
                  </div>

                  {formData.lines?.map((line) => (
                    <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-white border border-coffee-100 rounded-2xl items-end">
                      <div className="md:col-span-5">
                        <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1">材料/包材</label>
                        <select required value={line.materialId} onChange={e => updateLine(line.id, { materialId: e.target.value })} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none">
                          <option value="">請選擇...</option>
                          {materials.map(m => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1 text-right">數量</label>
                        <div className="relative">
                          <input type="number" step="0.01" required value={line.purchaseQty !== undefined ? (line.purchaseQty || '') : (line.qty || '')} onChange={e => {
                            const pQty = parseFloat(e.target.value) || 0;
                            const mat = materialMap[line.materialId];
                            const currentUnit = line.purchaseUnit || mat?.purchaseUnit || mat?.unit || '';
                            const isPurchaseUnit = currentUnit === mat?.purchaseUnit;
                            const rate = isPurchaseUnit ? (mat?.purchaseUnitRate || 1) : 1;
                            updateLine(line.id, { 
                              purchaseQty: pQty,
                              purchaseUnit: currentUnit,
                              qty: pQty * rate
                            });
                          }} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 pr-12 text-sm font-bold text-right outline-none" />
                          
                          {materialMap[line.materialId]?.purchaseUnit && materialMap[line.materialId]?.purchaseUnitRate ? (
                             <select className="absolute right-0 top-0 bottom-0 bg-transparent text-coffee-500 font-bold text-xs px-2 outline-none cursor-pointer appearance-none text-center hover:bg-black/5 transition"
                               value={line.purchaseUnit || materialMap[line.materialId]?.purchaseUnit}
                               onChange={e => {
                                 const newUnit = e.target.value;
                                 const pQty = line.purchaseQty !== undefined ? line.purchaseQty : line.qty;
                                 const mat = materialMap[line.materialId];
                                 const isPurchaseUnit = newUnit === mat?.purchaseUnit;
                                 const rate = isPurchaseUnit ? (mat?.purchaseUnitRate || 1) : 1;
                                 updateLine(line.id, {
                                   purchaseUnit: newUnit,
                                   qty: pQty * rate
                                 })
                               }}
                             >
                               <option value={materialMap[line.materialId]?.purchaseUnit!}>{materialMap[line.materialId]?.purchaseUnit}</option>
                               <option value={materialMap[line.materialId]?.unit!}>{materialMap[line.materialId]?.unit}</option>
                             </select>
                          ) : (
                             <span className="absolute right-4 top-1/2 -translate-y-1/2 text-coffee-400 font-bold text-xs pointer-events-none">
                               {materialMap[line.materialId]?.unit || '單位'}
                             </span>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1 text-right">總金額</label>
                        <input type="number" required value={line.amount || ''} onChange={e => updateLine(line.id, { amount: parseFloat(e.target.value) || 0 })} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 text-sm font-bold text-right outline-none" />
                      </div>
                      <div className="md:col-span-1 pb-1">
                        <button type="button" onClick={() => removeLine(line.id)} className="w-full h-8 flex items-center justify-center text-coffee-200 hover:text-danger-brand"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="md:col-span-12 text-right mt-1">
                        <span className="text-[10px] text-coffee-400 font-bold">
                          單價估算: <span className="text-mint-brand font-serif-brand font-bold">
                            {(line.purchaseQty ?? line.qty) > 0 ? `$${fmt(line.amount / (line.purchaseQty || line.qty))}` : '-'}
                          </span> / {line.purchaseUnit || materialMap[line.materialId]?.unit || '單位'}
                          {(line.purchaseQty && materialMap[line.materialId]?.purchaseUnitRate) ? ` (=${fmt(line.amount / line.qty)} / ${materialMap[line.materialId]?.unit})` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                  {formData.lines?.length === 0 && <div className="text-center py-6 text-coffee-300 text-sm font-bold bg-coffee-50/50 rounded-2xl border border-dashed border-coffee-200">尚未加入任何品項</div>}
                </div>

                <div>
                  <label className="text-xs font-bold text-coffee-400 uppercase ml-1">備註說明</label>
                  <input type="text" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full mt-1 bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none" />
                </div>

                <div className="pt-6 border-t border-coffee-50 flex justify-between items-center">
                  <div className="text-coffee-400 font-bold">本單總金額</div>
                  <div className="text-2xl md:text-3xl font-serif-brand font-bold text-rose-brand">${fmt(formData.lines?.reduce((a, b) => a + b.amount, 0) || 0)}</div>
                </div>

                <button type="submit" className="w-full py-4 bg-coffee-800 text-white rounded-full font-bold text-base md:text-lg shadow-lg hover:bg-coffee-900 active:scale-[0.98] transition-all">
                  {editingPurchase ? '儲存進貨單變更' : '儲存進貨單並更新庫存'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMatModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMatModalOpen(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-md bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold font-serif-brand text-coffee-800">新增材料</h3>
                <button type="button" onClick={() => setIsMatModalOpen(false)} className="p-2 text-coffee-300 hover:text-coffee-600 rounded-full"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>
              <form onSubmit={handleAddMaterial} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-coffee-400 block mb-1">類別</label>
                  <select value={newMaterial.category} onChange={e => setNewMaterial({ ...newMaterial, category: e.target.value })} className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 outline-none">
                    <option value="食材">食材</option>
                    <option value="包材">包材</option>
                    <option value="裝飾品">裝飾品</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-coffee-400 block mb-1">材料名稱</label>
                  <input type="text" required value={newMaterial.name} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-coffee-400 block mb-1">目前庫存 (選填)</label>
                  <input type="number" step="0.01" value={newMaterial.stock || ''} onChange={e => setNewMaterial({ ...newMaterial, stock: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-coffee-400 block mb-1">基本單位</label>
                    <input type="text" required value={newMaterial.unit} onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: g" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-coffee-400 block mb-1">大單位 (選填)</label>
                    <input type="text" value={newMaterial.purchaseUnit || ''} onChange={e => setNewMaterial({ ...newMaterial, purchaseUnit: e.target.value })} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: 箱" />
                  </div>
                </div>
                {newMaterial.purchaseUnit ? (
                  <div>
                    <label className="text-xs font-bold text-coffee-400 block mb-1">1 {newMaterial.purchaseUnit} = ? {newMaterial.unit}</label>
                    <input type="number" required step="0.01" min="0.01" value={newMaterial.purchaseUnitRate || ''} onChange={e => setNewMaterial({ ...newMaterial, purchaseUnitRate: parseFloat(e.target.value) || undefined })} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="輸入換算比例" />
                  </div>
                ) : null}
                <button type="submit" className="w-full bg-coffee-800 text-white rounded-xl py-3 font-bold hover:bg-coffee-900 transition">新增</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVendorDbOpen && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsVendorDbOpen(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border-0 shadow-2xl rounded-[32px] overflow-hidden relative z-10">
              <div className="p-6 md:p-8 border-b border-coffee-50 bg-[#faf7f2]/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold font-serif-brand text-coffee-800 flex items-center gap-2"><Users className="w-6 h-6 text-coffee-500" /> 廠商資料庫</h3>
                  <p className="text-sm text-coffee-400 mt-1">管理配合的進貨廠商、聯絡資訊與備註</p>
                </div>
                <button onClick={() => setIsVendorDbOpen(false)} className="p-2 text-coffee-300 hover:text-coffee-600 bg-white rounded-full"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-coffee-800">廠商列表 ({vendors.length})</h4>
                    <button onClick={() => setEditingVendor({ name: '' })} className="text-xs font-bold bg-coffee-100 text-coffee-700 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-coffee-200 transition">
                      <Plus className="w-4 h-4" /> 新增廠商
                    </button>
                  </div>
                  <div className="space-y-3">
                    {vendors.map(v => (
                       <div key={v.id} className="p-4 rounded-xl border border-coffee-100 bg-white hover:border-coffee-300 transition group flex flex-col gap-2">
                         <div className="flex justify-between items-start">
                           <div>
                             <div className="font-bold text-coffee-800">{v.name}</div>
                             {v.category && <span className="text-[10px] bg-coffee-50 text-coffee-500 px-2 py-0.5 rounded-full mt-1 inline-block">{v.category}</span>}
                           </div>
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => setEditingVendor(v)} className="p-1.5 text-coffee-400 hover:text-coffee-600 bg-coffee-50 rounded-md"><Pencil className="w-4 h-4" /></button>
                             <button onClick={() => handleDeleteVendor(v)} className="p-1.5 text-coffee-400 hover:text-rose-600 bg-coffee-50 rounded-md"><Trash2 className="w-4 h-4" /></button>
                           </div>
                         </div>
                         {(v.phone || v.email) && (
                           <div className="flex gap-4 text-xs text-coffee-500 mt-1">
                             {v.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {v.phone}</div>}
                             {v.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {v.email}</div>}
                           </div>
                         )}
                         {v.notes && <div className="text-xs text-coffee-400 mt-1 pt-2 border-t border-coffee-50">{v.notes}</div>}
                       </div>
                    ))}
                    {vendors.length === 0 && <div className="text-center py-10 text-sm text-coffee-400 font-bold bg-coffee-50/50 rounded-xl border border-dashed border-coffee-200">尚無廠商資料</div>}
                  </div>
                </div>

                <div className="w-full md:w-[360px] flex-shrink-0">
                  <div className="bg-[#faf7f2]/50 p-5 rounded-2xl border border-coffee-100 sticky top-0">
                    <h4 className="font-bold text-coffee-800 mb-4">{editingVendor?.id ? '編輯廠商資料' : (editingVendor ? '新增廠商' : '點擊列表編輯，或新增廠商')}</h4>
                    {editingVendor ? (
                      <form onSubmit={handleSaveVendor} className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-coffee-400 block mb-1">廠商名稱 *</label>
                          <input type="text" required value={editingVendor.name || ''} onChange={e => setEditingVendor({...editingVendor, name: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-coffee-400 block mb-1">聯絡電話</label>
                          <input type="text" value={editingVendor.phone || ''} onChange={e => setEditingVendor({...editingVendor, phone: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-coffee-400 block mb-1">信箱 / Email</label>
                          <input type="email" value={editingVendor.email || ''} onChange={e => setEditingVendor({...editingVendor, email: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-coffee-400 block mb-1">主要類別 (選填)</label>
                          <input type="text" value={editingVendor.category || ''} onChange={e => setEditingVendor({...editingVendor, category: e.target.value})} placeholder="例如：包材、食材進口" className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-coffee-400 block mb-1">備註 / 匯款帳號</label>
                          <textarea value={editingVendor.notes || ''} onChange={e => setEditingVendor({...editingVendor, notes: e.target.value})} rows={3} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-500 resize-none"></textarea>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-coffee-100">
                          <button type="button" onClick={() => setEditingVendor(null)} className="flex-1 py-2 bg-white border border-coffee-200 text-coffee-600 rounded-xl font-bold hover:bg-coffee-50">取消</button>
                          <button type="submit" className="flex-1 py-2 bg-coffee-800 text-white rounded-xl font-bold hover:bg-coffee-900 shadow-md">儲存</button>
                        </div>
                      </form>
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center text-coffee-300">
                        <Store className="w-12 h-12 mb-3 opacity-20" />
                        <span className="text-sm font-bold">請選擇或新增廠商</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
