import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { Material, PhysicalCountRecord, Purchase } from '../../types';
import { Target, CheckCircle2, AlertCircle, Plus, Calendar, Save, Trash2, Edit2, FileText, Lock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fmt, uid, monthISO } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface Props {
  materials: Material[];
  shopId: string;
  selectedYear: number;
  purchases: Purchase[];
}

export default function PeriodicCountTab({ materials, shopId, selectedYear, purchases }: Props) {
  const [records, setRecords] = useState<PhysicalCountRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PhysicalCountRecord | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'shops', shopId, 'physicalCounts'), where('yearMonth', '>=', `${selectedYear}-01`), where('yearMonth', '<=', `${selectedYear}-12`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PhysicalCountRecord));
      data.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
      setRecords(data);
    });
    return unsub;
  }, [shopId, selectedYear]);

  const handleCreateNew = () => {
    const newRecord: PhysicalCountRecord = {
      id: '',
      yearMonth: monthISO(),
      isOpeningBalance: records.length === 0, // 如果是該年度第一筆或完全沒資料，預設為期初開帳
      status: 'draft',
      items: {},
      totalInventoryValue: 0,
      updatedAt: new Date().toISOString()
    };
    
    // 初始化 items
    materials.forEach(m => {
      newRecord.items[m.id] = {
        actualQty: m.stock || 0,
        unitCost: m.avgCost || 0,
        totalValue: (m.stock || 0) * (m.avgCost || 0),
      };
    });

    setEditingRecord(newRecord);
    setIsModalOpen(true);
  };

  const handleEdit = (record: PhysicalCountRecord) => {
    setEditingRecord(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除這筆盤點紀錄嗎？')) {
      await deleteDoc(doc(db, 'shops', shopId, 'physicalCounts', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">月底實地盤點系統</h2>
          <p className="text-sm text-coffee-400">取代每日耗損登記，透過月底盤點結存，自動結算本月正確食材成本 (期初+進貨-期末)</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="bg-coffee-600 text-white px-6 py-2 rounded-2xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5" /> 新增盤點作業
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {records.map(record => (
          <div key={record.id} className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-100 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-mint-brand" />
                <h3 className="text-lg font-bold text-coffee-800">{record.yearMonth}</h3>
                {record.isOpeningBalance && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">期初開帳</span>}
              </div>
              {record.status === 'locked' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-coffee-400 bg-gray-100 px-2 py-1 rounded-full">
                  <Lock className="w-3 h-3" /> 已鎖定
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-brand bg-rose-50 px-2 py-1 rounded-full border border-rose-200">
                  <Edit2 className="w-3 h-3" /> 草稿中
                </span>
              )}
            </div>
            
            <div className="flex-1">
              <div className="text-[10px] font-bold text-coffee-400 mb-1">盤點庫存總值</div>
              <div className="text-2xl font-serif-brand font-bold text-coffee-900 mb-4">${fmt(record.totalInventoryValue)}</div>
              
              <div className="text-xs text-coffee-400">盤點品項數: {Object.keys(record.items).length} 項</div>
              <div className="text-xs text-coffee-400">更新時間: {new Date(record.updatedAt).toLocaleDateString()}</div>
            </div>

            <div className="mt-6 flex gap-2">
              <button 
                onClick={() => handleEdit(record)} 
                className="flex-1 py-2 bg-coffee-50 text-coffee-600 font-bold text-sm rounded-xl hover:bg-coffee-100 transition"
              >
                {record.status === 'locked' ? '查看明細' : '繼續盤點'}
              </button>
              {record.status !== 'locked' && (
                <button 
                  onClick={() => handleDelete(record.id)} 
                  className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {records.length === 0 && (
          <div className="col-span-full py-12 text-center text-coffee-300 font-bold bg-white rounded-3xl border border-dashed border-coffee-200">
            {selectedYear} 年尚無任何盤點紀錄
          </div>
        )}
      </div>

      {isModalOpen && editingRecord && (
        <CountModal 
          shopId={shopId} 
          record={editingRecord} 
          materials={materials} 
          purchases={purchases}
          records={records}
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
}

function CountModal({ shopId, record, materials, purchases, records, onClose }: { shopId: string, record: PhysicalCountRecord, materials: Material[], purchases: Purchase[], records: PhysicalCountRecord[], onClose: () => void }) {
  const [data, setData] = useState<PhysicalCountRecord>(record);

  const prevRecord = React.useMemo(() => {
    return [...records].filter(r => r.yearMonth < data.yearMonth && r.status === 'locked').sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth))[0];
  }, [records, data.yearMonth]);

  const groupedMaterials = React.useMemo(() => {
    const groups: Record<string, Material[]> = {};
    materials.forEach(m => {
      if (!groups[m.name]) groups[m.name] = [];
      groups[m.name].push(m);
    });
    return Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0]));
  }, [materials]);

  // 初始化單位輸入值
  useEffect(() => {
    if (data.status === 'locked') return; // 鎖定的不需要算輸入欄位
    
    const newItems = { ...data.items };
    materials.forEach(m => {
      if (!newItems[m.id]) {
        newItems[m.id] = { actualQty: 0, unitCost: m.avgCost || 0, totalValue: 0 };
      }
      
      const item = newItems[m.id];
      // 如果還沒設定 tier 值，從 actualQty 反推
      if (item.tier1Qty === undefined && item.tier2Qty === undefined && item.tier3Qty === undefined) {
        let initialBig = 0;
        let initialMid = 0;
        let initialSmall = Math.round(item.actualQty * 100) / 100;

        if (m.purchaseUnit && m.purchaseUnitRate) {
          initialBig = Math.floor(initialSmall / m.purchaseUnitRate);
          initialSmall = Math.round((initialSmall - initialBig * m.purchaseUnitRate) * 100) / 100;
        }
        if (m.midUnit && m.midUnitRate) {
          initialMid = Math.floor(initialSmall / m.midUnitRate);
          initialSmall = Math.round((initialSmall - initialMid * m.midUnitRate) * 100) / 100;
        }

        item.tier1Qty = initialBig;
        item.tier2Qty = initialMid;
        item.tier3Qty = initialSmall;
      }
    });
    setData(prev => ({ ...prev, items: newItems }));
  }, [materials]);

  const handleUpdateQty = (m: Material, tier: 1 | 2 | 3, value: number) => {
    const currentItem = data.items[m.id];
    let t1 = tier === 1 ? value : (currentItem.tier1Qty || 0);
    let t2 = tier === 2 ? value : (currentItem.tier2Qty || 0);
    let t3 = tier === 3 ? value : (currentItem.tier3Qty || 0);

    const actualQty = 
      t1 * (m.purchaseUnitRate || 0) + 
      t2 * (m.midUnitRate || 0) + 
      t3;

    setData(prev => ({
      ...prev,
      items: {
        ...prev.items,
        [m.id]: {
          ...currentItem,
          tier1Qty: t1,
          tier2Qty: t2,
          tier3Qty: t3,
          actualQty: Math.round(actualQty * 100) / 100,
          totalValue: Math.round(actualQty * 100) / 100 * currentItem.unitCost
        }
      }
    }));
  };

  const handleSave = async (isLocked: boolean = false) => {
    if (!data.yearMonth) return alert('請填寫盤點月份');

    let totalVal = 0;
    Object.keys(data.items).forEach(k => { totalVal += data.items[k].totalValue; });

    const id = data.id || uid();
    const payload: PhysicalCountRecord = {
      ...data,
      id,
      status: isLocked ? 'locked' : 'draft',
      totalInventoryValue: totalVal,
      updatedAt: new Date().toISOString()
    };

    if (isLocked) {
      if (!confirm('鎖定後將無法再修改盤點數字，且會同步更新為目前的最新庫存，確定要鎖定嗎？')) return;
      
      // Update material stock synchronously if locking
      materials.forEach(async m => {
        const item = payload.items[m.id];
        if (item) {
          await setDoc(doc(db, 'shops', shopId, 'materials', m.id), {
            ...m,
            stock: item.actualQty
          }, { merge: true });
        }
      });
    }

    await setDoc(doc(db, 'shops', shopId, 'physicalCounts', id), payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-5xl h-[90vh] flex flex-col bg-white border-0 shadow-2xl rounded-3xl relative z-10 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 bg-coffee-50/50 border-b border-coffee-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-3">
              {data.status === 'locked' ? '🔒 盤點明細查看' : '📋 執行月末盤點'}
              {data.status === 'draft' && <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded-lg">草稿未鎖定</span>}
            </h3>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-coffee-400">盤點月份</label>
                <input 
                  type="month" 
                  value={data.yearMonth} 
                  onChange={e => setData({...data, yearMonth: e.target.value})} 
                  disabled={data.status === 'locked'}
                  className="bg-white border border-coffee-200 rounded-lg px-2 py-1 text-sm font-bold text-coffee-800 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">
                <input 
                  type="checkbox" 
                  checked={data.isOpeningBalance} 
                  onChange={e => setData({...data, isOpeningBalance: e.target.checked})}
                  disabled={data.status === 'locked'}
                  className="w-3.5 h-3.5 text-amber-500 rounded focus:ring-amber-500 disabled:opacity-50" 
                />
                <span className="text-xs font-bold text-amber-800">這是期初開帳 (不計算本月損益)</span>
              </label>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-coffee-400 hover:bg-coffee-100 hover:text-coffee-600 rounded-full transition"><X className="w-6 h-6"/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#faf7f2]">
          <div className="bg-white rounded-2xl shadow-sm border border-coffee-50 overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-coffee-50 border-b border-coffee-100">
                <tr>
                  <th className="p-3 font-bold text-coffee-600 w-24">商品名稱</th>
                  <th className="p-3 font-bold text-coffee-600 text-right w-24">期初庫存</th>
                  <th className="p-3 font-bold text-coffee-600 w-24">廠商名稱</th>
                  <th className="p-3 font-bold text-coffee-600 text-right w-24">本月進貨</th>
                  <th className="p-3 font-bold text-coffee-600 text-right w-24">單位成本</th>
                  <th className="p-3 font-bold text-coffee-600 text-center w-[300px]">期末盤點輸入 (支援多階層)</th>
                  <th className="p-3 font-bold text-coffee-600 text-right w-24">盤點總值</th>
                </tr>
              </thead>
              <tbody>
                {groupedMaterials.map(([name, mats]) => {
                  let beginningSum = 0;
                  mats.forEach(m => {
                    if (data.isOpeningBalance) {
                      beginningSum += m.stock;
                    } else if (prevRecord && prevRecord.items[m.id]) {
                      beginningSum += prevRecord.items[m.id].actualQty;
                    }
                  });

                  return (
                    <React.Fragment key={name}>
                      {mats.map((m, idx) => {
                        const item = data.items[m.id];
                        if (!item) return null;

                        let purchaseQty = 0;
                        purchases.filter(p => p.date.startsWith(data.yearMonth)).forEach(p => {
                          p.lines.filter(l => l.materialId === m.id).forEach(l => {
                            const currentUnit = l.purchaseUnit || m.purchaseUnit || m.unit;
                            const isPurchaseUnit = currentUnit === m.purchaseUnit;
                            const isMidUnit = currentUnit === m.midUnit;
                            const rate = isPurchaseUnit ? (m.purchaseUnitRate || 1) : (isMidUnit ? (m.midUnitRate || 1) : 1);
                            purchaseQty += (l.purchaseQty !== undefined ? l.purchaseQty : (l.qty || 0)) * rate;
                          });
                        });

                        return (
                          <tr key={m.id} className="border-b border-gray-50 hover:bg-coffee-50/30 transition-colors">
                            {idx === 0 && (
                              <>
                                <td rowSpan={mats.length} className="p-3 font-bold text-coffee-800 bg-white border-r border-coffee-50 align-top">{name}</td>
                                <td rowSpan={mats.length} className="p-3 text-right font-bold text-coffee-600 bg-white border-r border-coffee-50 align-top">
                                  {fmt(beginningSum)} <span className="text-[10px] text-coffee-400">{m.unit}</span>
                                </td>
                              </>
                            )}
                            <td className="p-3 text-xs font-bold text-coffee-500">{m.vendor || '無'}</td>
                            <td className="p-3 text-right font-bold text-coffee-600">{fmt(purchaseQty)} <span className="text-[10px] text-coffee-400">{m.unit}</span></td>
                            <td className="p-3 text-right font-mono text-coffee-500">${fmt(item.unitCost)}</td>
                            <td className="p-3">
                              {data.status === 'locked' ? (
                                <div className="text-center font-bold text-coffee-700">
                                  {item.tier1Qty ? `${fmt(item.tier1Qty)} ${m.purchaseUnit} ` : ''}
                                  {item.tier2Qty ? `${fmt(item.tier2Qty)} ${m.midUnit} ` : ''}
                                  {item.tier3Qty ? `${fmt(item.tier3Qty)} ${m.unit}` : ''}
                                  {!item.tier1Qty && !item.tier2Qty && !item.tier3Qty && `${fmt(item.actualQty)} ${m.unit}`}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  {m.purchaseUnit && m.purchaseUnitRate && (
                                    <div className="flex items-center gap-1">
                                      <input type="number" step="0.01" min="0" value={item.tier1Qty === 0 ? '' : item.tier1Qty} onChange={e => handleUpdateQty(m, 1, parseFloat(e.target.value) || 0)} className="w-14 bg-white border border-coffee-200 rounded px-1.5 py-1 font-mono font-bold text-rose-brand outline-none text-right focus:border-rose-brand" placeholder="0" />
                                      <span className="text-[10px] text-coffee-600 font-bold">{m.purchaseUnit}</span>
                                      <span className="text-[10px] text-coffee-300 mx-0.5">+</span>
                                    </div>
                                  )}
                                  {m.midUnit && m.midUnitRate && (
                                    <div className="flex items-center gap-1">
                                      <input type="number" step="0.01" min="0" value={item.tier2Qty === 0 ? '' : item.tier2Qty} onChange={e => handleUpdateQty(m, 2, parseFloat(e.target.value) || 0)} className="w-14 bg-white border border-coffee-200 rounded px-1.5 py-1 font-mono font-bold text-rose-brand outline-none text-right focus:border-rose-brand" placeholder="0" />
                                      <span className="text-[10px] text-coffee-600 font-bold">{m.midUnit}</span>
                                      <span className="text-[10px] text-coffee-300 mx-0.5">+</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <input type="number" step="0.01" min="0" value={item.tier3Qty === 0 && item.actualQty !== 0 ? '' : item.tier3Qty} onChange={e => handleUpdateQty(m, 3, parseFloat(e.target.value) || 0)} className="w-16 bg-white border border-coffee-200 rounded px-1.5 py-1 font-mono font-bold text-rose-brand outline-none text-right focus:border-rose-brand" placeholder="0" />
                                    <span className="text-[10px] text-coffee-600 font-bold">{m.unit}</span>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right font-serif-brand font-bold text-mint-brand text-lg">
                              ${fmt(item.totalValue)}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t border-coffee-100 flex justify-between items-center shrink-0">
          <div className="text-sm font-bold text-coffee-500">
            盤點總值估算: <span className="text-2xl font-serif-brand text-coffee-900 ml-2">${fmt(Object.keys(data.items).reduce((s, k) => s + data.items[k].totalValue, 0))}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition">
              關閉
            </button>
            {data.status !== 'locked' && (
              <>
                <button onClick={() => handleSave(false)} className="px-6 py-2.5 bg-white border border-coffee-200 text-coffee-600 rounded-xl font-bold shadow-sm hover:bg-coffee-50 transition flex items-center gap-2">
                  <Save className="w-4 h-4" /> 儲存草稿
                </button>
                <button onClick={() => handleSave(true)} className="px-8 py-2.5 bg-coffee-800 text-white rounded-xl font-bold shadow-md hover:bg-coffee-900 transition flex items-center gap-2">
                  <Lock className="w-4 h-4" /> 鎖定盤點並更新庫存
                </button>
              </>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
