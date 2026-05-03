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
  X,
  Monitor,
  MapPin,
  Phone,
  Search,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { cn, normalizeDateKey } from '../lib/utils';
import CashRegisterTab from './daily/CashRegisterTab';
import SettingsTab from './daily/SettingsTab';
import ImportTab from './daily/ImportTab';
import AddOrderModal from './daily/AddOrderModal';
import PhoneSearchModal from './daily/PhoneSearchModal';
import { upsertCustomerFromOrder, MergeConflictModal } from './CustomerView';
import { Customer } from '../types';

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
  const [subTab, setSubTab] = useState<'dashboard' | 'cash_register' | 'import' | 'settings'>(() => {
    return (localStorage.getItem('daily_sub_tab') as any) || 'dashboard';
  });
  const [addOrderModal, setAddOrderModal] = useState(false);
  const [phoneSearchModal, setPhoneSearchModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mergeConflict, setMergeConflict] = useState<{ candidates: Customer[]; resolve: (action: 'merge'|'new', id?: string) => void } | null>(null);

  // load customers realtime
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, 'shops', shopId, 'customers'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, snap => setCustomers(snap.docs.map(d => d.data() as Customer)));
    return unsub;
  }, [shopId]);

  useEffect(() => {
    localStorage.setItem('daily_sub_tab', subTab);
  }, [subTab]);
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
                if (d === 1) {
                  accumFromPrev = 0; // 每個月 1 號不帶入上個月的未結帳款
                } else {
                  accumFromPrev = Math.max(0, prevAr.accum + calcDayUnpaid(prev.orders || []) - prevAr.collect);
                }
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

  const handleNewOrder = async (order: Order) => {
    if (!dailyData) return;
    updateDaily({ orders: [...dailyData.orders, order] });
    
    // CRM update
    if (order.buyer === '現客' && !order.phone) return;
    if (!order.buyer && !order.phone) return;

    upsertCustomerFromOrder(shopId, customers, {
      orderId: order.id,
      date: currentDate,
      buyer: order.buyer,
      phone: order.phone || '',
      email: '',
      prodAmt: order.prodAmt,
      actualAmt: order.actualAmt,
      items: order.items,
      status: order.status
    }, (candidates, resolve) => {
      setMergeConflict({ candidates, resolve });
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
                  { id: 'cash_register', label: '收銀機', icon: Monitor },
                  { id: 'import', label: '訂單匯入', icon: FileUp },
                  { id: 'settings', label: '品項設定', icon: SettingsIcon },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSubTab(t.id as 'dashboard' | 'cash_register' | 'import' | 'settings'); setIsMobileSubTabOpen(false); }}
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
              { id: 'cash_register', label: '收銀機', icon: Monitor },
              { id: 'import', label: '訂單匯入', icon: FileUp },
              { id: 'settings', label: '品項設定', icon: SettingsIcon },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id as 'dashboard' | 'cash_register' | 'import' | 'settings')}
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

      {subTab === 'cash_register' && (
        <CashRegisterTab
              shopId={shopId}
              dailyData={dailyData}
              settings={settings}
              updateDaily={updateDaily}
              metrics={metrics}
              customers={customers}
              onAddOrder={(order) => {
                handleNewOrder(order);
                setSaveStatus('saving');
              }}
            />
      )}

      {subTab === 'dashboard' && (
        <div className="flex flex-col gap-8">
          {/* Sales List */}
          <div className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-title">
                <LayoutDashboard className="w-5 h-5 inline-block mr-2 mb-1" /> 銷售明細
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPhoneSearchModal(true)}
                  className="bg-white border border-coffee-200 text-coffee-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-50 transition-colors shadow-sm"
                >
                  <Search className="w-4 h-4" /> 搜尋訂單
                </button>
                <button
                  onClick={() => setAddOrderModal(true)}
                  className="bg-coffee-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition-colors shadow-md"
                >
                  <Plus className="w-4 h-4" /> 新增訂單
                </button>
              </div>
            </div>

            {/* max-h + overflow-y-auto enables sticky thead inside a scrollable container */}
            <div className="rounded-2xl border border-coffee-50 bg-white/50" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '520px' }}>
              <table className="w-full text-xs md:text-sm text-center border-collapse">
                <thead className="bg-[#faf7f2] sticky top-0 z-30">
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider">
                    <th className="px-3 py-4 text-left border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">購買人</th>
                    {settings.giftItems.filter(i => i.active).length > 0 && (
                      <th colSpan={settings.giftItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#ffcbf2]/30 border-r border-[#ffb3c1]/30">禮盒</th>
                   )}
                   {settings.singleItems.filter(i => i.active).length > 0 && (
                     <th colSpan={settings.singleItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#a2d2ff]/30 border-r border-[#83c5be]/30">單顆</th>
                   )}
                    <th colSpan={4} className="px-2 py-4 border-b border-[#f0ede8] bg-[#e2ece9]/30">金額結算</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">收款</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">配送</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">電話</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">備注</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8] text-right sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">操作</th>
                  </tr>
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="px-3 py-3 border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">姓名</th>
                    {(settings.giftItems || []).filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#ffb3c1]/30 bg-[#ffcbf2]/20">{normalizeFlavorName(i.name)}</th>)}
                    {(settings.singleItems || []).filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#83c5be]/30 bg-[#a2d2ff]/20">{normalizeFlavorName(i.name)}</th>)}
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">商品</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">運費</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">折讓</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">應收</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">狀態</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">宅/取</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">電話</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">文字備注</th>
                    <th className="px-3 py-3 text-right border-b border-[#f0ede8] sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">刪除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {dailyData.orders.map((order, idx) => {
                    const isDelivery = order.deliveryMethod === '宅配';
                    const isPickup = order.deliveryMethod === '自取';
                    const copyRecipient = () => {
                      const text = `${order.recipientName || order.buyer} / ${order.recipientPhone || order.phone} / ${order.address}`;
                      navigator.clipboard.writeText(text);
                    };
                    return (
                    <tr key={order.id} className="group hover:bg-coffee-50/50 transition-colors">
                      <td className="px-3 py-3 sticky left-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-r border-[#f0ede8]">
                        <input
                          className="w-20 md:w-28 bg-transparent font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="姓名"
                          value={order.buyer}
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].buyer = e.target.value; updateDaily({ orders }); }}
                        />
                      </td>
                      {(settings.giftItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#ffcbf2]/5">
                          <input type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''} placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              if (!orders[idx].items) orders[idx].items = {};
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => { pAmt += (orders[idx].items?.[item.id] || 0) * item.price; });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + (orders[idx].shipAmt || 0) - (orders[idx].discAmt || 0);
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      {(settings.singleItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#a2d2ff]/5">
                          <input type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''} placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              if (!orders[idx].items) orders[idx].items = {};
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => { pAmt += (orders[idx].items?.[item.id] || 0) * item.price; });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + (orders[idx].shipAmt || 0) - (orders[idx].discAmt || 0);
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-3 font-mono font-bold text-gray-500 bg-[#e2ece9]/5">${fmt(order.prodAmt)}</td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input type="number"
                          className="w-14 bg-transparent text-center font-mono font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.shipAmt || ''} placeholder="0"
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].shipAmt = parseNum(e.target.value); orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt; updateDaily({ orders }); }}
                        />
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input type="number"
                          className="w-14 bg-transparent text-center font-mono font-bold text-rose-brand outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.discAmt || ''} placeholder="0"
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].discAmt = parseNum(e.target.value); orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt; updateDaily({ orders }); }}
                        />
                      </td>
                      <td className="px-2 py-3 font-mono font-bold text-mint-brand bg-[#e2ece9]/10">${fmt(order.actualAmt)}</td>
                      {/* 收款狀態 */}
                      <td className="px-3 py-3">
                        <select value={order.status}
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].status = e.target.value as any; updateDaily({ orders }); }}
                          className={cn("text-xs font-bold px-2 py-1.5 rounded-lg outline-none",
                            order.status === '匯款' && "bg-blue-50 text-blue-600",
                            order.status === '現結' && "bg-green-50 text-green-600",
                            order.status === '未結帳款' && "bg-danger-brand/10 text-danger-brand",
                            order.status === '公關品' && "bg-purple-50 text-purple-600"
                          )}>
                          <option value="匯款">匯款</option>
                          <option value="現結">現結</option>
                          <option value="未結帳款">未結</option>
                          <option value="公關品">公關</option>
                        </select>
                      </td>
                      {/* 配送方式 */}
                      <td className="px-2 py-2 min-w-[80px]">
                        {(order.source === 'pos' || order.note?.includes('收銀機交易')) ? (
                          <span className="text-[10px] font-bold text-coffee-300 bg-coffee-50 px-2 py-0.5 rounded-full">現場</span>
                        ) : (
                        <div className="flex flex-col gap-1.5 items-center">
                          {/* 宅配/自取 toggle */}
                          <div className="flex rounded-lg overflow-hidden border border-coffee-100 text-[10px] font-bold">
                            <button
                              onClick={() => { const orders = [...dailyData.orders]; orders[idx].deliveryMethod = '宅配'; updateDaily({ orders }); }}
                              className={cn("px-2 py-1 transition-colors flex items-center gap-0.5", isDelivery ? "bg-blue-500 text-white" : "bg-white text-coffee-400 hover:bg-coffee-50")}
                            ><Truck className="w-3 h-3"/>宅</button>
                            <button
                              onClick={() => { const orders = [...dailyData.orders]; orders[idx].deliveryMethod = '自取'; updateDaily({ orders }); }}
                              className={cn("px-2 py-1 transition-colors flex items-center gap-0.5", isPickup ? "bg-mint-brand text-white" : "bg-white text-coffee-400 hover:bg-coffee-50")}
                            ><MapPin className="w-3 h-3"/>取</button>
                          </div>
                          {/* 自取：已取/未取 toggle */}
                          {isPickup && (
                            <button
                              onClick={() => { const orders = [...dailyData.orders]; orders[idx].isPickedUp = !orders[idx].isPickedUp; updateDaily({ orders }); }}
                              className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors w-full text-center",
                                order.isPickedUp ? "bg-mint-brand text-white" : "bg-amber-50 text-amber-600 border border-amber-200"
                              )}
                            >{order.isPickedUp ? '✓ 已取貨' : '未取貨'}</button>
                          )}
                          {/* 宅配：收件人資訊 + 複製 */}
                          {isDelivery && (
                            <div className="w-full text-left space-y-0.5">
                              <div className="flex items-center gap-1">
                                <input
                                  className="text-[10px] w-full bg-transparent text-coffee-700 font-bold outline-none border-b border-transparent focus:border-blue-300 placeholder-coffee-200"
                                  placeholder="收件人姓名"
                                  value={order.recipientName || ''}
                                  onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].recipientName = e.target.value; updateDaily({ orders }); }}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  className="text-[10px] w-full bg-transparent text-coffee-600 outline-none border-b border-transparent focus:border-blue-300 placeholder-coffee-200"
                                  placeholder="收件人電話"
                                  value={order.recipientPhone || ''}
                                  onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].recipientPhone = e.target.value; updateDaily({ orders }); }}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  className="text-[10px] w-full bg-transparent text-coffee-600 outline-none border-b border-transparent focus:border-blue-300 placeholder-coffee-200"
                                  placeholder="地址"
                                  value={order.address || ''}
                                  onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].address = e.target.value; updateDaily({ orders }); }}
                                />
                                <button
                                  onClick={copyRecipient}
                                  title="複製收件資訊"
                                  className="flex-shrink-0 p-0.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                ><Copy className="w-3 h-3"/></button>
                              </div>
                            </div>
                          )}
                        </div>
                        )}
                      </td>
                      {/* 電話 */}
                      <td className="px-2 py-3">
                        <input type="text"
                          className="w-24 bg-transparent text-xs text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="電話"
                          value={order.phone || ''}
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].phone = e.target.value; updateDaily({ orders }); }}
                        />
                      </td>
                      {/* 文字備注 */}
                      <td className="px-2 py-3">
                        <input type="text"
                          className="w-28 bg-transparent text-xs text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="備注說明"
                          value={order.note || ''}
                          onChange={(e) => { const orders = [...dailyData.orders]; orders[idx].note = e.target.value; updateDaily({ orders }); }}
                        />
                      </td>
                      {/* 刪除（含確認） */}
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-l border-[#f0ede8]">
                        <button
                          onClick={() => {
                            if (window.confirm(`確定要刪除「${order.buyer || '此筆'}」的訂單嗎？`)) {
                              updateDaily({ orders: dailyData.orders.filter(o => o.id !== order.id) });
                            }
                          }}
                          className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-lg transition-all"
                        ><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Add Order Modal ── */}
          <AnimatePresence>
            {addOrderModal && (
              <AddOrderModal
                settings={settings}
                shopId={shopId}
                customers={customers}
                onClose={() => setAddOrderModal(false)}
                onAdd={(order) => { handleNewOrder(order); setAddOrderModal(false); }}
              />
            )}
          </AnimatePresence>

          {/* ── Phone Search Modal ── */}
          <AnimatePresence>
            {phoneSearchModal && (
              <PhoneSearchModal
                orders={dailyData.orders}
                settings={settings}
                onClose={() => setPhoneSearchModal(false)}
                onUpdateOrder={(updated) => {
                  const orders = dailyData.orders.map(o => o.id === updated.id ? updated : o);
                  updateDaily({ orders });
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Merge Conflict Modal ── */}
          <AnimatePresence>
            {mergeConflict && (
              <MergeConflictModal
                candidates={mergeConflict.candidates}
                onDecide={(action, id) => { mergeConflict.resolve(action, id); setMergeConflict(null); }}
              />
            )}
          </AnimatePresence>

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
                    // Match the same flavor list as 產能庫存推算
                    const activeNames = (settings.singleItems || []).filter(i => i.active && !i.name.includes('綜合')).map(i => normalizeFlavorName(i.name));
                    const soldNames = Object.keys(metrics?.inventoryOut || {}).filter(k => (metrics?.inventoryOut[k] || 0) > 0 && !k.includes('綜合'));
                    const flavors = Array.from(new Set([...activeNames, ...soldNames]));
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
                      // Same source as 產能庫存推算: active singleItems + anything sold/inventoried today
                      const activeNames = (settings.singleItems || []).filter(i => i.active && !i.name.includes('綜合')).map(i => normalizeFlavorName(i.name));
                      const soldNames = Object.keys(metrics?.inventoryOut || {}).filter(k => (metrics?.inventoryOut[k] || 0) > 0 && !k.includes('綜合'));
                      const allFlavors = Array.from(new Set([...activeNames, ...soldNames]));
                      // Also include current value if it's not in the list (e.g. old data)
                      if (loss.flavor && !allFlavors.includes(loss.flavor)) allFlavors.push(loss.flavor);
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
        <ImportTab
          settings={settings}
          shopId={shopId}
          currentDate={currentDate}
          dailyData={dailyData}
          updateDaily={updateDaily}
          customers={customers}
          onConflict={(cands, resolve) => setMergeConflict({ candidates: cands, resolve })}
        />
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

