import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Material, MaterialCostRecord } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Save, Trash2, Calculator } from 'lucide-react';

export default function MaterialCostTab({ materials, shopId }: { materials: Material[], shopId: string }) {
  const [records, setRecords] = useState<MaterialCostRecord[]>([]);
  const [formData, setFormData] = useState<Partial<MaterialCostRecord> & { rate?: number }>({
    materialId: '', qty: 1, unit: '', price: 0, rate: undefined
  });

  useEffect(() => {
    const q = query(collection(db, 'shops', shopId, 'materialCostRecords'));
    const unsub = onSnapshot(q, snap => {
      const recs = snap.docs.map(d => d.data() as MaterialCostRecord);
      recs.sort((a, b) => b.date.localeCompare(a.date));
      setRecords(recs);
    });
    return unsub;
  }, [shopId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.materialId || !formData.qty || !formData.unit || formData.price === undefined) {
      return alert('請填寫完整資訊');
    }

    const unitCost = formData.price / formData.qty;
    const recId = uid();
    const payload: MaterialCostRecord = {
      id: recId,
      materialId: formData.materialId,
      qty: formData.qty,
      unit: formData.unit,
      price: formData.price,
      unitCost,
      date: new Date().toISOString().substring(0, 10),
      timestamp: Date.now()
    };

    await setDoc(doc(db, 'shops', shopId, 'materialCostRecords', recId), payload);

    // Update material's purchase unit and optionally avgCost if they want it
    const mat = materials.find(m => m.id === formData.materialId);
    if (mat) {
      let costPerStockUnit = unitCost;
      let rate = formData.rate || mat.purchaseUnitRate;

      if (mat.unit !== formData.unit) {
        if (rate) {
          costPerStockUnit = unitCost / rate;
        } else {
          // If no rate, temporary fallback
          costPerStockUnit = unitCost;
        }
      } else {
        rate = 1;
      }
      
      await setDoc(doc(db, 'shops', shopId, 'materials', mat.id), {
        ...mat,
        purchaseUnit: formData.unit,
        ...(rate && mat.unit !== formData.unit ? { purchaseUnitRate: rate } : {}),
        avgCost: costPerStockUnit
      }, { merge: true });
    }

    setFormData({ materialId: '', qty: 1, unit: '', price: 0, rate: undefined });
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定刪除此紀錄？')) {
      await deleteDoc(doc(db, 'shops', shopId, 'materialCostRecords', id));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">食材成本紀錄</h2>
          <p className="text-sm text-coffee-400">新增或現有的食材帶入並填寫數量、單位、購買價格，自動計算出每單位成本。</p>
        </div>
      </div>

      <div className="glass-panel p-6 bg-white/60 mb-6 border-2 border-coffee-100 shadow-md rounded-[24px]">
        <h3 className="font-bold text-coffee-800 mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-coffee-400" /> 新增成本紀錄
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold text-coffee-400 block mb-1">食材選擇</label>
            <select 
              required 
              value={formData.materialId} 
              onChange={e => {
                const mat = materials.find(m => m.id === e.target.value);
                setFormData({...formData, materialId: e.target.value, unit: mat?.purchaseUnit || mat?.unit || '', rate: mat?.purchaseUnitRate});
              }} 
              className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300"
            >
              <option value="">請選擇...</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {materials.find(m => m.id === formData.materialId) && materials.find(m => m.id === formData.materialId)!.unit !== formData.unit ? (
            <div className="md:col-span-1">
              <label className="text-[10px] font-bold text-amber-600 block mb-1">單位換算 (1{formData.unit} = ?{materials.find(m => m.id === formData.materialId)!.unit})</label>
              <input type="number" step="0.01" required min="0.01" value={formData.rate || ''} onChange={e => setFormData({...formData, rate: parseFloat(e.target.value) || undefined})} className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 outline-none focus:border-amber-400" />
            </div>
          ) : null}
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-coffee-400 block mb-1">數量</label>
            <input type="number" step="0.01" required min="0.01" value={formData.qty || ''} onChange={e => setFormData({...formData, qty: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" />
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-coffee-400 block mb-1">單位</label>
            <input type="text" required value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" placeholder="例如: 箱" />
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-coffee-400 block mb-1">購買價格</label>
            <input type="number" required min="0" value={formData.price === 0 ? '' : formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 outline-none focus:border-coffee-300" />
          </div>
          <div className="md:col-span-1 pb-0.5">
            <button type="submit" className="w-full bg-coffee-800 text-white rounded-xl py-2 font-bold hover:bg-coffee-900 transition flex items-center justify-center gap-2"><Save className="w-4 h-4"/> 儲存</button>
          </div>
          {formData.qty && formData.price && formData.qty > 0 ? (
             <div className="md:col-span-6 text-right text-xs font-bold text-coffee-600 bg-coffee-50 p-2 rounded-xl border border-coffee-100">
               每單位成本估算： <span className="text-mint-brand font-serif-brand text-sm">${fmt(formData.price / formData.qty)}</span> / {formData.unit}
             </div>
          ) : null}
        </form>
      </div>

      <div className="glass-panel p-4 md:p-6 bg-white border border-coffee-50 shadow-sm rounded-[24px]">
        <h3 className="text-lg font-bold text-coffee-800 mb-4">近期成本紀錄</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm text-left">
            <thead className="bg-[#faf7f2]">
              <tr className="text-coffee-400 font-bold uppercase tracking-wider text-[10px] border-b border-coffee-100">
                <th className="py-3 px-4">日期</th>
                <th className="py-3 px-4">食材</th>
                <th className="py-3 px-4 text-right">數量</th>
                <th className="py-3 px-4 text-right">購買價格</th>
                <th className="py-3 px-4 text-right">每單位成本</th>
                <th className="py-3 px-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-50">
              {records.map(r => {
                const mat = materials.find(m => m.id === r.materialId);
                return (
                  <tr key={r.id} className="hover:bg-coffee-50/50">
                    <td className="py-3 px-4 font-medium text-coffee-600">{r.date || new Date(r.timestamp || 0).toISOString().substring(0,10)}</td>
                    <td className="py-3 px-4 font-bold text-coffee-800">{mat?.name || '（已移除）'}</td>
                    <td className="py-3 px-4 text-right">{r.qty} {r.unit}</td>
                    <td className="py-3 px-4 text-right font-serif-brand">${fmt(r.price)}</td>
                    <td className="py-3 px-4 text-right font-serif-brand font-bold text-mint-brand">${fmt(r.unitCost)}</td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => handleDelete(r.id)} className="text-coffee-300 hover:text-rose-brand transition"><Trash2 className="w-4 h-4 mx-auto" /></button>
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-coffee-300 font-bold">目前無任何成本紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
