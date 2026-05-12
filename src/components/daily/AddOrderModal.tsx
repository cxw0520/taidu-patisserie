import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, DailyReport, Order, Customer } from '../../types';
import { uid, fmt, cn } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, getDoc, writeBatch, collection, query, onSnapshot } from 'firebase/firestore';
import { Plus, X } from 'lucide-react';
import CustomerAutocomplete from './CustomerAutocomplete';


/* ══════════════════════════════════════════
   AddOrderModal — new order form modal
══════════════════════════════════════════ */
export default function AddOrderModal({ settings, shopId, customers, onClose, onAdd }: {
  settings: Settings;
  shopId: string;
  customers: Customer[];
  onClose: () => void;
  onAdd: (order: Order) => void;
}) {
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [form, setForm] = useState<Order>({
    id: uid(), buyer: '', phone: '', address: '', items: {},
    prodAmt: 0, shipAmt: 0, discAmt: 0, actualAmt: 0, status: '匯款', note: ''
  });
  const [phoneInput, setPhoneInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allItems = useMemo(() => [
    ...(settings.giftItems || []).filter(i => i.active),
    ...(settings.singleItems || []).filter(i => i.active),
    ...(settings.customCategories || []).flatMap(c => (c.items || []).filter(i => i.active)),
  ], [settings]);

  const recalc = (items: Record<string, number>, ship: number, disc: number) => {
    const prod = allItems.reduce((s, i) => s + (items[i.id] || 0) * i.price, 0);
    return { prodAmt: prod, actualAmt: prod + ship - disc };
  };

  const fillFromCustomer = (c: Customer) => {
    setPhoneInput(c.phone);
    setSelectedCust(c);
    setForm(prev => ({ ...prev, buyer: c.name, phone: c.phone, customerId: c.id }));
  };


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-lg bg-white border-0 shadow-2xl rounded-3xl relative z-10 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-coffee-50">
          <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2"><Plus className="w-5 h-5 text-rose-brand" /> 新增訂單</h3>
          <button onClick={onClose} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-coffee-400 mb-1 block">購買人姓名</label>
              <input type="text" value={form.buyer} onChange={e => setForm({ ...form, buyer: e.target.value })} placeholder="姓名" className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand" />
            </div>
            <CustomerAutocomplete
              customers={customers}
              phoneInput={phoneInput}
              setPhoneInput={(v) => {
                setPhoneInput(v);
                setForm(prev => ({ ...prev, phone: v }));
              }}
              onSelectCustomer={fillFromCustomer}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-coffee-400">付款狀態與方式</label>
              {selectedCust && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  顧客儲值金餘額: ${fmt(selectedCust.creditBalance || 0)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(['匯款', '現結', '未結帳款', '儲值金扣款', '公關品'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => {
                    if (s === '儲值金扣款' && selectedCust) {
                      const bal = Number(selectedCust.creditBalance || 0);
                      if (form.actualAmt > bal) {
                        alert(`提醒：當前顧客儲值金餘額 ($${bal}) 小於訂單應收總計 ($${form.actualAmt})`);
                      }
                    }
                    setForm({ ...form, status: s });
                  }}
                  className={cn("py-2 rounded-xl text-[11px] font-bold border transition-all truncate px-1", 
                    form.status === s 
                      ? s === '儲值金扣款' ? "bg-emerald-600 border-emerald-600 text-white shadow-xs" : "bg-rose-brand border-rose-brand text-white shadow-xs" 
                      : "bg-white border-coffee-100 text-coffee-500 hover:border-coffee-300"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-coffee-400 mb-2 block">訂購品項</label>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {allItems.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-coffee-50 rounded-xl px-4 py-2.5">
                  <div>
                    <div className="text-sm font-bold text-coffee-700">{item.name}</div>
                    <div className="text-xs text-coffee-400 font-mono">${fmt(item.price)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const q = Math.max(0, (form.items?.[item.id] || 0) - 1); const items = { ...form.items, [item.id]: q }; setForm({ ...form, items, ...recalc(items, form.shipAmt, form.discAmt) }); }} className="w-7 h-7 bg-white border border-coffee-200 rounded-lg font-bold text-coffee-500 hover:bg-coffee-100 flex items-center justify-center">−</button>
                    <span className="w-8 text-center font-bold font-mono text-coffee-800">{form.items?.[item.id] || 0}</span>
                    <button onClick={() => { const q = (form.items?.[item.id] || 0) + 1; const items = { ...form.items, [item.id]: q }; setForm({ ...form, items, ...recalc(items, form.shipAmt, form.discAmt) }); }} className="w-7 h-7 bg-rose-brand/10 border border-rose-brand/20 rounded-lg font-bold text-rose-brand hover:bg-rose-brand/20 flex items-center justify-center">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-coffee-400 mb-1 block">運費</label>
              <input type="number" value={form.shipAmt || ''} placeholder="0" onChange={e => { const ship = Number(e.target.value) || 0; setForm({ ...form, shipAmt: ship, ...recalc(form.items || {}, ship, form.discAmt) }); }} className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-coffee-400 font-mono" />
            </div>
            <div>
              <label className="text-xs font-bold text-coffee-400 mb-1 block">折讓</label>
              <input type="number" value={form.discAmt || ''} placeholder="0" onChange={e => { const disc = Number(e.target.value) || 0; setForm({ ...form, discAmt: disc, ...recalc(form.items || {}, form.shipAmt, disc) }); }} className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold text-rose-brand outline-none focus:border-rose-brand font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-coffee-400 mb-1 block">備注</label>
            <input type="text" value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="備注說明（選填）" className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-400" />
          </div>
          <div className="p-4 bg-coffee-50 rounded-2xl flex justify-between items-center">
            <span className="font-bold text-coffee-700">應收總金額</span>
            <span className="text-2xl font-bold font-mono text-rose-brand">${fmt(form.actualAmt)}</span>
          </div>
        </div>
        <div className="px-8 pb-8 pt-4 border-t border-coffee-50">
          <button onClick={() => onAdd({ ...form, id: uid() })} className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold shadow-xl hover:bg-coffee-900 transition-all active:scale-95 flex items-center justify-center gap-2">
            確認新增訂單 <Plus className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

