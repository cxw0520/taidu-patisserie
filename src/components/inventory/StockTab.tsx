import React, { useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Material, InventoryAdj } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Target, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export default function StockTab({ materials, shopId }: { materials: Material[], shopId: string }) {
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [adjModal, setAdjModal] = useState<Material | null>(null);
  
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: '', category: '食材', unit: 'g', minAlert: 0, stock: 0, avgCost: 0
  });

  const [adjData, setAdjData] = useState({ actualQty: 0, reason: '' });

  const totalInvValue = useMemo(() => {
    return materials.reduce((s, m) => s + (m.stock * m.avgCost), 0);
  }, [materials]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    await setDoc(doc(db, 'shops', shopId, 'materials', id), { ...newMaterial, id });
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

    // Update material
    await setDoc(doc(db, 'shops', shopId, 'materials', adjModal.id), {
      ...adjModal,
      stock: adjData.actualQty
    });

    // Save adjustment log
    await setDoc(doc(db, 'shops', shopId, 'inventoryAdj', adjRecord.id), adjRecord);
    
    setAdjModal(null);
    setAdjData({ actualQty: 0, reason: '' });
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
            <form onSubmit={handleAddSubmit} className="glass-panel p-6 bg-white/60 mb-6 border-2 border-coffee-100 shadow-md">
              <h3 className="font-bold text-coffee-800 mb-4">新增材料資料卡</h3>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
                <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-coffee-400 block mb-1">類別</label>
                  <select value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300">
                    <option value="食材">食材</option>
                    <option value="包材">包材</option>
                    <option value="裝飾品">裝飾品</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-coffee-400 block mb-1">材料名稱</label>
                  <input type="text" required value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" placeholder="例如: 麵粉" />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-coffee-400 block mb-1">計算單位</label>
                  <input type="text" required value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" placeholder="例如: g" />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-coffee-400 block mb-1">目前庫存</label>
                  <input type="number" step="0.01" value={newMaterial.stock || ''} onChange={e => setNewMaterial({...newMaterial, stock: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-coffee-400 block mb-1">安全警示水位</label>
                  <input type="number" required value={newMaterial.minAlert} onChange={e => setNewMaterial({...newMaterial, minAlert: parseFloat(e.target.value)})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" />
                </div>
                <div className="md:col-span-1 pb-0.5">
                  <button type="submit" className="w-full bg-coffee-800 text-white rounded-xl py-2 font-bold hover:bg-coffee-900 transition flex items-center justify-center gap-2"><Save className="w-4 h-4"/> 儲存</button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-[32px] overflow-hidden border border-coffee-50 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#faf7f2]">
            <tr className="text-coffee-400 font-bold uppercase tracking-wider text-xs border-b border-coffee-100">
              <th className="py-4 px-6">狀態</th>
              <th className="py-4 px-6">名稱</th>
              <th className="py-4 px-6">類別</th>
              <th className="py-4 px-6 text-right">目前庫存</th>
              <th className="py-4 px-6 text-right">單位成本</th>
              <th className="py-4 px-6 text-right">資產總值</th>
              <th className="py-4 px-6 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-50">
            {materials.sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map(m => {
              const isLow = m.stock <= m.minAlert;
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
                  <td className="py-4 px-6 text-right font-serif-brand font-bold text-lg text-coffee-900">{fmt(m.stock)} <span className="text-xs font-sans font-medium text-coffee-400">{m.unit}</span></td>
                  <td className="py-4 px-6 text-right font-serif-brand text-coffee-500">${fmt(m.avgCost)}</td>
                  <td className="py-4 px-6 text-right font-serif-brand font-bold text-mint-brand text-lg">${fmt(m.stock * m.avgCost)}</td>
                  <td className="py-4 px-6 text-center">
                    <button 
                      onClick={() => { setAdjModal(m); setAdjData({ actualQty: m.stock, reason: '' }); }}
                      className="px-4 py-1.5 bg-coffee-100 text-coffee-600 rounded-full text-xs font-bold hover:bg-coffee-200 transition-colors inline-flex items-center gap-1"
                    >
                      <Target className="w-3 h-3" /> 庫存盤點
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                   <span className="font-serif-brand font-bold text-lg text-coffee-800">{fmt(adjModal.stock)} {adjModal.unit}</span>
                 </div>
                 
                 <div>
                   <label className="text-xs font-bold text-coffee-500 mb-1 block">實際盤點餘額</label>
                   <div className="relative">
                     <input type="number" step="0.01" required value={adjData.actualQty || ''} onChange={e => setAdjData({...adjData, actualQty: parseFloat(e.target.value)})} className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-3 font-serif-brand font-bold text-xl text-rose-brand outline-none focus:border-rose-brand focus:ring-2 focus:ring-rose-brand/20 pr-12 text-right" />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-coffee-400 font-bold">{adjModal.unit}</span>
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
    </div>
  );
}
