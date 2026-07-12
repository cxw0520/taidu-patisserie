import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, query, collection, where, getDocs, limit, orderBy, runTransaction, writeBatch, increment, getDocFromServer } from 'firebase/firestore';
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
  ChevronRight,
  Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, normalizeDateKey } from '../lib/utils';
import CashRegisterTab, { calculateCartPricing } from './daily/CashRegisterTab';
import SettingsTab from './daily/SettingsTab';
import ImportTab from './daily/ImportTab';
import AddOrderModal from './daily/AddOrderModal';
import PhoneSearchModal from './daily/PhoneSearchModal';
import BackupModal from './daily/BackupModal';
import { upsertCustomerFromOrder, MergeConflictModal } from './CustomerView';
import { Customer } from '../types';
import { useRef } from 'react';

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
      active: dailyActive.giftItems?.[item.id] ?? item.activeReport ?? item.active ?? true,
      activePOS: dailyActive.giftItemsPOS?.[item.id] ?? item.activePOS ?? item.active ?? true,
    })),
    singleItems: (settings.singleItems || []).map(item => ({
      ...item,
      active: dailyActive.singleItems?.[item.id] ?? item.activeReport ?? item.active ?? true,
      activePOS: dailyActive.singleItemsPOS?.[item.id] ?? item.activePOS ?? item.active ?? true,
    })),
    packagingItems: (settings.packagingItems || []).map(item => ({
      ...item,
      active: dailyActive.packagingItems?.[item.id] ?? item.activeReport ?? item.active ?? true,
      activePOS: dailyActive.packagingItemsPOS?.[item.id] ?? item.activePOS ?? item.active ?? true,
    })),
    customCategories: (settings.customCategories || []).map(cat => ({
      ...cat,
      items: (cat.items || []).map(item => ({
        ...item,
        active: dailyActive.customCategories?.[cat.id]?.[item.id] ?? item.activeReport ?? item.active ?? true,
        activePOS: dailyActive.customCategoriesPOS?.[cat.id]?.[item.id] ?? item.activePOS ?? item.active ?? true,
      })),
    })),
  };
};

export interface OfflineAction {
  id: string;
  type: 'add_order' | 'update_order' | 'delete_order' | 'update_daily';
  dateKey: string;
  payload: any;
  timestamp: number;
}

export interface ConflictInfo {
  action: OfflineAction;
  title: string;
  serverLabel: string;
  localLabel: string;
  serverValue: any;
  localValue: any;
  resolve: (chosenValue: any) => Promise<void>;
}

export const applyOfflineActions = (baseData: DailyReport | null, actions: OfflineAction[], currentDateKey: string): DailyReport | null => {
  if (!baseData) return null;
  let result = { ...baseData };
  const dailyActions = actions.filter(a => a.dateKey === currentDateKey);
  
  dailyActions.forEach(action => {
    if (action.type === 'add_order') {
      const order = action.payload;
      result.orders = result.orders || [];
      if (!result.orders.some(o => o.id === order.id)) {
        result.orders = [...result.orders, order];
      }
    } else if (action.type === 'update_order') {
      const { orderId, patch } = action.payload;
      result.orders = (result.orders || []).map(o => o.id === orderId ? { ...o, ...patch } : o);
    } else if (action.type === 'delete_order') {
      const { orderId } = action.payload;
      result.orders = (result.orders || []).map(o => o.id === orderId ? { ...o, status: '已取消' } : o);
    } else if (action.type === 'update_daily') {
      const patch = action.payload;
      result = { 
        ...result, 
        ...patch,
        inventory: { ...(result.inventory || {}), ...(patch.inventory || {}) },
        ar: { ...(result.ar || {}), ...(patch.ar || {}) },
        losses: [...(result.losses || []), ...(patch.losses || [])].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      };
    }
  });
  
  return result;
};

export default function DailyView({ 
  currentDate, 
  setCurrentDate, 
  settings: baseSettings, 
  shopId,
  forcedSubTab,
  onNavigateToTab
}: { 
  currentDate: string, 
  setCurrentDate: (d: string) => void, 
  settings: Settings,
  shopId: string,
  forcedSubTab?: string,
  onNavigateToTab?: (tab: string, subTab?: string) => void
}) {
  const [subTab, setSubTab] = useState<'dashboard' | 'import' | 'settings'>(() => {
    return (localStorage.getItem('daily_sub_tab') as any) || 'dashboard';
  });

  useEffect(() => {
    if (forcedSubTab && ['dashboard', 'import', 'settings'].includes(forcedSubTab)) {
      setSubTab(forcedSubTab as any);
    }
  }, [forcedSubTab]);
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showBackupModal, setShowBackupModal] = useState(false);
  
  // Offline caching & Conflict resolution states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeConflict, setActiveConflict] = useState<ConflictInfo | null>(null);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [offlineActions, setOfflineActions] = useState<OfflineAction[]>(() => {
    try {
      const saved = localStorage.getItem(`taidu_offline_actions_${shopId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const localUpdateIdRef = useRef<string | null>(null);
  const pendingPatchesRef = useRef<Record<string, boolean>>({});
  const orderTxQueueRef = useRef<Record<string, Partial<Order>>>({});
  const orderTxTimeoutRef = useRef<any>(null);

  // Sync localStorage with offlineActions
  useEffect(() => {
    if (!shopId) return;
    localStorage.setItem(`taidu_offline_actions_${shopId}`, JSON.stringify(offlineActions));
  }, [offlineActions, shopId]);

  // Network listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pushOfflineAction = (action: OfflineAction) => {
    setOfflineActions(prev => {
      if (prev.some(a => a.id === action.id)) return prev;

      // Coalescing updates to avoid duplicates and redundant conflicts
      if (action.type === 'update_order') {
        const { orderId, patch } = action.payload;
        
        // 1. If there's a pending add_order for this order, merge patch directly into it
        const addIdx = prev.findIndex(a => a.type === 'add_order' && a.payload.id === orderId);
        if (addIdx !== -1) {
          const next = [...prev];
          next[addIdx] = {
            ...next[addIdx],
            payload: { ...next[addIdx].payload, ...patch }
          };
          return next;
        }

        // 2. If there's already a pending update_order for this order, merge patch into it
        const updateIdx = prev.findIndex(a => a.type === 'update_order' && a.payload.orderId === orderId);
        if (updateIdx !== -1) {
          const next = [...prev];
          next[updateIdx] = {
            ...next[updateIdx],
            payload: {
              ...next[updateIdx].payload,
              patch: { ...next[updateIdx].payload.patch, ...patch }
            }
          };
          return next;
        }
      }

      if (action.type === 'delete_order') {
        const { orderId } = action.payload;
        
        // If there's an add_order for this, remove it completely from queue and skip delete_order
        const hasAdd = prev.some(a => a.type === 'add_order' && a.payload.id === orderId);
        if (hasAdd) {
          return prev.filter(a => !(a.type === 'add_order' && a.payload.id === orderId) && !(a.type === 'update_order' && a.payload.orderId === orderId));
        }

        // Otherwise, remove any pending updates for this order since it's going to be deleted anyway
        return [...prev.filter(a => !(a.type === 'update_order' && a.payload.orderId === orderId)), action];
      }

      if (action.type === 'update_daily') {
        const patch = action.payload;
        const dailyIdx = prev.findIndex(a => a.type === 'update_daily' && a.dateKey === action.dateKey);
        if (dailyIdx !== -1) {
          const next = [...prev];
          const existingPatch = next[dailyIdx].payload;
          next[dailyIdx] = {
            ...next[dailyIdx],
            payload: {
              ...existingPatch,
              inventory: { ...(existingPatch.inventory || {}), ...(patch.inventory || {}) },
              ar: { ...(existingPatch.ar || {}), ...(patch.ar || {}) },
              losses: [...(existingPatch.losses || []), ...(patch.losses || [])].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
            }
          };
          return next;
        }
      }

      return [...prev, action];
    });
  };

  const popOfflineAction = (actionId: string) => {
    setOfflineActions(prev => prev.filter(a => a.id !== actionId));
  };

  // Reconcile processing loop
  useEffect(() => {
    if (isOnline && offlineActions.length > 0 && !syncingQueue && !activeConflict) {
      processNextOfflineAction();
    }
  }, [isOnline, offlineActions, syncingQueue, activeConflict]);

  const processNextOfflineAction = async () => {
    if (offlineActions.length === 0 || !shopId) return;
    setSyncingQueue(true);
    const action = offlineActions[0];

    try {
      const docRef = doc(db, 'shops', shopId, 'daily', action.dateKey);
      const docSnap = await getDocFromServer(docRef).catch(() => null);
      
      let serverData: DailyReport = docSnap && docSnap.exists() 
        ? docSnap.data() as DailyReport 
        : {
            date: action.dateKey,
            orders: [],
            inventory: {},
            losses: [],
            packagingUsage: {},
            ar: { accum: 0, collect: 0, logSpent: 0, actualTotal: 0 }
          };

      serverData.orders = serverData.orders || [];

      if (action.type === 'add_order') {
        const order = action.payload;
        if (!serverData.orders.some(o => o.id === order.id)) {
          serverData.orders.push(order);
          await setDoc(docRef, { orders: serverData.orders }, { merge: true });
        }
        popOfflineAction(action.id);
      } 
      
      else if (action.type === 'delete_order') {
        const { orderId } = action.payload;
        const nextOrders = serverData.orders.filter(o => o.id !== orderId);
        await setDoc(docRef, { orders: nextOrders }, { merge: true });
        popOfflineAction(action.id);
      } 
      
      else if (action.type === 'update_order') {
        const { orderId, patch } = action.payload;
        const serverOrderIdx = serverData.orders.findIndex(o => o.id === orderId);
        
        if (serverOrderIdx === -1) {
          popOfflineAction(action.id);
        } else {
          const serverOrder = serverData.orders[serverOrderIdx];
          const conflictingKeys = Object.keys(patch).filter(k => {
            const patchVal = (patch as any)[k];
            const serverVal = (serverOrder as any)[k];
            return JSON.stringify(patchVal) !== JSON.stringify(serverVal);
          });

          if (conflictingKeys.length > 0) {
            setSyncingQueue(false);
            setActiveConflict({
              action,
              title: `訂單修改衝突 - ${serverOrder.buyer || '現客'}`,
              serverLabel: '雲端已同步版本',
              localLabel: '本機離線修改版本',
              serverValue: serverOrder,
              localValue: { ...serverOrder, ...patch },
              resolve: async (chosenValue) => {
                const updatedOrders = [...serverData.orders];
                const idx = updatedOrders.findIndex(o => o.id === orderId);
                if (idx >= 0) {
                  updatedOrders[idx] = chosenValue;
                }
                await setDoc(docRef, { orders: updatedOrders }, { merge: true });
                setOfflineActions(prev => prev.filter(a => a.id !== action.id && !(a.type === 'update_order' && a.payload.orderId === orderId) && !(a.type === 'delete_order' && a.payload.orderId === orderId)));
                setActiveConflict(null);
              }
            });
            return;
          } else {
            const updatedOrders = [...serverData.orders];
            updatedOrders[serverOrderIdx] = { ...serverOrder, ...patch };
            await setDoc(docRef, { orders: updatedOrders }, { merge: true });
            popOfflineAction(action.id);
          }
        }
      } 
      
      else if (action.type === 'update_daily') {
        const patch = action.payload;
        let hasConflict = false;
        let conflictDetails: any = null;

        if (patch.inventory) {
          const serverInv = serverData.inventory || {};
          const localInv = patch.inventory;
          
          const conflictingItems = Object.keys(localInv).filter(itemId => {
            const sItem = serverInv[itemId];
            const lItem = localInv[itemId];
            if (!sItem) return false;
            return sItem.act !== lItem.act || sItem.los !== lItem.los;
          });

          if (conflictingItems.length > 0) {
            hasConflict = true;
            conflictDetails = {
              title: '庫存數據衝突',
              serverLabel: '雲端在庫盤點數',
              localLabel: '本機離線盤點數',
              serverValue: serverInv,
              localValue: { ...serverInv, ...localInv },
              resolve: async (chosenValue) => {
                await setDoc(docRef, { inventory: chosenValue }, { merge: true });
                setOfflineActions(prev => prev.filter(a => a.id !== action.id && !(a.type === 'update_daily' && a.dateKey === action.dateKey)));
                setActiveConflict(null);
              }
            };
          }
        }

        if (hasConflict && conflictDetails) {
          setSyncingQueue(false);
          setActiveConflict({
            action,
            title: conflictDetails.title,
            serverLabel: conflictDetails.serverLabel,
            localLabel: conflictDetails.localLabel,
            serverValue: conflictDetails.serverValue,
            localValue: conflictDetails.localValue,
            resolve: conflictDetails.resolve
          });
          return;
        } else {
          const mergedData = {
            ...serverData,
            ...patch,
            inventory: { ...(serverData.inventory || {}), ...(patch.inventory || {}) },
            ar: { ...(serverData.ar || {}), ...(patch.ar || {}) },
            losses: [...(serverData.losses || []), ...(patch.losses || [])].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
          };
          await setDoc(docRef, mergedData, { merge: true });
          popOfflineAction(action.id);
        }
      }

    } catch (err) {
      console.error('Failed to reconcile offline action:', err);
      setSyncingQueue(false);
      return;
    }

    setSyncingQueue(false);
  };
  
  // Filters, Summary search, and Sort
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'manual' | 'import'>('all');
  const [pickupFilter, setPickupFilter] = useState<'all' | 'picked' | 'pending'>('all');
  const [summaryItemId, setSummaryItemId] = useState<string>('');
  type SortField = 'time' | 'delivery' | 'status';
  type SortDir = 'asc' | 'desc' | null;
  const [sortConfig, setSortConfig] = useState<{ field: SortField; dir: SortDir }>({ field: 'time', dir: null });
  const [sortDropdown, setSortDropdown] = useState<SortField | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Delivery method sort order
  const deliveryOrder = (o: Order): number => {
    if (o.deliveryMethod === '宅配') return 0;
    if (o.deliveryMethod === '自取' && !o.isPickedUp) return 1;
    if (o.deliveryMethod === '自取' && o.isPickedUp) return 2;
    return 3; // 現場 or undefined
  };

  const filteredOrders = useMemo(() => {
    if (!dailyData?.orders) return [];
    const filtered = dailyData.orders.filter(o => {
      const matchSource = sourceFilter === 'all' || o.source === sourceFilter;
      const matchPickup = pickupFilter === 'all' || 
                         (pickupFilter === 'picked' && o.isPickedUp) || 
                         (pickupFilter === 'pending' && o.deliveryMethod === '自取' && !o.isPickedUp);
      return matchSource && matchPickup;
    });

    if (!sortConfig.dir) return filtered; // default: preserve insertion order

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortConfig.field === 'time') {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        cmp = ta - tb;
      } else if (sortConfig.field === 'delivery') {
        cmp = deliveryOrder(a) - deliveryOrder(b);
      } else if (sortConfig.field === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '', 'zh-TW');
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [dailyData?.orders, sourceFilter, pickupFilter, sortConfig]);

  const itemSummary = useMemo(() => {
    if (!summaryItemId || !dailyData?.orders) return null;
    const stats = { picked: 0, pending: 0, total: 0 };
    dailyData.orders.forEach(o => {
      const qty = o.items?.[summaryItemId] || 0;
      if (qty > 0) {
        stats.total += qty;
        if (o.isPickedUp) stats.picked += qty;
        else if (o.deliveryMethod === '自取') stats.pending += qty;
      }
    });
    return stats;
  }, [summaryItemId, dailyData?.orders]);

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

    const start = () => {
      const targetDateKey = normalizeDateKey(currentDate);
      const targetRef = doc(db, 'shops', shopId, 'daily', targetDateKey);

      unsub = onSnapshot(targetRef, (snap) => {
        setLoading(false);
        (async () => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.data() as DailyReport;
            setLoadedDateKey(targetDateKey);
            const newData = { 
              ...data, 
              date: targetDateKey, 
              orders: data.orders || [],
              losses: data.losses || [],
              inventory: data.inventory || {},
              packagingUsage: data.packagingUsage || {},
              ar: { ...defaultAr(), ...(data.ar || {}) } 
            };
            
            // Replay pending offline actions to preserve local unsaved edits
            let currentOffline: OfflineAction[] = [];
            try {
              const saved = localStorage.getItem(`taidu_offline_actions_${shopId}`);
              currentOffline = saved ? JSON.parse(saved) : [];
            } catch {}

            const mergedWithOffline = applyOfflineActions(newData, currentOffline, targetDateKey) || newData;

            // Ignore echo-backs from our own local updates
            if ((data as any).updateId && (data as any).updateId === localUpdateIdRef.current) {
              return;
            }
            
            // It's a real external update. Merge intelligently to preserve local unsaved edits.
            setDailyData(prev => {
              if (!prev) return mergedWithOffline;
              const mergedData = { ...mergedWithOffline };

              // 1. Preserve root fields that are currently debouncing
              Object.keys(pendingPatchesRef.current).forEach(k => {
                (mergedData as any)[k] = (prev as any)[k];
              });

              // 2. Preserve order edits that are currently debouncing
              const pendingOrderIds = Object.keys(orderTxQueueRef.current);
              if (pendingOrderIds.length > 0) {
                const mergedOrders = [...(mergedData.orders || [])];
                pendingOrderIds.forEach(oId => {
                  const sIdx = mergedOrders.findIndex((o: any) => o.id === oId);
                  const pIdx = prev.orders.findIndex(o => o.id === oId);
                  if (sIdx >= 0 && pIdx >= 0) {
                    mergedOrders[sIdx] = prev.orders[pIdx]; // Keep our local typing state
                  }
                });
                mergedData.orders = mergedOrders;
              }

              return mergedData;
            });
            setLoading(false);
          } else {
            // ── 當天文件不存在，先檢查是否有 Legacy Key 的資料 ──
            const legacyKey = toLegacyDateKey(currentDate);
            if (legacyKey !== targetDateKey) {
              const legacyRef = doc(db, 'shops', shopId, 'daily', legacyKey);
              const legacySnap = await getDoc(legacyRef);
              if (legacySnap.exists() && !cancelled) {
                // 如果有 Legacy 資料，提示用戶或自動遷移（這裡選擇自動顯示，並在下次存檔時存入 PadKey）
                const data = legacySnap.data() as DailyReport;
                setDailyData({ ...data, date: targetDateKey });
                setLoadedDateKey(targetDateKey);
                setLoading(false);
                return;
              }
            }

            // ── 真的沒有資料，計算帶入值 ──────────────────────────
            const [cy, cm, cd] = normalizeDateKey(currentDate).split('-').map(Number);
            const targetDt = new Date(cy, cm - 1, cd);

            let accumFromPrev = 0;
            let inventoryFromPrev: Record<string, any> = {};

            try {
              // ── 最佳化：直接向資料庫查詢最近的一份有資料的報表 ──
              const q = query(
                collection(db, 'shops', shopId, 'daily'),
                where('date', '<', targetDateKey),
                orderBy('date', 'desc'),
                limit(1)
              );
              const prevSnaps = await getDocs(q);
              
              if (!prevSnaps.empty) {
                const prev = prevSnaps.docs[0].data() as DailyReport;
                const prevAr = { ...defaultAr(), ...(prev.ar || {}) };
                const yesterdayUnpaid = calcDayUnpaid(prev.orders || []);
                accumFromPrev = Math.max(0, (prevAr.accum || 0) + yesterdayUnpaid - (prevAr.collect || 0));

                // ── 庫存帶入 ──
                const flavorNames = Array.from(new Set([
                  ...(baseSettings.singleItems || []).filter(i => i.active && !i.name.includes('綜合')).map(i => normalizeFlavorName(i.name)),
                  ...Object.keys(prev.inventory || {}),
                ]));

                flavorNames.forEach(flavorKey => {
                  inventoryFromPrev[flavorKey] = { org: 0, exp: 0, act: 0, los: 0 };
                });
              }
            } catch (err) {
              console.error('[帶入] 讀取前期日報失敗:', err);
            } finally {
              if (!cancelled) setLoading(false);
            }

            // 確保所有啟用口味都有初始 org 欄位
            (baseSettings.singleItems || []).filter(i => i.active && !i.name.includes('綜合')).forEach(item => {
              const key = normalizeFlavorName(item.name);
              if (!inventoryFromPrev[key]) {
                inventoryFromPrev[key] = { org: 0, exp: 0, act: 0, los: 0 };
              }
            });

            if (cancelled) return;

            const newData: DailyReport = {
              date: targetDateKey,
              orders: [],
              dailyActive: {},
              ar: { ...defaultAr(), accum: accumFromPrev },
              inventory: inventoryFromPrev,
              losses: [],
              packagingUsage: {},
              updateId: ''
            };

            // 立即以 Transaction 寫入 Firestore，防範因連線短暫中斷造成的覆寫
            try {
              const docRef = doc(db, 'shops', shopId, 'daily', targetDateKey);
              await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                if (!sfDoc.exists()) {
                  transaction.set(docRef, newData);
                  if (!cancelled) {
                    setLoadedDateKey(targetDateKey);
                    setDailyData(newData);
                  }
                } else {
                  // 如果伺服器上其實有資料，不做任何覆寫，直接載入已存在的資料
                  const existingData = sfDoc.data() as DailyReport;
                  if (!cancelled) {
                    setLoadedDateKey(targetDateKey);
                    setDailyData({
                      ...existingData,
                      date: targetDateKey,
                      orders: existingData.orders || [],
                      losses: existingData.losses || [],
                      inventory: existingData.inventory || {},
                      packagingUsage: existingData.packagingUsage || {},
                      ar: { ...defaultAr(), ...(existingData.ar || {}) }
                    });
                  }
                }
              });
            } catch (err) {
              console.error('[帶入] 寫入/驗證 Firestore 失敗:', err);
              if (!cancelled) {
                setLoadedDateKey(targetDateKey);
                setDailyData(newData);
              }
            }
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
    if (!dailyData || loading || !loadedDateKey || !shopId) return;
    const currentKey = normalizeDateKey(currentDate);
    if (loadedDateKey !== currentKey) return;

    const t = setTimeout(async () => {
      const keysToSave = Object.keys(pendingPatchesRef.current);
      if (keysToSave.length === 0) return; // Nothing to save via debounce

      setSaveStatus('saving');
      const patch: any = {};
      keysToSave.forEach(k => {
        patch[k] = (dailyData as any)[k];
      });
      pendingPatchesRef.current = {}; // Clear patches

      if (patch.orders) {
        patch.orders = patch.orders.map((o: any) => ({
          ...o,
          customerId: o.customerId || null
        }));
      }

      if (!navigator.onLine) {
        pushOfflineAction({
          id: uid(),
          type: 'update_daily',
          dateKey: loadedDateKey,
          payload: patch,
          timestamp: Date.now()
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        const dataToSave = { ...patch };
        if (localUpdateIdRef.current) {
          (dataToSave as any).updateId = localUpdateIdRef.current;
        }
        await setDoc(
          doc(db, 'shops', shopId, 'daily', loadedDateKey),
          dataToSave,
          { merge: true }
        );
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [dailyData, currentDate, loadedDateKey, loading, shopId]);

  // ── Auto Backup Every 30 Minutes ──
  useEffect(() => {
    if (!dailyData || !isOnline) return;
    const currentKey = normalizeDateKey(currentDate);
    if (loadedDateKey !== currentKey) return;

    const checkAndBackup = async () => {
      try {
        const lastBackupStr = localStorage.getItem(`last_backup_${loadedDateKey}`);
        const lastBackupTime = lastBackupStr ? parseInt(lastBackupStr, 10) : 0;
        const now = Date.now();
        if (now - lastBackupTime > 30 * 60 * 1000) {
          const backupRef = doc(db, 'shops', shopId, 'daily', loadedDateKey, 'backups', `bkp_${now}`);
          await setDoc(backupRef, {
             ...dailyData,
             _backupTimestamp: now
          });
          localStorage.setItem(`last_backup_${loadedDateKey}`, now.toString());
        }
      } catch (err) {
        console.error("Auto Backup Failed:", err);
      }
    };
    
    checkAndBackup();
    const interval = setInterval(checkAndBackup, 5 * 60 * 1000); // Check every 5 mins
    return () => clearInterval(interval);
  }, [dailyData, currentDate, loadedDateKey, isOnline, shopId]);

  const updateDaily = (patchOrFn: Partial<DailyReport> | ((prev: DailyReport) => Partial<DailyReport>)) => {
    setDailyData(prev => {
      if (!prev) return null;
      const currentKey = normalizeDateKey(currentDate);
      if (!loadedDateKey || loadedDateKey !== currentKey) return prev;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      
      const newUpdateId = uid();
      localUpdateIdRef.current = newUpdateId;
      
      Object.keys(patch).forEach(k => {
        pendingPatchesRef.current[k] = true;
      });
      
      const updated = { ...prev, ...patch, date: loadedDateKey, updateId: newUpdateId };
      return updated;
    });
  };

  // POS-specific checkout: safely appends to server using runTransaction
  const handlePosCheckout = async (
    updaterFn: (prev: DailyReport) => DailyReport,
    sideEffectOrders: Order[]
  ) => {
    const targetKey = normalizeDateKey(currentDate);
    if (!loadedDateKey || loadedDateKey !== targetKey) return;

    // 1. Instant local update
    setDailyData(prev => {
      if (!prev) return prev;
      return updaterFn(prev);
    });

    // 2. Offline check
    if (!navigator.onLine) {
      sideEffectOrders.forEach(order => {
        pushOfflineAction({
          id: uid(),
          type: 'add_order',
          dateKey: targetKey,
          payload: order,
          timestamp: Date.now()
        });
      });
      
      const currentSnapshot = dailyData ? updaterFn(dailyData) : null;
      if (currentSnapshot) {
        pushOfflineAction({
          id: uid(),
          type: 'update_daily',
          dateKey: targetKey,
          payload: {
            ar: currentSnapshot.ar || {},
            inventory: currentSnapshot.inventory || {},
            losses: currentSnapshot.losses || {}
          },
          timestamp: Date.now()
        });
      }
      setSaveStatus('saved');
    } else {
      if (!shopId) return;
      try {
        await runTransaction(db, async (tx) => {
          const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
          const snap = await tx.get(docRef);
          if (snap.exists()) {
             const serverData = snap.data() as DailyReport;
             const nextData = updaterFn(serverData);
             tx.set(docRef, { orders: nextData.orders, ar: nextData.ar }, { merge: true });
          } else {
             const fallbackData = updaterFn({ orders: [], date: targetKey } as any);
             tx.set(docRef, fallbackData, { merge: true });
          }
        });
      } catch (e) {
        console.warn('[POS] Online transaction failed, queuing offline:', e);
        sideEffectOrders.forEach(order => {
          pushOfflineAction({
            id: uid(),
            type: 'add_order',
            dateKey: targetKey,
            payload: order,
            timestamp: Date.now()
          });
        });
        const currentSnapshot = dailyData ? updaterFn(dailyData) : null;
        if (currentSnapshot) {
          pushOfflineAction({
            id: uid(),
            type: 'update_daily',
            dateKey: targetKey,
            payload: {
              ar: currentSnapshot.ar || {},
              inventory: currentSnapshot.inventory || {},
              losses: currentSnapshot.losses || {}
            },
            timestamp: Date.now()
          });
        }
      }
    }

    // 4. Side effects: packaging deduction + CRM (do NOT touch orders state)
    for (const order of sideEffectOrders) {
      if (order.orderType === 'topup') continue; // 🌟 儲值訂單排除
      if (!order.pendingPickup) {
        await deductPackagingForOrder(order);
      }
      if (order.buyer && order.buyer !== '現客') {
        upsertCustomerFromOrder(shopId, customers, {
          orderId: order.id,
          date: currentDate,
          buyer: order.buyer,
          phone: order.phone || '',
          email: '',
          prodAmt: order.prodAmt,
          actualAmt: order.actualAmt,
          items: order.items,
          status: order.status,
          source: order.source
        }, (candidates, resolve) => { setMergeConflict({ candidates, resolve }); });
      }
    }
  };


  const handlePickup = async (orderId: string) => {
    if (!dailyData) return;
    const orderIndex = dailyData.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    const order = dailyData.orders[orderIndex];
    
    // Auto-deduct packaging when picked up
    await deductPackagingForOrder(order);
    
    updateOrderInDb(orderId, { pendingPickup: false });
  };

  const deductPackagingForOrder = async (order: Order) => {
    const packagingUsed: Record<string, number> = {};
    Object.entries(order.items || {}).forEach(([itemId, qtyStr]) => {
      const qty = parseNum(qtyStr);
      if (qty <= 0) return;
      const itemDef = settings.singleItems?.find(i => i.id === itemId) ||
                      settings.giftItems?.find(i => i.id === itemId) ||
                      (settings.customCategories || []).flatMap(c => c.items).find(i => i.id === itemId);
      if (itemDef && itemDef.materialRecipe) {
        Object.entries(itemDef.materialRecipe).forEach(([matId, pkgQty]) => {
          packagingUsed[matId] = (packagingUsed[matId] || 0) + (parseNum(pkgQty) * qty);
        });
      }
    });

    if (Object.keys(packagingUsed).length > 0) {
      const batch = writeBatch(db);
      Object.entries(packagingUsed).forEach(([matId, deductQty]) => {
        batch.update(doc(db, 'shops', shopId, 'materials', matId), {
          stock: increment(-deductQty)
        });
      });
      await batch.commit().catch(e => console.error('Failed to deduct packaging:', e));
    }
  };

  const handleAddFutureOrder = async (targetDate: string, order: Order) => {
    const targetKey = normalizeDateKey(targetDate);
    const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
    const docSnap = await getDoc(docRef);
    let targetData: DailyReport;
    if (docSnap.exists()) {
      targetData = docSnap.data() as DailyReport;
    } else {
      targetData = {
        date: targetKey,
        orders: [],
        inventory: {},
        losses: [],
        packagingUsage: {},
        ar: { accum: 0, collect: 0, logSpent: 0, actualTotal: 0 }
      };
    }
    
    targetData.orders = [...(targetData.orders || []), order];
    await setDoc(docRef, targetData, { merge: true });

    if (order.orderType === 'topup') return; // 🌟 儲值訂單排除
    if (order.buyer && order.buyer !== '現客') {
      upsertCustomerFromOrder(shopId, customers, {
        orderId: order.id,
        date: targetKey,
        buyer: order.buyer,
        phone: order.phone || '',
        email: '',
        prodAmt: order.prodAmt,
        actualAmt: order.actualAmt,
        items: order.items,
        status: order.status,
        source: order.source
      }, (candidates, resolve) => {
        setMergeConflict({ candidates, resolve });
      });
    }
  };

  const handleNewOrder = async (order: Order) => {
    const targetKey = normalizeDateKey(currentDate);
    if (!loadedDateKey || loadedDateKey !== targetKey) return;

    // 1. Instant local update
    setDailyData(prev => {
      if (!prev) return prev;
      if ((prev.orders || []).some(o => o.id === order.id)) return prev;
      return { ...prev, orders: [...(prev.orders || []), order], date: targetKey };
    });

    if (!shopId) return;

    // 2. Offline check
    if (!navigator.onLine) {
      pushOfflineAction({
        id: uid(),
        type: 'add_order',
        dateKey: targetKey,
        payload: order,
        timestamp: Date.now()
      });
      setSaveStatus('saved');
    } else {
      // Transaction update
      try {
        await runTransaction(db, async (tx) => {
          const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
          const snap = await tx.get(docRef);
          if (snap.exists()) {
             const serverData = snap.data() as DailyReport;
             const sOrders = serverData.orders || [];
             if (!sOrders.some(o => o.id === order.id)) {
                tx.set(docRef, { orders: [...sOrders, order] }, { merge: true });
             }
          } else {
             tx.set(docRef, { date: targetKey, orders: [order] }, { merge: true });
          }
        });
      } catch (e) {
        console.warn('[Add Order] Online transaction failed, queuing offline:', e);
        pushOfflineAction({
          id: uid(),
          type: 'add_order',
          dateKey: targetKey,
          payload: order,
          timestamp: Date.now()
        });
      }
    }
    
    // Auto-deduct packaging ONLY IF it's not a pending pickup order
    if (!order.pendingPickup) {
      await deductPackagingForOrder(order);
    }
    
    // CRM update
    if (order.orderType === 'topup') return; // 🌟 儲值訂單排除
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
      status: order.status,
      source: order.source
    }, (candidates, resolve) => {
      setMergeConflict({ candidates, resolve });
    });
  };

  const handleAutoCalculateDiscount = (order: Order) => {
    // 1. 取得所有商品設定列表
    const itemsList = [
      ...(settings.giftItems || []),
      ...(settings.singleItems || []),
      ...(settings.customCategories || []).flatMap(c => c.items || [])
    ].filter(i => i.active);

    // 2. 將訂單中的 items 轉為 calculateCartPricing 所需的購物車格式
    const cart: { item: any; qty: number }[] = [];
    Object.entries(order.items || {}).forEach(([itemId, qty]) => {
      const matchItem = itemsList.find(it => it.id === itemId);
      if (matchItem && Number(qty) > 0) {
        cart.push({ item: matchItem, qty: Number(qty) });
      }
    });

    // 3. 呼叫計算促銷價格
    const pricing = calculateCartPricing(cart, [], itemsList, settings.promoRules || []);

    // 4. 取得計算出的 discount 金額
    const disc = pricing.discount || 0;
    
    // 5. 更新訂單中的 discAmt 和 actualAmt
    updateOrderInDb(order.id, {
      discAmt: disc,
      actualAmt: (order.prodAmt || 0) + (order.shipAmt || 0) - disc
    });
  };

  const updateOrderInDb = (orderId: string, patch: Partial<Order>) => {
    const targetKey = normalizeDateKey(currentDate);
    if (!loadedDateKey || loadedDateKey !== targetKey) return;

    // 1. Instant local update
    setDailyData(prev => {
      if (!prev) return prev;
      const nextOrders = [...(prev.orders || [])];
      const idx = nextOrders.findIndex(o => o.id === orderId);
      if (idx >= 0) {
        nextOrders[idx] = { ...nextOrders[idx], ...patch };
      }
      return { ...prev, orders: nextOrders };
    });

    if (!targetKey || !shopId) return;

    // 2. Offline check
    if (!navigator.onLine) {
      pushOfflineAction({
        id: uid(),
        type: 'update_order',
        dateKey: targetKey,
        payload: { orderId, patch },
        timestamp: Date.now()
      });
      setSaveStatus('saved');
    } else {
      // Queue patch and debounce transaction
      orderTxQueueRef.current[orderId] = { ...orderTxQueueRef.current[orderId], ...patch };

      if (orderTxTimeoutRef.current) clearTimeout(orderTxTimeoutRef.current);
      orderTxTimeoutRef.current = setTimeout(() => {
        const patchesToApply = orderTxQueueRef.current;
        orderTxQueueRef.current = {};
        if (Object.keys(patchesToApply).length === 0) return;

        const newUpdateId = uid();
        localUpdateIdRef.current = newUpdateId;

        runTransaction(db, async (tx) => {
          const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
          const snap = await tx.get(docRef);
          if (snap.exists()) {
            const sData = snap.data() as any;
            const sOrders = sData.orders || [];
            Object.keys(patchesToApply).forEach(oId => {
              const idx = sOrders.findIndex((o: any) => o.id === oId);
              if (idx >= 0) {
                sOrders[idx] = { ...sOrders[idx], ...patchesToApply[oId] };
              }
            });
            tx.set(docRef, { orders: sOrders, updateId: newUpdateId }, { merge: true });
          }
        }).then(() => {
          // 🌟 異動成功後，若更動了狀態、實收金額、購買人、電話或品項，則同步更新至 CRM 系統
          Object.keys(patchesToApply).forEach(oId => {
            const currentOrder = dailyData?.orders?.find(o => o.id === oId);
            const patch = patchesToApply[oId];
            const finalOrder = currentOrder ? { ...currentOrder, ...patch } : null;
            
            if (finalOrder && finalOrder.orderType !== 'topup') {
              const hasCrmPatch = patch.status !== undefined || patch.actualAmt !== undefined || patch.buyer !== undefined || patch.phone !== undefined || patch.items !== undefined;
              if (hasCrmPatch && finalOrder.buyer && finalOrder.buyer !== '現客') {
                upsertCustomerFromOrder(shopId, customers, {
                  orderId: finalOrder.id,
                  date: currentDate,
                  buyer: finalOrder.buyer,
                  phone: finalOrder.phone || '',
                  email: '',
                  prodAmt: finalOrder.prodAmt,
                  actualAmt: finalOrder.actualAmt,
                  items: finalOrder.items,
                  status: finalOrder.status,
                  source: finalOrder.source
                }, (candidates, resolve) => {
                  setMergeConflict({ candidates, resolve });
                });
              }
            }
          });
        }).catch(e => {
          console.warn('Order update tx failed, queuing offline:', e);
          Object.keys(patchesToApply).forEach(oId => {
            pushOfflineAction({
              id: uid(),
              type: 'update_order',
              dateKey: targetKey,
              payload: { orderId: oId, patch: patchesToApply[oId] },
              timestamp: Date.now()
            });
          });
        });
      }, 800);
    }
  };

  const deleteOrderInDb = (orderId: string) => {
    const targetKey = normalizeDateKey(currentDate);
    if (!loadedDateKey || loadedDateKey !== targetKey) return;

    const currentOrder = dailyData?.orders?.find(o => o.id === orderId);
    const isAlreadyCancelled = currentOrder?.status === '已取消' || currentOrder?.status === '已刪除';

    if (isAlreadyCancelled) {
      // 🌟 物理刪除
      setDailyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: (prev.orders || []).filter(o => o.id !== orderId)
        };
      });
    } else {
      // 🌟 邏輯刪除：將 status 改為 '已取消'
      setDailyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: (prev.orders || []).map(o => o.id === orderId ? { ...o, status: '已取消' } : o)
        };
      });
    }

    if (!shopId) return;

    if (!navigator.onLine) {
      pushOfflineAction({
        id: uid(),
        type: 'delete_order',
        dateKey: targetKey,
        payload: { orderId },
        timestamp: Date.now()
      });
      setSaveStatus('saved');
    } else {
      const newUpdateId = uid();
      localUpdateIdRef.current = newUpdateId;

      runTransaction(db, async (tx) => {
        const docRef = doc(db, 'shops', shopId, 'daily', targetKey);
        const snap = await tx.get(docRef);
        if (snap.exists()) {
          const sData = snap.data() as any;
          const sOrders = sData.orders || [];
          const idx = sOrders.findIndex((o: any) => o.id === orderId);
          if (idx >= 0) {
            if (isAlreadyCancelled) {
              sOrders.splice(idx, 1);
            } else {
              sOrders[idx] = { ...sOrders[idx], status: '已取消' };
            }
          }
          tx.set(docRef, { orders: sOrders, updateId: newUpdateId }, { merge: true });
        }
      }).then(() => {
        const finalOrder = currentOrder;
        if (finalOrder && finalOrder.buyer && finalOrder.buyer !== '現客') {
          upsertCustomerFromOrder(shopId, customers, {
            orderId: finalOrder.id,
            date: currentDate,
            buyer: finalOrder.buyer,
            phone: finalOrder.phone || '',
            email: '',
            prodAmt: finalOrder.prodAmt,
            actualAmt: finalOrder.actualAmt,
            items: finalOrder.items,
            status: isAlreadyCancelled ? '已物理刪除' : '已取消',
            source: finalOrder.source
          }, (candidates, resolve) => {
            setMergeConflict({ candidates, resolve });
          });
        }
      }).catch(e => {
        console.warn('Delete (cancel) order tx failed, queuing offline:', e);
        pushOfflineAction({
          id: uid(),
          type: 'delete_order',
          dateKey: targetKey,
          payload: { orderId },
          timestamp: Date.now()
        });
      });
    }
  };

  const handleChangePickupDate = async (order: Order, newDateStr: string) => {
    if (!shopId) return;
    try {
      const normalizedNewDate = normalizeDateKey(newDateStr);
      const originalDateKey = loadedDateKey || normalizeDateKey(currentDate);

      if (order.orderType === 'pickup') {
        // --- CASE 1: Migrating the pickup order itself ---
        // 1. Remove from current/original day in Firestore
        const originalDocRef = doc(db, 'shops', shopId, 'daily', originalDateKey);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(originalDocRef);
          if (snap.exists()) {
            const data = snap.data();
            const orders = (data.orders || []).filter((o: any) => o.id !== order.id);
            tx.update(originalDocRef, { orders });
          }
        });

        // Update local state if the original order was in the currently loaded day
        if (originalDateKey === loadedDateKey) {
          setDailyData(prev => {
            if (!prev) return prev;
            return { ...prev, orders: (prev.orders || []).filter(o => o.id !== order.id) };
          });
        }

        // 2. Add to the new day in Firestore
        const newDocRef = doc(db, 'shops', shopId, 'daily', normalizedNewDate);
        const updatedPickupOrder = {
          ...order,
          pickupDate: newDateStr,
          note: order.note.replace(/\d{4}-\d{2}-\d{2}/, newDateStr) // update date in note if matches yyyy-mm-dd
        };

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(newDocRef);
          if (snap.exists()) {
            const data = snap.data();
            const orders = [...(data.orders || [])];
            if (!orders.some((o: any) => o.id === order.id)) {
              orders.push(updatedPickupOrder);
            }
            tx.update(newDocRef, { orders });
          } else {
            tx.set(newDocRef, { orders: [updatedPickupOrder] });
          }
        });

        // Update local state if the currently loaded day is the new date
        if (normalizedNewDate === loadedDateKey) {
          setDailyData(prev => {
            if (!prev) return prev;
            const orders = [...(prev.orders || [])];
            if (!orders.some(o => o.id === order.id)) {
              orders.push(updatedPickupOrder);
            }
            return { ...prev, orders };
          });
        }

        // 3. Find and update the prepayment order on the payment day if it exists in the current view
        setDailyData(prev => {
          if (!prev) return prev;
          const nextOrders = (prev.orders || []).map(o => {
            if (o.orderType === 'prepayment' && o.phone === order.phone && o.buyer === order.buyer && o.pickupDate === order.pickupDate) {
              const patch = {
                pickupDate: newDateStr,
                note: o.note.replace(/\d{4}-\d{2}-\d{2}/, newDateStr)
              };
              setTimeout(() => updateOrderInDb(o.id, patch), 50);
              return { ...o, ...patch };
            }
            return o;
          });
          return { ...prev, orders: nextOrders };
        });

        alert(`已成功將取貨單移動到新取貨日：${newDateStr}！`);

      } else if (order.orderType === 'prepayment') {
        // --- CASE 2: Migrating the booking date on a prepayment order ---
        // 1. Update the prepayment order itself on the currently loaded day
        const oldPickupDateStr = order.pickupDate || '';
        const patch = {
          pickupDate: newDateStr,
          note: order.note.replace(/\d{4}-\d{2}-\d{2}/, newDateStr)
        };
        updateOrderInDb(order.id, patch);

        // 2. Try to find the pickup order on the old pickup date and migrate it to the new pickup date
        if (oldPickupDateStr) {
          const oldPickupDateKey = normalizeDateKey(oldPickupDateStr);
          const oldPickupDocRef = doc(db, 'shops', shopId, 'daily', oldPickupDateKey);

          await runTransaction(db, async (tx) => {
            const snap = await tx.get(oldPickupDocRef);
            if (snap.exists()) {
              const data = snap.data();
              const sOrders = data.orders || [];
              
              // Find the corresponding pickup order
              const pickupOrderToMove = sOrders.find((o: any) => o.orderType === 'pickup' && o.phone === order.phone && o.buyer === order.buyer);
              
              if (pickupOrderToMove) {
                // Remove from old date in firestore
                const remainingOrders = sOrders.filter((o: any) => o.id !== pickupOrderToMove.id);
                tx.update(oldPickupDocRef, { orders: remainingOrders });

                // Add to new date in firestore
                const newDocRef = doc(db, 'shops', shopId, 'daily', normalizedNewDate);
                const updatedPickupOrder = {
                  ...pickupOrderToMove,
                  pickupDate: newDateStr,
                  note: pickupOrderToMove.note.replace(/\d{4}-\d{2}-\d{2}/, newDateStr)
                };

                const newSnap = await tx.get(newDocRef);
                if (newSnap.exists()) {
                  const newData = newSnap.data();
                  const newOrders = [...(newData.orders || [])];
                  if (!newOrders.some((o: any) => o.id === pickupOrderToMove.id)) {
                    newOrders.push(updatedPickupOrder);
                  }
                  tx.update(newDocRef, { orders: newOrders });
                } else {
                  tx.set(newDocRef, { orders: [updatedPickupOrder] });
                }
              }
            }
          });
        }

        alert(`已成功將預購單與對應取貨單日期變更為新取貨日：${newDateStr}！`);
      }
    } catch (err) {
      console.error('Change pickup date error:', err);
      alert('變更失敗，請確認網路連線！');
    }
  };

  const metrics = useMemo(() => {

    if (!dailyData) return null;
    let m = {
        rev: 0, ship: 0, prShip: 0, disc: 0, prVal: 0, recv: 0, act: 0, remit: 0, cash: 0, unpaid: 0,
        topup: 0, topupCash: 0, topupRemit: 0, prepaidPay: 0,
        prepay: 0, prepayCash: 0, prepayRemit: 0, preorderPay: 0,
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
        if (o.status === '已取消' || o.status === '已刪除') return;
        const isPR = o.status === '公關品';
        // 預付款單(prepayment)：付款日，只計金流，不計營業額（商品尚未取出）
        // 取貨單(pickup)：取貨日，計入營業額與銷量，不重複計金流（錢已在 prepayment 日收）
        // 其他（現客/POS）：金流與營業額同日，兩者都計
        const isPickupLinked = o.orderType === 'pickup'; // 取貨日的關聯取貨單
        const isPrepayment = o.orderType === 'prepayment'; // 付款日的預付款單

        // 1. 金流累加：prepayment（付款日收款）與一般訂單都計；pickup 不重複計
        if (!isPR && !isPickupLinked) {
            if (o.orderType === 'topup') {
                m.topup += o.actualAmt;
                if (o.status === '現結') {
                    m.topupCash += o.actualAmt;
                } else if (o.status === '匯款') {
                    m.topupRemit += o.actualAmt;
                }
            } else if (o.orderType === 'prepayment') {
                m.prepay += o.actualAmt;
                if (o.status === '現結') {
                    m.prepayCash += o.actualAmt;
                } else if (o.status === '匯款') {
                    m.prepayRemit += o.actualAmt;
                }
            } else {
                if (o.status === '匯款') { 
                    m.remit += o.actualAmt; 
                } else if (o.status === '現結') { 
                    m.cash += o.actualAmt; 
                } else if (o.status === '儲值金扣款') {
                    m.prepaidPay += o.actualAmt;
                }
                
                if (o.status === '未結帳款' || o.status === '已收帳款' || o.status === '已付訂金') {
                    m.unpaid += o.actualAmt;
                }
                m.act += o.actualAmt;
            }
        }

        // On pickup day, record that it is paid from preorder unearned revenue
        if (!isPR && isPickupLinked) {
            m.preorderPay += (o.prodAmt - o.discAmt + o.shipAmt);
        }

        // 2. 營業額、折扣、銷量、出庫累加：
        //    - prepayment（僅付款，商品未交）→ 跳過
        //    - topup（儲值金充值，不計入商品銷售營業額）→ 跳過
        if (isPrepayment || o.orderType === 'topup') return;

        m.rev += o.prodAmt; 
        m.disc += o.discAmt;
        
        if (isPR) { 
            m.prVal += o.prodAmt; 
            m.prShip += o.shipAmt;
        } else {
            m.ship += o.shipAmt;
            if (o.orderType === 'pickup') {
                m.recv += (o.prodAmt - o.discAmt + o.shipAmt);
            } else {
                m.recv += o.actualAmt;
            }
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
            
            {/* Offline status indicator */}
            {!isOnline && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg" title="您目前處於離線狀態。所有操作會先暫存，等網路恢復後自動同步。">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>離線模式</span>
              </div>
            )}

            <button
              onClick={() => setShowBackupModal(true)}
              className="ml-2 px-2.5 py-1 bg-coffee-100 hover:bg-coffee-200 text-coffee-600 rounded-lg flex items-center gap-1.5 transition border border-coffee-200 font-bold"
            >
              <History className="w-3.5 h-3.5" />
              <span>時光機</span>
            </button>
          </div>
        </div>

        {!forcedSubTab || forcedSubTab !== 'pos' ? (
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
        ) : (
          <div className="flex-1 flex justify-center">
            <div className="bg-rose-brand/10 text-rose-brand px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm border border-rose-brand/20">
              <Monitor className="w-4 h-4" /> POS 收銀機模式
            </div>
          </div>
        )}
      </div>

      {forcedSubTab === 'pos' && (
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
              onPosCheckout={handlePosCheckout}
              onAddFutureOrder={handleAddFutureOrder}
              onGoToDashboard={() => {
                if (onNavigateToTab) {
                  onNavigateToTab('daily', 'dashboard');
                } else {
                  setSubTab('dashboard');
                }
              }}
            />
      )}

      {forcedSubTab !== 'pos' && subTab === 'dashboard' && (
        <div className="flex flex-col gap-8">
          
          {/* Pending Pickups Alert Block */}
          {(() => {
            const pendingPickups = dailyData.orders.filter(o => o.pendingPickup);
            if (pendingPickups.length === 0) return null;
            return (
              <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="w-6 h-6 text-amber-600" />
                  <h3 className="text-lg font-bold text-amber-800">今日有 {pendingPickups.length} 筆預購單待交貨</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingPickups.map(order => (
                    <div key={order.id} className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-coffee-800">{order.buyer}</span>
                          <span className="text-xs text-coffee-400">{order.phone}</span>
                        </div>
                        <div className="text-xs text-coffee-500 font-medium">
                          {Object.entries(order.items || {}).map(([id, qty]) => {
                            const name = settings.singleItems?.find(i => i.id === id)?.name || settings.giftItems?.find(i => i.id === id)?.name || '未知名稱';
                            return `${name} x${qty}`;
                          }).join(', ')}
                        </div>
                      </div>
                      <button
                        onClick={() => handlePickup(order.id)}
                        className="px-5 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 active:scale-95 transition-all whitespace-nowrap shadow-md shadow-amber-200"
                      >
                        ✅ 確認交件 (扣除庫存)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Sales List */}
          <div className="glass-panel p-6 md:p-8">
            <div className="flex flex-col gap-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="section-title">
                  <LayoutDashboard className="w-5 h-5 inline-block mr-2 mb-1" /> 銷售明細
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Filters */}
                  <div className="flex bg-coffee-50 p-1 rounded-xl border border-coffee-100">
                    {(['all', 'pos', 'manual', 'import'] as const).map(f => (
                      <button 
                        key={f}
                        onClick={() => setSourceFilter(f)}
                        className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", sourceFilter === f ? "bg-white text-coffee-800 shadow-sm" : "text-coffee-400 hover:text-coffee-600")}
                      >
                        {f === 'all' ? '全部' : f === 'pos' ? 'POS收銀' : f === 'manual' ? '手動新增' : '批量匯入'}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-coffee-50 p-1 rounded-xl border border-coffee-100">
                    {['all', 'picked', 'pending'].map(f => (
                      <button 
                        key={f}
                        onClick={() => setPickupFilter(f as any)}
                        className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", pickupFilter === f ? "bg-white text-coffee-800 shadow-sm" : "text-coffee-400 hover:text-coffee-600")}
                      >
                        {f === 'all' ? '全部狀態' : f === 'picked' ? '已取貨' : '待取貨'}
                      </button>
                    ))}
                  </div>
                  
                  <button
                    onClick={() => setPhoneSearchModal(true)}
                    className="bg-white border border-coffee-200 text-coffee-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-50 transition-colors shadow-sm"
                  >
                    <Search className="w-4 h-4" /> 搜尋
                  </button>
                  <button
                    onClick={() => setAddOrderModal(true)}
                    className="bg-coffee-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition-colors shadow-md"
                  >
                    <Plus className="w-4 h-4" /> 新增
                  </button>
                </div>
              </div>

              {/* Item Summary Search Widget */}
              <div className="bg-coffee-50/50 p-4 rounded-2xl border border-coffee-100 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-coffee-600">品項提領統計:</span>
                  <select 
                    value={summaryItemId}
                    onChange={e => setSummaryItemId(e.target.value)}
                    className="bg-white border border-coffee-200 rounded-lg px-3 py-1.5 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
                  >
                    <option value="">選擇品項...</option>
                    {[...(settings.giftItems || []), ...(settings.singleItems || [])].filter(i => i.active).map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                {itemSummary && (
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-coffee-400">總數:</span>
                      <span className="text-sm font-bold text-coffee-800 font-mono">{itemSummary.total}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-mint-brand">已取:</span>
                      <span className="text-sm font-bold text-mint-brand font-mono">{itemSummary.picked}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-brand">待取:</span>
                      <span className="text-sm font-bold text-rose-brand font-mono">{itemSummary.pending}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* max-h + overflow-y-auto enables sticky thead inside a scrollable container */}
            <div className="rounded-2xl border border-coffee-50 bg-white/50" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '520px' }}
              onClick={(e) => {
                // Close sort dropdown if click is not on a sort button
                const target = e.target as HTMLElement;
                if (!target.closest('[data-sort-btn]')) setSortDropdown(null);
              }}
            >
              <table className="w-full text-xs md:text-sm text-center border-collapse">
                <thead className="bg-[#faf7f2] sticky top-0 z-30">
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider">
                    {/* 購買人 — sortable by time */}
                    <th className="px-3 py-4 text-left border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">
                      <div className="flex items-center gap-1 relative" data-sort-btn="true">
                        <span>購買人</span>
                        <button
                          onClick={() => setSortDropdown(prev => prev === 'time' ? null : 'time')}
                          className={cn("p-0.5 rounded hover:bg-coffee-100 transition-colors flex items-center",
                            sortConfig.field === 'time' && sortConfig.dir ? "text-rose-brand" : "text-coffee-300")}
                          title="依時間排序"
                        >
                          {sortConfig.field === 'time' && sortConfig.dir === 'asc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                          ) : sortConfig.field === 'time' && sortConfig.dir === 'desc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>
                          )}
                        </button>
                        {sortDropdown === 'time' && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-coffee-100 rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden">
                            <div className="px-3 py-2 text-[10px] font-bold text-coffee-400 uppercase tracking-wider border-b border-coffee-50">依結帳/新增時間</div>
                            {[{dir: null as SortDir, label: '預設（新增順序）'}, {dir: 'asc' as SortDir, label: '⬆ 舊 → 新'}, {dir: 'desc' as SortDir, label: '⬇ 新 → 舊'}].map(opt => (
                              <button key={String(opt.dir)} onClick={() => { setSortConfig({ field: 'time', dir: opt.dir }); setSortDropdown(null); }}
                                className={cn("w-full text-left px-3 py-2 text-xs font-bold hover:bg-coffee-50 transition-colors",
                                  sortConfig.field === 'time' && sortConfig.dir === opt.dir ? "text-rose-brand bg-rose-50" : "text-coffee-700")}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                    {settings.giftItems.filter(i => i.active).length > 0 && (
                      <th colSpan={settings.giftItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#ffcbf2]/30 border-r border-[#ffb3c1]/30">禮盒</th>
                   )}
                   {settings.singleItems.filter(i => i.active).length > 0 && (
                     <th colSpan={settings.singleItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#a2d2ff]/30 border-r border-[#83c5be]/30">單顆</th>
                   )}
                    <th colSpan={4} className="px-2 py-4 border-b border-[#f0ede8] bg-[#e2ece9]/30">金額結算</th>
                    {/* 收款 — sortable by status */}
                    <th className="px-3 py-4 border-b border-[#f0ede8]">
                      <div className="flex items-center justify-center gap-1 relative" data-sort-btn="true">
                        <span>收款</span>
                        <button
                          onClick={() => setSortDropdown(prev => prev === 'status' ? null : 'status')}
                          className={cn("p-0.5 rounded hover:bg-coffee-100 transition-colors flex items-center",
                            sortConfig.field === 'status' && sortConfig.dir ? "text-rose-brand" : "text-coffee-300")}
                          title="依收款方式排序"
                        >
                          {sortConfig.field === 'status' && sortConfig.dir === 'asc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                          ) : sortConfig.field === 'status' && sortConfig.dir === 'desc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>
                          )}
                        </button>
                        {sortDropdown === 'status' && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-coffee-100 rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden">
                            <div className="px-3 py-2 text-[10px] font-bold text-coffee-400 uppercase tracking-wider border-b border-coffee-50">依收款方式</div>
                            {[{dir: null as SortDir, label: '預設（新增順序）'}, {dir: 'asc' as SortDir, label: '⬆ A → Z'}, {dir: 'desc' as SortDir, label: '⬇ Z → A'}].map(opt => (
                              <button key={String(opt.dir)} onClick={() => { setSortConfig({ field: 'status', dir: opt.dir }); setSortDropdown(null); }}
                                className={cn("w-full text-left px-3 py-2 text-xs font-bold hover:bg-coffee-50 transition-colors",
                                  sortConfig.field === 'status' && sortConfig.dir === opt.dir ? "text-rose-brand bg-rose-50" : "text-coffee-700")}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                    {/* 配送 — sortable by delivery method */}
                    <th className="px-3 py-4 border-b border-[#f0ede8]">
                      <div className="flex items-center justify-center gap-1 relative" data-sort-btn="true">
                        <span>配送</span>
                        <button
                          onClick={() => setSortDropdown(prev => prev === 'delivery' ? null : 'delivery')}
                          className={cn("p-0.5 rounded hover:bg-coffee-100 transition-colors flex items-center",
                            sortConfig.field === 'delivery' && sortConfig.dir ? "text-rose-brand" : "text-coffee-300")}
                          title="依配送方式排序"
                        >
                          {sortConfig.field === 'delivery' && sortConfig.dir === 'asc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                          ) : sortConfig.field === 'delivery' && sortConfig.dir === 'desc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>
                          )}
                        </button>
                        {sortDropdown === 'delivery' && (
                          <div className="absolute top-full right-0 mt-1 bg-white border border-coffee-100 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
                            <div className="px-3 py-2 text-[10px] font-bold text-coffee-400 uppercase tracking-wider border-b border-coffee-50">依取貨方式</div>
                            {[
                              {dir: null as SortDir, label: '預設（新增順序）'},
                              {dir: 'asc' as SortDir, label: '⬆ 宅配→待取→已取'},
                              {dir: 'desc' as SortDir, label: '⬇ 已取→待取→宅配'},
                            ].map(opt => (
                              <button key={String(opt.dir)} onClick={() => { setSortConfig({ field: 'delivery', dir: opt.dir }); setSortDropdown(null); }}
                                className={cn("w-full text-left px-3 py-2 text-xs font-bold hover:bg-coffee-50 transition-colors",
                                  sortConfig.field === 'delivery' && sortConfig.dir === opt.dir ? "text-rose-brand bg-rose-50" : "text-coffee-700")}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
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
                  {filteredOrders.map((order) => {
                    const idx = dailyData.orders.findIndex(o => o.id === order.id);
                    if (idx === -1) return null;
                    const isDelivery = order.deliveryMethod === '宅配';
                    const isPickup = order.deliveryMethod === '自取';
                    const copyRecipient = () => {
                      const text = `${order.recipientName || order.buyer} / ${order.recipientPhone || order.phone} / ${order.address}`;
                      navigator.clipboard.writeText(text);
                    };
                    const isCancelled = order.status === '已取消' || order.status === '已刪除';
                    return (
                    <tr key={order.id} className={cn("group hover:bg-coffee-50/50 transition-colors", isCancelled && "opacity-60 bg-gray-50/85 text-gray-400 select-none line-through")}>
                      <td className="px-3 py-3 sticky left-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-r border-[#f0ede8]">
                        <div className="flex flex-col items-start gap-1">
                          <input
                            className={cn("w-20 md:w-28 bg-transparent font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand", isCancelled && "text-gray-400 line-through")}
                            placeholder="姓名"
                            value={order.buyer}
                            onChange={(e) => { updateOrderInDb(order.id, { buyer: e.target.value }); }}
                          />
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-tighter", 
                              order.source === 'pos' ? "bg-coffee-100 text-coffee-600" : 
                              order.source === 'import' ? "bg-blue-50 text-blue-500" :
                              order.source === 'manual' ? "bg-purple-50 text-purple-500" :
                              "bg-gray-100 text-gray-400")}>
                              {order.source === 'pos' ? 'POS收銀' : order.source === 'import' ? '批量匯入' : order.source === 'manual' ? '手動新增' : '未知'}
                            </span>
                            {isCancelled && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-gray-200 text-gray-500 border border-gray-300 shadow-sm">
                                ❌ 已取消
                              </span>
                            )}
                            {order.createdAt && (
                              <span className="text-[9px] text-coffee-300 font-mono tabular-nums" title={order.createdAt}>
                                {new Date(order.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {(settings.giftItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#ffcbf2]/5">
                          <input type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''} placeholder="0"
                            disabled={isCancelled}
                            onChange={(e) => { const num = parseNum(e.target.value); const newItems = { ...(order.items || {}), [i.id]: num }; let pAmt = 0; [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => { pAmt += (newItems[item.id] || 0) * item.price; }); updateOrderInDb(order.id, { items: newItems, prodAmt: pAmt, actualAmt: pAmt + (order.shipAmt || 0) - (order.discAmt || 0) }); }}
                          />
                        </td>
                      ))}
                      {(settings.singleItems || []).filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#a2d2ff]/5">
                          <input type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items?.[i.id] || ''} placeholder="0"
                            disabled={isCancelled}
                            onChange={(e) => { const num = parseNum(e.target.value); const newItems = { ...(order.items || {}), [i.id]: num }; let pAmt = 0; [...(settings.giftItems || []), ...(settings.singleItems || [])].forEach(item => { pAmt += (newItems[item.id] || 0) * item.price; }); updateOrderInDb(order.id, { items: newItems, prodAmt: pAmt, actualAmt: pAmt + (order.shipAmt || 0) - (order.discAmt || 0) }); }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-3 font-mono font-bold text-gray-500 bg-[#e2ece9]/5">${fmt(order.prodAmt)}</td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input type="number"
                          className="w-14 bg-transparent text-center font-mono font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.shipAmt || ''} placeholder="0"
                          disabled={isCancelled}
                          onChange={(e) => { const num = parseNum(e.target.value); updateOrderInDb(order.id, { shipAmt: num, actualAmt: (order.prodAmt || 0) + num - (order.discAmt || 0) }); }}
                        />
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5 flex items-center justify-center gap-1 min-w-[76px]">
                        <input type="number"
                          className="w-10 bg-transparent text-center font-mono font-bold text-rose-brand outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.discAmt || ''} placeholder="0"
                          disabled={isCancelled}
                          onChange={(e) => { const num = parseNum(e.target.value); updateOrderInDb(order.id, { discAmt: num, actualAmt: (order.prodAmt || 0) + (order.shipAmt || 0) - num }); }}
                        />
                        {!isCancelled && (
                          <button
                            title="自動計算促銷折扣"
                            onClick={() => handleAutoCalculateDiscount(order)}
                            className="p-1 rounded text-gray-400 hover:text-rose-brand hover:bg-rose-50 transition-colors"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-3 font-mono font-bold text-mint-brand bg-[#e2ece9]/10">${fmt(order.actualAmt)}</td>
                      {/* 收款狀態 */}
                      <td className="px-3 py-3">
                        <select value={order.status}
                          onChange={(e) => { updateOrderInDb(order.id, { status: e.target.value as any }); }}
                          className={cn("text-xs font-bold px-2 py-1.5 rounded-lg outline-none",
                            order.status === '匯款' && "bg-blue-50 text-blue-600",
                            order.status === '現結' && "bg-green-50 text-green-600",
                            order.status === '未結帳款' && "bg-danger-brand/10 text-danger-brand",
                            order.status === '公關品' && "bg-purple-50 text-purple-600",
                            order.status === '儲值金扣款' && "bg-emerald-50 text-emerald-600",
                            isCancelled && "bg-gray-100 text-gray-500 line-through border border-gray-300"
                          )}>
                          <option value="匯款">匯款</option>
                          <option value="現結">現結</option>
                          <option value="未結帳款">未結</option>
                          <option value="公關品">公關</option>
                          <option value="儲值金扣款">儲值金扣款</option>
                          <option value="已取消">已取消</option>
                        </select>
                      </td>
                      {/* 配送方式 */}
                      <td className="px-2 py-2 min-w-[80px]">
                        {(order.source === 'pos' || order.note?.includes('收銀機交易')) && (order.orderType !== 'prepayment' && order.orderType !== 'pickup') ? (
                          <span className="text-[10px] font-bold text-coffee-300 bg-coffee-50 px-2 py-0.5 rounded-full">現場</span>
                        ) : (
                        <div className="flex flex-col gap-1.5 items-center">
                          {/* 宅配/自取 toggle (僅對非預購單開放) */}
                          {order.orderType !== 'prepayment' && order.orderType !== 'pickup' ? (
                            <div className="flex rounded-lg overflow-hidden border border-coffee-100 text-[10px] font-bold">
                              <button
                                onClick={() => { updateOrderInDb(order.id, { deliveryMethod: '宅配' }); }}
                                className={cn("px-2 py-1 transition-colors flex items-center gap-0.5", isDelivery ? "bg-blue-500 text-white" : "bg-white text-coffee-400 hover:bg-coffee-50")}
                              ><Truck className="w-3 h-3"/>宅</button>
                              <button
                                onClick={() => { updateOrderInDb(order.id, { deliveryMethod: '自取' }); }}
                                className={cn("px-2 py-1 transition-colors flex items-center gap-0.5", isPickup ? "bg-mint-brand text-white" : "bg-white text-coffee-400 hover:bg-coffee-50")}
                              ><MapPin className="w-3 h-3"/>取</button>
                            </div>
                          ) : (
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full tracking-tighter shadow-sm border",
                              order.orderType === 'prepayment' ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-mint-50 text-mint-600 border-mint-200"
                            )}>
                              {order.orderType === 'prepayment' ? '🛍️ 預購付款' : '📍 預購取貨'}
                            </span>
                          )}

                          {/* 自取：已取/未取 toggle */}
                          {isPickup && (
                            <button
                              onClick={() => { updateOrderInDb(order.id, { isPickedUp: !order.isPickedUp }); }}
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
                                  onChange={(e) => { updateOrderInDb(order.id, { recipientName: e.target.value }); }}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  className="text-[10px] w-full bg-transparent text-coffee-600 outline-none border-b border-transparent focus:border-blue-300 placeholder-coffee-200"
                                  placeholder="收件人電話"
                                  value={order.recipientPhone || ''}
                                  onChange={(e) => { updateOrderInDb(order.id, { recipientPhone: e.target.value }); }}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  className="text-[10px] w-full bg-transparent text-coffee-600 outline-none border-b border-transparent focus:border-blue-300 placeholder-coffee-200"
                                  placeholder="地址"
                                  value={order.address || ''}
                                  onChange={(e) => { updateOrderInDb(order.id, { address: e.target.value }); }}
                                />
                                <button
                                  onClick={copyRecipient}
                                  title="複製收件資訊"
                                  className="flex-shrink-0 p-0.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                ><Copy className="w-3 h-3"/></button>
                              </div>
                            </div>
                          )}

                          {/* 預購/取貨：變更取貨日期 */}
                          {(order.orderType === 'prepayment' || order.orderType === 'pickup') && !order.isPickedUp && (
                            <div className="w-full mt-1 pt-1.5 border-t border-coffee-100 flex flex-col items-stretch gap-1">
                              <span className="text-[9px] font-bold text-coffee-400 text-center">📅 變更取貨日</span>
                              <input
                                type="date"
                                className="text-[10px] font-bold bg-white border border-coffee-200 rounded px-1.5 py-0.5 text-coffee-700 outline-none focus:border-coffee-400 text-center"
                                value={order.pickupDate || ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    if (window.confirm(`確定要將取貨日期變更為 ${e.target.value} 嗎？\n系統將自動安全搬移取貨明細並更新報表。`)) {
                                      handleChangePickupDate(order, e.target.value);
                                    }
                                  }
                                }}
                              />
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
                          onChange={(e) => { updateOrderInDb(order.id, { phone: e.target.value }); }}
                        />
                      </td>
                      {/* 文字備注 */}
                      <td className="px-2 py-3">
                        <input type="text"
                          className="w-28 bg-transparent text-xs text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="備注說明"
                          value={order.note || ''}
                          onChange={(e) => { updateOrderInDb(order.id, { note: e.target.value }); }}
                        />
                      </td>
                      {/* 刪除（含確認） */}
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-l border-[#f0ede8]">
                        <button
                          onClick={() => {
                            if (window.confirm(`確定要刪除「${order.buyer || '此筆'}」的訂單嗎？`)) {
                              deleteOrderInDb(order.id);
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

          {/* ── Backup Modal ── */}
          <AnimatePresence>
            {showBackupModal && (
              <BackupModal
                shopId={shopId}
                dateKey={loadedDateKey}
                onClose={() => setShowBackupModal(false)}
                onRestore={() => setLoadedDateKey('')} // Trigger reload
              />
            )}
          </AnimatePresence>

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
                  updateOrderInDb(updated.id, updated);
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
                  <span className="font-bold text-coffee-800">營業淨額 (含運費)</span>
                  <span className="font-bold font-mono text-rose-brand">${fmt(metrics?.recv || 0)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs text-coffee-500 font-bold uppercase tracking-wider">
                  <span>營業淨額項目</span>
                  <span className="text-right">系統應有</span>
                  <span className="text-right">今日實收</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">現金收入 (現結)</span>
                  <span className="font-bold font-mono text-right min-w-[96px]">${fmt(metrics?.cash || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualCash || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualCash: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">匯款收入 (匯款)</span>
                  <span className="font-bold font-mono text-right min-w-[96px]">${fmt(metrics?.remit || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualRemit || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualRemit: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-coffee-600">應收帳款 (未結)</span>
                  <span className="font-bold font-mono text-right min-w-[96px] text-danger-brand">${fmt(metrics?.unpaid || 0)}</span>
                  <input
                    type="number"
                    value={dailyData?.ar?.actualUnpaid || ''}
                    onChange={e => updateDaily({ ar: { ...(dailyData?.ar || defaultAr()), actualUnpaid: parseNum(e.target.value) } })}
                    className="w-28 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-mono text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="flex justify-between items-center border-t border-dashed border-coffee-100 pt-2">
                  <span className="text-coffee-600">儲值金付款</span>
                  <span className="font-bold font-mono text-right min-w-[96px] text-emerald-600">${fmt(metrics?.prepaidPay || 0)}</span>
                  <span className="w-28"></span>
                </div>
                <div className="flex justify-between items-center border-t border-dashed border-coffee-100 pt-2">
                  <span className="text-coffee-600">預定金付款 (預購取貨)</span>
                  <span className="font-bold font-mono text-right min-w-[96px] text-amber-600">${fmt(metrics?.preorderPay || 0)}</span>
                  <span className="w-28"></span>
                </div>

                <div className="mt-2 text-xs font-bold text-coffee-400 uppercase tracking-wider">儲值金充值 (金流獨立)</div>
                <div className="flex justify-between items-center text-xs text-coffee-600 pl-2">
                  <span>↳ 現金儲值</span>
                  <span className="font-mono font-semibold">${fmt(metrics?.topupCash || 0)}</span>
                  <span className="w-28"></span>
                </div>
                <div className="flex justify-between items-center text-xs text-coffee-600 pl-2">
                  <span>↳ 匯款儲值</span>
                  <span className="font-mono font-semibold">${fmt(metrics?.topupRemit || 0)}</span>
                  <span className="w-28"></span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-emerald-600 pl-2 border-b border-dashed border-coffee-100 pb-2">
                  <span>儲值金充值總額</span>
                  <span className="font-mono">${fmt(metrics?.topup || 0)}</span>
                  <span className="w-28"></span>
                </div>

                <div className="mt-2 text-xs font-bold text-coffee-400 uppercase tracking-wider">預定商品預付款 (金流獨立)</div>
                <div className="flex justify-between items-center text-xs text-coffee-600 pl-2">
                  <span>↳ 現金預收</span>
                  <span className="font-mono font-semibold">${fmt(metrics?.prepayCash || 0)}</span>
                  <span className="w-28"></span>
                </div>
                <div className="flex justify-between items-center text-xs text-coffee-600 pl-2">
                  <span>↳ 匯款預收</span>
                  <span className="font-mono font-semibold">${fmt(metrics?.prepayRemit || 0)}</span>
                  <span className="w-28"></span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-amber-600 pl-2 border-b border-dashed border-coffee-100 pb-2">
                  <span>預定商品預收總額</span>
                  <span className="font-mono">${fmt(metrics?.prepay || 0)}</span>
                  <span className="w-28"></span>
                </div>

                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-coffee-800">今日實收總額 (現金+匯款+應收)</span>
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
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={inv.org || ''} 
                                            onChange={e => updateDaily({ inventory: { ...dailyData.inventory, [normalizeFlavorName(f)]: { ...inv, org: parseNum(e.target.value) } } })}
                                            className="w-12 text-center border border-gray-200 rounded focus:border-coffee-400 font-mono font-bold outline-none" 
                                            placeholder="0"
                                        />
                                    </td>
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

      {forcedSubTab !== 'pos' && subTab === 'import' && (
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

      {forcedSubTab !== 'pos' && subTab === 'settings' && (
        <SettingsTab settings={baseSettings} shopId={shopId} dailyActive={dailyData?.dailyActive} updateDaily={updateDaily} />
      )}

      {/* Offline Conflict Resolution Modal */}
      <AnimatePresence>
        {activeConflict && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-2xl bg-[#faf7f2] border-0 shadow-2xl rounded-[32px] relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="bg-amber-600 text-white p-8 text-center relative">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold">{activeConflict.title}</h3>
                <p className="text-amber-100 text-xs mt-1">偵測到離線期間與雲端同步之數據衝突，請選擇保留版本</p>
              </div>

              {/* Comparison Columns */}
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto flex-1">
                {/* Server Version */}
                <div className="flex flex-col h-full bg-white border border-coffee-100 rounded-2xl p-6 shadow-sm justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-mint-brand" />
                      <h4 className="text-sm font-bold text-coffee-800">{activeConflict.serverLabel}</h4>
                    </div>
                    
                    <div className="space-y-3 text-xs text-coffee-600 font-bold bg-coffee-50 p-4 rounded-xl font-mono">
                      {activeConflict.action.type === 'update_order' ? (
                        <>
                          <div>購買人: {activeConflict.serverValue.buyer || '現客'}</div>
                          <div>實收金額: ${activeConflict.serverValue.actualAmt}</div>
                          <div>備註: {activeConflict.serverValue.notes || '無'}</div>
                          <div>付款狀態: {activeConflict.serverValue.status}</div>
                        </>
                      ) : (
                        <div>
                          {Object.entries(activeConflict.serverValue || {}).map(([itemId, item]: any) => {
                            const name = settings.singleItems?.find(i => i.id === itemId)?.name || settings.giftItems?.find(i => i.id === itemId)?.name || itemId;
                            return <div key={itemId}>{name}: 盤點數 {item.act} 顆 (損耗 {item.los})</div>;
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => activeConflict.resolve(activeConflict.serverValue)}
                    className="mt-6 w-full py-3 bg-mint-brand hover:bg-mint-brand/90 text-white rounded-xl font-bold transition-all active:scale-95 text-xs shadow-md"
                  >
                    保留此雲端版本
                  </button>
                </div>

                {/* Local Offline Version */}
                <div className="flex flex-col h-full bg-white border-2 border-rose-brand/30 rounded-2xl p-6 shadow-md justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-brand" />
                      <h4 className="text-sm font-bold text-rose-brand">{activeConflict.localLabel}</h4>
                    </div>
                    
                    <div className="space-y-3 text-xs text-coffee-600 font-bold bg-rose-50/50 p-4 rounded-xl font-mono">
                      {activeConflict.action.type === 'update_order' ? (
                        <>
                          <div>購買人: {activeConflict.localValue.buyer || '現客'}</div>
                          <div>實收金額: ${activeConflict.localValue.actualAmt}</div>
                          <div>備註: {activeConflict.localValue.notes || '無'}</div>
                          <div>付款狀態: {activeConflict.localValue.status}</div>
                        </>
                      ) : (
                        <div>
                          {Object.entries(activeConflict.localValue || {}).map(([itemId, item]: any) => {
                            const name = settings.singleItems?.find(i => i.id === itemId)?.name || settings.giftItems?.find(i => i.id === itemId)?.name || itemId;
                            return <div key={itemId}>{name}: 盤點數 {item.act} 顆 (損耗 {item.los})</div>;
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => activeConflict.resolve(activeConflict.localValue)}
                    className="mt-6 w-full py-3 bg-rose-brand hover:bg-rose-brand/90 text-white rounded-xl font-bold transition-all active:scale-95 text-xs shadow-md"
                  >
                    保留離線修改版本
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-coffee-50 bg-coffee-50/50 text-center">
                <p className="text-[10px] text-coffee-400 font-bold">一旦做出選擇，另一版本將會被覆蓋，且無法復原。</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components for DailyView (to keep the main component readable)
// -----------------------------------------------------------------------------

