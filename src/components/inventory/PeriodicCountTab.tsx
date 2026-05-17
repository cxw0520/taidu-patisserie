import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { Material, PhysicalCountRecord, Purchase, COAItem } from '../../types';
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
  const [coa, setCoa] = useState<COAItem[]>([]);
  const [pendingVoucher, setPendingVoucher] = useState<any | null>(null);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'shops', shopId, 'meta', 'coa'), (snap) => {
      if (snap.exists() && snap.data()?.list) {
        setCoa(snap.data().list);
      }
    });
    return unsub;
  }, [shopId]);

  const prevRecord = React.useMemo(() => {
    return [...records].filter(r => r.yearMonth < data.yearMonth && r.status === 'locked').sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth))[0];
  }, [records, data.yearMonth]);

  const totalsByCategory = React.useMemo(() => {
    const totals: Record<string, number> = { '食材': 0, '包材': 0, '裝飾品': 0 };
    materials.forEach(m => {
      const item = data.items[m.id];
      if (item) {
        const cat = m.category || '食材';
        if (totals[cat] !== undefined) {
          totals[cat] += Number(item.totalValue) || 0;
        } else {
          totals[cat] = Number(item.totalValue) || 0;
        }
      }
    });
    return totals;
  }, [data.items, materials]);

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
      if (!confirm('鎖定後將無法再修改盤點數字，且會同步更新為目前的最新庫存，並生成月底調整傳票草稿，確定要鎖定嗎？')) return;
      
      // Calculate inventory deltas (Ending - Beginning)
      const foodBeginning = materials.filter(m => m.category === '食材').reduce((s, m) => s + (prevRecord?.items[m.id]?.totalValue || 0), 0);
      const foodEnding = materials.filter(m => m.category === '食材').reduce((s, m) => s + (data.items[m.id]?.totalValue || 0), 0);
      const foodDelta = foodEnding - foodBeginning;

      const pkgBeginning = materials.filter(m => m.category === '包材').reduce((s, m) => s + (prevRecord?.items[m.id]?.totalValue || 0), 0);
      const pkgEnding = materials.filter(m => m.category === '包材').reduce((s, m) => s + (data.items[m.id]?.totalValue || 0), 0);
      const pkgDelta = pkgEnding - pkgBeginning;

      const decBeginning = materials.filter(m => m.category === '裝飾品').reduce((s, m) => s + (prevRecord?.items[m.id]?.totalValue || 0), 0);
      const decEnding = materials.filter(m => m.category === '裝飾品').reduce((s, m) => s + (data.items[m.id]?.totalValue || 0), 0);
      const decDelta = decEnding - decBeginning;

      const lines: any[] = [];
      const findAccountName = (accId: string, def: string) => {
        return coa.find(c => c.id === accId)?.name || def;
      };

      // 1. 食材調整 (1301 食材存貨 vs 5101 食材成本)
      if (Math.abs(foodDelta) >= 0.01) {
        if (foodDelta > 0) {
          lines.push({
            id: uid(),
            accountId: '1301',
            accountName: findAccountName('1301', '食材存貨'),
            type: 'debit',
            amount: Math.round(foodDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 月底食材存貨盤點增加調整`
          });
          lines.push({
            id: uid(),
            accountId: '5101',
            accountName: findAccountName('5101', '食材成本'),
            type: 'credit',
            amount: Math.round(foodDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 食材成本扣減結轉`
          });
        } else {
          lines.push({
            id: uid(),
            accountId: '5101',
            accountName: findAccountName('5101', '食材成本'),
            type: 'debit',
            amount: Math.round(Math.abs(foodDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 食材成本消耗結轉`
          });
          lines.push({
            id: uid(),
            accountId: '1301',
            accountName: findAccountName('1301', '食材存貨'),
            type: 'credit',
            amount: Math.round(Math.abs(foodDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 月底食材存貨盤點減少調整`
          });
        }
      }

      // 2. 包材調整 (1302 包材存貨 vs 5102 包材成本)
      if (Math.abs(pkgDelta) >= 0.01) {
        if (pkgDelta > 0) {
          lines.push({
            id: uid(),
            accountId: '1302',
            accountName: findAccountName('1302', '包材存貨'),
            type: 'debit',
            amount: Math.round(pkgDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 月底包材存貨盤點增加調整`
          });
          lines.push({
            id: uid(),
            accountId: '5102',
            accountName: findAccountName('5102', '包材成本'),
            type: 'credit',
            amount: Math.round(pkgDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 包材成本扣減結轉`
          });
        } else {
          lines.push({
            id: uid(),
            accountId: '5102',
            accountName: findAccountName('5102', '包材成本'),
            type: 'debit',
            amount: Math.round(Math.abs(pkgDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 包材成本消耗結轉`
          });
          lines.push({
            id: uid(),
            accountId: '1302',
            accountName: findAccountName('1302', '包材存貨'),
            type: 'credit',
            amount: Math.round(Math.abs(pkgDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 月底包材存貨盤點減少調整`
          });
        }
      }

      // 3. 裝飾品調整 (1303 裝飾品存貨 vs 5104 耗損成本)
      if (Math.abs(decDelta) >= 0.01) {
        if (decDelta > 0) {
          lines.push({
            id: uid(),
            accountId: '1303',
            accountName: findAccountName('1303', '裝飾品存貨'),
            type: 'debit',
            amount: Math.round(decDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 月底裝飾品存貨盤點增加調整`
          });
          lines.push({
            id: uid(),
            accountId: '5104',
            accountName: findAccountName('5104', '耗損成本'),
            type: 'credit',
            amount: Math.round(decDelta * 100) / 100,
            lineDescription: `${data.yearMonth} 裝飾品消耗扣減結轉`
          });
        } else {
          lines.push({
            id: uid(),
            accountId: '5104',
            accountName: findAccountName('5104', '耗損成本'),
            type: 'debit',
            amount: Math.round(Math.abs(decDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 裝飾品耗損消耗結轉`
          });
          lines.push({
            id: uid(),
            accountId: '1303',
            accountName: findAccountName('1303', '裝飾品存貨'),
            type: 'credit',
            amount: Math.round(Math.abs(decDelta) * 100) / 100,
            lineDescription: `${data.yearMonth} 月底裝飾品存貨盤點減少調整`
          });
        }
      }

      // Generate voucher number prefix based on the month's last day
      const [yearStr, monthStr] = data.yearMonth.split('-');
      const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0);
      const lastDayString = `${yearStr}-${monthStr}-${String(lastDay.getDate()).padStart(2, '0')}`;
      
      const yy = yearStr.slice(-2);
      const datePrefix = `${yy}${monthStr}${String(lastDay.getDate()).padStart(2, '0')}`;

      // Query database to prevent voucher number conflicts on that day
      const q = query(
        collection(db, 'shops', shopId, 'entries'),
        where('date', '==', lastDayString)
      );
      const snap = await getDocs(q);
      const todayVouchers = snap.docs.map(doc => doc.data().voucherNo || doc.id).filter(id => id && id.startsWith(datePrefix));
      
      let nextSeq = 1;
      if (todayVouchers.length > 0) {
        const seqs = todayVouchers.map(id => parseInt(id.slice(-2), 10) || 0);
        nextSeq = Math.max(...seqs) + 1;
      }
      const voucherNo = `${datePrefix}${String(nextSeq).padStart(2, '0')}`;

      setPendingVoucher({
        date: lastDayString,
        voucherNo,
        description: `${data.yearMonth} 月底盤點庫存自動調整傳票`,
        lines
      });
      setPendingPayload(payload);
      return;
    }

    // Save as draft directly
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
        <div className="p-6 bg-white border-t border-coffee-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-extrabold text-coffee-400 uppercase tracking-widest">估算盤點總值</div>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-coffee-600">
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-xl border border-emerald-100/50">食材: ${fmt(totalsByCategory['食材'] || 0)}</span>
              <span className="bg-sky-50 text-sky-700 px-3 py-1 rounded-xl border border-sky-100/50">包材: ${fmt(totalsByCategory['包材'] || 0)}</span>
              {(totalsByCategory['裝飾品'] || 0) > 0 && (
                <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-xl border border-amber-100/50">裝飾品: ${fmt(totalsByCategory['裝飾品'] || 0)}</span>
              )}
              <span className="bg-coffee-100 text-coffee-800 px-3 py-1 rounded-xl shadow-sm border border-coffee-200/50">總計: ${fmt(Object.values(data.items).reduce<number>((s: number, k: any) => s + (Number(k?.totalValue) || 0), 0))}</span>
            </div>
          </div>
          <div className="flex gap-3 self-end md:self-auto">
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

        {/* Voucher Preview & Edit Modal */}
        <AnimatePresence>
          {pendingVoucher && (
            <VoucherPreviewModal
              voucher={pendingVoucher}
              coa={coa}
              onCancel={() => {
                setPendingVoucher(null);
                setPendingPayload(null);
              }}
              onConfirm={async (finalVoucher) => {
                try {
                  // 1. Update material stock synchronously in Firestore
                  for (const m of materials) {
                    const item = pendingPayload.items[m.id];
                    if (item) {
                      await setDoc(doc(db, 'shops', shopId, 'materials', m.id), {
                        ...m,
                        stock: item.actualQty
                      }, { merge: true });
                    }
                  }

                  // 2. Save physical count record
                  await setDoc(doc(db, 'shops', shopId, 'physicalCounts', pendingPayload.id), pendingPayload);

                  // 3. Save auto-generated Journal Entry
                  const entryId = uid();
                  const debitTotal = finalVoucher.lines.filter((l: any) => l.type === 'debit').reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
                  const creditTotal = finalVoucher.lines.filter((l: any) => l.type === 'credit').reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
                  
                  const entryPayload = {
                    id: entryId,
                    date: finalVoucher.date,
                    year: parseInt(finalVoucher.date.split('-')[0], 10),
                    voucherNo: finalVoucher.voucherNo,
                    description: finalVoucher.description,
                    lines: finalVoucher.lines.map((l: any) => ({
                      accountId: l.accountId,
                      type: l.type,
                      amount: Number(l.amount) || 0,
                      lineDescription: l.lineDescription || ''
                    })),
                    debitTotal,
                    creditTotal,
                    isAutoGenerated: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                  await setDoc(doc(db, 'shops', shopId, 'entries', entryId), entryPayload);

                  alert('年底庫存調整傳票已成功建立，且盤點記錄已鎖定！');
                  setPendingVoucher(null);
                  setPendingPayload(null);
                  onClose();
                } catch (err) {
                  console.error(err);
                  alert('寫入資料庫時出錯，請稍後再試！');
                }
              }}
            />
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}

function VoucherPreviewModal({ voucher, coa, onCancel, onConfirm }: { voucher: any, coa: COAItem[], onCancel: () => void, onConfirm: (finalVoucher: any) => Promise<void> }) {
  const [localVoucher, setLocalVoucher] = useState(() => ({
    ...voucher,
    lines: voucher.lines.map((l: any) => ({ ...l }))
  }));

  const debitSum = React.useMemo(() => {
    return localVoucher.lines.filter((l: any) => l.type === 'debit').reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
  }, [localVoucher.lines]);

  const creditSum = React.useMemo(() => {
    return localVoucher.lines.filter((l: any) => l.type === 'credit').reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
  }, [localVoucher.lines]);

  const isBalanced = Math.abs(debitSum - creditSum) < 0.01;

  const handleUpdateLine = (id: string, field: string, val: any) => {
    setLocalVoucher((prev: any) => ({
      ...prev,
      lines: prev.lines.map((l: any) => {
        if (l.id === id) {
          const updated = { ...l, [field]: val };
          if (field === 'accountId') {
            updated.accountName = coa.find(c => c.id === val)?.name || '未知';
          }
          return updated;
        }
        return l;
      })
    }));
  };

  const handleAddLine = () => {
    const firstCoa = coa[0] || { id: '1101', name: '現金' };
    setLocalVoucher((prev: any) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: uid(),
          accountId: firstCoa.id,
          accountName: firstCoa.name,
          type: 'debit',
          amount: 0,
          lineDescription: '手動新增調整分錄'
        }
      ]
    }));
  };

  const handleRemoveLine = (id: string) => {
    if (localVoucher.lines.length <= 1) return;
    setLocalVoucher((prev: any) => ({
      ...prev,
      lines: prev.lines.filter((l: any) => l.id !== id)
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[250] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-coffee-50 bg-coffee-50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold text-coffee-800">📊 月底庫存調整傳票預覽與編輯</h3>
            <p className="text-xs text-coffee-400 mt-1">此為系統根據盤點差額自動推薦的分錄。您可以自由修改任何欄位，確認借貸平衡後即可建立。</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition text-2xl font-light">✕</button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-coffee-50/20 p-4 rounded-2xl border border-coffee-100/30">
            <div>
              <label className="block text-xs font-bold text-coffee-500 mb-1.5">傳票日期</label>
              <input
                type="date"
                value={localVoucher.date}
                onChange={e => setLocalVoucher((prev: any) => ({ ...prev, date: e.target.value }))}
                className="w-full bg-white border border-coffee-200 rounded-xl px-3.5 py-2 font-mono font-bold text-sm text-coffee-800 focus:border-coffee-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-coffee-500 mb-1.5">傳票編號</label>
              <input
                type="text"
                value={localVoucher.voucherNo}
                onChange={e => setLocalVoucher((prev: any) => ({ ...prev, voucherNo: e.target.value }))}
                className="w-full bg-white border border-coffee-200 rounded-xl px-3.5 py-2 font-mono font-bold text-sm text-coffee-800 focus:border-coffee-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-coffee-500 mb-1.5">總摘要</label>
              <input
                type="text"
                value={localVoucher.description}
                onChange={e => setLocalVoucher((prev: any) => ({ ...prev, description: e.target.value }))}
                className="w-full bg-white border border-coffee-200 rounded-xl px-3.5 py-2 font-bold text-sm text-coffee-800 focus:border-coffee-500 outline-none"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-extrabold text-coffee-800">借貸平衡分錄明細</span>
              <button
                type="button"
                onClick={handleAddLine}
                className="px-3.5 py-1.5 bg-coffee-50 hover:bg-coffee-100 text-coffee-600 rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 新增分錄行
              </button>
            </div>

            <div className="border border-coffee-100 rounded-2xl overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-coffee-50 border-b border-coffee-100 text-coffee-600 font-bold">
                    <th className="p-3 text-left w-20">借/貸</th>
                    <th className="p-3 text-left w-64">會計科目</th>
                    <th className="p-3 text-right w-44">金額 (TWD)</th>
                    <th className="p-3 text-left">行摘要</th>
                    <th className="p-3 text-center w-12">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {localVoucher.lines.map((line: any) => (
                    <tr key={line.id} className="border-b border-coffee-50 hover:bg-coffee-50/20 transition-colors">
                      <td className="p-2">
                        <select
                          value={line.type}
                          onChange={e => handleUpdateLine(line.id, 'type', e.target.value)}
                          className="w-full bg-white border border-coffee-200 rounded-lg p-1.5 font-bold text-xs text-coffee-700 outline-none"
                        >
                          <option value="debit">借 (Dr)</option>
                          <option value="credit">貸 (Cr)</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          value={line.accountId}
                          onChange={e => handleUpdateLine(line.id, 'accountId', e.target.value)}
                          className="w-full bg-white border border-coffee-200 rounded-lg p-1.5 font-bold text-xs text-coffee-700 outline-none"
                        >
                          {coa.map(c => (
                            <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="any"
                          value={line.amount || ''}
                          placeholder="0.00"
                          onChange={e => handleUpdateLine(line.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full bg-white border border-coffee-200 rounded-lg p-1.5 font-mono font-bold text-xs text-right text-rose-brand outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.lineDescription || ''}
                          placeholder="分錄說明..."
                          onChange={e => handleUpdateLine(line.id, 'lineDescription', e.target.value)}
                          className="w-full bg-white border border-coffee-200 rounded-lg p-1.5 font-medium text-xs text-coffee-700 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          disabled={localVoucher.lines.length <= 1}
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-coffee-50 bg-coffee-50/50 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] font-extrabold text-coffee-450 uppercase block tracking-wider">借方總計</span>
              <span className="font-mono font-bold text-base text-coffee-800">${debitSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-extrabold text-coffee-450 uppercase block tracking-wider">貸方總計</span>
              <span className="font-mono font-bold text-base text-coffee-800">${creditSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            {isBalanced ? (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 借貸已平衡
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 animate-pulse">
                <AlertCircle className="w-4 h-4" /> 借貸不平衡 (差額: ${(debitSum - creditSum).toFixed(2)})
              </div>
            )}
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-white border border-coffee-200 text-gray-500 rounded-xl font-bold hover:bg-gray-100 transition"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!isBalanced}
              onClick={() => onConfirm(localVoucher)}
              className="flex-1 sm:flex-none px-8 py-2.5 bg-coffee-800 text-white rounded-xl font-bold shadow-lg hover:bg-coffee-900 transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> 確認建立傳票並鎖定盤點
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
