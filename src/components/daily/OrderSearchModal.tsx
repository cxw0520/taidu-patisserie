import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../../types';
import { fmt, cn } from '../../lib/utils';
import { Search, X, CheckCircle2, AlertCircle, Phone, User, ShoppingBag } from 'lucide-react';

/* ══════════════════════════════════════════
   LoadedOrder — represents a pre-existing order loaded into POS
══════════════════════════════════════════ */
export interface LoadedOrder {
  order: Order;
  /** Amount to collect for this order (0 if already paid) */
  collectAmt: number;
}

/** Returns true if an order is considered already paid */
export function isPaidStatus(status: string): boolean {
  return ['匯款', '現結', '已收帳款', '儲值金扣款', '公關品', '已付訂金'].includes(status);
}

interface OrderSearchModalProps {
  todayOrders: Order[];
  onClose: () => void;
  onLoad: (loaded: LoadedOrder[]) => void;
}

export default function OrderSearchModal({ todayOrders, onClose, onLoad }: OrderSearchModalProps) {
  const [phoneInput, setPhoneInput] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [crossPersonConfirm, setCrossPersonConfirm] = useState(false);

  // Filter orders: has phone, not already picked up
  const searchable = useMemo(
    () => todayOrders.filter(o => o.phone && !o.isPickedUp),
    [todayOrders]
  );

  // Live filter by phone prefix
  const results = useMemo(() => {
    if (!phoneInput.trim()) return [];
    const q = phoneInput.trim();
    return searchable.filter(o => (o.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
  }, [phoneInput, searchable]);

  // Phone of the first selected order
  const primaryPhone = useMemo(() => {
    const firstId = Object.keys(selected).find(id => selected[id]);
    if (!firstId) return null;
    return results.find(o => o.id === firstId)?.phone || null;
  }, [selected, results]);

  const toggle = (order: Order) => {
    const alreadySelected = selected[order.id];
    if (!alreadySelected && primaryPhone && order.phone !== primaryPhone) {
      setCrossPersonConfirm(true);
      // Temporarily store pending
      setSelected(prev => ({ ...prev, [`__pending__`]: true, [`__pendingId__`]: order.id as any }));
      return;
    }
    setSelected(prev => ({ ...prev, [order.id]: !prev[order.id] }));
  };

  const confirmCrossPerson = () => {
    const pendingId = selected[`__pendingId__`] as any;
    if (pendingId) {
      setSelected(prev => {
        const next = { ...prev };
        delete next[`__pending__`];
        delete next[`__pendingId__`];
        next[pendingId] = true;
        return next;
      });
    }
    setCrossPersonConfirm(false);
  };

  const cancelCrossPerson = () => {
    setSelected(prev => {
      const next = { ...prev };
      delete next[`__pending__`];
      delete next[`__pendingId__`];
      return next;
    });
    setCrossPersonConfirm(false);
  };

  const handleLoad = () => {
    const chosenOrders = results.filter(o => selected[o.id]);
    const loaded: LoadedOrder[] = chosenOrders.map(o => ({
      order: o,
      collectAmt: isPaidStatus(o.status) ? 0 : o.actualAmt,
    }));
    onLoad(loaded);
    onClose();
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const statusBadge = (status: string) => {
    const paid = isPaidStatus(status);
    return (
      <span className={cn(
        'text-[10px] font-bold px-2 py-0.5 rounded-full',
        paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      )}>
        {paid ? '✓ 已付款' : '⚠ ' + status}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass-panel w-full max-w-lg bg-white border-0 shadow-2xl rounded-3xl relative z-10 overflow-hidden max-h-[88vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-7 pt-6 pb-4 border-b border-coffee-50">
          <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
            <Search className="w-5 h-5 text-rose-brand" /> 查詢當日訂單
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-coffee-50 rounded-full">
            <X className="w-5 h-5 text-coffee-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-7 pt-5 pb-3">
          <label className="text-xs font-bold text-coffee-400 mb-1.5 block">輸入電話號碼（即時搜尋）</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300" />
            <input
              autoFocus
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="例：0912345678"
              className="w-full pl-9 pr-4 py-3 bg-coffee-50 border border-coffee-100 rounded-xl text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-7 pb-4 space-y-2">
          {phoneInput.trim() === '' ? (
            <div className="flex flex-col items-center justify-center py-12 text-coffee-300 space-y-2 opacity-60">
              <Search className="w-10 h-10" />
              <p className="text-sm font-bold">輸入電話號碼以搜尋訂單</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-coffee-300 space-y-2 opacity-60">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm font-bold">找不到符合的當日訂單</p>
              <p className="text-xs">僅顯示有電話且尚未取貨的訂單</p>
            </div>
          ) : (
            results.map(order => {
              const isSelected = !!selected[order.id];
              const paid = isPaidStatus(order.status);
              const isCross = primaryPhone && order.phone !== primaryPhone;
              return (
                <button
                  key={order.id}
                  onClick={() => toggle(order)}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl border-2 transition-all',
                    isSelected
                      ? 'border-rose-brand bg-rose-50/60'
                      : isCross
                      ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                      : 'border-coffee-100 bg-white hover:border-coffee-300'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <User className="w-3.5 h-3.5 text-coffee-400 shrink-0" />
                        <span className="text-sm font-bold text-coffee-800 truncate">{order.buyer || '（無姓名）'}</span>
                        <span className="text-xs text-coffee-400 font-mono shrink-0">{order.phone}</span>
                        {isCross && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md shrink-0">跨人合併</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {statusBadge(order.status)}
                        <span className="text-[10px] text-coffee-400 font-bold">
                          <ShoppingBag className="inline w-3 h-3 mr-0.5" />
                          {Object.keys(order.items || {}).length} 項
                        </span>
                        {order.note && (
                          <span className="text-[10px] text-coffee-300 truncate max-w-[140px]">{order.note}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn('text-sm font-bold font-mono', paid ? 'text-emerald-600' : 'text-rose-brand')}>
                        {paid ? '$0 (免收)' : `$${fmt(order.actualAmt)}`}
                      </div>
                      <div className="text-[10px] text-coffee-300 mt-0.5 font-mono">原始: ${fmt(order.actualAmt)}</div>
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                      isSelected ? 'bg-rose-brand border-rose-brand' : 'border-coffee-200'
                    )}>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 pt-4 border-t border-coffee-50 space-y-3">
          {selectedCount > 0 && (
            <div className="p-3 bg-coffee-50 rounded-xl text-xs font-bold text-coffee-500">
              已選 {selectedCount} 筆訂單 · 應收合計：
              <span className="text-rose-brand font-mono ml-1">
                ${fmt(results.filter(o => selected[o.id]).reduce((s, o) => s + (isPaidStatus(o.status) ? 0 : o.actualAmt), 0))}
              </span>
            </div>
          )}
          <button
            disabled={selectedCount === 0}
            onClick={handleLoad}
            className="w-full py-3.5 bg-rose-brand text-white rounded-2xl font-bold shadow-lg shadow-rose-100 hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            載入已選訂單至購物車 <CheckCircle2 className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {/* Cross-person confirm dialog */}
      <AnimatePresence>
        {crossPersonConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-coffee-950/40"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 rounded-2xl">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h4 className="font-bold text-coffee-800">合併不同聯絡人的訂單？</h4>
                  <p className="text-xs text-coffee-400 mt-0.5">您正在選取與其他電話號碼不同的訂單</p>
                </div>
              </div>
              <p className="text-sm text-coffee-600 leading-relaxed">
                此訂單屬於不同聯絡人，確定要合併至同一張單結帳嗎？
              </p>
              <div className="flex gap-3">
                <button onClick={cancelCrossPerson} className="flex-1 py-3 bg-coffee-100 text-coffee-600 rounded-2xl font-bold hover:bg-coffee-200 transition-all">
                  取消
                </button>
                <button onClick={confirmCrossPerson} className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100">
                  確認合併
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
