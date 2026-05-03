import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, DailyReport, Order, Customer } from '../../types';
import { uid, fmt, cn, normalizeDateKey, copyText } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, getDoc, writeBatch, collection, query, onSnapshot } from 'firebase/firestore';
import { Search, X, Phone, User, MapPin, Copy, ChevronDown, ChevronRight } from 'lucide-react';


export default function PhoneSearchModal({ orders, settings, onClose, onUpdateOrder }: {
  orders: Order[];
  settings: Settings;
  onClose: () => void;
  onUpdateOrder: (updated: Order) => void;
}) {
  const [phone, setPhone] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allItems = useMemo(() => [
    ...(settings.giftItems || []),
    ...(settings.singleItems || []),
    ...(settings.customCategories || []).flatMap(c => c.items || []),
  ], [settings]);

  const results = useMemo(() => {
    if (!phone) return [];
    const q = phone.replace(/\D/g, '');
    return orders.filter(o => (o.phone || '').replace(/\D/g, '').includes(q));
  }, [phone, orders]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:pr-8 pointer-events-none">
      <motion.div
        initial={{ x: 80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 80, opacity: 0 }}
        className="pointer-events-auto w-full sm:w-96 bg-white rounded-3xl shadow-2xl border border-coffee-100 flex flex-col"
        style={{ height: '560px' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-coffee-50 flex-shrink-0">
          <h4 className="font-bold text-coffee-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-rose-brand" /> 訂單快速搜尋
          </h4>
          <button onClick={onClose} className="p-1.5 hover:bg-coffee-50 rounded-full"><X className="w-4 h-4 text-coffee-400" /></button>
        </div>
        {/* Search input */}
        <div className="px-6 py-4 flex-shrink-0">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
            <input
              autoFocus
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={e => { setPhone(e.target.value); setExpandedId(null); }}
              placeholder="輸入電話號碼搜尋..."
              className="w-full bg-coffee-50 border border-coffee-100 rounded-xl pl-10 pr-4 py-3 font-bold text-coffee-700 outline-none focus:border-rose-brand text-sm"
            />
          </div>
          <div className="mt-2 text-xs text-coffee-400 font-bold">
            {phone ? `找到 ${results.length} 筆符合結果` : '輸入手機號碼（任意位數）即時搜尋'}
          </div>
        </div>
        {/* Results — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
          {!phone && (
            <div className="flex flex-col items-center justify-center h-40 text-coffee-200">
              <Search className="w-10 h-10 mb-2" />
              <p className="text-sm font-bold">輸入號碼開始搜尋</p>
            </div>
          )}
          {phone && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-coffee-200">
              <Phone className="w-10 h-10 mb-2" />
              <p className="text-sm font-bold">無符合的訂單</p>
            </div>
          )}
          {results.map(order => {
            const isExpanded = expandedId === order.id;
            const orderedItems = allItems.filter(i => (order.items?.[i.id] || 0) > 0);
            const isPickup = order.deliveryMethod === '自取';
            return (
              <div key={order.id} className="border border-coffee-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-coffee-50 transition-colors"
                >
                  <div>
                    <div className="font-bold text-coffee-800 text-sm">{order.buyer || '（無姓名）'}</div>
                    <div className="text-xs text-coffee-400 font-mono mt-0.5 flex items-center gap-2">
                      <Phone className="w-3 h-3" />{order.phone || '—'}
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold",
                        order.status === '匯款' && 'bg-blue-50 text-blue-600',
                        order.status === '現結' && 'bg-green-50 text-green-600',
                        order.status === '未結帳款' && 'bg-red-50 text-red-500',
                        order.status === '公關品' && 'bg-purple-50 text-purple-600',
                      )}>{order.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-rose-brand text-sm">${fmt(order.actualAmt)}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-coffee-400" /> : <ChevronRight className="w-4 h-4 text-coffee-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-coffee-50 px-4 py-4 space-y-3 bg-coffee-50/30">
                    <div className="space-y-1.5">
                      {orderedItems.length === 0
                        ? <p className="text-xs text-coffee-300 font-bold text-center py-2">無品項資料</p>
                        : orderedItems.map(item => (
                          <div key={item.id} className="flex justify-between text-xs font-bold">
                            <span className="text-coffee-600">{item.name}</span>
                            <span className="font-mono text-coffee-800">× {order.items![item.id]}</span>
                          </div>
                        ))
                      }
                    </div>
                    <div className="text-xs space-y-1 pt-2 border-t border-coffee-100">
                      <div className="flex justify-between text-coffee-500"><span>商品</span><span className="font-mono">${fmt(order.prodAmt)}</span></div>
                      {order.shipAmt > 0 && <div className="flex justify-between text-coffee-500"><span>運費</span><span className="font-mono">${fmt(order.shipAmt)}</span></div>}
                      {order.discAmt > 0 && <div className="flex justify-between text-rose-brand"><span>折讓</span><span className="font-mono">-${fmt(order.discAmt)}</span></div>}
                      <div className="flex justify-between font-bold text-coffee-800 pt-1 border-t border-coffee-100"><span>應收</span><span className="font-mono text-mint-brand">${fmt(order.actualAmt)}</span></div>
                    </div>
                    {!order.source?.includes('pos') && !order.note?.includes('收銀機') && (
                      <div className="pt-2 border-t border-coffee-100">
                        <div className="text-xs font-bold text-coffee-400 mb-2">取貨狀態</div>
                        <div className="flex gap-2">
                          {(['宅配', '自取'] as const).map(m => (
                            <button
                              key={m}
                              onClick={() => onUpdateOrder({ ...order, deliveryMethod: m })}
                              className={cn("flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                order.deliveryMethod === m
                                  ? (m === '宅配' ? 'bg-blue-500 text-white border-blue-500' : 'bg-mint-brand text-white border-mint-brand')
                                  : 'bg-white border-coffee-100 text-coffee-400'
                              )}
                            >{m === '宅配' ? '🚚 宅配' : '📍 自取'}</button>
                          ))}
                        </div>
                        {isPickup && (
                          <button
                            onClick={() => onUpdateOrder({ ...order, isPickedUp: !order.isPickedUp })}
                            className={cn("mt-2 w-full py-2 rounded-xl text-xs font-bold transition-all border",
                              order.isPickedUp ? 'bg-mint-brand text-white border-mint-brand' : 'bg-amber-50 text-amber-600 border-amber-200'
                            )}
                          >{order.isPickedUp ? '✓ 已取貨' : '尚未取貨 — 點此標記已取'}</button>
                        )}
                      </div>
                    )}
                    {order.note && <p className="text-xs text-coffee-400 font-bold bg-coffee-50 rounded-lg px-3 py-2">📝 {order.note}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
