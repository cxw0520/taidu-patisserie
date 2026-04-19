import React, { useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Purchase, Material } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Trash2, Search, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

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
  
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0
  });

  const [formData, setFormData] = useState<Partial<Purchase>>({
    date: new Date().toISOString().substring(0,10),
    vendor: '',
    lines: [],
    notes: ''
  });

  const vendorStats = useMemo(() => {
    const stats: Record<string, number> = {};
    purchases.filter(p => p.date.startsWith(selectedMonth)).forEach(p => {
      stats[p.vendor] = (stats[p.vendor] || 0) + p.totalAmount;
    });
    return Object.entries(stats).map(([vendor, total]) => ({
      vendor,
      total
    })).sort((a, b) => b.total - a.total);
  }, [purchases, selectedMonth]);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    await setDoc(doc(db, 'shops', shopId, 'materials', id), { ...newMaterial, id });
    setIsMatModalOpen(false);
    setNewMaterial({ name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0 });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...(formData.lines || []), { id: uid(), materialId: '', qty: 0, amount: 0 }]
    });
  };

  const updateLine = (id: string, updates: any) => {
    setFormData({
      ...formData,
      lines: formData.lines?.map(l => l.id === id ? { ...l, ...updates } : l)
    });
  };

  const removeLine = (id: string) => {
    setFormData({
      ...formData,
      lines: formData.lines?.filter(l => l.id !== id)
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lines || formData.lines.length === 0) return alert('請加入至少一個進貨品項');
    if (!formData.vendor || !formData.date) return alert('請填寫完整資訊');

    let error = false;
    formData.lines.forEach(l => {
      if (!l.materialId || l.qty <= 0 || l.amount < 0) error = true;
    });

    if (error) return alert('明細資料有誤（數量必須大於 0，金額不能為負數）');

    const totalAmt = formData.lines.reduce((s, l) => s + l.amount, 0);
    const purchaseId = uid();
    
    // Create the purchase entry
    const newPurchase: Purchase = {
      id: purchaseId,
      date: formData.date,
      year: Number(formData.date.substring(0, 4)),
      vendor: formData.vendor,
      lines: formData.lines as any[],
      totalAmount: totalAmt,
      notes: formData.notes
    };

    // Begin updates
    // In a real app with cloud functions, we'd do a batch. Here we do client-side consecutive writes.
    for (const line of newPurchase.lines) {
      const mat = materials.find(m => m.id === line.materialId);
      if (mat) {
        const newStock = mat.stock + line.qty;
        // Moving Average Cost formulation: (oldQty * oldAvgCost + newAmount) / newTotalQty
        const oldTotalVal = mat.stock * mat.avgCost;
        let newAvgCost = (oldTotalVal + line.amount) / newStock;
        if (isNaN(newAvgCost) || !isFinite(newAvgCost)) newAvgCost = 0;
        
        await setDoc(doc(db, 'shops', shopId, 'materials', mat.id), {
          ...mat,
          stock: newStock,
          avgCost: newAvgCost
        });
      }
    }

    await setDoc(doc(db, 'shops', shopId, 'purchases', purchaseId), newPurchase);
    
    setIsModalOpen(false);
    setFormData({ date: new Date().toISOString().substring(0,10), vendor: '', lines: [], notes: '' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">進貨紀錄與廠商帳款</h2>
          <p className="text-sm text-coffee-400">登錄食材/包材進貨，系統將自動累加庫存及更新單位平均成本。</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-coffee-600 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5" /> 新增進貨單
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass-panel p-6 bg-white/50 border border-coffee-50 shadow-sm overflow-x-auto rounded-[32px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
              <Store className="w-5 h-5 text-coffee-400" /> 各廠商進貨分析
            </h3>
            <input 
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-white border border-coffee-200 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-500 transition-colors"
            />
          </div>
          <div className="min-w-full">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-coffee-400 font-bold uppercase border-b border-coffee-100">
                  <th className="py-3 px-4">廠商</th>
                  <th className="py-3 px-4 text-right">單月總金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-50">
                {vendorStats.map(stat => (
                  <tr key={stat.vendor} className="hover:bg-coffee-50/50">
                    <td className="py-4 px-4 font-bold text-coffee-800">{stat.vendor}</td>
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

        <div className="glass-panel p-6 bg-white border border-coffee-50 shadow-sm overflow-y-auto max-h-[600px] rounded-[32px]">
          <h3 className="text-lg font-bold text-coffee-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-coffee-400" /> 近期進貨紀錄
          </h3>
          <div className="space-y-4">
            {purchases.slice(0, 15).map(p => (
              <div key={p.id} className="p-4 bg-coffee-50/50 rounded-2xl border border-coffee-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-coffee-800">{p.vendor}</span>
                  <span className="text-xs font-bold text-coffee-400">{p.date}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-xs text-coffee-500 line-clamp-1 flex-1 pr-4">
                    {p.lines.map(l => materials.find(m => m.id === l.materialId)?.name).join(', ')}
                  </span>
                  <span className="font-serif-brand font-bold text-rose-brand">${fmt(p.totalAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
               className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border-0 shadow-2xl rounded-[40px] overflow-hidden relative z-10"
             >
               <div className="p-8 border-b border-coffee-50 bg-[#faf7f2]/50 flex justify-between items-center">
                 <h3 className="text-2xl font-bold font-serif-brand text-coffee-800">新增進貨單</h3>
                 <button onClick={() => setIsModalOpen(false)} className="p-2 text-coffee-300 hover:text-coffee-600 bg-white rounded-full"><Plus className="w-6 h-6 rotate-45" /></button>
               </div>
               
               <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-8 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                     <label className="text-xs font-bold text-coffee-400 uppercase ml-1">進貨日期</label>
                     <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full mt-1 bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:border-mint-brand" />
                   </div>
                   <div>
                     <label className="text-xs font-bold text-coffee-400 uppercase ml-1">廠商名稱</label>
                     <input type="text" required value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} placeholder="例如: 好又多原料行" className="w-full mt-1 bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:border-mint-brand" />
                   </div>
                 </div>

                 <div className="space-y-4">
                   <div className="flex justify-between items-center">
                     <label className="text-xs font-bold text-coffee-400 uppercase ml-1">進貨品項清單</label>
                     <div className="flex gap-2">
                       <button type="button" onClick={() => setIsMatModalOpen(true)} className="text-xs font-bold text-coffee-600 bg-coffee-100 px-3 py-2 rounded-full hover:bg-coffee-200 transition-colors shadow-sm">新增材料資料卡</button>
                       <button type="button" onClick={addLine} className="text-xs font-bold text-mint-brand bg-mint-brand/10 px-4 py-2 rounded-full flex items-center gap-1 hover:bg-mint-brand/20"><Plus className="w-3 h-3" /> 新增品項</button>
                     </div>
                   </div>
                   
                   {formData.lines?.map((line, idx) => (
                     <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-white border border-coffee-100 rounded-2xl items-end relative group">
                       <div className="md:col-span-5">
                         <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1">材料/包材</label>
                         <select required value={line.materialId} onChange={e => updateLine(line.id, { materialId: e.target.value })} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none">
                           <option value="">請選擇...</option>
                           {materials.map(m => <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>)}
                         </select>
                       </div>
                       <div className="md:col-span-3">
                         <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1 text-right">數量</label>
                         <input type="number" step="0.01" required value={line.qty || ''} onChange={e => updateLine(line.id, { qty: parseFloat(e.target.value) })} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 text-sm font-bold text-right outline-none" />
                       </div>
                       <div className="md:col-span-3">
                         <label className="text-[10px] font-bold text-coffee-300 uppercase block mb-1 text-right">總金額</label>
                         <input type="number" required value={line.amount || ''} onChange={e => updateLine(line.id, { amount: parseFloat(e.target.value) })} className="w-full bg-coffee-50 border border-coffee-50 rounded-xl px-4 py-2 text-sm font-bold text-right outline-none" />
                       </div>
                       <div className="md:col-span-1 pb-1">
                         <button type="button" onClick={() => removeLine(line.id)} className="w-full h-8 flex items-center justify-center text-coffee-200 hover:text-danger-brand"><Trash2 className="w-4 h-4" /></button>
                       </div>
                       
                       <div className="md:col-span-12 text-right mt-1">
                         <span className="text-[10px] text-coffee-400 font-bold">單價估算: <span className="text-mint-brand font-serif-brand font-bold">{line.qty > 0 ? `$${fmt(line.amount / line.qty)}` : '-'}</span> / {materials.find(m => m.id === line.materialId)?.unit || '單位'}</span>
                       </div>
                     </div>
                   ))}
                   {formData.lines?.length === 0 && <div className="text-center py-6 text-coffee-300 text-sm font-bold bg-coffee-50/50 rounded-2xl border border-dashed border-coffee-200">尚未加入任何品項</div>}
                 </div>

                 <div>
                   <label className="text-xs font-bold text-coffee-400 uppercase ml-1">備註說明</label>
                   <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full mt-1 bg-coffee-50/50 border border-coffee-100 rounded-2xl px-5 py-3 outline-none" />
                 </div>
                 
                 <div className="pt-6 border-t border-coffee-50 flex justify-between items-center">
                   <div className="text-coffee-400 font-bold">本單總金額</div>
                   <div className="text-3xl font-serif-brand font-bold text-rose-brand">${fmt(formData.lines?.reduce((a,b)=>a+b.amount,0) || 0)}</div>
                 </div>

                 <button type="submit" className="w-full py-4 bg-coffee-800 text-white rounded-full font-bold text-lg shadow-lg hover:bg-coffee-900 active:scale-[0.98] transition-all">儲存進貨單並更新庫存</button>
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
                   <select value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})} className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 outline-none">
                     <option value="食材">食材</option>
                     <option value="包材">包材</option>
                     <option value="裝飾品">裝飾品</option>
                     <option value="其他">其他</option>
                   </select>
                 </div>
                 <div>
                   <label className="text-xs font-bold text-coffee-400 block mb-1">材料名稱</label>
                   <input type="text" required value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-coffee-400 block mb-1">計算單位</label>
                   <input type="text" required value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" placeholder="例如: g" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-coffee-400 block mb-1">目前庫存 (選填)</label>
                   <input type="number" step="0.01" value={newMaterial.stock || ''} onChange={e => setNewMaterial({...newMaterial, stock: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 outline-none focus:border-coffee-400" />
                 </div>
                 <button type="submit" className="w-full bg-coffee-800 text-white rounded-xl py-3 font-bold hover:bg-coffee-900 transition">新增</button>
               </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
