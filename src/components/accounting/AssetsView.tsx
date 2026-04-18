import React, { useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { FixedAsset, JournalEntry } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { Plus, Trash2, Edit2, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AssetsView({ shopId, selectedYear }: { shopId: string, selectedYear: number }) {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [depLog, setDepLog] = useState<Record<string, boolean>>({});
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ totalCost: 0, quantity: 1 });
  const [remarkAssetId, setRemarkAssetId] = useState<string | null>(null);
  const [tempRemark, setTempRemark] = useState('');

  const [formData, setFormData] = useState<Partial<FixedAsset>>({
    status: '使用中',
    category: '生財設備',
    name: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    totalCost: 0,
    quantity: 1,
    usefulLife: 5,
    residualValue: 0
  });

  React.useEffect(() => {
    const q = query(collection(db, 'shops', shopId, 'assets'), orderBy('purchaseDate', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() } as FixedAsset)));
    });
    return unsub;
  }, [shopId]);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'shops', shopId, 'meta', 'depLog'), (snap) => {
      if (snap.exists()) setDepLog(snap.data());
    });
    return unsub;
  }, [shopId]);

  const updateAssetStatus = async (id: string, newStatus: string) => {
    await setDoc(doc(db, 'shops', shopId, 'assets', id), { id, status: newStatus }, { merge: true });
  };
  
  const startEditing = (asset: FixedAsset) => {
    setEditingId(asset.id);
    setEditData({ totalCost: asset.totalCost, quantity: asset.quantity });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await setDoc(doc(db, 'shops', shopId, 'assets', editingId), { 
      id: editingId,
      totalCost: editData.totalCost, 
      quantity: editData.quantity 
    }, { merge: true });
    setEditingId(null);
  };

  const openRemark = (asset: FixedAsset) => {
    setRemarkAssetId(asset.id);
    setTempRemark(asset.remark || '');
  };

  const saveRemark = async () => {
    if (!remarkAssetId) return;
    await setDoc(doc(db, 'shops', shopId, 'assets', remarkAssetId), { 
      id: remarkAssetId,
      remark: tempRemark 
    }, { merge: true });
    setRemarkAssetId(null);
  };

  const calculateDepreciation = (asset: FixedAsset, year: number, month: number) => {
    const purchaseDate = new Date(asset.purchaseDate);
    const targetDate = new Date(year, month, 0); // End of month
    
    const endDate = new Date(purchaseDate);
    endDate.setFullYear(purchaseDate.getFullYear() + asset.usefulLife);

    const totalMonths = asset.usefulLife * 12;
    const monthlyDep = totalMonths > 0 ? (asset.totalCost - asset.residualValue) / totalMonths : 0;
    const unitMonthlyDep = asset.quantity > 0 ? monthlyDep / asset.quantity : 0;

    let monthsUsed = (targetDate.getFullYear() - purchaseDate.getFullYear()) * 12 + (targetDate.getMonth() - purchaseDate.getMonth());
    if (targetDate.getDate() < purchaseDate.getDate()) monthsUsed--;
    monthsUsed = Math.max(0, monthsUsed);

    const accumulated = Math.min(asset.totalCost - asset.residualValue, monthlyDep * monthsUsed);
    const unitAccumulated = asset.quantity > 0 ? accumulated / asset.quantity : 0;
    const bookValue = asset.totalCost - accumulated;
    
    let status = '折舊中';
    if (asset.status === '已售出') status = '停止折舊';
    else if (bookValue <= asset.residualValue || monthsUsed >= totalMonths) status = '折舊結束';
    else if (targetDate < purchaseDate) status = '尚未開始';

    return {
      monthly: Math.round(monthlyDep),
      unitMonthly: Math.round(unitMonthlyDep),
      accumulated: Math.round(accumulated),
      unitAccumulated: Math.round(unitAccumulated),
      bookValue: Math.round(bookValue),
      status,
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  const monthlyTotal = assets.reduce((sum, a) => {
    const d = calculateDepreciation(a, selectedYear, selectedMonth);
    return sum + (d.status === '折舊中' ? d.monthly : 0);
  }, 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    await setDoc(doc(db, 'shops', shopId, 'assets', id), { ...formData, id });
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    // Note: window.confirm is blocked in iframe previews, performing delete directly
    await deleteDoc(doc(db, 'shops', shopId, 'assets', id));
  };

  const recordDepreciation = async () => {
    const key = `${selectedYear}-${selectedMonth}`;
    if (depLog[key]) return;
    
    // Note: window.confirm is blocked in iframe previews, performing action directly
    const entryId = uid();
    const entry: JournalEntry = {
      id: entryId,
      date: new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0],
      year: selectedYear,
      voucherNo: `DEP-${selectedYear}${String(selectedMonth).padStart(2, '0')}`,
      description: `${selectedYear}/${selectedMonth} 固定資產折舊提列`,
      lines: [
        { id: uid(), type: 'debit', accountId: '6105', accountName: '折舊費用', amount: monthlyTotal, lineDescription: '本月資產折舊' },
        { id: uid(), type: 'credit', accountId: '1402', accountName: '累計折舊', amount: monthlyTotal, lineDescription: '本月資產折舊' }
      ],
      debitTotal: monthlyTotal,
      creditTotal: monthlyTotal
    };

    await setDoc(doc(db, 'shops', shopId, 'entries', entryId), entry);
    await setDoc(doc(db, 'shops', shopId, 'meta', 'depLog'), { ...depLog, [key]: true }, { merge: true });
    alert('提列成功！');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">固定資產管理 (Fixed Assets)</h2>
          <div className="flex items-center gap-3 mt-2">
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-coffee-50 border border-coffee-100 rounded-lg px-3 py-1 text-sm font-bold text-coffee-600 outline-none"
            >
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1} 月</option>)}
            </select>
            <div className="h-4 w-px bg-coffee-100" />
            <span className="text-sm font-bold text-coffee-400">當月預估折舊:</span>
            <span className="text-lg font-serif-brand font-bold text-coffee-800">${fmt(Math.round(monthlyTotal))}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={recordDepreciation}
            disabled={depLog[`${selectedYear}-${selectedMonth}`] || monthlyTotal === 0}
            className={cn(
              "px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all shadow-md active:scale-95",
              depLog[`${selectedYear}-${selectedMonth}`] 
                ? "bg-green-100 text-green-700 pointer-events-none" 
                : "bg-white border border-coffee-200 text-coffee-600 hover:bg-coffee-50"
            )}
          >
            {depLog[`${selectedYear}-${selectedMonth}`] ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {depLog[`${selectedYear}-${selectedMonth}`] ? '本月已提列' : '提列本月折舊'}
          </button>
          
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-coffee-600 text-white px-8 py-2.5 rounded-full font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" /> 新增資產
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="glass-panel p-8 bg-white/50 border-2 border-coffee-100 shadow-xl rounded-[32px]">
          <h3 className="text-lg font-bold mb-6 text-coffee-800">登記新固定資產</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">資產類別</label>
              <select 
                value={formData.category} 
                onChange={e => setFormData({...formData, category: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
              >
                {['生財設備', '裝修工程', '租賃物改良', '辦公設備', '運輸設備'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">資產名稱</label>
              <input 
                type="text" 
                required
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
                placeholder="例如: 烤箱"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">購入日期</label>
              <input 
                type="date"
                required
                value={formData.purchaseDate} 
                onChange={e => setFormData({...formData, purchaseDate: e.target.value})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-coffee-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">購入總價</label>
              <input 
                type="number"
                required
                value={formData.totalCost || ''} 
                onChange={e => setFormData({...formData, totalCost: Number(e.target.value)})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm text-right outline-none focus:ring-2 focus:ring-coffee-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">數量</label>
              <input 
                type="number"
                required
                value={formData.quantity || ''} 
                onChange={e => setFormData({...formData, quantity: Number(e.target.value)})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm text-right outline-none focus:ring-2 focus:ring-coffee-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">折舊年限 (年)</label>
              <input 
                type="number"
                required
                value={formData.usefulLife || ''} 
                onChange={e => setFormData({...formData, usefulLife: Number(e.target.value)})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm text-right outline-none focus:ring-2 focus:ring-coffee-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-coffee-300 uppercase ml-1">預估殘值</label>
              <input 
                type="number"
                required
                value={formData.residualValue || ''} 
                onChange={e => setFormData({...formData, residualValue: Number(e.target.value)})}
                className="w-full bg-white border border-coffee-100 rounded-xl px-4 py-2 text-sm text-right outline-none focus:ring-2 focus:ring-coffee-100"
              />
            </div>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="flex-1 bg-white border border-coffee-100 text-coffee-400 py-3 rounded-xl font-bold hover:bg-coffee-50"
              >
                取消
              </button>
              <button 
                type="submit"
                className="flex-2 bg-coffee-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-coffee-900 shadow-lg active:scale-95 transition-all"
              >
                確認新增
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-[32px] overflow-hidden border border-coffee-50 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="bg-[#faf7f2]">
            <tr className="text-coffee-400 font-bold uppercase tracking-wider text-xs">
              <th className="px-3 py-4 text-left">狀態</th>
              <th className="px-3 py-4 text-left">類別</th>
              <th className="px-3 py-4 text-left">購買日期</th>
              <th className="px-3 py-4 text-left">名稱</th>
              <th className="px-3 py-4 text-right">購入總價</th>
              <th className="px-3 py-4 text-right">數量</th>
              <th className="px-3 py-4 text-right">折舊年限</th>
              <th className="px-3 py-4 text-left">折舊結束日</th>
              <th className="px-3 py-4 text-right">估計殘值</th>
              <th className="px-3 py-4 text-right">月折舊金額</th>
              <th className="px-3 py-4 text-right">累積折舊</th>
              <th className="px-3 py-4 text-right">帳面價值</th>
              <th className="px-3 py-4 text-center">折舊狀態</th>
              <th className="px-3 py-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-50 border-t border-coffee-50 bg-[#fffdf5]">
            {assets.map(asset => {
              const d = calculateDepreciation(asset, selectedYear, selectedMonth);
              return (
                <tr key={asset.id} className="group hover:bg-coffee-50/50 transition-colors">
                  <td className="px-3 py-4">
                    <select 
                       value={asset.status || '使用中'} 
                       onChange={(e) => updateAssetStatus(asset.id, e.target.value)}
                       className={cn(
                           "px-2 py-1 rounded text-[10px] font-bold border-none outline-none focus:ring-2 focus:ring-coffee-200 cursor-pointer text-center",
                           asset.status === '使用中' ? 'bg-mint-brand text-white' :
                           asset.status === '已售出' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                       )}
                    >
                       <option value="使用中">使用中</option>
                       <option value="已售出">已售出</option>
                       <option value="閒置">閒置</option>
                    </select>
                  </td>
                  <td className="px-3 py-4 font-bold text-coffee-800 text-xs">{asset.category}</td>
                  <td className="px-3 py-4 font-bold text-coffee-400 text-[10px] font-mono whitespace-nowrap">{asset.purchaseDate}</td>
                  <td className="px-3 py-4 font-bold text-coffee-700">{asset.name}</td>
                  <td className="px-3 py-4 text-right font-mono font-medium text-gray-700">
                      {editingId === asset.id ? (
                          <input 
                              type="number" 
                              value={editData.totalCost} 
                              onChange={e => setEditData({...editData, totalCost: Number(e.target.value)})}
                              className="w-24 border rounded p-1 text-right text-sm"
                          />
                      ) : (
                          asset.totalCost.toLocaleString()
                      )}
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-gray-700">
                      {editingId === asset.id ? (
                          <input 
                              type="number" 
                              value={editData.quantity} 
                              onChange={e => setEditData({...editData, quantity: Number(e.target.value)})}
                              className="w-16 border rounded p-1 text-right text-sm"
                          />
                      ) : (
                          asset.quantity
                      )}
                  </td>
                  <td className="px-3 py-4 text-right font-medium text-gray-700">{asset.usefulLife} 年</td>
                  <td className="px-3 py-4 font-bold text-gray-400 text-[10px] font-mono whitespace-nowrap">{d.endDate}</td>
                  <td className="px-3 py-4 text-right font-mono text-gray-500">{asset.residualValue.toLocaleString()}</td>
                  <td className="px-3 py-4 text-right font-mono font-medium text-coffee-800">
                      {d.monthly.toLocaleString()}
                      {asset.quantity > 1 && (
                          <div className="text-[10px] text-gray-400">({d.unitMonthly.toLocaleString()} / 件)</div>
                      )}
                  </td>
                  <td className="px-3 py-4 text-right font-mono font-bold text-rose-brand">
                      <div>{d.accumulated.toLocaleString()}</div>
                      {asset.quantity > 1 && (
                          <div className="text-[10px] text-rose-300 font-normal">({d.unitAccumulated.toLocaleString()} / 件)</div>
                      )}
                  </td>
                  <td className="px-3 py-4 text-right font-mono font-bold text-coffee-700 text-base">{d.bookValue.toLocaleString()}</td>
                  <td className="px-3 py-4 text-center">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded border",
                      d.status === '折舊中' ? "border-blue-200 text-blue-600 bg-blue-50" :
                      d.status === '折舊結束' ? "border-green-200 text-green-500 bg-green-50" :
                      d.status === '尚未開始' ? "border-gray-200 text-gray-400" :
                      "border-rose-200 text-rose-600 bg-rose-50"
                    )}>{d.status}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <div className="flex justify-center items-center gap-2">
                        {editingId === asset.id ? (
                            <>
                                <button onClick={saveEdit} className="text-green-600 hover:text-green-800 font-bold text-xs">儲存</button>
                                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">取消</button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => openRemark(asset)} 
                                    className={`text-xs px-2 py-1 rounded transition ${asset.remark ? 'font-bold bg-amber-50 text-amber-700' : 'text-coffee-400 hover:text-coffee-600'}`}
                                >
                                    {asset.remark ? '👁️ 備註' : '💬 備註'}
                                </button>
                                <button onClick={() => startEditing(asset)} className="text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition text-xs">編輯</button>
                                <button onClick={() => handleDelete(asset.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition text-xs">✕</button>
                            </>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && (
              <tr>
                <td colSpan={14} className="py-20 text-center text-gray-400 text-base italic">目前尚無固定資產登記資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {remarkAssetId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in-up">
                  <div className="p-4 border-b flex justify-between items-center bg-coffee-50">
                      <h3 className="font-bold text-coffee-700 flex items-center gap-2">
                          <span>📝</span> 資產備註 - {assets.find(a => a.id === remarkAssetId)?.name}
                      </h3>
                      <button onClick={() => setRemarkAssetId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                  </div>
                  <div className="p-6">
                      <textarea 
                          className="w-full h-40 border-2 border-coffee-100 rounded-xl p-4 focus:ring-2 focus:ring-coffee-300 outline-none text-gray-700 resize-none"
                          placeholder="輸入資產相關備註事項..."
                          value={tempRemark}
                          onChange={(e) => setTempRemark(e.target.value)}
                          autoFocus
                      />
                      <div className="mt-6 flex gap-3">
                          <button 
                              onClick={() => setRemarkAssetId(null)}
                              className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition"
                          >
                              取消
                          </button>
                          <button 
                              onClick={saveRemark}
                              className="flex-1 py-3 bg-coffee-600 text-white rounded-xl font-bold hover:bg-coffee-700 shadow-lg transition"
                          >
                              儲存備註
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
