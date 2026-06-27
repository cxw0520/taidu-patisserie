import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../lib/firebase';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, query, orderBy, getDoc, getDocs
} from 'firebase/firestore';
import { uid, fmt, cn, parseNum } from '../lib/utils';
import { Customer, CustomerPurchase, Settings, CreditLog } from '../types';
import {
  Users, Plus, Search, Trash2, ChevronDown, ChevronRight,
  Phone, Mail, StickyNote, ShoppingBag, X, Edit2, Check, Star, User, Database, MessageCircle, Cake, Tag, AlertTriangle, AlertCircle, CreditCard, DollarSign, History, Wrench, ArrowRightLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── helpers ──────────────────────────────────────────────────────────────────
const normalizePhone = (p: string) => p.replace(/\D/g, '');
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function parseNameAndGender(rawName: string): { name: string, gender: '先生' | '小姐' | '不選擇' } {
  if (!rawName) return { name: '', gender: '不選擇' };
  const trimmed = rawName.trim();
  if (trimmed.endsWith('先生') && trimmed.length >= 2) {
    const n = trimmed.slice(0, -2).trim();
    return { name: n || '先生', gender: '先生' };
  }
  if (trimmed.endsWith('小姐') && trimmed.length >= 2) {
    const n = trimmed.slice(0, -2).trim();
    return { name: n || '小姐', gender: '小姐' };
  }
  return { name: trimmed, gender: '不選擇' };
}

/** Find potential duplicate customers by name/phone/email */
export function findDuplicates(customers: Customer[], name: string, phone: string, email?: string): Customer[] {
  const np = normalizePhone(phone);
  const ne = email ? normalizeEmail(email) : '';
  return customers.filter(c => {
    if (normalizePhone(c.phone) && np && normalizePhone(c.phone) === np) return true;
    if (ne && c.email && normalizeEmail(c.email) === ne) return true;
    if (name && c.name === name) return true;
    return false;
  });
}

export function calcOrderFinancialImpact(
  customer: Partial<Customer>,
  orderId: string,
  newActualAmt: number,
  newStatus: string
): { creditBalance: number; unpaidBalance: number; creditLogs: CreditLog[] } {
  let cred = Number(customer.creditBalance || 0);
  let unp = Number(customer.unpaidBalance || 0);
  let logs = [...(customer.creditLogs || [])];

  // 1. Check previous purchase state to reverse previous impacts
  const prevP = customer.purchases?.find(p => p.orderId === orderId);
  if (prevP) {
    if (prevP.status === '儲值金扣款') {
      cred += Number(prevP.actualAmt || 0);
      logs = logs.filter(l => l.orderId !== orderId);
    } else if (prevP.status === '未結帳款') {
      unp = Math.max(0, unp - Number(prevP.actualAmt || 0));
    }
  }

  // 2. Apply new state impacts
  if (newStatus === '儲值金扣款') {
    cred = Math.max(0, cred - newActualAmt);
    logs.push({
      id: uid(),
      timestamp: new Date().toISOString(),
      type: 'consume',
      amount: -newActualAmt,
      balanceAfter: cred,
      orderId,
      note: 'POS 訂單儲值金扣款'
    });
  } else if (newStatus === '未結帳款') {
    unp += newActualAmt;
  }

  return { creditBalance: cred, unpaidBalance: unp, creditLogs: logs };
}

/** Upsert a customer record from an order, returns the customer id */
export async function upsertCustomerFromOrder(
  shopId: string,
  allCustomers: Customer[],
  orderInfo: { orderId: string; date: string; buyer: string; phone: string; email?: string; prodAmt: number; actualAmt: number; items: Record<string, number>; status: string; source?: string },
  onConflict: (matches: Customer[], resolve: (action: 'merge' | 'new', targetId?: string) => void) => void
): Promise<void> {
  const { orderId, date, buyer, phone, email, prodAmt, actualAmt, items, status, source } = orderInfo;
  const purchase: CustomerPurchase = { orderId, date, prodAmt, actualAmt, items, status };
  const { name: parsedName, gender: parsedGender } = parseNameAndGender(buyer);
  const isPosSource = source === 'pos';

  const getFreshCustomer = async (id: string): Promise<Customer | null> => {
    const snap = await getDoc(doc(db, 'shops', shopId, 'customers', id));
    return snap.exists() ? (snap.data() as Customer) : null;
  };

  const getImpact = (c: Partial<Customer>) => {
    if (isPosSource) {
      // 🌟 POS 交易在結帳時已自行透過 Transaction 處理完扣款/加值，CRM 僅記錄消費歷史，不做重複財務扣減
      return {
        creditBalance: Number(c.creditBalance || 0),
        unpaidBalance: Number(c.unpaidBalance || 0),
        creditLogs: c.creditLogs || []
      };
    }
    return calcOrderFinancialImpact(c, orderId, actualAmt, status);
  };

  // check if this order is already linked to a customer
  const alreadyLinked = allCustomers.find(c => c.purchases.some(p => p.orderId === orderId));
  if (alreadyLinked) {
    const freshCust = await getFreshCustomer(alreadyLinked.id);
    if (freshCust) {
      const impact = getImpact(freshCust);
      const basePurchases = (freshCust.purchases || []).filter(p => p.orderId !== orderId);
      const newPurchases = status === '已物理刪除' ? basePurchases : [...basePurchases, purchase];
      const validP = newPurchases.filter(p => p.status !== '已取消' && p.status !== '已刪除');
      const updated: Customer = {
        ...freshCust,
        ...impact,
        purchases: newPurchases,
        totalPurchaseCount: validP.length,
        totalPurchaseAmt: validP.reduce((s, p) => s + Number(p.actualAmt || 0), 0),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'shops', shopId, 'customers', freshCust.id), updated);
    }
    return;
  }

  const dups = findDuplicates(allCustomers, buyer, phone, email);

  const exactMatch = dups.find(c => c.name === parsedName && normalizePhone(c.phone) === normalizePhone(phone));
  if (exactMatch) {
    const freshCust = await getFreshCustomer(exactMatch.id);
    if (freshCust) {
      const impact = getImpact(freshCust);
      const basePurchases = (freshCust.purchases || []).filter(p => p.orderId !== orderId);
      const newPurchases = status === 'Spacer' || status === '已物理刪除' ? basePurchases : [...basePurchases, purchase];
      const validP = newPurchases.filter(p => p.status !== '已取消' && p.status !== '已刪除');
      const updated: Customer = {
        ...freshCust,
        ...impact,
        email: email || freshCust.email,
        gender: freshCust.gender === '不選擇' && parsedGender !== '不選擇' ? parsedGender : freshCust.gender,
        purchases: newPurchases,
        totalPurchaseCount: validP.length,
        totalPurchaseAmt: validP.reduce((s, p) => s + Number(p.actualAmt || 0), 0),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'shops', shopId, 'customers', freshCust.id), updated);
    }
    return;
  }

  const initialCount = (status === '已取消' || status === '已刪除' || status === '已物理刪除') ? 0 : 1;
  const initialAmtVal = (status === '已取消' || status === '已刪除' || status === '已物理刪除') ? 0 : actualAmt;

  if (dups.length > 0) {
    // ask caller what to do
    await new Promise<void>((resolve) => {
      onConflict(dups, async (action, targetId) => {
        if (action === 'merge' && targetId) {
          const freshCust = await getFreshCustomer(targetId);
          if (freshCust) {
            const impact = getImpact(freshCust);
            const basePurchases = (freshCust.purchases || []).filter(p => p.orderId !== orderId);
            const newPurchases = status === '已物理刪除' ? basePurchases : [...basePurchases, purchase];
            const validP = newPurchases.filter(p => p.status !== '已取消' && p.status !== '已刪除');
            const updated: Customer = {
              ...freshCust,
              ...impact,
              name: freshCust.name !== '未知' && freshCust.name ? freshCust.name : parsedName,
              phone: phone || freshCust.phone,
              email: email || freshCust.email,
              gender: freshCust.gender === '不選擇' && parsedGender !== '不選擇' ? parsedGender : freshCust.gender,
              purchases: newPurchases,
              totalPurchaseCount: validP.length,
              totalPurchaseAmt: validP.reduce((s, p) => s + Number(p.actualAmt || 0), 0),
              updatedAt: new Date().toISOString(),
            };
            await setDoc(doc(db, 'shops', shopId, 'customers', freshCust.id), updated);
          }
        } else {
          // create new
          const newId = uid();
          const impact = getImpact({});
          const newCustomer: Customer = {
            id: newId, name: parsedName, phone, email: email || '', gender: parsedGender, createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(), purchases: [purchase],
            totalPurchaseCount: initialCount, totalPurchaseAmt: initialAmtVal,
            ...impact
          };
          await setDoc(doc(db, 'shops', shopId, 'customers', newId), newCustomer);
        }
        resolve();
      });
    });
  } else {
    const newId = uid();
    const impact = getImpact({});
    const newCustomer: Customer = {
      id: newId, name: parsedName, phone, email: email || '', gender: parsedGender, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), purchases: [purchase],
      totalPurchaseCount: initialCount, totalPurchaseAmt: initialAmtVal,
      ...impact
    };
    await setDoc(doc(db, 'shops', shopId, 'customers', newId), newCustomer);
  }
}


// ── Main Component ────────────────────────────────────────────────────────────
export default function CustomerView({ shopId, settings }: { shopId: string; settings: Settings }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<Customer | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'list' | 'credit'>('list');
  const [creditAdjustModal, setCreditAdjustModal] = useState<Customer | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [displayCount, setDisplayCount] = useState(50);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeConfirmModal, setMergeConfirmModal] = useState(false);

  useEffect(() => {
    setDisplayCount(50);
  }, [searchQ, subTab]);

  const handleFixData = async () => {
    if (!window.confirm('確定要執行「顧客資料一鍵校正與清洗」？\n這會自動掃描所有顧客的明細，移除重複訂單，並重新校對未付款餘額與消費總額。')) return;
    setFixing(true);
    try {
      // 1. 取得所有日報表，收集所有訂單作為「真理之源」
      const dailySnap = await getDocs(collection(db, 'shops', shopId, 'daily'));
      const globalOrders = new Map<string, any>();
      dailySnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const orders = data.orders || [];
        orders.forEach((o: any) => {
          if (o && o.id) globalOrders.set(o.id, o);
        });
      });

      // 2. 進行校正
      let fixCount = 0;
      for (const c of customers) {
        const purchases = c.purchases || [];
        let needsUpdate = false;
        const uniqueMap = new Map<string, any>();
        
        for (const p of purchases) {
          if (!p.orderId) continue;
          const realOrder = globalOrders.get(p.orderId);
          let updatedP = { ...p };
          
          if (realOrder) {
            if (p.status !== realOrder.status) {
              updatedP.status = realOrder.status;
              needsUpdate = true;
            }
            if (p.actualAmt !== realOrder.actualAmt) {
              updatedP.actualAmt = realOrder.actualAmt;
              needsUpdate = true;
            }
            if (p.prodAmt !== realOrder.prodAmt) {
              updatedP.prodAmt = realOrder.prodAmt;
              needsUpdate = true;
            }
          } else {
            // 🌟 物理刪除的訂單（即日報表已找不到），在校正時將其標記為 '已取消'，沖銷金額
            if (p.status !== '已取消' && p.status !== '已刪除') {
              updatedP.status = '已取消';
              needsUpdate = true;
            }
          }

          if (uniqueMap.has(p.orderId)) {
            needsUpdate = true;
            const existing = uniqueMap.get(p.orderId);
            if (existing.status === '未結帳款' && updatedP.status !== '未結帳款') {
              uniqueMap.set(p.orderId, updatedP);
            }
          } else {
            uniqueMap.set(p.orderId, updatedP);
          }
        }

        const cleanedPurchases = Array.from(uniqueMap.values());
        
        // 重新計算 unpaidBalance
        let unpaidBalance = 0;
        cleanedPurchases.forEach((p: any) => {
          if (p.status === '未結帳款') {
            unpaidBalance += Number(p.actualAmt || 0);
          }
        });

        // 🌟 重新計算消費次數與金額時，完全排除已取消 / 已刪除的訂單金額
        const validPurchases = cleanedPurchases.filter((p: any) => p.status !== '已取消' && p.status !== '已刪除');
        const totalPurchaseCount = validPurchases.length;
        const totalPurchaseAmt = validPurchases.reduce((s: number, p: any) => s + Number(p.actualAmt || 0), 0);

        const oldUnpaid = Number(c.unpaidBalance || 0);
        const oldAmt = Number(c.totalPurchaseAmt || 0);
        const oldCount = Number(c.totalPurchaseCount || 0);
        const oldPurchasesCount = purchases.length;

        if (
          needsUpdate ||
          oldUnpaid !== unpaidBalance ||
          oldAmt !== totalPurchaseAmt ||
          oldCount !== totalPurchaseCount ||
          oldPurchasesCount !== cleanedPurchases.length
        ) {
          const updated = {
            ...c,
            purchases: cleanedPurchases,
            unpaidBalance,
            totalPurchaseCount,
            totalPurchaseAmt,
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'shops', shopId, 'customers', c.id), updated);
          fixCount++;
        }
      }
      alert(`🎉 校正完成！共成功修正了 ${fixCount} 位顧客的重複與未付款資料。`);
    } catch (err: any) {
      console.error(err);
      alert(`❌ 校正失敗：${err.message || err}`);
    } finally {
      setFixing(false);
    }
  };


  const handleMigrate = async () => {
    if (!window.confirm('確定要執行自動轉移嗎？這會讀取所有日報表的歷史訂單，為「有填寫電話或姓名」的訂購人自動建立或更新顧客資料。')) return;
    setMigrating(true);
    try {
      const dailySnap = await getDocs(collection(db, 'shops', shopId, 'daily'));
      const allCustomers = [...customers];
      
      let addedCount = 0;
      let updatedCount = 0;
      const updates = new Map<string, Customer>();

      for (const dSnap of dailySnap.docs) {
        const data = dSnap.data();
        const dateKey = data.date || dSnap.id;
        const orders = data.orders || [];

        for (const o of orders) {
          if (!o.buyer && !o.phone) continue;
          
          const { name, gender } = parseNameAndGender(o.buyer || '未知');
          const phone = o.phone || '';
          const email = o.email || '';
          
          const np = normalizePhone(phone);
          let matched = null;
          if (np) matched = allCustomers.find(c => normalizePhone(c.phone) === np);
          if (!matched && name && name !== '未知') {
             matched = allCustomers.find(c => c.name === name);
          }

          const purchase: CustomerPurchase = {
            orderId: o.id || uid(),
            date: dateKey,
            prodAmt: o.prodAmt || 0,
            actualAmt: o.actualAmt || 0,
            items: o.items || {},
            status: o.status || '匯款'
          };

          if (matched) {
             const hasOrder = matched.purchases.some(p => p.orderId === purchase.orderId);
             if (!hasOrder) {
               matched.purchases.push(purchase);
               matched.totalPurchaseCount = matched.purchases.length;
               matched.totalPurchaseAmt = matched.purchases.reduce((s,p) => s + p.actualAmt, 0);
               if (gender !== '不選擇' && matched.gender === '不選擇') matched.gender = gender;
               if (!matched.phone && phone) matched.phone = phone;
               if (!matched.email && email) matched.email = email;
               
               updates.set(matched.id, matched);
               // Also update the in-memory array so subsequent orders find the updated version
               const idx = allCustomers.findIndex(c => c.id === matched!.id);
               if (idx !== -1) allCustomers[idx] = matched;
             }
          } else {
             const newId = uid();
             const newC: Customer = {
               id: newId, name, phone, email, gender, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
               purchases: [purchase], totalPurchaseCount: 1, totalPurchaseAmt: purchase.actualAmt, note: ''
             };
             allCustomers.push(newC);
             updates.set(newId, newC);
             addedCount++;
          }
        }
      }
      
      const promises = Array.from(updates.values()).map(c => setDoc(doc(db, 'shops', shopId, 'customers', c.id), c));
      for (let i = 0; i < promises.length; i += 50) {
        await Promise.all(promises.slice(i, i + 50));
      }

      alert(`轉移完成！共新增 ${addedCount} 筆新顧客，並更新 ${updates.size - addedCount} 筆顧客購買紀錄。`);
    } catch (err: any) {
      console.error(err);
      alert('轉移失敗：' + err.message);
    } finally {
      setMigrating(false);
    }
  };

  // load customers realtime
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, 'shops', shopId, 'customers'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCustomers(snap.docs.map(d => d.data() as Customer));
      setLoading(false);
    });
    return unsub;
  }, [shopId]);

  // search filter
  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, searchQ]);

  const creditFiltered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const base = customers.filter(c => Number(c.creditBalance || 0) > 0 || Number(c.unpaidBalance || 0) > 0);
    if (!q) return base;
    return base.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [customers, searchQ]);

  const totalCreditPool = useMemo(() => {
    return customers.reduce((sum, c) => sum + Number(c.creditBalance || 0), 0);
  }, [customers]);

  const totalUnpaidPool = useMemo(() => {
    return customers.reduce((sum, c) => sum + Number(c.unpaidBalance || 0), 0);
  }, [customers]);

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'shops', shopId, 'customers', id));
    setDeleteConfirmId(null);
  };

  const allItems = useMemo(() => [
    ...(settings.giftItems || []),
    ...(settings.singleItems || []),
    ...(settings.customCategories || []).flatMap(c => c.items || []),
  ], [settings]);

  const getItemName = (id: string) => allItems.find(i => i.id === id)?.name || id;

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-coffee-300 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
          <Users className="w-6 h-6 text-rose-brand" /> 顧客資料管理
          <span className="text-sm font-normal text-coffee-400 ml-2">共 {customers.length} 位顧客</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋姓名、電話、Email…"
              className="pl-9 pr-4 py-2 bg-white border border-coffee-100 rounded-xl text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand w-48 sm:w-56"
            />
          </div>
          <button
            onClick={handleFixData}
            disabled={fixing}
            className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-100 transition shadow-sm disabled:opacity-50"
          >
            {fixing ? <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> : <Wrench className="w-4 h-4" />}
            <span className="hidden sm:inline">{fixing ? '校正中...' : '一鍵校正資料'}</span>
          </button>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="bg-white border border-coffee-200 text-coffee-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-50 transition shadow-sm disabled:opacity-50"
          >
            {migrating ? <span className="w-4 h-4 border-2 border-coffee-600 border-t-transparent rounded-full animate-spin" /> : <Database className="w-4 h-4" />}
            <span className="hidden sm:inline">{migrating ? '轉移中...' : '匯入歷史紀錄'}</span>
          </button>
          <button
            onClick={() => {
              if (mergeMode) {
                setMergeMode(false);
                setSelectedIds([]);
              } else {
                setMergeMode(true);
              }
            }}
            className={cn(
              "px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-sm border",
              mergeMode 
                ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100" 
                : "bg-white border-coffee-200 text-coffee-600 hover:bg-coffee-50"
            )}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{mergeMode ? '取消合併' : '合併顧客'}</span>
          </button>
          <button
            onClick={() => setAddModal(true)}
            className="bg-coffee-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-800 transition shadow-md"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">新增顧客</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-coffee-100 pb-2">
        <button
          onClick={() => setSubTab('list')}
          className={cn("px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2", subTab === 'list' ? "bg-coffee-800 text-white shadow-sm" : "bg-white text-coffee-600 hover:bg-coffee-50 border border-coffee-100")}
        >
          👥 顧客總覽清單
        </button>
        <button
          onClick={() => setSubTab('credit')}
          className={cn("px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2", subTab === 'credit' ? "bg-coffee-800 text-white shadow-sm" : "bg-white text-coffee-600 hover:bg-coffee-50 border border-coffee-100")}
        >
          💳 儲值金與未付帳款管理
        </button>
      </div>

      {/* Main View Area */}
      <div className="space-y-4">
        {mergeMode && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <span className="text-sm font-bold text-rose-800">
              已選擇 {selectedIds.length} 位顧客，請選擇一個主要帳號進行合併。
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setMergeConfirmModal(true)}
                disabled={selectedIds.length < 2}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm disabled:opacity-50 transition"
              >
                執行合併
              </button>
              <button
                onClick={() => {
                  setMergeMode(false);
                  setSelectedIds([]);
                }}
                className="bg-white border border-rose-200 text-rose-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-rose-50 transition"
              >
                取消
              </button>
            </div>
          </div>
        )}
        {subTab === 'credit' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <CreditCard className="w-4 h-4" /> 總流通儲值金餘額
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-800">${fmt(totalCreditPool)}</div>
                <p className="text-[10px] text-emerald-600 mt-1">顧客預付且尚未消費的總額度 (預收負債)</p>
              </div>
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-md">
                💳
              </div>
            </div>

            <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <DollarSign className="w-4 h-4" /> 累計應收未付帳款
                </div>
                <div className="text-2xl font-bold font-mono text-rose-800">${fmt(totalUnpaidPool)}</div>
                <p className="text-[10px] text-rose-600 mt-1">顧客先取貨後付款待結清的總金額</p>
              </div>
              <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-md">
                ⚠️
              </div>
            </div>
          </div>
        )}

        {(subTab === 'credit' ? creditFiltered : filtered).length === 0 && (
          <div className="glass-panel p-12 text-center text-coffee-300 font-bold">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {searchQ ? '查無符合顧客' : subTab === 'credit' ? '目前尚無儲值餘額或未付帳款的顧客紀錄' : '尚未建立任何顧客資料'}
          </div>
        )}
        {(subTab === 'credit' ? creditFiltered : filtered).slice(0, displayCount).map(c => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="glass-panel overflow-hidden shadow-sm hover:-translate-y-0.5 transition-transform duration-200">
              {/* Summary row */}
              <div className="flex items-center gap-4 px-6 py-4">
                {mergeMode ? (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => {
                      if (selectedIds.includes(c.id)) {
                        setSelectedIds(selectedIds.filter(id => id !== c.id));
                      } else {
                        setSelectedIds([...selectedIds, c.id]);
                      }
                    }}
                    className="w-5 h-5 text-rose-600 border-gray-300 rounded focus:ring-rose-500 cursor-pointer flex-shrink-0 accent-rose-500"
                  />
                ) : (
                  /* Avatar */
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-brand/20 to-coffee-200 flex items-center justify-center font-bold text-coffee-700 text-sm flex-shrink-0">
                    {c.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-coffee-800 flex items-center gap-2">
                      {c.name} {c.gender && c.gender !== '不選擇' ? c.gender : ''}
                      {c.tags?.includes('奧客') && <AlertTriangle className="w-4 h-4 text-danger-brand" />}
                    </span>
                    {c.totalPurchaseCount >= 3 && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" /> 回購顧客
                      </span>
                    )}
                    {c.tags?.filter(t => t !== '奧客').map(t => (
                      <span key={t} className="text-[10px] font-bold bg-coffee-100 text-coffee-600 px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-coffee-400 font-bold">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.lineId && <span className="flex items-center gap-1 text-[#06C755]"><MessageCircle className="w-3 h-3" />{c.lineId}</span>}
                    {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6 text-center">
                  {Number(c.creditBalance || 0) > 0 && (
                    <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                      <div className="text-sm font-bold font-mono text-emerald-700">${fmt(c.creditBalance || 0)}</div>
                      <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-0.5 justify-center">
                        <CreditCard className="w-2.5 h-2.5" /> 儲值金
                      </div>
                    </div>
                  )}
                  {Number(c.unpaidBalance || 0) > 0 && (
                    <div className="bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">
                      <div className="text-sm font-bold font-mono text-rose-600">${fmt(c.unpaidBalance || 0)}</div>
                      <div className="text-[9px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-0.5 justify-center">
                        <DollarSign className="w-2.5 h-2.5" /> 未付帳款
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-base font-bold font-mono text-coffee-800">{c.totalPurchaseCount}</div>
                    <div className="text-[9px] text-coffee-400 font-bold uppercase tracking-wider">次數</div>
                  </div>
                  <div>
                    <div className="text-base font-bold font-mono text-rose-brand">${fmt(c.totalPurchaseAmt)}</div>
                    <div className="text-[9px] text-coffee-400 font-bold uppercase tracking-wider">累計</div>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCreditAdjustModal(c)} className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition font-bold text-xs flex items-center gap-1 border border-emerald-200/60 shadow-sm" title="加值與餘額調整">
                    <CreditCard className="w-3.5 h-3.5" /> <span className="hidden lg:inline">加值/扣款</span>
                  </button>
                  <button onClick={() => setEditModal(c)} className="p-2 text-coffee-300 hover:text-coffee-600 hover:bg-coffee-50 rounded-lg transition" title="編輯顧客">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteConfirmId(c.id)} className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-lg transition" title="刪除顧客">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setExpandedId(isExpanded ? null : c.id)} className="p-2 text-coffee-300 hover:text-coffee-600 hover:bg-coffee-50 rounded-lg transition">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded purchases & credit logs */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-coffee-50 px-6 py-4 bg-coffee-50/30 space-y-4">
                      {c.note && (
                        <div className="flex items-start gap-2 text-sm text-coffee-500 bg-white rounded-xl px-4 py-3 border border-coffee-100">
                          <StickyNote className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span>{c.note}</span>
                        </div>
                      )}

                      {/* 儲值金與應收帳款異動明細 */}
                      {c.creditLogs && c.creditLogs.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1 mb-2">
                            <History className="w-3.5 h-3.5" /> 儲值金與異動明細紀錄（{c.creditLogs.length} 筆）
                          </h4>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 font-mono text-xs">
                            {[...c.creditLogs].sort((a,b) => b.timestamp.localeCompare(a.timestamp)).map((l, idx) => (
                              <div key={idx} className="bg-white rounded-xl p-2.5 border border-emerald-100/60 flex justify-between items-center gap-2 shadow-2xs">
                                <div>
                                  <span className="text-coffee-400 font-sans text-[10px]">{new Date(l.timestamp).toLocaleString()}</span>
                                  <span className="ml-2 font-bold text-coffee-800">
                                    {l.type === 'topup' && '➕ 現場加值'}
                                    {l.type === 'consume' && '➖ 消費扣款'}
                                    {l.type === 'refund' && '↩️ 儲值退款'}
                                    {l.type === 'manual_adjust' && '✏️ 人工校正'}
                                  </span>
                                  {l.note && <span className="ml-2 text-coffee-500 font-sans text-xs">({l.note})</span>}
                                </div>
                                <div className="text-right">
                                  <span className={cn("font-bold text-sm", l.amount >= 0 ? "text-emerald-600" : "text-rose-500")}>
                                    {l.amount >= 0 ? `+${l.amount}` : l.amount}
                                  </span>
                                  <span className="text-coffee-400 text-[10px] ml-2 font-bold block sm:inline">餘額 ${l.balanceAfter}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-bold text-coffee-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                          <ShoppingBag className="w-3.5 h-3.5" /> 購買紀錄（{c.purchases.length} 筆）
                        </h4>
                        {c.purchases.length === 0 && (
                          <p className="text-sm text-coffee-300 italic">尚無購買紀錄</p>
                        )}
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {[...c.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => {
                            const isDeleted = p.status === '已取消' || p.status === '已刪除';
                            return (
                              <div key={i} className={cn("bg-white rounded-xl px-4 py-3 border border-coffee-100 flex justify-between items-start gap-4", isDeleted && "bg-gray-50/80 text-gray-400 opacity-60 border-gray-200")}>
                                <div className="min-w-0">
                                  <div className={cn("text-xs font-bold text-coffee-400 font-mono", isDeleted && "line-through text-gray-400")}>{p.date}</div>
                                  <div className={cn("text-sm text-coffee-600 font-bold mt-0.5", isDeleted && "line-through text-gray-400")}>
                                    {Object.entries(p.items || {}).filter(([, q]) => Number(q) > 0).map(([id, q]) => `${getItemName(id)} ×${q}`).join('、') || '—'}
                                  </div>
                                  <div className="mt-1">
                                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                                      p.status === '匯款' && 'bg-blue-50 text-blue-600',
                                      p.status === '現結' && 'bg-green-50 text-green-600',
                                      p.status === '未結帳款' && 'bg-red-50 text-red-500',
                                      p.status === '公關品' && 'bg-purple-50 text-purple-600',
                                      p.status === '儲值金扣款' && 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
                                      isDeleted && 'bg-gray-200 text-gray-500 border border-gray-300'
                                    )}>{p.status}</span>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className={cn("font-bold font-mono text-rose-brand", isDeleted ? "text-gray-400 line-through" : "")}>${fmt(p.actualAmt)}</div>
                                  {isDeleted && <span className="text-[10px] block text-gray-400 font-bold mt-0.5">(已作廢)</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {(subTab === 'credit' ? creditFiltered : filtered).length > displayCount && (
        <div className="flex justify-center pt-6 pb-4">
          <button
            onClick={() => setDisplayCount(prev => prev + 50)}
            className="bg-coffee-800 border-2 border-coffee-800 text-white hover:bg-coffee-900 px-6 py-3 rounded-full font-bold transition shadow-md active:scale-95 text-sm flex items-center gap-2"
          >
            <span>✨</span> 顯示更多顧客 (已顯示 {displayCount} / 共 {(subTab === 'credit' ? creditFiltered : filtered).length} 筆)
          </button>
        </div>
      )}


      {/* Add / Edit Modal */}
      <AnimatePresence>
        {(addModal || editModal) && (
          <CustomerFormModal
            shopId={shopId}
            initial={editModal || undefined}
            onClose={() => { setAddModal(false); setEditModal(null); }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirmId(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
              <Trash2 className="w-10 h-10 text-danger-brand mx-auto mb-4" />
              <h3 className="font-bold text-coffee-800 text-lg mb-2">確定刪除此顧客資料？</h3>
              <p className="text-coffee-500 text-sm mb-6">此操作無法復原，相關購買紀錄也將一併刪除</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 border border-coffee-100 rounded-2xl font-bold text-coffee-600 hover:bg-coffee-50 transition">取消</button>
                <button onClick={() => handleDelete(deleteConfirmId!)} className="flex-1 py-3 bg-danger-brand text-white rounded-2xl font-bold hover:bg-danger-brand/90 transition">確認刪除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 儲值金與帳款調整 Modal */}
      <AnimatePresence>
        {creditAdjustModal && (
          <CreditAdjustModal
            shopId={shopId}
            customer={creditAdjustModal}
            onClose={() => setCreditAdjustModal(null)}
          />
        )}
      </AnimatePresence>

      {/* 合併顧客 Modal */}
      <AnimatePresence>
        {mergeConfirmModal && (
          <MergeConfirmModal
            shopId={shopId}
            selectedCustomers={customers.filter(c => selectedIds.includes(c.id))}
            onClose={() => setMergeConfirmModal(false)}
            onFinish={() => {
              setMergeConfirmModal(false);
              setMergeMode(false);
              setSelectedIds([]);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Credit Adjust Modal ───────────────────────────────────────────────────────
function CreditAdjustModal({ shopId, customer, onClose }: {
  shopId: string;
  customer: Customer;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'topup' | 'consume' | 'repay_unpaid' | 'manual_adjust'>('topup');
  const [repayMethod, setRepayMethod] = useState<'現金' | '匯款'>('現金');
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = parseNum(amountStr);
    if (amt <= 0 && mode !== 'manual_adjust') {
      alert('請輸入大於零的有效金額');
      return;
    }

    setSaving(true);
    try {
      let newCredit = Number(customer.creditBalance || 0);
      let newUnpaid = Number(customer.unpaidBalance || 0);
      let logAmt = amt;
      let logType: 'topup' | 'consume' | 'refund' | 'manual_adjust' = 'topup';
      const updatedPurchases = [...(customer.purchases || [])];

      if (mode === 'topup') {
        newCredit += amt;
        logType = 'topup';
      } else if (mode === 'consume') {
        if (amt > newCredit) {
          if (!confirm(`注意：扣款金額 ($${amt}) 大於當前儲值金餘額 ($${newCredit})，確定要透支扣除嗎？`)) {
            setSaving(false);
            return;
          }
        }
        newCredit = Math.max(0, newCredit - amt);
        logType = 'consume';
        logAmt = -amt;
      } else if (mode === 'repay_unpaid') {
        newUnpaid = Math.max(0, newUnpaid - amt);
        logType = 'manual_adjust';
        logAmt = -amt;

        // Distribute payment to matching orders in Firestore daily reports
        let remainingPayment = amt;
        const unpaidPurchases = updatedPurchases
          .filter(p => p.status === '未結帳款')
          .sort((a, b) => a.date.localeCompare(b.date));

        for (const p of unpaidPurchases) {
          if (remainingPayment <= 0) break;

          let dailyRef = doc(db, 'shops', shopId, 'daily', p.date);
          let dailySnap = await getDoc(dailyRef);
          if (!dailySnap.exists()) {
            // Try legacy path
            const legacy = p.date.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, (_, y, m, d) => `${y}-${Number(m)}-${Number(d)}`);
            dailyRef = doc(db, 'shops', shopId, 'daily', legacy);
            dailySnap = await getDoc(dailyRef);
          }

          if (dailySnap.exists()) {
            const dailyData = dailySnap.data();
            const orders = dailyData.orders || [];
            const orderIdx = orders.findIndex((o: any) => o.id === p.orderId);

            if (orderIdx !== -1) {
              const order = orders[orderIdx];
              const collected = Number(order.arCollectedCash || 0) + Number(order.arCollectedRemit || 0);
              const remainingUnpaid = Math.max(0, Number(order.actualAmt || 0) - collected);

              if (remainingUnpaid > 0) {
                const allocated = Math.min(remainingPayment, remainingUnpaid);
                if (repayMethod === '現金') {
                  order.arCollectedCash = Number(order.arCollectedCash || 0) + allocated;
                } else {
                  order.arCollectedRemit = Number(order.arCollectedRemit || 0) + allocated;
                }

                if (Number(order.arCollectedCash || 0) + Number(order.arCollectedRemit || 0) >= Number(order.actualAmt || 0)) {
                  order.status = '已收帳款';
                  const pIdx = updatedPurchases.findIndex(x => x.orderId === p.orderId);
                  if (pIdx !== -1) updatedPurchases[pIdx].status = '已收帳款';
                }

                await setDoc(dailyRef, { ...dailyData, orders }, { merge: true });
                remainingPayment -= allocated;
              } else {
                const pIdx = updatedPurchases.findIndex(x => x.orderId === p.orderId);
                if (pIdx !== -1) updatedPurchases[pIdx].status = '已收帳款';
              }
            }
          }
        }
      } else if (mode === 'manual_adjust') {
        const diff = amt - newCredit;
        newCredit = amt;
        logType = 'manual_adjust';
        logAmt = diff;
      }

      const newLog = {
        id: uid(),
        timestamp: new Date().toISOString(),
        type: logType,
        amount: logAmt,
        balanceAfter: mode === 'repay_unpaid' ? newUnpaid : newCredit,
        note: note.trim() || (mode === 'repay_unpaid' ? `收回先取貨未結帳款 (${repayMethod})` : mode === 'manual_adjust' ? '人工校正餘額' : '')
      };

      const updated: Customer = {
        ...customer,
        creditBalance: newCredit,
        unpaidBalance: newUnpaid,
        purchases: updatedPurchases,
        creditLogs: [...(customer.creditLogs || []), newLog],
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'shops', shopId, 'customers', customer.id), updated);
      alert('儲值金與帳款狀態已順利更新！');
      onClose();
    } catch (e: any) {
      alert('操作失敗: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-emerald-100">
        <div className="flex justify-between items-center px-8 pt-7 pb-5 bg-emerald-50/50 border-b border-emerald-100">
          <div>
            <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" /> 顧客儲值金與帳款作業
            </h3>
            <p className="text-xs text-emerald-700 font-bold mt-0.5">{customer.name} {customer.phone ? `(${customer.phone})` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-emerald-100 rounded-full text-emerald-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-8 space-y-5">
          {/* 當前額度狀態 */}
          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-center">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">儲值餘額</div>
              <div className="text-lg font-bold font-mono text-emerald-700">${fmt(customer.creditBalance || 0)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">未付帳款</div>
              <div className="text-lg font-bold font-mono text-rose-600">${fmt(customer.unpaidBalance || 0)}</div>
            </div>
          </div>

          {/* 作業模式選擇 */}
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-2 block">請選擇交易調整項目</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'topup', label: '➕ 現場加值儲值' },
                { id: 'consume', label: '➖ 直接扣除餘額' },
                { id: 'repay_unpaid', label: '💰 收取未付帳款' },
                { id: 'manual_adjust', label: '✏️ 直接校正餘額' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id as any)}
                  className={cn("py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all", mode === item.id ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 收款管道 (僅在收取未付帳款時顯示) */}
          {mode === 'repay_unpaid' && (
            <div>
              <label className="text-xs font-bold text-coffee-400 mb-2 block">收款方式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRepayMethod('現金')}
                  className={cn("py-2.5 px-3 rounded-xl text-xs font-bold border text-center transition-all", repayMethod === '現金' ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                >
                  💵 現金收回
                </button>
                <button
                  type="button"
                  onClick={() => setRepayMethod('匯款')}
                  className={cn("py-2.5 px-3 rounded-xl text-xs font-bold border text-center transition-all", repayMethod === '匯款' ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                >
                  🏦 匯款收回
                </button>
              </div>
            </div>
          )}

          {/* 輸入金額 */}
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">
              {mode === 'manual_adjust' ? '設定為目標絕對餘額 ($)' : '輸入交易金額 ($) *'}
            </label>
            <input
              type="number"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="如: 1000"
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base font-bold font-mono text-coffee-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* 備註說明 */}
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">作業備註或原因</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={mode === 'topup' ? '如: 門市現金儲值享95折優惠' : '選填'}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-bold text-coffee-700 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="px-8 pb-8 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> {saving ? '處理中...' : '確認執行作業'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}


// ── Customer Form Modal ───────────────────────────────────────────────────────
function CustomerFormModal({ shopId, initial, onClose }: {
  shopId: string;
  initial?: Customer;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    gender: initial?.gender || '不選擇',
    lineId: initial?.lineId || '',
    birthday: initial?.birthday || '',
    tags: initial?.tags || [],
    note: initial?.note || '',
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleTag = (t: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.includes(t) ? prev.tags.filter(x => x !== t) : [...prev.tags, t] }));
  };
  const addCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!form.tags.includes(tagInput.trim())) {
        setForm(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      }
      setTagInput('');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('請輸入顧客姓名');
    setSaving(true);
    try {
      if (isEdit && initial) {
        const updated: Customer = {
          ...initial,
          ...form,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'shops', shopId, 'customers', initial.id), updated);
      } else {
        const newId = uid();
        const newCustomer: Customer = {
          id: newId, ...form, createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(), purchases: [],
          totalPurchaseCount: 0, totalPurchaseAmt: 0,
        };
        await setDoc(doc(db, 'shops', shopId, 'customers', newId), newCustomer);
      }
      onClose();
    } catch (e: any) {
      alert('儲存失敗: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-coffee-50">
          <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-brand" /> {isEdit ? '編輯顧客資料' : '新增顧客'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
        </div>
        <div className="p-8 space-y-5">
          {[
            { label: '姓名 *', key: 'name', placeholder: '顧客姓名', icon: Users, type: 'text' },
            { label: '電話', key: 'phone', placeholder: '09xx-xxx-xxx', icon: Phone, type: 'tel' },
            { label: 'LINE ID', key: 'lineId', placeholder: '@yourline', icon: MessageCircle, type: 'text' },
            { label: '電子郵件', key: 'email', placeholder: 'example@email.com', icon: Mail, type: 'email' },
            { label: '生日', key: 'birthday', placeholder: '', icon: Cake, type: 'date' },
          ].map(({ label, key, placeholder, icon: Icon, type }) => (
            <div key={key}>
              <label className="text-xs font-bold text-coffee-400 mb-1 block">{label}</label>
              <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-coffee-50 border border-coffee-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
                />
              </div>
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">性別</label>
            <div className="grid grid-cols-3 gap-2">
              {(['先生', '小姐', '不選擇'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setForm({ ...form, gender: g })}
                  className={cn("py-2.5 rounded-xl text-sm font-bold border transition-all", form.gender === g ? "bg-rose-brand border-rose-brand text-white" : "bg-white border-coffee-100 text-coffee-500 hover:border-coffee-300")}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">顧客標籤</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map(t => (
                <span key={t} className="bg-coffee-100 text-coffee-700 text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  {t} <button onClick={() => toggleTag(t)} className="text-coffee-400 hover:text-danger-brand"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={addCustomTag}
                placeholder="輸入自訂標籤後按 Enter"
                className="w-full bg-coffee-50 border border-coffee-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {(['VIP', '常客', '公司行號', '奧客']).map(preset => (
                <button
                  key={preset}
                  onClick={() => toggleTag(preset)}
                  className={cn("text-[10px] font-bold px-2 py-1 rounded-full border transition-colors", 
                    form.tags.includes(preset) ? "bg-coffee-700 text-white border-coffee-700" : "bg-white text-coffee-500 border-coffee-200 hover:border-coffee-400"
                  )}
                >
                  {preset === '奧客' ? <AlertTriangle className="w-3 h-3 inline mr-1 text-danger-brand" /> : '+'}{preset}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">備注</label>
            <div className="relative">
              <StickyNote className="absolute left-3 top-3 w-4 h-4 text-coffee-300" />
              <textarea
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="特殊備注（過敏、喜好等）"
                rows={2}
                className="w-full bg-coffee-50 border border-coffee-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand resize-none"
              />
            </div>
          </div>
        </div>
        <div className="px-8 pb-8 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold shadow-xl hover:bg-coffee-900 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Check className="w-5 h-5" /> {saving ? '儲存中...' : isEdit ? '更新資料' : '建立顧客'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Merge Conflict Modal (exported for use in DailyView) ─────────────────────
export function MergeConflictModal({ candidates, onDecide }: {
  candidates: Customer[];
  onDecide: (action: 'merge' | 'new', targetId?: string) => void;
}) {
  const [selected, setSelected] = useState<string>(candidates[0]?.id || '');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/70 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-8 pt-7 pb-5 border-b border-coffee-50">
          <h3 className="text-lg font-bold text-coffee-800">發現疑似重複顧客</h3>
          <p className="text-sm text-coffee-500 mt-1">以下顧客資料與此訂單的姓名、電話或信箱相符，請選擇操作方式：</p>
        </div>
        <div className="p-8 space-y-4 max-h-72 overflow-y-auto">
          {candidates.map(c => (
            <label key={c.id} className={cn("flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all",
              selected === c.id ? 'border-rose-brand bg-rose-brand/5' : 'border-coffee-100 hover:border-coffee-200'
            )}>
              <input type="radio" name="merge_target" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} className="accent-rose-300" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-coffee-800">{c.name} {c.gender && c.gender !== '不選擇' ? c.gender : ''}</div>
                <div className="text-xs text-coffee-400 font-mono mt-0.5">{c.phone} {c.email && `· ${c.email}`}</div>
                <div className="text-xs text-coffee-400 mt-0.5">已購 {c.totalPurchaseCount} 次 · ${fmt(c.totalPurchaseAmt)}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="px-8 pb-8 flex gap-3">
          <button onClick={() => onDecide('new')} className="flex-1 py-3 border-2 border-coffee-200 rounded-2xl font-bold text-coffee-600 hover:bg-coffee-50 transition">建立新顧客</button>
          <button onClick={() => onDecide('merge', selected)} className="flex-1 py-3 bg-coffee-800 text-white rounded-2xl font-bold hover:bg-coffee-900 transition">合併到此顧客</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Merge Confirm Modal ───────────────────────────────────────────────────────
function MergeConfirmModal({ shopId, selectedCustomers, onClose, onFinish }: {
  shopId: string;
  selectedCustomers: Customer[];
  onClose: () => void;
  onFinish: () => void;
}) {
  const [primaryId, setPrimaryId] = useState<string>(selectedCustomers[0]?.id || '');
  const [merging, setMerging] = useState(false);

  const handleMerge = async () => {
    if (!primaryId) return;
    const primary = selectedCustomers.find(c => c.id === primaryId);
    if (!primary) return;

    if (!confirm(`確定要將選取的 ${selectedCustomers.length - 1} 位顧客合併到「${primary.name}」嗎？此作業無法復原！`)) return;

    setMerging(true);
    try {
      const secondaries = selectedCustomers.filter(c => c.id !== primaryId);
      const secondaryIds = secondaries.map(c => c.id);
      
      // Collect all order IDs from secondary customers
      const secondaryOrderIds = secondaries.flatMap(c => (c.purchases || []).map(p => p.orderId)).filter(Boolean) as string[];

      // Merge fields
      let mergedCredit = Number(primary.creditBalance || 0);
      let mergedUnpaid = Number(primary.unpaidBalance || 0);
      let mergedPurchases = [...(primary.purchases || [])];
      let mergedCreditLogs = [...(primary.creditLogs || [])];
      let mergedTags = [...(primary.tags || [])];
      let mergedNotes = primary.note ? [primary.note] : [];

      secondaries.forEach(c => {
        mergedCredit += Number(c.creditBalance || 0);
        mergedUnpaid += Number(c.unpaidBalance || 0);
        
        // Append purchases, avoiding duplicate orderIds
        (c.purchases || []).forEach(p => {
          if (!mergedPurchases.some(mp => mp.orderId === p.orderId)) {
            mergedPurchases.push(p);
          }
        });

        // Append creditLogs
        (c.creditLogs || []).forEach(cl => {
          mergedCreditLogs.push(cl);
        });

        // Append tags
        (c.tags || []).forEach(t => {
          if (!mergedTags.includes(t)) {
            mergedTags.push(t);
          }
        });

        // Concat notes
        if (c.note) mergedNotes.push(c.note);
      });

      // Sort credit logs by timestamp
      mergedCreditLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Re-calculate totals
      const validPurchases = mergedPurchases.filter(p => p.status !== '已取消' && p.status !== '已刪除');
      const totalPurchaseCount = validPurchases.length;
      const totalPurchaseAmt = validPurchases.reduce((s, p) => s + Number(p.actualAmt || 0), 0);

      // Find first non-empty phone, email, lineId, birthday, gender from secondaries if primary lacks them
      let phone = primary.phone;
      if (!phone) {
        const found = secondaries.find(c => c.phone);
        if (found) phone = found.phone;
      }

      let email = primary.email;
      if (!email) {
        const found = secondaries.find(c => c.email);
        if (found) email = found.email;
      }

      let lineId = primary.lineId;
      if (!lineId) {
        const found = secondaries.find(c => c.lineId);
        if (found) lineId = found.lineId;
      }

      let birthday = primary.birthday;
      if (!birthday) {
        const found = secondaries.find(c => c.birthday);
        if (found) birthday = found.birthday;
      }

      let gender = primary.gender;
      if (!gender || gender === '不選擇') {
        const found = secondaries.find(c => c.gender && c.gender !== '不選擇');
        if (found) gender = found.gender;
      }

      // Update primary Customer document
      const updatedPrimary: Customer = {
        ...primary,
        phone: phone || '',
        email: email || '',
        lineId: lineId || '',
        birthday: birthday || '',
        gender: gender || '不選擇',
        creditBalance: mergedCredit,
        unpaidBalance: mergedUnpaid,
        purchases: mergedPurchases,
        creditLogs: mergedCreditLogs,
        tags: mergedTags,
        note: mergedNotes.join(' \n'),
        totalPurchaseCount,
        totalPurchaseAmt,
        updatedAt: new Date().toISOString()
      };

      // 1. Write updated primary
      await setDoc(doc(db, 'shops', shopId, 'customers', primary.id), updatedPrimary);

      // 2. Delete secondaries
      for (const sId of secondaryIds) {
        await deleteDoc(doc(db, 'shops', shopId, 'customers', sId));
      }

      // 3. Re-link orders in Firestore daily reports
      const dailySnap = await getDocs(collection(db, 'shops', shopId, 'daily'));
      const updatePromises = dailySnap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let orders = data.orders || [];
        let hasChanges = false;
        
        orders = orders.map((o: any) => {
          const isMatch = (o.customerId && secondaryIds.includes(o.customerId)) || (o.id && secondaryOrderIds.includes(o.id));
          if (o && isMatch) {
            hasChanges = true;
            return {
              ...o,
              customerId: primary.id,
              buyer: primary.name,
              phone: primary.phone || o.phone
            };
          }
          return o;
        });

        if (hasChanges) {
          await setDoc(doc(db, 'shops', shopId, 'daily', docSnap.id), { ...data, orders }, { merge: true });
        }
      });

      await Promise.all(updatePromises);

      alert(`🎉 合併成功！已將 ${selectedCustomers.length} 位顧客資料與其歷史訂單，成功歸併至「${primary.name}」名下。`);
      onFinish();
    } catch (e: any) {
      console.error(e);
      alert('合併失敗：' + e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-rose-100">
        <div className="flex justify-between items-center px-8 pt-7 pb-5 bg-rose-50/50 border-b border-rose-100">
          <div>
            <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-rose-600" /> 合併顧客資料
            </h3>
            <p className="text-xs text-rose-700 font-bold mt-0.5">請選取一位作為「主存顧客」主體</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-rose-100 rounded-full text-rose-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-8 space-y-5">
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 p-3 rounded-xl font-bold flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            合併後，其他被合併顧客的儲值金、未付款及所有訂單歷史，將自動轉移至主存顧客，其餘顧客帳號將永久刪除且無法復原！
          </p>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {selectedCustomers.map(c => (
              <label key={c.id} className={cn(
                "flex items-center gap-3 p-3.5 border rounded-2xl cursor-pointer transition-all hover:bg-coffee-50/50",
                primaryId === c.id ? "bg-rose-50/30 border-rose-300" : "bg-white border-gray-200"
              )}>
                <input
                  type="radio"
                  name="primary_customer"
                  value={c.id}
                  checked={primaryId === c.id}
                  onChange={() => setPrimaryId(c.id)}
                  className="accent-rose-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-coffee-800 flex items-center gap-1.5 justify-between">
                    <span>{c.name}</span>
                    <span className="text-xs text-coffee-400 font-normal">購買 {c.purchases?.length || 0} 次</span>
                  </div>
                  <div className="text-[10px] text-coffee-400 font-bold mt-0.5 flex items-center gap-3">
                    {c.phone && <span>📞 {c.phone}</span>}
                    {Number(c.creditBalance || 0) > 0 && <span className="text-emerald-600 font-mono">💳 ${c.creditBalance}</span>}
                    {Number(c.unpaidBalance || 0) > 0 && <span className="text-rose-600 font-mono">⚠️ ${c.unpaidBalance}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="px-8 pb-8 pt-2 flex gap-3">
          <button onClick={onClose} disabled={merging} className="flex-1 py-3 border border-coffee-100 rounded-2xl font-bold text-coffee-600 hover:bg-coffee-50 transition">取消</button>
          <button
            onClick={handleMerge}
            disabled={merging || !primaryId}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {merging ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{merging ? '合併中...' : '確認合併'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
