import React, { useState, useMemo } from 'react';
import { DailyReport, Settings, Order, CashRegisterShift, CurrencyBreakdown, CashExpense, Item } from '../../types';
import { fmt, uid } from '../../lib/utils';
import { 
  Monitor, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  DollarSign, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  X,
  History,
  TrendingDown,
  Calculator,
  Edit2,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface CashRegisterTabProps {
  dailyData: DailyReport;
  settings: Settings;
  updateDaily: (patch: Partial<DailyReport>) => void;
  shopId: string;
  metrics: any;
}

const DEFAULT_CURRENCY: CurrencyBreakdown = {
  "1000": 0,
  "500": 0,
  "100": 0,
  "50": 0,
  "10": 0,
  "5": 0,
  "1": 0
};

export default function CashRegisterTab({ dailyData, settings, updateDaily, metrics }: CashRegisterTabProps) {
  const [cart, setCart] = useState<{item: Item, qty: number}[]>([]);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [editQtyModal, setEditQtyModal] = useState<{index: number, qty: string} | null>(null);
  const [finalCheckModal, setFinalCheckModal] = useState<{order: Order, change: number, received: number} | null>(null);

  // Form states
  const [checkoutData, setCheckoutData] = useState({
    buyer: '現客',
    discAmt: 0,
    paymentMethod: '現結' as Order['status'],
    receivedAmt: 0
  });

  const [expenseData, setExpenseData] = useState({
    amount: 0,
    reason: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editMemo, setEditMemo] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const [currencyForm, setCurrencyForm] = useState<CurrencyBreakdown>(DEFAULT_CURRENCY);

  const shift = dailyData.cashRegister || {
    isOpen: false,
    openingCash: DEFAULT_CURRENCY,
    openingTotal: 0,
    expenses: []
  };

  const totalCartAmt = useMemo(() => {
    return cart.reduce((sum, entry) => sum + (entry.item.price * entry.qty), 0);
  }, [cart]);

  const addToCart = (item: Item) => {
    setCart(prev => {
      const existing = prev.findIndex(e => e.item.id === item.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
        return next;
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart(prev => {
      const next = [...prev];
      const newQty = Math.max(0, next[index].qty + delta);
      if (newQty === 0) {
        return prev.filter((_, i) => i !== index);
      }
      next[index] = { ...next[index], qty: newQty };
      return next;
    });
  };

  const handleOpenShift = () => {
    const total = Object.entries(currencyForm).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
    updateDaily({
      cashRegister: {
        isOpen: true,
        openTime: new Date().toLocaleTimeString(),
        openingCash: { ...currencyForm },
        openingTotal: total,
        expenses: []
      }
    });
    setOpenShiftModal(false);
    setCurrencyForm(DEFAULT_CURRENCY);
  };

  const handleAddExpense = () => {
    const newExpense: CashExpense = {
      id: uid(),
      amount: expenseData.amount,
      reason: expenseData.reason,
      time: new Date().toLocaleTimeString()
    };
    updateDaily({
      cashRegister: {
        ...shift,
        expenses: [...shift.expenses, newExpense]
      }
    });
    setExpenseModal(false);
    setExpenseData({ amount: 0, reason: '' });
  };

  const handleCheckout = () => {
    const orderId = uid();
    const orderItems: Record<string, number> = {};
    cart.forEach(c => {
      orderItems[c.item.id] = c.qty;
    });

    const actualAmt = totalCartAmt - checkoutData.discAmt;
    const newOrder: Order = {
      id: orderId,
      buyer: checkoutData.buyer,
      phone: '',
      address: '',
      items: orderItems,
      prodAmt: totalCartAmt,
      shipAmt: 0,
      discAmt: checkoutData.discAmt,
      actualAmt: actualAmt,
      status: checkoutData.paymentMethod,
      note: `收銀機交易 - ${checkoutData.paymentMethod}`
    };

    updateDaily({
      orders: [...dailyData.orders, newOrder]
    });

    setFinalCheckModal({
      order: newOrder,
      received: checkoutData.receivedAmt,
      change: checkoutData.paymentMethod === '現結' ? checkoutData.receivedAmt - actualAmt : 0
    });
    
    setCart([]);
    setCheckoutModal(false);
    setCheckoutData({
      buyer: '現客',
      discAmt: 0,
      paymentMethod: '現結',
      receivedAmt: 0
    });
  };

  const handleCloseShift = () => {
    const total = Object.entries(currencyForm).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
    const cashSales = dailyData.orders
      .filter(o => o.status === '現結')
      .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
    const totalExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
    const expected = shift.openingTotal + cashSales - totalExpenses;
    
    updateDaily({
      cashRegister: {
        ...shift,
        isOpen: false,
        closeTime: new Date().toLocaleTimeString(),
        closingCash: { ...currencyForm },
        closingTotal: total,
        expectedCash: expected,
        overShort: total - expected
      }
    });
    setCloseShiftModal(false);
    setCurrencyForm(DEFAULT_CURRENCY);
    setIsEditing(false);
  };

  const handleUpdateClosingCash = () => {
    const total = Object.entries(currencyForm).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
    const cashSales = dailyData.orders
      .filter(o => o.status === '現結')
      .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
    const totalExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
    const expected = shift.openingTotal + cashSales - totalExpenses;

    const diffs: string[] = [];
    Object.entries(currencyForm).forEach(([val, count]) => {
      const old = shift.closingCash?.[val as keyof CurrencyBreakdown] || 0;
      if (old !== count) diffs.push(`${val}元: ${old} -> ${count}`);
    });

    const timestamp = new Date().toLocaleString();
    const log = `於 ${timestamp} 修正了[閉帳盤點]: ${diffs.join(', ')}`;

    updateDaily({
      cashRegister: {
        ...shift,
        closingCash: { ...currencyForm },
        closingTotal: total,
        expectedCash: expected,
        overShort: total - expected,
        editLogs: [...(shift.editLogs || []), log]
      }
    });
    setCloseShiftModal(false);
    setCurrencyForm(DEFAULT_CURRENCY);
  };

  const handleUpdateOpeningCash = () => {
    const total = Object.entries(currencyForm).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
    const cashSales = dailyData.orders
      .filter(o => o.status === '現結')
      .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
    const totalExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
    const expected = total + cashSales - totalExpenses;

    const diffs: string[] = [];
    Object.entries(currencyForm).forEach(([val, count]) => {
      const old = shift.openingCash[val as keyof CurrencyBreakdown] || 0;
      if (old !== count) diffs.push(`${val}元: ${old} -> ${count}`);
    });

    const timestamp = new Date().toLocaleString();
    const log = `於 ${timestamp} 修正了[開帳盤點]: ${diffs.join(', ')}`;

    updateDaily({
      cashRegister: {
        ...shift,
        openingCash: { ...currencyForm },
        openingTotal: total,
        expectedCash: expected,
        overShort: (shift.closingTotal || 0) - expected,
        editLogs: [...(shift.editLogs || []), log]
      }
    });
    setOpenShiftModal(false);
    setCurrencyForm(DEFAULT_CURRENCY);
  };

  const handleSaveEdits = () => {
    const timestamp = new Date().toLocaleString();
    const newLog = `於 ${timestamp} 填寫備註: ${editMemo}`;
    updateDaily({
      cashRegister: {
        ...shift,
        editLogs: [...(shift.editLogs || []), newLog]
      }
    });
    setIsEditing(false);
    setEditMemo('');
  };

  const handleExportPDF = () => {
    const element = document.getElementById('cash-report-section');
    if (!element) return;
    
    setIsExporting(true);

    // Some versions of html2pdf require .default in ESM
    const html2pdfLib = (html2pdf as any).default || html2pdf;

    // Use a cloned element for better capture stability if needed
    // but first let's see if the function call was the issue
    setTimeout(() => {
      const opt = {
        margin: [0.5, 0.5] as [number, number],
        filename: `收銀結報_${dailyData.date || '今日'}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollY: 0,
          windowWidth: document.documentElement.offsetWidth
        },
        jsPDF: { unit: 'in' as const, format: 'a4', orientation: 'portrait' as const }
      };

      try {
        html2pdfLib().set(opt).from(element).save().then(() => {
          setIsExporting(false);
        }).catch((err: any) => {
          console.error('PDF Library Async Error:', err);
          throw err;
        });
      } catch (err) {
        console.error('PDF Export Critical Error:', err);
        setIsExporting(false);
        alert('匯出遇到問題，已自動開啟列印視窗，請選擇「另存為 PDF」');
        window.print();
      }
    }, 500);
  };

  const allItems = [
    ...(settings.giftItems || []),
    ...(settings.singleItems || []),
    ...(settings.customCategories || []).flatMap(c => c.items || [])
  ].filter(i => i.active);

  const posSalesStats = useMemo(() => {
    const stats: Record<string, number> = {};
    dailyData.orders.forEach(o => {
      if (o.note?.includes('收銀機交易')) {
        Object.entries(o.items || {}).forEach(([id, qty]) => {
          const item = allItems.find(i => i.id === id);
          if (item) {
            stats[item.name] = (stats[item.name] || 0) + Number(qty || 0);
          }
        });
      }
    });
    return Object.entries(stats).map(([name, qty]) => ({ name, qty }));
  }, [dailyData.orders, allItems]);

  if (!shift.isOpen && !shift.closeTime) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-coffee-100 rounded-full">
          <Monitor className="w-16 h-16 text-coffee-400" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-coffee-800">收銀機尚未開帳</h2>
          <p className="text-coffee-500 mt-2">請先設定開帳現金後開始營業</p>
        </div>
        <button 
          onClick={() => setOpenShiftModal(true)}
          className="px-8 py-4 bg-coffee-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-coffee-700 transition-all active:scale-95 flex items-center gap-2"
        >
          <TrendingDown className="w-6 h-6 rotate-180" /> 開帳作業
        </button>

        {/* Open Shift Modal */}
        {openShiftModal && (
          <CurrencyModal 
            title="開帳現金設定" 
            onClose={() => setOpenShiftModal(false)}
            onSubmit={handleOpenShift}
            currency={currencyForm}
            setCurrency={setCurrencyForm}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto min-h-[calc(100vh-250px)]">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; margin: 0; background: white; }
          .no-print { display: none !important; }
          .glass-panel { border: 1px solid #eee !important; box-shadow: none !important; background: white !important; }
          .bg-coffee-50 { background-color: #f9f8f6 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      {dailyData.cashRegister?.closeTime && !dailyData.cashRegister?.isOpen && !isEditing ? (
        <div id="cash-report-section" className="lg:col-span-12 space-y-8 animate-fade-in print-section p-4 bg-white">
          <div className="flex justify-between items-center no-print">
            <h2 className="text-2xl font-serif-brand font-bold text-coffee-800">今日收銀結報</h2>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsEditing(true)} 
                className="px-5 py-2 bg-coffee-100 text-coffee-600 rounded-xl font-bold hover:bg-coffee-200 flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" /> 編輯資料
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Cash Management Summary */}
              <div className="glass-panel p-8 space-y-6">
                <h4 className="font-bold text-lg text-coffee-800 flex items-center gap-2 border-b border-coffee-50 pb-4">
                  <Calculator className="w-5 h-5 text-rose-brand" /> 開閉帳與溢短金盤點
                </h4>
                
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <span className="text-xs font-bold text-coffee-400 block mb-2 uppercase tracking-widest">開帳盤點 ({shift.openTime})</span>
                    <div className="space-y-1">
                      {Object.entries(shift.openingCash).map(([val, count]) => (
                        count > 0 && <div key={val} className="text-xs text-coffee-600 flex justify-between"><span>{val}元 x {count}</span><span>${fmt(Number(val) * count)}</span></div>
                      ))}
                      <div className="pt-2 border-t border-coffee-50 flex justify-between font-bold text-coffee-800">
                        <span>總計</span><span>${fmt(shift.openingTotal)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-coffee-400 block mb-2 uppercase tracking-widest">閉帳盤點 ({shift.closeTime})</span>
                    <div className="space-y-1">
                      {shift.closingCash && Object.entries(shift.closingCash).map(([val, count]) => (
                        count > 0 && <div key={val} className="text-xs text-coffee-600 flex justify-between"><span>{val}元 x {count}</span><span>${fmt(Number(val) * count)}</span></div>
                      ))}
                      <div className="pt-2 border-t border-coffee-50 flex justify-between font-bold text-coffee-800">
                        <span>總計</span><span>${fmt(shift.closingTotal || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-coffee-50 rounded-[32px] space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-coffee-500 font-bold">系統應有現金</span>
                    <span className="font-mono font-bold">${fmt(shift.expectedCash || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-coffee-800">實際盤點總額</span>
                    <span className="text-2xl font-serif-brand font-bold text-coffee-800">${fmt(shift.closingTotal || 0)}</span>
                  </div>
                  <div className="h-px bg-coffee-200 mt-2" />
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-bold text-lg">溢短金 (Over/Short)</span>
                    <span className={cn(
                      "text-2xl font-serif-brand font-bold px-4 py-1 rounded-xl",
                      (shift.overShort || 0) >= 0 ? "bg-mint-brand text-white" : "bg-rose-brand text-white"
                    )}>
                      {(shift.overShort || 0) >= 0 ? '+' : ''}{fmt(shift.overShort || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expense List */}
              <div className="glass-panel p-8 space-y-4">
                <h4 className="font-bold text-lg text-coffee-800 flex items-center gap-2 border-b border-coffee-50 pb-4">
                  <TrendingDown className="w-5 h-5 text-amber-500" /> 本日支出明細
                </h4>
                <div className="space-y-3">
                  {shift.expenses.length === 0 ? (
                    <p className="text-center py-4 text-coffee-300 font-bold">今日無支出紀錄</p>
                  ) : (
                    shift.expenses.map(e => (
                      <div key={e.id} className="flex justify-between items-center p-3 bg-white border border-coffee-50 rounded-2xl shadow-sm">
                        <div>
                          <p className="text-sm font-bold text-coffee-800">{e.reason}</p>
                          <p className="text-[10px] text-coffee-400 font-bold">{e.time}</p>
                        </div>
                        <span className="text-rose-brand font-mono font-bold">-${fmt(e.amount)}</span>
                      </div>
                    ))
                  )}
                  {shift.expenses.length > 0 && (
                    <div className="pt-2 flex justify-between font-bold text-coffee-800">
                      <span>支出總額</span>
                      <span className="text-rose-brand">-${fmt(shift.expenses.reduce((s, e) => s + e.amount, 0))}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Sales Stats */}
              <div className="glass-panel p-8 space-y-6 h-full">
                <h4 className="font-bold text-lg text-coffee-800 flex items-center gap-2 border-b border-coffee-50 pb-4">
                  <ShoppingBag className="w-5 h-5 text-rose-brand" /> 本日收銀機銷售統計
                </h4>
                <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
                  {posSalesStats.length === 0 ? (
                    <p className="text-center py-8 text-coffee-300 font-bold">今日收銀機無銷售紀錄</p>
                  ) : (
                    posSalesStats.map(s => (
                      <div key={s.name} className="flex justify-between items-center p-4 bg-coffee-50/50 rounded-2xl">
                        <span className="text-sm font-bold text-coffee-700">{s.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="px-3 py-1 bg-white border border-coffee-100 rounded-lg text-xs font-bold text-coffee-500">x{s.qty}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Logs & Export */}
          <div className="space-y-6">
            {shift.editLogs && shift.editLogs.length > 0 && (
              <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-[32px] space-y-3">
                <h5 className="text-sm font-bold text-amber-700 flex items-center gap-2">
                  <History className="w-4 h-4" /> 修改紀錄與備註
                </h5>
                <div className="space-y-2">
                  {shift.editLogs.map((log, i) => (
                    <p key={i} className="text-xs text-amber-600 font-medium bg-white/50 p-2 rounded-lg">{log}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center no-print">
              <button 
                onClick={handleExportPDF}
                disabled={isExporting}
                className="px-10 py-4 bg-coffee-800 text-white rounded-[24px] font-bold shadow-xl hover:bg-coffee-900 transition-all flex items-center gap-2 disabled:opacity-70"
              >
                {isExporting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    結報單準備中...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" /> 匯出為 PDF 結報單
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : isEditing ? (
        <div className="lg:col-span-12 glass-panel p-10 space-y-8 animate-fade-in">
           <div className="flex justify-between items-center">
             <h3 className="text-2xl font-bold text-coffee-800">編輯結報資料</h3>
             <button onClick={() => setIsEditing(false)} className="text-coffee-400 hover:text-coffee-600"><X className="w-6 h-6" /></button>
           </div>
           <p className="text-sm text-coffee-500 bg-coffee-50 p-4 rounded-2xl border-l-4 border-coffee-300">
             您正在修改已閉帳的收銀結報。修改完畢後請填寫修改原因，系統將會記錄此變更。
           </p>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="font-bold text-coffee-700">幣值調整與支出管理</h4>
                <div className="flex flex-col gap-3">
                   <button 
                    onClick={() => {
                      setCurrencyForm({ ...shift.openingCash });
                      setOpenShiftModal(true);
                    }} 
                    className="w-full py-3 bg-white border border-coffee-200 rounded-xl font-bold hover:bg-coffee-50"
                  >
                    修改開帳盤點
                  </button>
                   <button 
                    onClick={() => {
                      setCurrencyForm({ ...(shift.closingCash || DEFAULT_CURRENCY) });
                      setCloseShiftModal(true);
                    }} 
                    className="w-full py-3 bg-white border border-coffee-200 rounded-xl font-bold hover:bg-coffee-50"
                  >
                    修改閉帳盤點
                  </button>
                   <button onClick={() => setExpenseModal(true)} className="w-full py-3 bg-white border border-coffee-200 rounded-xl font-bold hover:bg-coffee-50">修改支出紀錄</button>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-bold text-coffee-700">修改原因與備註</h4>
                <textarea 
                  value={editMemo}
                  onChange={e => setEditMemo(e.target.value)}
                  placeholder="請簡述修改原因 (例如: 補登支出、盤點輸入錯誤...)"
                  className="w-full h-32 bg-coffee-50 border border-coffee-100 rounded-2xl p-4 outline-none focus:border-coffee-400 text-sm font-bold"
                />
              </div>
           </div>

           <div className="pt-8 flex justify-end gap-3">
             <button onClick={() => setIsEditing(false)} className="px-8 py-3 bg-coffee-100 text-coffee-600 rounded-xl font-bold">取消編輯</button>
             <button 
               onClick={handleSaveEdits}
               disabled={!editMemo}
               className="px-10 py-3 bg-coffee-800 text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
             >
               儲存變更並更新紀錄
             </button>
           </div>
        </div>
      ) : (
        <>
          {/* Left: Product Grid (8 cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4 overflow-hidden print:hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-rose-brand" /> 商品選單
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setExpenseModal(true)}
                  className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-amber-200 transition-all"
                >
                  <TrendingDown className="w-4 h-4" /> 支出紀錄
                </button>
                <button 
                  onClick={() => setCloseShiftModal(true)}
                  className="px-4 py-2 bg-coffee-800 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-coffee-900 transition-all"
                >
                  <Monitor className="w-4 h-4" /> 閉帳作業
                </button>
              </div>
            </div>
    
            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {allItems.map(item => (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="flex flex-col items-center justify-center p-4 bg-white border border-coffee-100 rounded-2xl shadow-sm hover:border-rose-brand/30 hover:shadow-md transition-all group aspect-square text-center"
                >
                  <div className="text-sm font-bold text-coffee-700 group-hover:text-rose-brand transition-colors line-clamp-2 mb-2">
                    {item.name}
                  </div>
                  <div className="text-rose-brand font-mono font-bold">
                    ${fmt(item.price)}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
    
          {/* Right: Cart (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-coffee-100 rounded-3xl flex flex-col overflow-hidden shadow-lg print:hidden">
            <div className="p-6 border-b border-coffee-50 bg-coffee-50/50">
              <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-rose-brand" /> 購物車明細
              </h3>
            </div>
    
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-coffee-300 space-y-2 opacity-50">
                  <ShoppingBag className="w-12 h-12" />
                  <p className="font-bold">尚無商品</p>
                </div>
              ) : (
                cart.map((entry, idx) => (
                  <div key={entry.item.id} className="flex items-center justify-between p-3 bg-coffee-50 rounded-2xl group">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="text-sm font-bold text-coffee-800 truncate">{entry.item.name}</div>
                      <div className="text-xs text-coffee-400 font-mono font-bold">${fmt(entry.item.price)} x {entry.qty}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-white rounded-xl border border-coffee-100 p-1">
                        <button onClick={() => updateCartQty(idx, -1)} className="p-1 hover:bg-coffee-50 rounded-lg transition-colors"><Minus className="w-3 h-3" /></button>
                        <button 
                          onClick={() => setEditQtyModal({ index: idx, qty: entry.qty.toString() })}
                          className="w-10 text-center font-bold font-mono text-sm text-coffee-700"
                        >
                          {entry.qty}
                        </button>
                        <button onClick={() => updateCartQty(idx, 1)} className="p-1 hover:bg-coffee-50 rounded-lg transition-colors"><Plus className="w-3 h-3" /></button>
                      </div>
                      <div className="text-sm font-bold font-mono text-coffee-900 w-16 text-right">
                        ${fmt(entry.item.price * entry.qty)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
    
            <div className="p-6 border-t border-coffee-100 bg-white space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-sm font-bold text-coffee-400">小計項目: {cart.length}</div>
                <div className="text-right">
                  <div className="text-xs text-coffee-400 font-bold uppercase tracking-widest mb-1">TOTAL AMOUNT</div>
                  <div className="text-3xl font-serif-brand font-bold text-rose-brand leading-none">
                    <span className="text-sm mr-1">$</span>{fmt(totalCartAmt)}
                  </div>
                </div>
              </div>
              <button 
                disabled={cart.length === 0}
                onClick={() => setCheckoutModal(true)}
                className="w-full py-4 bg-rose-brand text-white rounded-2xl font-bold shadow-xl shadow-rose-200 hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                結帳收款 <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Checkout Modal */}
      <AnimatePresence>
        {checkoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCheckoutModal(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-md bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-coffee-800">結帳收款</h3>
                <button onClick={() => setCheckoutModal(false)} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-coffee-400 mb-1 block">購買人</label>
                    <input 
                      type="text" 
                      value={checkoutData.buyer} 
                      onChange={e => setCheckoutData({...checkoutData, buyer: e.target.value})}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-coffee-400 mb-1 block">折讓金額</label>
                    <input 
                      type="number" 
                      value={checkoutData.discAmt || ''} 
                      placeholder="0"
                      onChange={e => setCheckoutData({...checkoutData, discAmt: Number(e.target.value)})}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-2 text-sm font-bold text-rose-brand outline-none focus:border-rose-brand font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {['現結', '匯款', '未結帳款'].map(m => (
                    <button
                      key={m}
                      onClick={() => setCheckoutData({...checkoutData, paymentMethod: m as any})}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold border transition-all",
                        checkoutData.paymentMethod === m 
                          ? "bg-rose-brand border-rose-brand text-white shadow-md shadow-rose-100" 
                          : "bg-white border-coffee-100 text-coffee-500 hover:border-coffee-300"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="p-4 bg-coffee-50 rounded-2xl space-y-2">
                  <div className="flex justify-between text-sm font-bold text-coffee-500">
                    <span>商品小計</span>
                    <span className="font-mono">${fmt(totalCartAmt)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-rose-brand">
                    <span>折讓金額</span>
                    <span className="font-mono">-${fmt(checkoutData.discAmt)}</span>
                  </div>
                  <div className="h-px bg-coffee-100 my-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-coffee-800">應收總金額</span>
                    <span className="text-2xl font-serif-brand font-bold text-rose-brand">${fmt(totalCartAmt - checkoutData.discAmt)}</span>
                  </div>
                </div>

                {checkoutData.paymentMethod === '現結' && (
                  <div>
                    <label className="text-xs font-bold text-coffee-400 mb-1 block">實收金額</label>
                    <input 
                      type="number" 
                      value={checkoutData.receivedAmt || ''} 
                      placeholder="輸入顧客支付金額"
                      onChange={e => setCheckoutData({...checkoutData, receivedAmt: Number(e.target.value)})}
                      className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-4 text-xl font-bold text-mint-brand shadow-inner outline-none focus:border-mint-brand font-mono text-center"
                    />
                    {checkoutData.receivedAmt > 0 && (
                      <div className="text-center mt-2 text-sm font-bold">
                        <span className="text-coffee-400">應找零：</span>
                        <span className="text-mint-brand font-mono">${fmt(checkoutData.receivedAmt - (totalCartAmt - checkoutData.discAmt))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleCheckout}
                  className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold shadow-xl hover:bg-coffee-900 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  確認結帳與列入銷售明細 <CheckCircle2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Final Checkout Modal (Receipt Info) */}
      <AnimatePresence>
        {finalCheckModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-sm bg-white rounded-[40px] shadow-2xl relative z-10 overflow-hidden">
              <div className="bg-mint-brand p-10 text-center text-white">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold mb-1">交易完成</h3>
                <p className="text-mint-100 text-sm">已將交易資料同步為日報表銷售項目</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-coffee-50 pb-4">
                    <span className="text-coffee-400 font-bold">應收金額</span>
                    <span className="text-2xl font-serif-brand font-bold text-coffee-800">${fmt(finalCheckModal.order.actualAmt)}</span>
                  </div>
                  {finalCheckModal.order.status === '現結' && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-coffee-400 font-bold">實收金額</span>
                        <span className="font-mono font-bold text-coffee-600">${fmt(finalCheckModal.received)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-mint-brand/5 p-4 rounded-2xl border border-mint-brand/10 mt-2">
                        <span className="text-mint-brand font-bold">找零金額</span>
                        <span className="text-2xl font-serif-brand font-bold text-mint-brand">${fmt(finalCheckModal.change)}</span>
                      </div>
                    </>
                  )}
                </div>
                <button 
                  onClick={() => setFinalCheckModal(null)}
                  className="w-full py-4 bg-coffee-900 text-white rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Qty Modal (Keypad like) */}
      <AnimatePresence>
        {editQtyModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditQtyModal(null)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-xs bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-6 space-y-4">
              <h3 className="text-center font-bold text-coffee-800">修改商品數量</h3>
              <input 
                autoFocus
                type="number"
                value={editQtyModal.qty}
                onChange={e => setEditQtyModal({...editQtyModal, qty: e.target.value})}
                className="w-full text-center text-4xl font-serif-brand font-bold text-rose-brand border-b-2 border-coffee-200 outline-none pb-2"
              />
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9,0].map(n => (
                  <button 
                    key={n} 
                    onClick={() => setEditQtyModal({...editQtyModal, qty: editQtyModal.qty === '0' ? n.toString() : editQtyModal.qty + n.toString()})}
                    className="py-3 bg-coffee-50 rounded-xl font-bold text-coffee-700 hover:bg-coffee-100"
                  >
                    {n}
                  </button>
                ))}
                <button onClick={() => setEditQtyModal({...editQtyModal, qty: ''})} className="py-3 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100">C</button>
              </div>
              <button 
                onClick={() => {
                  const q = parseInt(editQtyModal.qty) || 0;
                  updateCartQty(editQtyModal.index, q - cart[editQtyModal.index].qty);
                  setEditQtyModal(null);
                }}
                className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold"
              >
                確定修改
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {expenseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setExpenseModal(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-sm bg-white border-0 shadow-2xl rounded-3xl relative z-10 p-8 space-y-6">
              <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-amber-500" /> 收銀機支出紀錄
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-coffee-400 mb-1 block">支出金額</label>
                  <input 
                    type="number" 
                    value={expenseData.amount || ''} 
                    onChange={e => setExpenseData({...expenseData, amount: Number(e.target.value)})}
                    className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-3 text-xl font-bold text-rose-brand outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-coffee-400 mb-1 block">支出原因</label>
                  <input 
                    type="text" 
                    placeholder="如：採買、雜支、退款"
                    value={expenseData.reason} 
                    onChange={e => setExpenseData({...expenseData, reason: e.target.value})}
                    className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-3 text-sm font-bold text-coffee-700 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={handleAddExpense}
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold shadow-lg hover:bg-amber-600 transition-all active:scale-95"
              >
                儲存支出
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Open/Edit Opening Modal */}
      {openShiftModal && (
        <CurrencyModal 
          title={shift.isOpen || shift.closeTime ? "修改開帳盤點" : "開帳現金設定"} 
          onClose={() => setOpenShiftModal(false)}
          onSubmit={shift.closeTime ? handleUpdateOpeningCash : handleOpenShift}
          currency={currencyForm}
          setCurrency={setCurrencyForm}
        />
      )}

      {/* Close/Edit Closing Modal */}
      {closeShiftModal && (
        <CurrencyModal 
          title={isEditing ? "修改閉帳盤點" : "閉帳現金盤點"} 
          onClose={() => setCloseShiftModal(false)}
          onSubmit={isEditing ? handleUpdateClosingCash : handleCloseShift}
          currency={currencyForm}
          setCurrency={setCurrencyForm}
          isClosing
          shiftData={shift}
          metricsCash={metrics?.cash || 0}
        />
      )}
    </div>
  );
}

function CurrencyModal({ title, onClose, onSubmit, currency, setCurrency, isClosing, shiftData, metricsCash }: any) {
  const total = Object.entries(currency).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
  
  // Calculate expected if closing
  const cashSales = metricsCash;
  const totalExpenses = shiftData?.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
  const expected = isClosing ? ((shiftData?.openingTotal || 0) + cashSales - totalExpenses) : 0;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-coffee-950/80 backdrop-blur-md" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-lg bg-white border-0 shadow-2xl rounded-[32px] relative z-10 p-8 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-coffee-800">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1000, 500, 100, 50, 10, 5, 1].map(val => (
              <div key={val} className="p-4 bg-coffee-50 rounded-2xl text-center space-y-2 border border-coffee-100">
                <div className="text-xs font-bold text-coffee-400 uppercase tracking-widest">{val} 元</div>
                <input 
                  type="number"
                  min="0"
                  value={currency[val] || ''}
                  placeholder="0"
                  onChange={e => setCurrency({...currency, [val]: parseInt(e.target.value) || 0})}
                  className="w-full bg-white border border-coffee-100 rounded-xl px-2 py-2 text-center font-bold font-mono text-coffee-800 outline-none focus:border-rose-brand"
                />
              </div>
            ))}
          </div>

          <div className="p-6 bg-coffee-900 rounded-2xl text-white space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-bold opacity-60">盤點總額</span>
              <span className="text-3xl font-serif-brand font-bold">${fmt(total)}</span>
            </div>

            {isClosing && (
              <div className="pt-4 border-t border-white/10 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">開帳現鈔</span>
                  <span className="font-mono">${fmt(shiftData.openingTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">本日現金銷售</span>
                  <span className="font-mono text-mint-brand">+${fmt(cashSales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">合計支出</span>
                  <span className="font-mono text-rose-brand">-${fmt(totalExpenses)}</span>
                </div>
                <div className="h-px bg-white/10 my-2" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="opacity-60">應有現金金額</span>
                  <span className="font-mono text-lg">${fmt(expected)}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-bold text-lg">溢短金</span>
                  <span className={cn(
                    "text-2xl font-serif-brand font-bold px-4 py-1 rounded-xl",
                    total - expected >= 0 ? "bg-mint-brand text-white" : "bg-rose-brand text-white"
                  )}>
                    {total - expected >= 0 ? '+' : ''}{fmt(total - expected)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-6">
          <button 
            onClick={onSubmit}
            className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold shadow-xl hover:bg-coffee-900 transition-all active:scale-95"
          >
            {isClosing ? '確認閉帳並儲存' : '確認開帳'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
