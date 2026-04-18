import React, { useState } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { COAItem } from '../../types';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function CoaView({ coa, shopId }: { coa: COAItem[], shopId: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<COAItem>({ id: '', name: '', type: '資產', side: 'debit' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let newList: COAItem[];
    
    if (editingId) {
      newList = coa.map(a => a.id === formData.id ? formData : a);
    } else {
      if (coa.some(a => a.id === formData.id)) {
        alert('編號已存在');
        return;
      }
      newList = [...coa, formData].sort((a, b) => a.id.localeCompare(b.id));
    }

    await setDoc(doc(db, 'shops', shopId, 'meta', 'coa'), { list: newList });
    setIsAdding(false);
    setEditingId(null);
    setFormData({ id: '', name: '', type: '資產', side: 'debit' });
  };

  const startEdit = (a: COAItem) => {
    setFormData(a);
    setEditingId(a.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    // Note: window.confirm is blocked in iframe previews
    const newList = coa.filter(a => a.id !== id);
    await setDoc(doc(db, 'shops', shopId, 'meta', 'coa'), { list: newList });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">會計科目管理 (COA)</h2>
          <p className="text-sm text-coffee-400">定義系統中使用的會計科目及其預設餘額方向。</p>
        </div>
        <button 
          onClick={() => { setIsAdding(!isAdding); setEditingId(null); setFormData({ id: '', name: '', type: '資產', side: 'debit' }); }}
          className="bg-coffee-600 text-white px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? '取消' : '新增科目'}
        </button>
      </div>

      {isAdding && (
        <div className="glass-panel p-6 border-2 border-coffee-100 mb-6 bg-white/50">
          <h3 className="text-lg font-bold mb-6 text-coffee-700">{editingId ? '編輯科目' : '新增科目'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">編號</label>
              <input 
                type="text" 
                value={formData.id} 
                onChange={e => setFormData({...formData, id: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
                placeholder="例如: 1101"
                required
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">名稱</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
                placeholder="例如: 現金"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">類別</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
              >
                {['資產', '負債', '權益', '收入', '成本', '費用', '營業外收入', '營業外費損'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">正常方向</label>
              <select 
                value={formData.side} 
                onChange={e => setFormData({...formData, side: e.target.value as any})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
              >
                <option value="debit">借方 (Debit)</option>
                <option value="credit">貸方 (Credit)</option>
              </select>
            </div>
            <button type="submit" className="bg-coffee-600 text-white py-2 rounded-xl hover:bg-coffee-700 transition font-bold shadow-md h-[40px] flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> {editingId ? '更新' : '儲存'}
            </button>
          </form>
        </div>
      )}

      <div className="rounded-[24px] overflow-hidden border border-coffee-50 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[#faf7f2]">
            <tr className="text-coffee-400 font-bold uppercase tracking-wider">
              <th className="px-6 py-4 text-left">編號</th>
              <th className="px-6 py-4 text-left">名稱</th>
              <th className="px-6 py-4 text-left">類別</th>
              <th className="px-6 py-4 text-left">正常方向</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-50">
            {coa.map(a => (
              <tr key={a.id} className="group hover:bg-coffee-50/30 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-coffee-600 tracking-tighter">{a.id}</td>
                <td className="px-6 py-4 font-bold text-coffee-800">{a.name}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                    a.type === '資產' ? 'bg-blue-100 text-blue-700' :
                    a.type === '負債' ? 'bg-red-100 text-red-700' :
                    a.type === '權益' ? 'bg-purple-100 text-purple-700' :
                    a.type === '收入' ? 'bg-green-100 text-green-700' :
                    a.type === '成本' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  )}>
                    {a.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-coffee-400 font-medium">{a.side === 'debit' ? '借方 (Dr)' : '貸方 (Cr)'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(a)} className="p-2 text-coffee-300 hover:text-coffee-600 rounded-lg hover:bg-coffee-100"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(a.id)} className="p-2 text-coffee-200 hover:text-danger-brand rounded-lg hover:bg-danger-brand/5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
