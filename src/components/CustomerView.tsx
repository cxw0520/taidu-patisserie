import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../lib/firebase';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, query, orderBy, getDoc
} from 'firebase/firestore';
import { uid, fmt, cn } from '../lib/utils';
import { Customer, CustomerPurchase, Settings } from '../types';
import {
  Users, Plus, Search, Trash2, ChevronDown, ChevronRight,
  Phone, Mail, StickyNote, ShoppingBag, X, Edit2, Check, Star, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── helpers ──────────────────────────────────────────────────────────────────
const normalizePhone = (p: string) => p.replace(/\D/g, '');
const normalizeEmail = (e: string) => e.trim().toLowerCase();

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

/** Upsert a customer record from an order, returns the customer id */
export async function upsertCustomerFromOrder(
  shopId: string,
  allCustomers: Customer[],
  orderInfo: { orderId: string; date: string; buyer: string; phone: string; email?: string; prodAmt: number; actualAmt: number; items: Record<string, number>; status: string },
  onConflict: (matches: Customer[], resolve: (action: 'merge' | 'new', targetId?: string) => void) => void
): Promise<void> {
  const { orderId, date, buyer, phone, email, prodAmt, actualAmt, items, status } = orderInfo;
  const purchase: CustomerPurchase = { orderId, date, prodAmt, actualAmt, items, status };

  // check if this order is already linked to a customer
  const alreadyLinked = allCustomers.find(c => c.purchases.some(p => p.orderId === orderId));
  if (alreadyLinked) {
    // update amounts in place
    const updated: Customer = {
      ...alreadyLinked,
      purchases: alreadyLinked.purchases.map(p => p.orderId === orderId ? purchase : p),
      totalPurchaseCount: alreadyLinked.purchases.length,
      totalPurchaseAmt: alreadyLinked.purchases.reduce((s, p) => s + (p.orderId === orderId ? actualAmt : p.actualAmt), 0),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'shops', shopId, 'customers', alreadyLinked.id), updated);
    return;
  }

  const dups = findDuplicates(allCustomers, buyer, phone, email);
  if (dups.length > 0) {
    // ask caller what to do
    await new Promise<void>((resolve) => {
      onConflict(dups, async (action, targetId) => {
        if (action === 'merge' && targetId) {
          const existing = allCustomers.find(c => c.id === targetId)!;
          const newPurchases = [...existing.purchases, purchase];
          const updated: Customer = {
            ...existing,
            name: buyer || existing.name,
            phone: phone || existing.phone,
            email: email || existing.email,
            purchases: newPurchases,
            totalPurchaseCount: newPurchases.length,
            totalPurchaseAmt: newPurchases.reduce((s, p) => s + p.actualAmt, 0),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'shops', shopId, 'customers', existing.id), updated);
        } else {
          // create new
          const newId = uid();
          const newCustomer: Customer = {
            id: newId, name: buyer, phone, email, gender: '不選擇', createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(), purchases: [purchase],
            totalPurchaseCount: 1, totalPurchaseAmt: actualAmt,
          };
          await setDoc(doc(db, 'shops', shopId, 'customers', newId), newCustomer);
        }
        resolve();
      });
    });
  } else {
    const newId = uid();
    const newCustomer: Customer = {
      id: newId, name: buyer, phone, email: email || '', gender: '不選擇', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), purchases: [purchase],
      totalPurchaseCount: 1, totalPurchaseAmt: actualAmt,
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
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋姓名、電話、Email…"
              className="pl-9 pr-4 py-2 bg-white border border-coffee-100 rounded-xl text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand w-56"
            />
          </div>
          <button
            onClick={() => setAddModal(true)}
            className="bg-coffee-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-800 transition shadow-md"
          >
            <Plus className="w-4 h-4" /> 新增顧客
          </button>
        </div>
      </div>

      {/* Customer list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="glass-panel p-12 text-center text-coffee-300 font-bold">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {searchQ ? '查無符合顧客' : '尚未建立任何顧客資料'}
          </div>
        )}
        {filtered.map(c => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="glass-panel overflow-hidden shadow-sm hover:-translate-y-0.5 transition-transform duration-200">
              {/* Summary row */}
              <div className="flex items-center gap-4 px-6 py-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-brand/20 to-coffee-200 flex items-center justify-center font-bold text-coffee-700 text-sm flex-shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-coffee-800">{c.name} {c.gender && c.gender !== '不選擇' ? c.gender : ''}</span>
                    {c.totalPurchaseCount >= 3 && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" /> 回購顧客
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-coffee-400 font-bold">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6 text-center">
                  <div>
                    <div className="text-lg font-bold font-mono text-coffee-800">{c.totalPurchaseCount}</div>
                    <div className="text-[10px] text-coffee-400 font-bold uppercase tracking-wider">購買次數</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono text-rose-brand">${fmt(c.totalPurchaseAmt)}</div>
                    <div className="text-[10px] text-coffee-400 font-bold uppercase tracking-wider">累計金額</div>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditModal(c)} className="p-2 text-coffee-300 hover:text-coffee-600 hover:bg-coffee-50 rounded-lg transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteConfirmId(c.id)} className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setExpandedId(isExpanded ? null : c.id)} className="p-2 text-coffee-300 hover:text-coffee-600 hover:bg-coffee-50 rounded-lg transition">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded purchases */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-coffee-50 px-6 py-4 bg-coffee-50/30 space-y-3">
                      {c.note && (
                        <div className="flex items-start gap-2 text-sm text-coffee-500 bg-white rounded-xl px-4 py-3 border border-coffee-100">
                          <StickyNote className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span>{c.note}</span>
                        </div>
                      )}
                      <h4 className="text-xs font-bold text-coffee-400 uppercase tracking-wider flex items-center gap-2">
                        <ShoppingBag className="w-3.5 h-3.5" /> 購買紀錄（{c.purchases.length} 筆）
                      </h4>
                      {c.purchases.length === 0 && (
                        <p className="text-sm text-coffee-300 italic">尚無購買紀錄</p>
                      )}
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {[...c.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
                          <div key={i} className="bg-white rounded-xl px-4 py-3 border border-coffee-100 flex justify-between items-start gap-4">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-coffee-400 font-mono">{p.date}</div>
                              <div className="text-sm text-coffee-600 font-bold mt-0.5">
                                {Object.entries(p.items || {}).filter(([, q]) => Number(q) > 0).map(([id, q]) => `${getItemName(id)} ×${q}`).join('、') || '—'}
                              </div>
                              <div className="mt-1">
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  p.status === '匯款' && 'bg-blue-50 text-blue-600',
                                  p.status === '現結' && 'bg-green-50 text-green-600',
                                  p.status === '未結帳款' && 'bg-red-50 text-red-500',
                                  p.status === '公關品' && 'bg-purple-50 text-purple-600',
                                )}>{p.status}</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-bold font-mono text-rose-brand">${fmt(p.actualAmt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

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
    note: initial?.note || '',
  });
  const [saving, setSaving] = useState(false);

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
            { label: '電子郵件', key: 'email', placeholder: 'example@email.com', icon: Mail, type: 'email' },
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
