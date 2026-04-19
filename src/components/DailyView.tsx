import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, query, collection, where, getDocs, limit, orderBy, runTransaction, writeBatch } from 'firebase/firestore';
import { fmt, uid, parseNum, todayISO, normalizeFlavorName } from '../lib/utils';
import { DailyReport, Settings, Order, LossEntry } from '../types';
import { 
  Plus, 
  Trash2, 
  FileUp, 
  Save, 
  TrendingUp, 
  Truck, 
  Box, 
  AlertTriangle,
  History,
  Copy,
  LayoutDashboard,
  Settings as SettingsIcon,
  Check,
  RefreshCw,
  CircleDollarSign,
  FileText,
  PackageSearch,
  BarChart3,
  Wand2,
  CalendarDays,
  Gift,
  Cookie,
  Package,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { cn } from '../lib/utils';

const normalizeDateKey = (v: string) => {
  const [y, m = '1', d = '1'] = v.split('-');
  return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
};
const toLegacyDateKey = (v: string) =>
  v.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, (_, y, m, d) => `${y}-${Number(m)}-${Number(d)}`);
const getDailyDocRef = async (shopId: string, dateKey: string) => {
  const padKey = normalizeDateKey(dateKey);
  const legacyKey = toLegacyDateKey(dateKey);
  const padRef = doc(db, 'shops', shopId, 'daily', padKey);
  const padSnap = await getDoc(padRef);
  if (padSnap.exists()) return { ref: padRef, snap: padSnap, dateKey: padKey };
  if (legacyKey !== padKey) {
    const legacyRef = doc(db, 'shops', shopId, 'daily', legacyKey);
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists()) return { ref: legacyRef, snap: legacySnap, dateKey: padKey };
  }
  return { ref: padRef, snap: padSnap, dateKey: padKey };
};
const defaultAr = () => ({
  accum: 0,
  collect: 0,
  logSpent: 0,
  actualTotal: 0,
  actualRemit: 0,
  actualCash: 0,
  actualUnpaid: 0,
});
const calcDayUnpaid = (orders: Order[] = []) =>
  orders.filter(o => o.status === '未結帳款').reduce((sum, o) => sum + Number(o.actualAmt || 0), 0);
const applyDailyActive = (settings: Settings, dailyActive?: DailyReport['dailyActive']): Settings => {
  if (!dailyActive) return settings;
  return {
    ...settings,
    giftItems: (settings.giftItems || []).map(item => ({
      ...item,
      active: dailyActive.giftItems?.[item.id] ?? item.active,
    })),
    singleItems: (settings.singleItems || []).map(item => ({
      ...item,
      active: dailyActive.singleItems?.[item.id] ?? item.active,
    })),
    packagingItems: (settings.packagingItems || []).map(item => ({
      ...item,
      active: dailyActive.packagingItems?.[item.id] ?? item.active,
    })),
    customCategories: (settings.customCategories || []).map(cat => ({
      ...cat,
      items: (cat.items || []).map(item => ({
        ...item,
        active: dailyActive.customCategories?.[cat.id]?.[item.id] ?? item.active,
      })),
    })),
  };
};
export default function DailyView({ 
  currentDate, 
  setCurrentDate, 
  settings: baseSettings, 
  shopId 
}: { 
  currentDate: string, 
  setCurrentDate: (d: string) => void, 
  settings: Settings,
  shopId: string 
}) {
  const [subTab, setSubTab] = useState<'dashboard' | 'import' | 'settings'>('dashboard');
  const [isMobileSubTabOpen, setIsMobileSubTabOpen] = useState(false);
  const [dailyData, setDailyData] = useState<DailyReport | null>(null);
  const [loadedDateKey, setLoadedDateKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const settings = useMemo(
    () => applyDailyActive(baseSettings, dailyData?.dailyActive),
    [baseSettings, dailyData?.dailyActive]
  );

  useEffect(() => {
    (async () => {
      const q = query(collection(db, 'shops', shopId, 'daily'), limit(20), orderBy('date', 'desc'));
      const s = await getDocs(q);
      
    })();
  }, [shopId]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    setLoading(true);
    setDailyData(null);
    setLoadedDateKey('');

    const start = async () => {
      const resolved = await getDailyDocRef(shopId, currentDate);
      if (cancelled) return;
      const targetRef = resolved.ref;
      const targetDateKey = resolved.dateKey;

      unsub = onSnapshot(targetRef, (snap) => {
        (async () => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.data() as DailyReport;
            setLoadedDateKey(targetDateKey);
            setDailyData({ ...data, date: targetDateKey, ar: { ...defaultAr(), ...(data.ar || {}) } });
          } else {
            const [y, m, d] = normalizeDateKey(currentDate).split('-').map(Number);
            const prevDate = new Date(y, m - 1, d);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
            let accumFromPrev = 0;
            try {
              const prevResolved = await getDailyDocRef(shopId, prevKey);
              if (prevResolved.snap.exists()) {
                const prev = prevResolved.snap.data() as DailyReport;
                const prevAr = { ...defaultAr(), ...(prev.ar || {}) };
                accumFromPrev = Math.max(0, prevAr.accum + calcDayUnpaid(prev.orders || []) - prevAr.collect);
              }
            } catch (err) {
              console.error('載入前一天日報失敗:', err);
            }
            if (cancelled) return;
            setLoadedDateKey(targetDateKey);
            setDailyData({
              date: targetDateKey,
              orders: [],
              dailyActive: {},
              ar: { ...defaultAr(), accum: accumFromPrev },
              inventory: {},
              losses: [],
              packagingUsage: {},
            });
          }
          if (!cancelled) setLoading(false);
        })();
      });
    };

    start();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [currentDate, shopId]);

  // Debounced Save
  useEffect(() => {
    if (!dailyData || loading) return;
    const dateKey = normalizeDateKey(currentDate);
    const dataDateKey = normalizeDateKey(dailyData.date || '');
    if (!loadedDateKey) return;
    if (loadedDateKey !== dateKey) return;
    if (dataDateKey !== loadedDateKey) return;
    const t = setTimeout(async () => {
      setSaveStatus('saving');
      await setDoc(
        doc(db, 'shops', shopId, 'daily', loadedDateKey),
        { ...dailyData, date: loadedDateKey },
        { merge: true }
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1000);
    return () => clearTimeout(t);
  }, [dailyData, currentDate, loadedDateKey, loading, shopId]);

  const updateDaily = (patch: Partial<DailyReport>) => {
    setDailyData(prev => {
      if (!prev) return null;
      const currentKey = normalizeDateKey(currentDate);
      if (!loadedDateKey || loadedDateKey !== currentKey) return prev;
      return { ...prev, ...patch, date: loadedDateKey };
    });
  };

  const metrics = useMemo(() => {
    if (!dailyData) return null;
    let m = {
        rev: 0, ship: 0, prShip: 0, disc: 0, prVal: 0, recv: 0, act: 0, remit: 0, cash: 0, unpaid: 0,
        qty: { 
            gb: {} as Record<string,number>, 
            sg: {} as Record<string,number>, 
            prGB: {} as Record<string,number>, 
            prSG: {} as Record<string,number>,
            flavorSales: {} as Record<string, number>,
            flavorPR: {} as Record<string, number>
        },
        inventoryOut: {} as Record<string, number>
    };

    (settings.giftItems || []).forEach(i => { m.qty.gb[i.name] = 0; m.qty.prGB[i.name] = 0; });
    (settings.singleItems || []).forEach(i => { m.qty.sg[i.name] = 0; m.qty.prSG[i.name] = 0; });
    
    // Initialize flavor stats with single items
    (settings.singleItems || []).forEach(i => { 
        const norm = normalizeFlavorName(i.name);
        m.qty.flavorSales[norm] = 0; 
        m.qty.flavorPR[norm] = 0; 
    });

    const allGiftItems = [...(settings.giftItems || []), ...(settings.customCategories || []).flatMap(c => (c.items || []).filter((_, idx) => c.name.includes('禮盒') || c.id === 'gift'))]; // simplified logic to identify gifts in custom categories if needed
    
    dailyData.orders.forEach(o => {
        const isPR = o.status === '公關品';
        m.rev += o.prodAmt; 
        m.disc += o.discAmt;
        
        if(isPR) { 
            m.prVal += o.prodAmt; 
            m.prShip += o.shipAmt;
        } else {
            m.ship += o.shipAmt;
            m.recv += o.actualAmt;
            if(o.status === '匯款') { m.remit += o.actualAmt; m.act += o.actualAmt; }
            if(o.status === '現結') { m.cash += o.actualAmt; m.act += o.actualAmt; }
            if(o.status === '未結帳款') { m.unpaid += o.actualAmt; }
        }

        // Standard categories
        (settings.giftItems || []).forEach(i => {
            const count = (o.items?.[i.id] || 0);
            if(isPR) m.qty.prGB[i.name] = (m.qty.prGB[i.name] || 0) + count;
            else m.qty.gb[i.name] = (m.qty.gb[i.name] || 0) + count;
        });
        (settings.singleItems || []).forEach(i => {
            const count = (o.items?.[i.id] || 0);
            if(isPR) m.qty.prSG[i.name] = (m.qty.prSG[i.name] || 0) + count;
            else m.qty.sg[i.name] = (m.qty.sg[i.name] || 0) + count;
        });

        // Custom categories (Crucial for "War Room" or other custom groups)
        (settings.customCategories || []).forEach(cat => {
            (cat.items || []).forEach(i => {
                const count = (o.items?.[i.id] || 0);
                // We map them to SG/GB based on category name or just treat as SG if unsure
                const isGb = cat.name.includes('禮盒');
                if (isGb) {
                    if(isPR) m.qty.prGB[i.name] = (m.qty.prGB[i.name] || 0) + count;
                    else m.qty.gb[i.name] = (m.qty.gb[i.name] || 0) + count;
                } else {
                    if(isPR) m.qty.prSG[i.name] = (m.qty.prSG[i.name] || 0) + count;
                    else m.qty.sg[i.name] = (m.qty.sg[i.name] || 0) + count;
                }
            });
        });

        // Inventory out & Flavor Breakdown
        const allItems = [...(settings.giftItems || []), ...(settings.singleItems || []), ...(settings.customCategories || []).flatMap(c => c.items || [])];
        allItems.forEach(item => {
            const qty = o.items?.[item.id] || 0;
            if (qty <= 0) return;

            if (item.recipe) { // Both giftItems and custom categorized gifts might have recipe
                Object.entries(item.recipe || {}).forEach(([flavor, count]) => {
                    const normFlavor = normalizeFlavorName(flavor);
                    const volume = qty * (Number(count) || 0);
                    m.inventoryOut[normFlavor] = (m.inventoryOut[normFlavor] || 0) + volume;
                    if (isPR) {
                        m.qty.flavorPR[normFlavor] = (m.qty.flavorPR[normFlavor] || 0) + volume;
                    } else {
                        m.qty.flavorSales[normFlavor] = (m.qty.flavorSales[normFlavor] || 0) + volume;
                    }
                });
            } else {
                // If no recipe, it's a single item (or its own material)
                const normName = normalizeFlavorName(item.name);
                m.inventoryOut[normName] = (m.inventoryOut[normName] || 0) + qty;
                if (isPR) {
                    m.qty.flavorPR[normName] = (m.qty.flavorPR[normName] || 0) + qty;
                } else {
                    m.qty.flavorSales[normName] = (m.qty.flavorSales[normName] || 0) + qty;
                }
            }
        });
    });

    return m;
  }, [dailyData, settings]);

  const [syncingInv, setSyncingInv] = useState(false);
  const syncInventory = async () => {
    if (!dailyData || syncingInv) return;
    setSyncingInv(true);
    try {
      // Basic consumption auto-deduction based on daily sales
      const consumption: Record<string, number> = {};
            dailyData.orders.forEach((o) => {
        [...(settings.giftItems || []), ...(settings.singleItems || []), ...(settings.customCategories?.flatMap(c => c.items || []) || [])].forEach((item) => {
          const qty = o.items?.[item.id] || 0;
          if (qty > 0 && item.materialRecipe) {
            Object.entries(item.materialRecipe || {}).forEach(([matId, usage]) => {
              consumption[matId] = (consumption[matId] || 0) + qty * Number(usage || 0);
            });
          }
        });
      });

      // Execute deduction (transaction-safe)
      for (const [matId, qty] of Object.entries(consumption)) {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'shops', shopId, 'materials', matId);
          const snap = await tx.get(ref);

          if (!snap.exists()) {
            throw new Error(`MATERIAL_NOT_FOUND:${matId}`);
          }

          const mat = snap.data() as any;
          const currentStock = Number(mat.stock || 0);
          const nextStock = currentStock - Number(qty || 0);

          if (Number.isNaN(nextStock)) {
            throw new Error(`INVALID_STOCK_CALC:${matId}`);
          }

          tx.set(
            ref,
            {
              ...mat,
              stock: nextStock,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        });
      }

      alert('庫存扣減完成！');
    } catch (e: any) {
      alert(`扣減庫存發生錯誤: ${e?.message || e}`);
      console.error(e);
    } finally {
      setSyncingInv(false);
    }
  };

  if (loading || !dailyData) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="bg-white border border-coffee-200 rounded-xl px-4 py-2 font-bold text-coffee-700 shadow-sm focus:ring-2 focus:ring-coffee-300 outline-none"
          />
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-coffee-400">
            {saveStatus === 'saving' && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><RefreshCw className="w-4 h-4" /></motion.div>}
            {saveStatus === 'saved' && <Check className="w-4 h-4 text-green-500" />}
            {saveStatus === 'saved' ? "已儲存" : saveStatus === 'saving' ? "同步中..." : "雲端存檔"}
          </div>
        </div>

        <div className="relative w-full md:w-auto">
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileSubTabOpen(v => !v)}
              className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2.5 font-bold text-coffee-700 flex items-center justify-between shadow-sm"
            >
              <span>
                {[{ id: 'dashboard', label: '銷售與戰情室' }, { id: 'import', label: '訂單匯入' }, { id: 'settings', label: '品項設定' }].find(t => t.id === subTab)?.label}
              </span>
              {isMobileSubTabOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {isMobileSubTabOpen && (
              <div className="absolute z-20 mt-2 w-full bg-white border border-coffee-100 rounded-xl shadow-lg overflow-hidden">
                {[
                  { id: 'dashboard', label: '銷售與戰情室', icon: LayoutDashboard },
                  { id: 'import', label: '訂單匯入', icon: FileUp },
                  { id: 'settings', label: '品項設定', icon: SettingsIcon },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSubTab(t.id as 'dashboard' | 'import' | 'settings'); setIsMobileSubTabOpen(false); }}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm font-bold border-b border-coffee-50 last:border-b-0 flex items-center gap-2",
                      subTab === t.id ? "bg-coffee-50 text-coffee-700" : "text-coffee-500"
                    )}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hidden md:flex bg-coffee-100/50 p-1 rounded-xl">
            {[
              { id: 'dashboard', label: '銷售與戰情室', icon: LayoutDashboard },
              { id: 'import', label: '訂單匯入', icon: FileUp },
              { id: 'settings', label: '品項設定', icon: SettingsIcon },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id as 'dashboard' | 'import' | 'settings')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                  subTab === t.id ? "bg-white text-coffee-700 shadow-sm" : "text-coffee-400 hover:text-coffee-600"
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        
        <button 
          onClick={syncInventory}
          disabled={syncingInv}
          className="px-4 py-2 rounded-lg font-bold text-sm text-white bg-mint-brand shadow-sm hover:bg-mint-brand/80 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4 md:mt-0"
          title="根據本表配方自動扣減庫存"
        >
          {syncingInv ? '扣減中...' : '扣除今日庫存'}
        </button>
      </div>

      {subTab === 'dashboard' && (
        <div className="flex flex-col gap-8">
          {/* Sales List */}
          <div className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-title">
                <LayoutDashboard className="w-5 h-5 inline-block mr-2 mb-1" /> 銷售明細
              </h3>
              <button 
                onClick={() => {
                  const newOrder: Order = {
                    id: uid(), buyer: '', phone: '', address: '', items: {},
                    prodAmt: 0, shipAmt: 0, discAmt: 0, actualAmt: 0, status: '匯款', note: ''
                  };
                  updateDaily({ orders: [...dailyData.orders, newOrder] });
                }}
                className="bg-coffee-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" /> 新增訂單
              </button>
            </div>

            <div className="rounded-2xl overflow-x-auto border border-coffee-50 bg-white/50">
              <table className="w-full text-xs md:text-sm text-center border-collapse">
                <thead className="bg-[#faf7f2]">
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider">
                    <th className="px-3 py-4 text-left border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">購買人</th>
                    {settings.giftItems.filter(i => i.active).length > 0 && (
                      <th colSpan={settings.giftItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#ffcbf2]/30 border-r border-[#ffb3c1]/30">禮盒</th>
                   )}
                   {settings.singleItems.filter(i => i.active).length > 0 && (
                     <th colSpan={settings.singleItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#a2d2ff]/30 border-r border-[#83c5be]/30">單顆</th>
                   )}
                    <th colSpan={4} className="px-2 py-4 border-b border-[#f0ede8] bg-[#e2ece9]/30">金額結算</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">收款狀態</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">備註</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8] text-right sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">操作</th>
                  </tr>
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="px-3 py-3 border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">姓名</th>
                    {(settings.giftItems || []).filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#ffb3c1]/30 bg-[#ffcbf2]/20">{normalizeFlavorName(i.name)}</th>)}
                    {(settings.singleItems || []).filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#83c5be]/30 bg-[#a2d2ff]/20">{normalizeFlavorName(i.name)}</th>)}
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">商品金額</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">運費</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">折讓</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">應收金額</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">狀態</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">金流說明</th>
                    <th className="px-3 py-3 text-right border-b border-[#f0ede8] sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">刪除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {dailyData.orders.map((order, idx) => (
                    <tr key={order.id} className="group hover:bg-coffee-50/50 transition-colors">
                      <td className="px-3 py-3 sticky left-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-r border-[#f0ede8]">
                        <input 
                          className="w-20 md:w-28 bg-transparent font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="姓名"
                          value={order.buyer}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].buyer = e.target.value;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      {(settings.giftItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#ffcbf2]/5">
                          <input 
                            type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              if (!orders[idx].items) orders[idx].items = {};
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => {
                                pAmt += (orders[idx].items?.[item.id] || 0) * item.price;
                              });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + (orders[idx].shipAmt || 0) - (orders[idx].discAmt || 0);
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      {(settings.singleItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#a2d2ff]/5">
                          <input 
                            type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              if (!orders[idx].items) orders[idx].items = {};
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => {
                                pAmt += (orders[idx].items?.[item.id] || 0) * item.price;
                              });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + (orders[idx].shipAmt || 0) - (orders[idx].discAmt || 0);
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-3 font-mono font-bold text-gray-500 bg-[#e2ece9]/5">
                        ${fmt(order.prodAmt)}
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input 
                          type="number"
                          className="w-16 bg-transparent text-center font-mono font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.shipAmt || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].shipAmt = parseNum(e.target.value);
                            orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input 
                          type="number"
                          className="w-16 bg-transparent text-center font-mono font-bold text-rose-brand outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.discAmt || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].discAmt = parseNum(e.target.value);
                            orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-2 py-3 font-mono font-bold text-mint-brand bg-[#e2ece9]/10">
                        ${fmt(order.actualAmt)}
                      </td>
                      <td className="px-3 py-3">
                        <select 
                          value={order.status}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].status = e.target.value as any;
                            updateDaily({ orders });
                          }}
                          className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-lg outline-none",
                            order.status === '匯款' && "bg-blue-50 text-blue-600",
                            order.status === '現結' && "bg-green-50 text-green-600",
                            order.status === '未結帳款' && "bg-danger-brand/10 text-danger-brand",
                            order.status === '公關品' && "bg-purple-50 text-purple-600"
                          )}
                        >
                          <option value="匯款">匯款</option>
                          <option value="現結">現結</option>
                          <option value="未結帳款">未結</option>
                          <option value="公關品">公關</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input 
                          type="text"
                          className="w-32 bg-transparent text-sm text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="地址/電話/說明"
                          value={order.note || ''}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].note = e.target.value;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-l border-[#f0ede8]">
                        <button 
                          onClick={() => {
                            const orders = dailyData.orders.filter(o => o.id !== order.id);
                            updateDaily({ orders });
                          }}
                          className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-lg transition-all"
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 金流總結 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-[#ffb3c1]/40 pb-3 mb-4">
                <CircleDollarSign className="w-5 h-5 text-rose-brand" /> 金流總結
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center"><span className="text-coffee-600">商品營業總額</span><span className="font-bold font-mono">${fmt(metrics?.rev || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">運費</span><span className="font-bold font-mono">${fmt(metrics?.ship || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">折讓</span><span className="font-bold font-mono text-danger-brand">${fmt(metrics?.disc || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">公關品折算總額</span><span className="font-bold font-mono">${fmt(metrics?.prVal || 0)}</span></div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center text-lg">
                  <span className="font-bold text-coffee-800">營業淨額</span>
                  <span className="font-bold font-mono text-rose-brand">${fmt((metrics?.recv || 0) - (metrics?.ship || 0))}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs text-coffee-500 font-bold uppercase tracking-wider">
                  <span></span>
                  <span className="text-right">應收</span>
                  <span className="text-right">實收</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">已收-匯款</span>
                  <span className="font-bold font-mono text-right min-w-[96px]">${fmt(metrics?.remit || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualRemit || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualRemit: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">已收-現金</span>
                  <span className="font-bold font-mono text-right min-w-[96px]">${fmt(metrics?.cash || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualCash || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualCash: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">今日未結帳款</span>
                  <span className="font-bold font-mono text-right min-w-[96px] text-danger-brand">${fmt(metrics?.unpaid || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualUnpaid || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualUnpaid: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-coffee-800">實收總額</span>
                  <span className="font-bold font-mono text-mint-brand">
                    ${fmt((dailyData?.ar?.actualRemit || 0) + (dailyData?.ar?.actualCash || 0) + (dailyData?.ar?.actualUnpaid || 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* 前期應收帳款管理 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300 flex flex-col">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-mint-brand/40 pb-3 mb-4">
                <FileText className="w-5 h-5 text-mint-brand" /> 前期應收帳款管理
              </h3>
              <div className="space-y-4 text-sm flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">累積前期未結</span>
                  <input 
                    type="number"
                    value={dailyData?.ar?.accum || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), accum: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-bold font-mono text-coffee-700 outline-none focus:border-coffee-400"
                  />
                </div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">今日新增未結</span><span className="font-bold font-mono">${fmt(metrics?.unpaid || 0)}</span></div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">今日回款 (沖銷)</span>
                  <input 
                    type="number"
                    value={dailyData?.ar?.collect || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), collect: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand outline-none"
                  />
                </div>
              </div>
              <div className="h-px bg-coffee-100 my-4" />
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold text-coffee-800">剩餘總未結帳款</span>
                <span className="font-bold font-mono text-danger-brand">${fmt((dailyData?.ar?.accum || 0) + (metrics?.unpaid || 0) - (dailyData?.ar?.collect || 0))}</span>
              </div>
            </div>

            {/* 物流與包材 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-amber-200 pb-3 mb-4">
                <Truck className="w-5 h-5 text-amber-500" /> 物流分析與包材
              </h3>
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between items-center"><span className="text-coffee-600">運費實收 (明細)</span><span className="font-bold font-mono">${fmt(metrics?.ship || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">公關品運費 (不計入)</span><span className="font-bold font-mono text-danger-brand">${fmt(metrics?.prShip || 0)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">運費實支 (支出)</span>
                  <input 
                    type="number"
                    value={dailyData?.ar?.logSpent || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || { accum: 0, collect: 0, logSpent: 0, actualTotal: 0 }), logSpent: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono outline-none focus:border-coffee-400"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">物流服務額</span>
                  <span className={cn("font-bold font-mono", ((metrics?.ship || 0) - (dailyData?.ar?.logSpent || 0)) < 0 ? 'text-danger-brand' : 'text-mint-brand')}>
                    ${fmt((metrics?.ship || 0) - (dailyData?.ar?.logSpent || 0))}
                  </span>
                </div>
              </div>

              <h4 className="flex items-center gap-2 text-[13px] font-bold text-coffee-600 mb-2">
                <PackageSearch className="w-4 h-4" /> 包材計算
              </h4>
              <div className="overflow-x-auto rounded-lg border border-coffee-100 mb-2">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-[#e2ece9]/30">
                    <tr><th className="p-2 text-left">包材</th><th className="p-2">單價</th><th className="p-2">數量</th><th className="p-2 text-right">小計</th></tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50 bg-white">
                    {(settings.packagingItems || []).filter(p => p.active).map(pkg => {
                      const qty = dailyData?.packagingUsage?.[pkg.id] || 0;
                      return (
                        <tr key={pkg.id}>
                          <td className="p-2 text-left">{pkg.name}</td>
                          <td className="p-2">${pkg.price}</td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              className="w-12 text-center border border-gray-200 rounded py-0.5 outline-none focus:border-coffee-400" 
                              value={qty || ''}
                              onChange={e => updateDaily({ packagingUsage: { ...(dailyData?.packagingUsage || {}), [pkg.id]: parseNum(e.target.value) } })}
                            />
                          </td>
                          <td className="p-2 font-bold text-right text-rose-brand">${fmt(qty * pkg.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-right text-sm">
                <span className="text-coffee-600 mr-2">包材總支出:</span>
                <span className="font-bold font-mono text-rose-brand">
                  ${fmt(settings.packagingItems.reduce((sum, pkg) => sum + (pkg.price * (dailyData.packagingUsage[pkg.id] || 0)), 0))}
                </span>
              </div>
            </div>

            {/* 動態商情與庫存分析 */}
            <div className="lg:col-span-3 glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-blue-200 pb-3 mb-4">
                <BarChart3 className="w-5 h-5 text-blue-500" /> 動態商情與庫存分析
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="text-[13px] font-bold text-coffee-600 mb-2">禮盒銷售統計</h4>
                  <div className="overflow-x-auto rounded-lg border border-coffee-100">
                    <table className="w-full text-xs text-center border-collapse bg-white">
                      <thead className="bg-[#ffcbf2]/20 text-coffee-600">
                        <tr><th className="p-2 text-left">品項</th><th className="p-2">販售</th><th className="p-2">公關</th><th className="p-2 font-bold">總數</th></tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-50">
                        {[...settings.giftItems, ...(settings.customCategories?.flatMap(c => c.name.includes('禮盒') ? c.items : []) || [])]
                          .filter((i, idx, self) => (i.active || (metrics.qty.gb[i.name] + metrics.qty.prGB[i.name] > 0)) && self.findIndex(s => s.id === i.id) === idx)
                          .map(i => (
                          <tr key={i.id}>
                            <td className="p-2 text-left font-medium">{i.name}</td>
                            <td className="p-2 font-mono font-bold">{metrics.qty.gb[i.name] || 0}</td>
                            <td className="p-2 text-purple-600 font-mono font-bold">{metrics.qty.prGB[i.name] || 0}</td>
                            <td className="p-2 font-bold text-rose-brand font-mono">{(metrics.qty.gb[i.name] || 0) + (metrics.qty.prGB[i.name] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-coffee-600 mb-2">單顆銷售統計</h4>
                  <div className="overflow-x-auto rounded-lg border border-coffee-100">
                    <table className="w-full text-xs text-center border-collapse bg-white">
                      <thead className="bg-[#a2d2ff]/20 text-coffee-600">
                        <tr><th className="p-2 text-left">品項</th><th className="p-2">販售</th><th className="p-2">公關</th><th className="p-2 font-bold">總數</th></tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-50">
                        {(() => {
                           const activeNames = (settings.singleItems || []).filter(i => i.active).map(i => normalizeFlavorName(i.name));
                           const soldNames = Object.keys(metrics.qty.flavorSales).filter(k => metrics.qty.flavorSales[k] > 0);
                           const prNames = Object.keys(metrics.qty.flavorPR).filter(k => metrics.qty.flavorPR[k] > 0);
                           const allNames = Array.from(new Set([...activeNames, ...soldNames, ...prNames]));

                           return allNames.map(name => (
                             <tr key={name}>
                               <td className="p-2 text-left font-medium">{name}</td>
                               <td className="p-2 font-mono font-bold">{metrics.qty.flavorSales[name] || 0}</td>
                               <td className="p-2 text-purple-600 font-mono font-bold">{metrics.qty.flavorPR[name] || 0}</td>
                               <td className="p-2 font-bold text-rose-brand font-mono">{(metrics.qty.flavorSales[name] || 0) + (metrics.qty.flavorPR[name] || 0)}</td>
                             </tr>
                           ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end mb-2">
                <h4 className="text-[13px] font-bold text-coffee-600">單一口味產能庫存推算</h4>
                <div className="text-[10px] text-coffee-400 font-medium">* 「出貨總量」 = 單顆賣出 + 特定口味禮盒賣出 + (綜合禮盒數量 × 配方)</div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-coffee-100">
                <table className="w-full text-xs text-center border-collapse bg-white">
                  <thead className="bg-[#e2ece9]/30 text-coffee-600">
                    <tr>
                      <th className="p-2 text-left">口味</th>
                      <th className="p-2">原庫存</th>
                      <th className="p-2">預產量</th>
                      <th className="p-2">實產量</th>
                      <th className="p-2">耗損</th>
                      <th className="p-2 whitespace-nowrap">出貨總量</th>
                      <th className="p-2 font-bold">結存</th>
                      <th className="p-2">損耗率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                    {(() => {
                        const activeNames = (settings.singleItems || []).filter(i => i.active && !i.name.includes('綜合')).map(i => normalizeFlavorName(i.name));
                        const soldNames = Object.keys(metrics.inventoryOut).filter(k => metrics.inventoryOut[k] > 0 && !k.includes('綜合'));
                        const uniqueFlavors = Array.from(new Set([...activeNames, ...soldNames]));

                        return uniqueFlavors.map(f => {
                            const inv = dailyData?.inventory?.[normalizeFlavorName(f)] || { org: 0, exp: 0, act: 0, los: 0 };
                            
                            const outTotal = metrics.inventoryOut[f] || 0;
                            const flavorLossTotal = dailyData.losses.filter(l => normalizeFlavorName(l.flavor) === f).reduce((sum, l) => sum + l.qty, 0);

                            const todayRemain = inv.org + inv.act - flavorLossTotal - outTotal;
                            let rate = 0; if(inv.act > 0) rate = (flavorLossTotal / inv.act) * 100;

                            return (
                                <tr key={f}>
                                    <td className="p-2 text-left font-bold">{f}</td>
                                    <td className="p-2"><input type="number" readOnly value={inv.org || 0} className="w-10 text-center bg-gray-100 rounded text-gray-500 font-mono font-bold outline-none" /></td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={inv.exp || ''} 
                                            onChange={e => updateDaily({ inventory: { ...dailyData.inventory, [normalizeFlavorName(f)]: { ...inv, exp: parseNum(e.target.value) } } })}
                                            className="w-12 text-center border border-gray-200 rounded focus:border-coffee-400 font-mono font-bold outline-none" 
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={inv.act || ''} 
                                            onChange={e => updateDaily({ inventory: { ...dailyData.inventory, [normalizeFlavorName(f)]: { ...inv, act: parseNum(e.target.value) } } })}
                                            className="w-12 text-center border border-gray-200 rounded focus:border-coffee-400 font-mono font-bold outline-none" 
                                        />
                                    </td>
                                    <td className="p-2"><input type="number" readOnly value={flavorLossTotal} className="w-10 text-center bg-gray-100 rounded text-gray-500 font-mono font-bold outline-none" /></td>
                                    <td className="p-2 font-mono font-bold text-coffee-600">{outTotal}</td>
                                    <td className={cn("p-2 font-mono font-bold text-sm", todayRemain < 0 ? 'text-danger-brand' : 'text-mint-brand')}>{todayRemain}</td>
                                    <td className="p-2 text-coffee-400 font-mono font-bold">{rate.toFixed(1)}%</td>
                                </tr>
                            );
                        });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 耗損紀錄簿 */}
            <div className="lg:col-span-3 glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800">
                  <Trash2 className="w-5 h-5 text-gray-400" /> 耗損紀錄簿
                </h3>
                <button 
                  onClick={() => {
                         const flavors = Array.from(new Set([
                           ...settings.singleItems.filter(i=>i.active && !i.name.includes('綜合')).map(i=>i.name)
                         ]));
                    updateDaily({
                      losses: [...dailyData.losses, { id: uid(), flavor: flavors[0] || '', qty: 0, type: '技術', notes: '' }]
                    })
                  }}
                  className="px-3 py-1.5 bg-rose-brand text-white text-xs font-bold rounded-lg hover:bg-rose-brand/90 transition-colors shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 新增耗損
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-coffee-100">
                <table className="w-full text-xs text-center border-collapse bg-white">
                  <thead className="bg-rose-50/50 text-rose-800">
                    <tr>
                      <th className="p-3 text-left w-[120px]">品項口味</th>
                      <th className="p-3 w-[80px]">數量</th>
                      <th className="p-3 w-[100px]">耗損類別</th>
                      <th className="p-3 text-left">詳細備註</th>
                      <th className="p-3 w-[60px] text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                  {(dailyData?.losses || []).map((loss, idx) => {
                      const allFlavors = Array.from(new Set([
                        ...(settings.singleItems || []).filter(i=>i.active && !i.name.includes('綜合')).map(i=>normalizeFlavorName(i.name)),
                        ...(settings.customCategories || []).flatMap(c => (c.items || []).filter(i=>i.active).map(i=>normalizeFlavorName(i.name)))
                      ]));
                      return (
                        <tr key={loss.id}>
                          <td className="p-2">
                            <select 
                              value={loss.flavor} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].flavor = e.target.value;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 outline-none text-coffee-700"
                            >
                              {allFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              value={loss.qty || ''} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].qty = parseNum(e.target.value);
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-[60px] text-center border border-gray-200 rounded py-1 outline-none focus:border-rose-brand" 
                            />
                          </td>
                          <td className="p-2">
                            <select 
                              value={loss.type} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].type = e.target.value as any;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 outline-none text-coffee-700"
                            >
                              <option value="技術">技術</option>
                              <option value="人為">人為</option>
                              <option value="過期">過期</option>
                              <option value="吃掉">吃掉</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={loss.notes || ''} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].notes = e.target.value;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full border border-gray-200 rounded px-2 py-1 outline-none focus:border-rose-brand" 
                            />
                          </td>
                          <td className="p-2 text-right">
                            <button 
                              onClick={() => updateDaily({ losses: dailyData.losses.filter(l => l.id !== loss.id) })}
                              className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/5 rounded transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {dailyData.losses.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-gray-400 italic bg-gray-50">尚無耗損紀錄</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'import' && (
        <ImportTab settings={settings} shopId={shopId} currentDate={currentDate} dailyData={dailyData} updateDaily={updateDaily} />
      )}

      {subTab === 'settings' && (
        <SettingsTab settings={baseSettings} shopId={shopId} dailyActive={dailyData?.dailyActive} updateDaily={updateDaily} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components for DailyView (to keep the main component readable)
// -----------------------------------------------------------------------------

function SettingsTab({
  settings,
  shopId,
  dailyActive,
  updateDaily,
}: {
  settings: Settings;
  shopId: string;
  dailyActive?: DailyReport['dailyActive'];
  updateDaily: (patch: Partial<DailyReport>) => void;
}) {
  const updateSettings = async (newSettings: Settings) => {
    try {
      await setDoc(doc(db, 'shops', shopId, 'meta', 'settings'), newSettings);
    } catch (e: any) {
      alert('設定儲存失敗: ' + e.message);
      console.error(e);
    }
  };

  const handleToggle = (type: 'giftItems' | 'singleItems' | 'packagingItems', itemId: string, active: boolean) => {
    updateDaily({
      dailyActive: {
        ...(dailyActive || {}),
        [type]: {
          ...((dailyActive && dailyActive[type]) || {}),
          [itemId]: active,
        },
      },
    });
  };

  const handleChange = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number, field: string, val: any) => {
    const newItems = [...settings[type]];
    newItems[idx] = { ...newItems[idx], [field]: val };
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleDelete = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number) => {
    // Note: window.confirm is blocked in iframe previews, directly deleting instead
    const newItems = [...settings[type]];
    newItems.splice(idx, 1);
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleAdd = (type: 'giftItems' | 'singleItems' | 'packagingItems') => {
    const newItems = [...settings[type], { id: uid(), name: '新品項', price: 0, active: true }];
    updateSettings({ ...settings, [type]: newItems });
  };

  // Custom Categories handlers
  const handleAddCustomCategory = () => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.push({
        id: uid(),
        name: `自訂新類別 ${newCategories.length + 1}`,
        items: []
    });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleRenameCustomCategory = (idx: number, newName: string) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[idx].name = newName;
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleDeleteCustomCategory = (idx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.splice(idx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomToggle = (catId: string, itemId: string, active: boolean) => {
    updateDaily({
      dailyActive: {
        ...(dailyActive || {}),
        customCategories: {
          ...((dailyActive && dailyActive.customCategories) || {}),
          [catId]: {
            ...(((dailyActive && dailyActive.customCategories && dailyActive.customCategories[catId]) || {})),
            [itemId]: active,
          },
        },
      },
    });
  };

  const handleCustomChange = (catIdx: number, itemIdx: number, field: string, val: any) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items[itemIdx] = { ...newCategories[catIdx].items[itemIdx], [field]: val };
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomDelete = (catIdx: number, itemIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.splice(itemIdx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleAddCustomItem = (catIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.push({ id: uid(), name: '新品項', price: 0, active: true });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const [recipeModal, setRecipeModal] = useState<{ isOpen: boolean; gbIndex: number | null }>({ isOpen: false, gbIndex: null });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center glass-panel p-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
          <SettingsIcon className="w-6 h-6 text-coffee-600" /> 品項與價格全域設定
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={handleAddCustomCategory} className="bg-coffee-600 text-white border text-sm font-bold border-coffee-600 px-4 py-2 rounded-xl hover:bg-coffee-700 transition shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> 自訂新類別
          </button>
          <button onClick={() => window.location.reload()} className="bg-white border text-sm font-bold border-coffee-200 px-4 py-2 rounded-xl text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> 重新整理
          </button>
        </div>
      </div>

      {[{ type: 'giftItems', title: '禮盒', icon: Gift }, { type: 'singleItems', title: '單顆', icon: Cookie }, { type: 'packagingItems', title: '物流包材', icon: Box }].map(t => {
        const typeTag = t.type as 'giftItems' | 'singleItems' | 'packagingItems';
        return (
          <div key={t.type} className="glass-panel p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
              <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
                <t.icon className="w-5 h-5 text-mint-brand" /> {t.title}品項設定
              </h2>
              <button 
                onClick={() => handleAdd(typeTag)}
                className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> 新增
              </button>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-coffee-100">
              <table className="w-full text-sm text-center border-collapse bg-white">
                <thead className="bg-[#faf7f2] text-coffee-600">
                  <tr>
                    <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (依日期保留)</th>
                    <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                    <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                    {t.type === 'giftItems' && <th className="p-3 border-b border-[#f0ede8]">內容配方</th>}
                    <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {settings[typeTag]?.map((item: any, idx: number) => (
                    <tr key={item.id} className="hover:bg-coffee-50 transition">
                      <td className="p-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={dailyActive?.[typeTag]?.[item.id] ?? item.active}
                            onChange={(e) => handleToggle(typeTag, item.id, e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                        </label>
                      </td>
                      <td className="p-3">
                        <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleChange(typeTag, idx, 'name', e.target.value)} />
                      </td>
                      <td className="p-3">
                        <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleChange(typeTag, idx, 'price', parseNum(e.target.value))} />
                      </td>
                      {t.type === 'giftItems' && (
                        <td className="p-3">
                          <button 
                            onClick={() => setRecipeModal({ isOpen: true, gbIndex: idx })}
                            className="text-xs bg-coffee-100 hover:bg-coffee-200 text-coffee-700 font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            📝 配方 ({Object.values(item.recipe || {}).reduce((acc: number, val: any) => acc + parseNum(val), 0)}顆)
                          </button>
                        </td>
                      )}
                      <td className="p-3">
                        <button onClick={() => handleDelete(typeTag, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {settings[typeTag].length === 0 && <tr><td colSpan={t.type === 'giftItems' ? 5 : 4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(settings.customCategories || []).map((cat, catIdx) => (
        <div key={cat.id} className="glass-panel p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
            <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
              <Package className="w-5 h-5 text-mint-brand" /> 
              <input 
                className="bg-transparent outline-none border-b border-transparent focus:border-coffee-300 w-32 md:w-auto" 
                value={cat.name} 
                onChange={(e) => handleRenameCustomCategory(catIdx, e.target.value)} 
              />
            </h2>
            <div className="flex gap-2">
                <button 
                  onClick={() => handleAddCustomItem(catIdx)}
                  className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> 新增
                </button>
                <button 
                  onClick={() => handleDeleteCustomCategory(catIdx)}
                  className="bg-white border text-sm font-bold border-red-200 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition shadow-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> 刪除類別
                </button>
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-lg border border-coffee-100">
            <table className="w-full text-sm text-center border-collapse bg-white">
              <thead className="bg-[#faf7f2] text-coffee-600">
                <tr>
                  <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (依日期保留)</th>
                  <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                  <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                  <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede8]">
                {(cat.items || []).map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-coffee-50 transition">
                    <td className="p-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={dailyActive?.customCategories?.[cat.id]?.[item.id] ?? item.active}
                          onChange={(e) => handleCustomToggle(cat.id, item.id, e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                      </label>
                    </td>
                    <td className="p-3">
                      <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleCustomChange(catIdx, idx, 'name', e.target.value)} />
                    </td>
                    <td className="p-3">
                      <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleCustomChange(catIdx, idx, 'price', parseNum(e.target.value))} />
                    </td>
                    <td className="p-3">
                      <button onClick={() => handleCustomDelete(catIdx, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {(cat.items || []).length === 0 && <tr><td colSpan={4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {recipeModal.isOpen && recipeModal.gbIndex !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99] flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800">設定「{settings.giftItems?.[recipeModal.gbIndex!]?.name || '未知'}」配方</h3>
              <button onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })} className="p-1 text-gray-400 hover:text-coffee-600 rounded"><Trash2 className="w-5 h-5 hidden"/><span className="text-xl leading-none">&times;</span></button>
            </div>
            <div className="p-6 space-y-4">
              {(settings.singleItems || []).map(sg => {
                const gb = (settings.giftItems || [])[recipeModal.gbIndex!];
                if (!gb) return null;
                const count = gb.recipe?.[sg.name] || 0;
                return (
                  <div key={sg.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="font-bold text-coffee-700">{normalizeFlavorName(sg.name)}</span>
                    <input 
                      type="number" 
                      min="0"
                      className="w-16 text-center border-none shadow-sm rounded-md py-1 font-bold text-coffee-800 outline-none focus:ring-2 focus:ring-mint-brand" 
                      value={count}
                      onChange={(e) => {
                        const newGBItems = [...(settings.giftItems || [])];
                        if(!newGBItems[recipeModal.gbIndex!].recipe) newGBItems[recipeModal.gbIndex!].recipe = {};
                        newGBItems[recipeModal.gbIndex!].recipe![sg.name] = parseNum(e.target.value);
                        updateSettings({ ...settings, giftItems: newGBItems });
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })}
                className="bg-brand-brown text-white font-bold bg-coffee-800 px-6 py-2 rounded-xl shadow-md hover:bg-coffee-900 transition active:scale-95"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportTab({ settings, shopId, currentDate, dailyData, updateDaily }: { settings: Settings; shopId: string; currentDate: string; dailyData: DailyReport; updateDaily: (patch: Partial<DailyReport>) => void }) {
  const [importText, setImportText] = useState('');
  const [parsedOrders, setParsedOrders] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [weeklyData, setWeeklyData] = useState<DailyReport[]>([]);
  const [weekRange, setWeekRange] = useState('');

  useEffect(() => {
    const fetchWeekly = async () => {
      const [y, m, d] = currentDate.split('-').map(Number);
      const selDate = new Date(y, m - 1, d);
      const day = selDate.getDay();
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const monday = new Date(selDate);
      monday.setDate(selDate.getDate() + diffToMon);
      
      const sunday = new Date(monday); 
      sunday.setDate(monday.getDate() + 6);
      
      const fmtYMD = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      
      const p1 = fmtYMD(monday);
      const p2 = fmtYMD(sunday);
      setWeekRange(`${p1} 至 ${p2}`);

      // Read by document id (YYYY-MM-DD) to avoid relying on mutable `date` field.
      const days: DailyReport[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const key = fmtYMD(d);
        const ref = doc(db, 'shops', shopId, 'daily', key);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          days.push({ ...(snap.data() as DailyReport), date: key });
        }
      }
      setWeeklyData(days);
    };
    fetchWeekly();
  }, [currentDate, shopId, dailyData, refreshKey]); // adding dailyData and refreshKey dependency so it refreshes

  const parseDateFromCell = (raw: string) => {
    const s = (raw || '').trim().replace(/\//g, '-');
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  };

  const processImport = () => {
    const raw = importText.trim();
    if (!raw) return alert("請貼上資料");

    const { data } = Papa.parse(raw, { skipEmptyLines: 'greedy' });
    const rows = data as string[][];

    if (rows.length < 2) return alert("資料格式不正確 (需包含標題列)");

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const getIdx = (keywords: string[]) => {
      for (const k of keywords) {
        const found = headers.findIndex(h => h.trim() === k);
        if (found !== -1) return found;
      }
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const idxBuyer = getIdx(['訂購人姓名', '姓名']);
    const idxPhone = getIdx(['訂購人電話', '電話', '聯絡電話']);
    const idxAddr = getIdx(['宅配地址', '地址', '收件地址']);
    const idxRecipientName = getIdx(['收件人姓名']);
    const idxRecipientStatus = getIdx(['收件人']);
    const idxRecipientPhone = getIdx(['收件人電話']);
    const idxStoreDate = getIdx(['預約取貨日期', '店取', '取貨日']);
    const idxShipDate = getIdx(['宅配出貨日', '出貨', '出貨日']);
    const idxMethod = getIdx(['取貨方式', '物流', '運送方式']);

    const itemMap: { item: any; colIdx: number }[] = [];
    const allPossibleItems = [
      ...(settings.giftItems || []),
      ...(settings.singleItems || []),
    ];

    headers.forEach((h, colIdx) => {
      const cleanH = h.trim();
      const isGBHeader = cleanH.includes('禮盒') || cleanH.includes('盒');
      const isSGHeader = cleanH.includes('單顆') || cleanH.includes('個');

      let bestMatch = null;
      if (isGBHeader) {
        bestMatch = (settings.giftItems || []).find((i) => cleanH.includes(i.name) || i.name.includes(cleanH));
        if (!bestMatch) {
          if (cleanH.includes('綜合')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('綜合'));
          if (cleanH.includes('原味')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('原味'));
          if (cleanH.includes('伯爵')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('伯爵'));
          if (cleanH.includes('可可')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('可可'));
          if (cleanH.includes('抹茶')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('抹茶'));
        }
      } else if (isSGHeader) {
        bestMatch = (settings.singleItems || []).find((i) => cleanH.includes(i.name) || i.name.includes(cleanH));
        if (!bestMatch) {
          if (cleanH.includes('原味')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('原味'));
          if (cleanH.includes('伯爵')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('伯爵'));
          if (cleanH.includes('可可')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('可可'));
          if (cleanH.includes('抹茶')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('抹茶'));
        }
      }

      if (!bestMatch) {
        bestMatch = (settings.giftItems || []).find((i) => cleanH.includes(i.name)) || 
                    (settings.singleItems || []).find((i) => cleanH.includes(i.name));
      }

      if (bestMatch && !itemMap.some((m) => m.colIdx === colIdx)) {
        itemMap.push({ item: bestMatch, colIdx });
      }
    });

    const parsed: any[] = [];
    dataRows.forEach((row) => {
      if (!row.some(c => c)) return;
      const rowStr = row.join('');
      if (rowStr.includes('欄')) return; // Skip helper rows

      const method = idxMethod !== -1 && row[idxMethod] ? String(row[idxMethod]) : '';
      let targetDate = '';
      if (method && (method.includes('店') || method.includes('自取'))) {
        targetDate = idxStoreDate !== -1 && row[idxStoreDate] ? String(row[idxStoreDate]) : '';
      } else if (method && (method.includes('宅配') || method.includes('出貨') || method.includes('寄送'))) {
        targetDate = idxShipDate !== -1 && row[idxShipDate] ? String(row[idxShipDate]) : '';
      } else {
        targetDate = (idxStoreDate !== -1 && row[idxStoreDate] ? String(row[idxStoreDate]) : '') || (idxShipDate !== -1 && row[idxShipDate] ? String(row[idxShipDate]) : '');
      }

      const parsedDate = parseDateFromCell(targetDate);
      const d = parsedDate || normalizeDateKey(currentDate);
      
      const buyer = idxBuyer !== -1 && row[idxBuyer] ? String(row[idxBuyer]) : '未知';
      const phone = idxPhone !== -1 && row[idxPhone] ? String(row[idxPhone]) : '';
      const addr = idxAddr !== -1 && row[idxAddr] ? String(row[idxAddr]) : '';

      const rNameRaw = idxRecipientName !== -1 ? String(row[idxRecipientName] || '').trim() : '';
      const rStatusRaw = idxRecipientStatus !== -1 ? String(row[idxRecipientStatus] || '').trim() : '';
      
      let recipientName = '';
      if (rNameRaw && !['與訂購人相同', '與訂購人不同'].includes(rNameRaw)) {
        recipientName = rNameRaw;
      } else if (rStatusRaw && !['與訂購人相同', '與訂購人不同'].includes(rStatusRaw)) {
        recipientName = rStatusRaw;
      } else {
        recipientName = buyer;
      }
      
      let recipientPhone = idxRecipientPhone !== -1 && row[idxRecipientPhone] ? String(row[idxRecipientPhone]) : '';
      if (!recipientPhone) recipientPhone = phone;
      
      const items: Record<string, number> = {};
      let prodAmt = 0;
      itemMap.forEach(m => {
        const val = row[m.colIdx];
        if (val) {
          const match = val.match(/(\d+)\s*份/) || val.match(/(\d+)/);
          if (match) {
            const qty = parseInt(match[1]);
            if (qty > 0) {
              items[m.item.id] = qty;
              prodAmt += qty * m.item.price;
            }
          }
        }
      });

      if (Object.keys(items).length > 0) {
        parsed.push({
          date: d,
          buyer, phone, addr, recipientName, recipientPhone, items, prodAmt
        });
      }
    });

    if (parsed.length === 0) {
      alert("解析完成，但未找到有效訂單資料。請檢查標題列是否包含「姓名/電話/取貨方式/項目名稱」等關鍵字。");
    }
    setParsedOrders(parsed);
  };

  const confirmImport = async () => {
    // Replaced window.confirm with silent proceed or more interactive check if needed.
    // Given the user report, window.confirm might be blocking in their iframe.
    // We will proceed without confirm or add a simple state-based one if needed.
    // For now, let's just make it robust.
    
    if (parsedOrders.length === 0) return;

    // Group by date
    const byDate: Record<string, any[]> = {};
    parsedOrders.forEach(po => {
      const dKey = normalizeDateKey(po.date);
      if (!byDate[dKey]) byDate[dKey] = [];
      byDate[dKey].push(po);
    });

    try {
      const currentKey = normalizeDateKey(currentDate);
      const batch = writeBatch(db);
      const currentDateOrdersToAppend: Order[] = [];

      for (const [date, orders] of Object.entries(byDate)) {
        const dateKey = normalizeDateKey(date);
        const appended = orders.map(po => ({
          id: uid(),
          buyer: po.buyer,
          items: po.items,
          prodAmt: po.prodAmt,
          shipAmt: 0,
          discAmt: 0,
          actualAmt: po.prodAmt,
          status: '匯款' as const,
          note: `${po.phone} | ${po.addr}`.trim(),
          phone: po.phone,
          address: po.addr,
          recipientName: po.recipientName,
          recipientPhone: po.recipientPhone
        }));

        const ref = doc(db, 'shops', shopId, 'daily', dateKey);
        const snap = await getDoc(ref);
        let existingOrders: Order[] = [];
        let existingData: any = {};
        if (snap.exists()) {
          existingData = snap.data();
          existingOrders = snap.data().orders || [];
        }

        batch.set(ref, {
          ...existingData,
          date: dateKey,
          orders: [...existingOrders, ...appended]
        }, { merge: true });

        if (dateKey === currentKey) {
          currentDateOrdersToAppend.push(...appended);
        }
      }

      await batch.commit();

      if (currentDateOrdersToAppend.length > 0) {
        updateDaily({ orders: [...dailyData.orders, ...currentDateOrdersToAppend] });
      }

      setRefreshKey(prev => prev + 1);
      setImportText('');
      setParsedOrders([]);
      alert("匯入成功！");
    } catch (err) {
      console.error(err);
      alert("匯入發生錯誤，請稍後再試。");
    }
  };

    const copyText = (text: string, e: React.MouseEvent<HTMLButtonElement>) => {
      navigator.clipboard.writeText(text).then(() => {
        const btn = e.currentTarget;
        const oldClass = btn.className;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-mint-brand"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
        }, 1500);
      });
    };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-6 shadow-sm border border-coffee-100">
        <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-mint-brand/40">
          <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
            <FileUp className="w-5 h-5 text-mint-brand" /> 訂單匯入
          </h2>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-coffee-200 bg-white text-coffee-600 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition active:scale-95" onClick={() => { setImportText(''); setParsedOrders([]); }}>清空</button>
            <button className="px-4 py-2 bg-coffee-600 text-white font-bold rounded-xl shadow-sm hover:bg-coffee-700 transition active:scale-95 flex items-center gap-2" onClick={processImport}>
              <Wand2 className="w-4 h-4" /> 解析資料
            </button>
          </div>
        </div>

        <textarea 
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder="在此貼上 Google 表單或 Excel 複製來的整列資料..." 
          className="w-full h-32 md:h-48 rounded-xl border border-coffee-100 p-4 font-mono text-sm bg-white/70 outline-none focus:ring-2 focus:ring-mint-brand focus:border-transparent placeholder:text-gray-300 shadow-inner"
        />

        {parsedOrders.length > 0 && (
          <div className="mt-6 p-4 bg-mint-brand/5 border border-mint-brand/20 rounded-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-mint-brand">待匯入預覽 ({parsedOrders.length} 筆)</h3>
              <button className="px-4 py-2 bg-mint-brand text-white font-bold rounded-lg shadow-sm hover:bg-mint-brand/80 transition" onClick={confirmImport}>
                確認匯入以上資料
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center border-collapse bg-white border border-gray-100 rounded-lg">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 border-b border-gray-100">日期</th>
                    <th className="p-2 border-b border-gray-100">訂購人</th>
                    <th className="p-2 border-b border-gray-100 text-left">收件人</th>
                    <th className="p-2 border-b border-gray-100 text-left">項目</th>
                    <th className="p-2 border-b border-gray-100 text-right">總額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedOrders.map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-2 font-mono font-bold">{o.date}</td>
                      <td className="p-2 font-bold">{o.buyer}</td>
                      <td className="p-2 text-left">
                        <div className="flex flex-col">
                          <span className="font-bold text-coffee-700">{o.recipientName}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{o.recipientPhone}</span>
                        </div>
                      </td>
                      <td className="p-2 text-left">{Object.keys(o.items).length} 項品項</td>
                      <td className="p-2 font-bold text-rose-brand font-mono text-right">${fmt(o.prodAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Weekly View */}
      <div className="glass-panel p-6 border border-coffee-100 shadow-sm bg-transparent">
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-coffee-100">
          <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
            <CalendarDays className="w-5 h-5 text-coffee-500" /> 當週訂購名單 (依日期分組)
          </h2>
          <span className="text-sm font-bold text-coffee-400 bg-white px-3 py-1 rounded-lg border border-coffee-100">{weekRange}</span>
        </div>
        
        <div className="space-y-8">
          {Array.from({length: 7}).map((_, i) => {
            const [y, m, d] = currentDate.split('-').map(Number);
            const selDate = new Date(y, m - 1, d);
            const day = selDate.getDay();
            const diffToMon = (day === 0 ? -6 : 1 - day);
            const curDate = new Date(selDate);
            curDate.setDate(selDate.getDate() + diffToMon + i);
            const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}-${String(curDate.getDate()).padStart(2,'0')}`;
            
            const data = weeklyData.find(w => w.date === dateStr) || (dailyData.date === dateStr ? dailyData : null);
            const validOrders = data?.orders?.filter(o => o.buyer.trim() || o.actualAmt > 0) || [];

            if (validOrders.length === 0) return null;

            return (
              <div key={dateStr} className="flex flex-col bg-white rounded-xl shadow-sm border border-coffee-100 overflow-hidden">
                <h3 className="bg-coffee-50 p-3 font-bold text-coffee-800 text-sm border-b border-coffee-100 flex items-center gap-2 sticky top-0 z-10">
                  <CalendarDays className="w-4 h-4 text-rose-brand" /> {dateStr}
                  <span className="ml-auto text-[10px] text-coffee-400 font-bold uppercase tracking-wider">共 {validOrders.length} 筆訂單</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#a2d2ff]/5 text-coffee-500 font-bold">
                      <tr>
                        <th className="p-3 border-b border-coffee-50">訂購人/金額</th>
                        <th className="p-3 border-b border-coffee-50">項目內容</th>
                        <th className="p-3 border-b border-coffee-50">收件資訊</th>
                        <th className="p-3 border-b border-coffee-50 text-right">備註/地址</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-coffee-50">
                      {validOrders.map((o: any) => {
                        const getItemName = (id: string) => {
                          const item = [...settings.giftItems, ...settings.singleItems, ...(settings.customCategories || []).flatMap(c => c.items || [])].find(i => i?.id === id);
                          return item ? item.name : id;
                        };

                        return (
                          <tr key={o.id} className="hover:bg-coffee-50/30 transition">
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-coffee-800 text-[13px]">{o.buyer}</span>
                                <span className="font-mono font-bold text-rose-brand text-[11px]">${fmt(o.actualAmt)}</span>
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <div className="text-coffee-600 leading-relaxed font-medium">
                                {(o.items ? Object.entries(o.items) : [])
                                  .filter(([_, q]) => parseNum(q) > 0)
                                  .map(([k, q]) => `${getItemName(k)} x ${q}`)
                                  .join(', ')}
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-1.5 min-w-[120px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-coffee-700">{o.recipientName || o.buyer}</span>
                                  <button onClick={(e) => copyText(o.recipientName || o.buyer, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製收件人">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold text-coffee-400 bg-coffee-50 px-1.5 py-0.5 rounded border border-coffee-100">
                                    {o.recipientPhone || o.phone || '無電話'}
                                  </span>
                                  {(o.recipientPhone || o.phone) && (
                                    <button onClick={(e) => copyText(o.recipientPhone || o.phone, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製電話">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right align-top">
                              <div className="flex flex-col items-end gap-1.5">
                                {o.address ? (
                                  <div className="flex items-center gap-1.5 justify-end group">
                                    <span className="text-[10px] text-coffee-500 max-w-[150px] truncate" title={o.address}>
                                      {o.address}
                                    </span>
                                    <button onClick={(e) => copyText(o.address, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製地址">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-coffee-300 italic">無收件地址</span>
                                )}
                                {o.note && (
                                  <div className="text-[10px] text-coffee-400 italic max-w-[180px] break-all">
                                    備註: {o.note}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          
          {weekRange && !Array.from({length: 7}).some((_, i) => {
            const [y, m, d] = currentDate.split('-').map(Number);
            const selDate = new Date(y, m - 1, d);
            const day = selDate.getDay();
            const diffToMon = (day === 0 ? -6 : 1 - day);
            const curDate = new Date(selDate);
            curDate.setDate(selDate.getDate() + diffToMon + i);
            const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}-${String(curDate.getDate()).padStart(2,'0')}`;
            const data = weeklyData.find(w => w.date === dateStr) || (dailyData.date === dateStr ? dailyData : null);
            return (data?.orders?.filter(o => o.buyer.trim() || o.actualAmt > 0) || []).length > 0;
          }) && (
            <div className="col-span-full flex justify-center items-center py-12 bg-white/50 border border-dashed border-coffee-200 rounded-xl">
              <span className="text-coffee-400 font-bold">本週尚無任何訂單紀錄</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
