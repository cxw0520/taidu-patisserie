import React, { useState, useMemo } from 'react';
import { DailyReport, Settings, Order, CashRegisterShift, CurrencyBreakdown, CashExpense, Item, Customer, CreditLog } from '../../types';
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
  FileText,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import CustomerAutocomplete from './CustomerAutocomplete';
import OrderSearchModal, { LoadedOrder, isPaidStatus } from './OrderSearchModal';
import { db } from '../../lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

interface CashRegisterTabProps {
  dailyData: DailyReport;
  settings: Settings;
  updateDaily: (patch: Partial<DailyReport>) => void;
  shopId: string;
  metrics: any;
  customers: import('../../types').Customer[];
  onAddOrder: (order: Order) => void;
  onAddFutureOrder?: (targetDate: string, order: Order) => void;
  onGoToDashboard?: () => void;
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

export default function CashRegisterTab({ dailyData, settings, updateDaily, metrics, customers, onAddOrder, onAddFutureOrder, onGoToDashboard, shopId }: CashRegisterTabProps & { shopId?: string }) {
  const [cart, setCart] = useState<{item: Item, qty: number}[]>([]);
  // Loaded pre-existing orders
  const [loadedOrders, setLoadedOrders] = useState<LoadedOrder[]>([]);
  const [orderSearchModal, setOrderSearchModal] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [editQtyModal, setEditQtyModal] = useState<{index: number, qty: string} | null>(null);
  const [finalCheckModal, setFinalCheckModal] = useState<{order: Order, change: number, received: number, creditBalanceAfter?: number} | null>(null);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  // Topup modal state
  const [topupModal, setTopupModal] = useState(false);
  const [topupPhone, setTopupPhone] = useState('');
  const [topupCust, setTopupCust] = useState<Customer | null>(null);
  const [topupAmt, setTopupAmt] = useState('');
  const [topupMethod, setTopupMethod] = useState<'現結' | '匯款'>('現結');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupSuccess, setTopupSuccess] = useState<{name: string, amt: number, balAfter: number} | null>(null);
  // Keypad state for checkout modal
  const [receivedInput, setReceivedInput] = useState('');

  // Form states
  const [checkoutData, setCheckoutData] = useState({
    buyer: '現客',
    phone: '',
    discAmt: 0,
    paymentMethod: '現結' as Order['status'],
    receivedAmt: 0,
    pickupDate: dailyData.date
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

  const totalNewItemsAmt = useMemo(() =>
    cart.reduce((sum, entry) => sum + (entry.item.price * entry.qty), 0)
  , [cart]);

  // Amount still owed from loaded orders (unpaid ones)
  const totalLoadedUnpaid = useMemo(() =>
    loadedOrders.reduce((s, lo) => s + lo.collectAmt, 0)
  , [loadedOrders]);

  // Grand total to collect
  const totalCartAmt = totalNewItemsAmt + totalLoadedUnpaid;

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

  const handleTopup = async () => {
    const amt = Number(topupAmt);
    if (!topupCust || !topupCust.id) { setTopupError('請先搜尋並選擇顧客'); return; }
    if (!amt || amt <= 0) { setTopupError('請輸入有效的儲值金額'); return; }
    if (!shopId) { setTopupError('找不到店舖資訊'); return; }

    setTopupLoading(true);
    setTopupError(null);
    try {
      let balAfter = 0;
      const custRef = doc(db, 'shops', shopId, 'customers', topupCust.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(custRef);
        if (!snap.exists()) throw new Error('顧客資料不存在');
        const data = snap.data();
        const currentBal = Number(data.creditBalance || 0);
        balAfter = currentBal + amt;
        const log: CreditLog = {
          id: uid(),
          timestamp: new Date().toISOString(),
          type: 'topup',
          amount: amt,
          balanceAfter: balAfter,
          note: `POS 收銀機儲值 (${topupMethod})`
        };
        tx.update(custRef, {
          creditBalance: balAfter,
          creditLogs: [...(data.creditLogs || []), log],
          updatedAt: new Date().toISOString()
        });
      });

      // Write a topup order to daily report for cash register tracking
      const topupOrder: Order = {
        id: uid(),
        buyer: topupCust.name || topupCust.phone,
        phone: topupCust.phone,
        address: '',
        items: {},
        prodAmt: 0,
        shipAmt: 0,
        discAmt: 0,
        actualAmt: amt,
        status: topupMethod,
        note: `儲值金充值 - ${topupCust.name || topupCust.phone}`,
        source: 'pos',
        orderType: 'topup',
        customerId: topupCust.id
      };
      onAddOrder(topupOrder);

      setTopupSuccess({ name: topupCust.name || topupCust.phone, amt, balAfter });
      setTopupPhone('');
      setTopupCust(null);
      setTopupAmt('');
      setTopupMethod('現結');
    } catch (err: any) {
      setTopupError(err.message || '儲值失敗，請重試');
    } finally {
      setTopupLoading(false);
    }
  };

  const handleLoadOrders = (loaded: LoadedOrder[]) => {
    setLoadedOrders(prev => {
      // Avoid duplicates
      const existingIds = new Set(prev.map(lo => lo.order.id));
      return [...prev, ...loaded.filter(lo => !existingIds.has(lo.order.id))];
    });
    // Auto-fill buyer/phone from first loaded order if not yet set
    const first = loaded[0];
    if (first && checkoutData.buyer === '現客') {
      setCheckoutData(prev => ({
        ...prev,
        buyer: first.order.buyer || '現客',
        phone: first.order.phone || ''
      }));
      // Try to find customer
      const cust = customers.find(c => c.phone === first.order.phone);
      if (cust) setSelectedCust(cust);
    }
  };

  const handleCheckout = async () => {
    const orderId = uid();
    const orderItems: Record<string, number> = {};
    cart.forEach(c => { orderItems[c.item.id] = c.qty; });

    const newItemsAmt = totalNewItemsAmt - checkoutData.discAmt;
    const grandTotal = Math.max(0, newItemsAmt) + totalLoadedUnpaid;
    const isFuturePickup = checkoutData.pickupDate !== dailyData.date;
    const isCreditPayment = checkoutData.paymentMethod === '儲值金扣款';
    let creditBalanceAfter: number | undefined;

    // ── 1. Firestore Transaction for credit deduction ──────────────
    if (isCreditPayment && selectedCust && shopId) {
      try {
        const custRef = doc(db, 'shops', shopId, 'customers', selectedCust.id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(custRef);
          if (!snap.exists()) throw new Error('顧客資料不存在');
          const data = snap.data();
          const currentBal = Number(data.creditBalance || 0);
          if (currentBal < grandTotal) {
            throw new Error(`儲值金不足！目前餘額 $${currentBal}，需要 $${grandTotal}`);
          }
          const newBal = currentBal - grandTotal;
          const log: CreditLog = {
            id: uid(),
            timestamp: new Date().toISOString(),
            type: 'consume',
            amount: -grandTotal,
            balanceAfter: newBal,
            orderId,
            note: 'POS 儲值金結帳扣款'
          };
          tx.update(custRef, {
            creditBalance: newBal,
            creditLogs: [...(data.creditLogs || []), log],
            updatedAt: new Date().toISOString()
          });
          creditBalanceAfter = newBal;
        });
      } catch (err: any) {
        setCreditError(err.message || '儲值金扣款失敗');
        return;
      }
    }

    // ── 2. Mark loaded orders as picked up ───────────────────────
    if (loadedOrders.length > 0) {
      const updatedOrders = dailyData.orders.map(o => {
        const lo = loadedOrders.find(l => l.order.id === o.id);
        if (!lo) return o;
        return { ...o, isPickedUp: true, status: lo.collectAmt === 0 ? o.status : checkoutData.paymentMethod };
      });
      updateDaily({ orders: updatedOrders });
    }

    // ── 3. Create new order for new items (if any) ───────────────
    if (cart.length > 0) {
      if (isFuturePickup) {
        const prepaymentOrder: Order = {
          id: orderId, buyer: checkoutData.buyer, phone: checkoutData.phone,
          address: '', items: {}, prodAmt: 0, shipAmt: 0, discAmt: 0,
          actualAmt: Math.max(0, newItemsAmt),
          status: checkoutData.paymentMethod,
          note: `收銀機交易 (預購單) - 將於 ${checkoutData.pickupDate} 取貨`,
          source: 'pos', orderType: 'prepayment', pickupDate: checkoutData.pickupDate,
          customerId: selectedCust?.id
        };
        onAddOrder(prepaymentOrder);
        if (onAddFutureOrder) {
          onAddFutureOrder(checkoutData.pickupDate, {
            id: uid(), buyer: checkoutData.buyer, phone: checkoutData.phone,
            address: '', items: orderItems, prodAmt: totalNewItemsAmt, shipAmt: 0,
            discAmt: checkoutData.discAmt, actualAmt: 0, status: '已收帳款',
            note: `收銀機交易 (取貨單) - 於 ${dailyData.date} 結帳`,
            source: 'pos', orderType: 'pickup', pendingPickup: true,
            pickupDate: checkoutData.pickupDate, customerId: selectedCust?.id
          });
        }
      } else {
        onAddOrder({
          id: orderId, buyer: checkoutData.buyer, phone: checkoutData.phone,
          address: '', items: orderItems, prodAmt: totalNewItemsAmt, shipAmt: 0,
          discAmt: checkoutData.discAmt, actualAmt: Math.max(0, newItemsAmt),
          status: checkoutData.paymentMethod,
          note: `收銀機交易 - ${checkoutData.paymentMethod}`,
          source: 'pos', orderType: 'normal', pickupDate: dailyData.date,
          customerId: selectedCust?.id,
          deliveryMethod: '現場',
          isPickedUp: true
        });
      }
    }

    setFinalCheckModal({
      order: { id: orderId, actualAmt: grandTotal, status: checkoutData.paymentMethod } as Order,
      received: checkoutData.receivedAmt,
      change: checkoutData.paymentMethod === '現結' ? checkoutData.receivedAmt - grandTotal : 0,
      creditBalanceAfter
    });

    setCart([]);
    setLoadedOrders([]);
    setCheckoutModal(false);
    setReceivedInput('');
    setSelectedCust(null);
    setCreditError(null);
    setCheckoutData({ buyer: '現客', phone: '', discAmt: 0, paymentMethod: '現結', receivedAmt: 0, pickupDate: dailyData.date });
  };

  const handleCloseShift = () => {
    const total = Object.entries(currencyForm).reduce((sum, [val, count]) => sum + (Number(val) * (count as number)), 0);
    // 計算所有現結收入（含 POS、匯入、手動新增）
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
    // 計算所有現結收入（含 POS、匯入、手動新增）
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
    // 計算所有現結收入（含 POS、匯入、手動新增）
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
    setIsExporting(true);
    // Use a small timeout to let the UI update and the print dialog to open smoothly
    setTimeout(() => {
      window.print();
      setIsExporting(false);
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
      if (o.source === 'pos' || o.note?.includes('收銀機交易')) {
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
          .print-section, .print-section * { 
            visibility: visible; 
            font-family: serif !important;
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            color: black !important;
          }
          .print-section { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            padding: 20px; 
            margin: 0; 
          }
          .no-print, svg { display: none !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #333 !important; padding: 8px !important; }
          th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
          .font-mono { font-family: monospace !important; }
          .text-red-600 { color: #dc2626 !important; }
          .text-green-700 { color: #15803d !important; }
        }
      `}</style>
      {dailyData.cashRegister?.closeTime && !dailyData.cashRegister?.isOpen && !isEditing ? (
        <div id="cash-report-section" className="lg:col-span-12 space-y-8 animate-fade-in print-section p-8 bg-white">
          <div className="flex justify-between items-center no-print mb-6">
            <h2 className="text-2xl font-bold text-gray-800">今日收銀結報</h2>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsEditing(true)} 
                className="px-5 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" /> 編輯資料
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto space-y-10 text-gray-800">
            {/* 1. 基本營業數據 */}
            <section className="space-y-4">
              <h3 className="font-bold border-b-2 border-gray-800 pb-1 text-lg">全天銷售概況 (含 POS、匯入、手動)</h3>
              <table className="w-full border-collapse border border-gray-300 text-left">
                <tbody>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300 w-1/3">營業日</th>
                    <td className="p-3 border border-gray-300 font-mono">{dailyData.date}</td>
                  </tr>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300">營業總額</th>
                    <td className="p-3 border border-gray-300 font-mono font-bold">${fmt(dailyData.orders.reduce((sum, o) => sum + (o.prodAmt || 0) + (o.shipAmt || 0), 0))}</td>
                  </tr>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300">折扣總額</th>
                    <td className="p-3 border border-gray-300 font-mono text-red-600">-${fmt(dailyData.orders.reduce((sum, o) => sum + (o.discAmt || 0), 0))}</td>
                  </tr>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300">營業淨額</th>
                    <td className="p-3 border border-gray-300 font-mono font-bold text-lg">${fmt(dailyData.orders.reduce((sum, o) => sum + (o.actualAmt || 0), 0))}</td>
                  </tr>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300">來客數 (總筆數)</th>
                    <td className="p-3 border border-gray-300 font-mono">{dailyData.orders.length} 筆</td>
                  </tr>
                  <tr>
                    <th className="p-3 bg-gray-50 border border-gray-300">客單價 (淨額/筆數)</th>
                    <td className="p-3 border border-gray-300 font-mono">
                      ${fmt(dailyData.orders.length > 0 ? (dailyData.orders.reduce((sum, o) => sum + (o.actualAmt || 0), 0) / dailyData.orders.length) : 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 2. POS 系統數據 */}
            <section className="space-y-4">
              <h3 className="font-bold border-b-2 border-gray-800 pb-1 text-lg">ＰＯＳ結帳總額 (僅經由收銀機結帳)</h3>
              <table className="w-full border-collapse border border-gray-300 text-left">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-3 border border-gray-300">付款方式</th>
                    <th className="p-3 border border-gray-300 text-right">結帳總額</th>
                  </tr>
                </thead>
                <tbody>
                  {(settings.paymentMethods || ['現結', '匯款', '未結帳款']).map(method => {
                    const total = dailyData.orders
                      .filter(o => o.source === 'pos' && o.status === method)
                      .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
                    return (
                      <tr key={method}>
                        <td className="p-3 border border-gray-300">{method}</td>
                        <td className="p-3 border border-gray-300 text-right font-mono">${fmt(total)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-bold">
                    <td className="p-3 border border-gray-300">POS 總額小計</td>
                    <td className="p-3 border border-gray-300 text-right font-mono">
                      ${fmt(dailyData.orders.filter(o => o.source === 'pos').reduce((sum, o) => sum + (o.actualAmt || 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 3. 本日全部銷售明細 */}
            <section className="space-y-4">
              <h3 className="font-bold border-b-2 border-gray-800 pb-1 text-lg">本日銷售明細 (全天清單)</h3>
              <table className="w-full border-collapse border border-gray-300 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border border-gray-300">明細編號 (後四碼)</th>
                    <th className="p-2 border border-gray-300 text-right">金額</th>
                    <th className="p-2 border border-gray-300 text-center">付款方式</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.orders.map(o => (
                    <tr key={o.id}>
                      <td className="p-2 border border-gray-300 font-mono">...{o.id.slice(-4)}</td>
                      <td className="p-2 border border-gray-300 text-right font-mono">${fmt(o.actualAmt)}</td>
                      <td className="p-2 border border-gray-300 text-center">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* 4. 付款方式彙整 */}
            <section className="space-y-4">
              <h3 className="font-bold border-b-2 border-gray-800 pb-1 text-lg">付款方式彙整統計</h3>
              <table className="w-full border-collapse border border-gray-300 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border border-gray-300">付款方式</th>
                    <th className="p-2 border border-gray-300 text-right">交易筆數</th>
                    <th className="p-2 border border-gray-300 text-right">總金額</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(new Set(dailyData.orders.map(o => o.status))).map(method => {
                    const group = dailyData.orders.filter(o => o.status === method);
                    const total = group.reduce((sum, o) => sum + (o.actualAmt || 0), 0);
                    return (
                      <tr key={method}>
                        <td className="p-2 border border-gray-300 font-bold">{method}</td>
                        <td className="p-2 border border-gray-300 text-right">{group.length} 筆</td>
                        <td className="p-2 border border-gray-300 text-right font-mono font-bold">${fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* 5. 收銀機盤點數據 (即時計算確保報表數值一致) */}
            {(() => {
              const posCashSales = dailyData.orders
                .filter(o => (o.source === 'pos' || o.note?.includes('收銀機交易')) && o.status === '現結')
                .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
              const otherCashSales = dailyData.orders
                .filter(o => !(o.source === 'pos' || o.note?.includes('收銀機交易')) && o.status === '現結')
                .reduce((sum, o) => sum + (o.actualAmt || 0), 0);
                
              const currentCashSales = posCashSales + otherCashSales;
              const currentExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
              const currentExpected = shift.openingTotal + currentCashSales - currentExpenses;
              const currentOverShort = (shift.closingTotal || 0) - currentExpected;

              return (
                <section className="space-y-4">
                  <h3 className="font-bold border-b-2 border-gray-800 pb-1 text-lg">收銀機實體現金盤點 (Over/Short)</h3>
                  <div className="grid grid-cols-2 gap-6 border border-gray-300 p-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-500"><span>開帳現金:</span> <span className="font-mono">${fmt(shift.openingTotal)}</span></div>
                      <div className="flex justify-between text-sm"><span>+ POS 現金收入:</span> <span className="font-mono">${fmt(posCashSales)}</span></div>
                      {otherCashSales > 0 && (
                        <div className="flex justify-between text-sm text-amber-600"><span>+ 其他現結 (匯入/手動):</span> <span className="font-mono">${fmt(otherCashSales)}</span></div>
                      )}
                      {currentExpenses > 0 && (
                        <div className="flex justify-between text-sm text-red-600"><span>- 現金支出紀錄:</span> <span className="font-mono">-${fmt(currentExpenses)}</span></div>
                      )}
                      <div className="border-t-2 border-gray-800 pt-2 flex justify-between font-bold text-lg">
                        <span>應有現金金額:</span> 
                        <span className="font-mono">${fmt(currentExpected)}</span>
                      </div>
                    </div>
                    <div className="space-y-2 border-l border-gray-200 pl-6">
                      <div className="flex justify-between text-sm"><span>實際盤點金額:</span> <span className="font-mono font-bold text-lg">${fmt(shift.closingTotal || 0)}</span></div>
                      <div className={cn("flex justify-between items-center p-3 rounded-xl", currentOverShort >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase opacity-70">Over/Short</span>
                          <span className="text-xl font-bold">溢短金</span>
                        </div>
                        <span className="text-2xl font-serif-brand font-bold">
                          {currentOverShort >= 0 ? '+' : ''}{fmt(currentOverShort)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {otherCashSales > 0 && (
                    <p className="text-[10px] text-amber-600 font-bold">
                      ⚠️ 注意：應有現金包含了「非 POS 系統」產生的現結訂單。若這些款項未入收銀機，請檢查匯入清單。
                    </p>
                  )}
                </section>
              );
            })()}

            {shift.editLogs && shift.editLogs.length > 0 && (
              <div className="p-4 bg-gray-50 border border-gray-200 text-xs text-gray-500 space-y-1">
                <p className="font-bold">修改備註紀錄：</p>
                {shift.editLogs.map((log, i) => <p key={i}>• {log}</p>)}
              </div>
            )}

            <div className="flex justify-center no-print pt-10">
              <button 
                onClick={handleExportPDF}
                disabled={isExporting}
                className="px-10 py-4 bg-gray-800 text-white rounded-xl font-bold shadow-xl hover:bg-black transition-all flex items-center gap-2 disabled:opacity-70"
              >
                <FileText className="w-5 h-5" /> 匯出為 PDF 結報單
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
                {onGoToDashboard && (
                  <button 
                    onClick={onGoToDashboard}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-rose-100 transition-all border border-rose-100"
                  >
                    <Monitor className="w-4 h-4" /> 回戰情室
                  </button>
                )}
                <button
                  onClick={() => setOrderSearchModal(true)}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-100 transition-all border border-blue-100"
                >
                  <Search className="w-4 h-4" /> 查詢訂單
                </button>
                <button
                  onClick={() => { setTopupModal(true); setTopupSuccess(null); setTopupError(null); }}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                >
                  <DollarSign className="w-4 h-4" /> 儲值充值
                </button>
                <button
                  onClick={() => setCloseShiftModal(true)}
                  className="px-4 py-2 bg-coffee-800 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-coffee-900 transition-all"
                >
                  <Monitor className="w-4 h-4" /> 閉帳作業
                </button>
              </div>
            </div>

            {/* ── 銷售模式選擇器 (現場現購 vs 未來預購) ── */}
            <div className="bg-white border border-coffee-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-coffee-400">當前開單模式：</span>
                <div className="flex bg-coffee-50 p-1 rounded-xl gap-1">
                  <button
                    onClick={() => setCheckoutData(prev => ({ ...prev, pickupDate: dailyData.date }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      checkoutData.pickupDate === dailyData.date
                        ? "bg-white text-coffee-800 shadow-xs"
                        : "text-coffee-400 hover:text-coffee-600"
                    )}
                  >
                    現場取貨 (受庫存限制)
                  </button>
                  <button
                    onClick={() => {
                      if (checkoutData.pickupDate !== dailyData.date) return; // 已在預購模式，不重複切換
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      // 用本地時間格式，避免 toISOString() 的 UTC 時區偏差
                      const y = tomorrow.getFullYear();
                      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
                      const d = String(tomorrow.getDate()).padStart(2, '0');
                      const tomorrowStr = `${y}-${m}-${d}`;
                      setCheckoutData(prev => ({ ...prev, pickupDate: tomorrowStr }));
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      checkoutData.pickupDate !== dailyData.date
                        ? "bg-amber-500 text-white shadow-xs"
                        : "text-coffee-400 hover:text-coffee-600"
                    )}
                  >
                    未來預購 (無庫存上限)
                  </button>
                </div>
              </div>

              {checkoutData.pickupDate !== dailyData.date && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-amber-700">取貨日期：</label>
                  <input
                    type="date"
                    value={checkoutData.pickupDate}
                    onChange={e => setCheckoutData(prev => ({ ...prev, pickupDate: e.target.value }))}
                    className="bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1 text-xs font-bold text-amber-800 outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {allItems.map(item => {
                // ── 計算每個口味的即時可用庫存 ──────────────────────────
                const getFlavorStock = (flavorName: string): number => {
                  const norm = flavorName.trim();
                  const inv = dailyData?.inventory?.[norm] || { org: 0, act: 0 };
                  const outTotal = metrics?.inventoryOut?.[norm] || 0;
                  const lossTotal = (dailyData.losses || []).filter(l => l.flavor === norm).reduce((s, l) => s + l.qty, 0);
                  return Math.max(0, (inv.org || 0) + (inv.act || 0) - lossTotal - outTotal);
                };
                // 購物車已佔用的原料（避免超賣）
                const cartConsumed: Record<string, number> = {};
                cart.forEach(({ item: ci, qty: cq }) => {
                  if (ci.recipe) {
                    Object.entries(ci.recipe).forEach(([f, cnt]) => {
                      const n = f.trim();
                      cartConsumed[n] = (cartConsumed[n] || 0) + cq * (Number(cnt) || 0);
                    });
                  } else {
                    const n = ci.name.replace(/(\(單顆\)|單顆)/g, '').trim();
                    cartConsumed[n] = (cartConsumed[n] || 0) + cq;
                  }
                });

                // 預購模式下不受庫存限制
                const isPreorder = checkoutData.pickupDate !== dailyData.date;
                let currentStock: number;
                if (isPreorder) {
                  currentStock = 999; // 預購無上限
                } else if (item.recipe && Object.keys(item.recipe).length > 0) {
                  // 禮盒：配方每種口味最少可出幾個，取最小值
                  currentStock = Math.floor(
                    Math.min(...Object.entries(item.recipe).map(([flavor, count]) => {
                      const norm = flavor.trim();
                      return Math.floor((getFlavorStock(norm) - (cartConsumed[norm] || 0)) / (Number(count) || 1));
                    }))
                  );
                } else {
                  // 單顆：直接查庫存
                  const norm = item.name.replace(/(\(單顆\)|單顆)/g, '').trim();
                  currentStock = getFlavorStock(norm) - (cartConsumed[norm] || 0);
                }
                const isOutOfStock = currentStock <= 0;

                return (
                  <motion.button
                    whileTap={!isOutOfStock ? { scale: 0.95 } : {}}
                    key={item.id}
                    disabled={isOutOfStock}
                    onClick={() => addToCart(item)}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 bg-white border rounded-2xl shadow-sm transition-all group aspect-square text-center relative",
                      isOutOfStock ? "opacity-50 grayscale cursor-not-allowed border-gray-100" : "hover:border-rose-brand/30 hover:shadow-md border-coffee-100"
                    )}
                  >
                    <div className="text-sm font-bold text-coffee-700 group-hover:text-rose-brand transition-colors line-clamp-2 mb-2">
                      {item.name}
                    </div>
                    <div className="text-rose-brand font-mono font-bold">
                      ${fmt(item.price)}
                    </div>
                    <div className={cn("absolute bottom-2 right-2 text-[10px] font-bold px-1.5 rounded-md", isOutOfStock ? "bg-red-100 text-red-600" : isPreorder ? "bg-amber-100 text-amber-700" : "bg-mint-brand/10 text-mint-brand")}>
                      {isOutOfStock ? '補貨' : isPreorder ? '預購' : `剩 ${currentStock}`}
                    </div>
                  </motion.button>
                );
              })}
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
              {/* Loaded existing orders */}
              {loadedOrders.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest px-1">已載入當日訂單</div>
                  {loadedOrders.map(lo => {
                    // Resolve item names from order.items (Record<itemId, qty>)
                    const orderLines = Object.entries(lo.order.items || {}).map(([id, qty]) => {
                      const found = allItems.find(i => i.id === id);
                      return { name: found?.name || id, qty: Number(qty) };
                    });
                    return (
                      <div key={lo.order.id} className="p-3 bg-blue-50 border border-blue-100 rounded-2xl">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-blue-800 truncate">{lo.order.buyer || '（無姓名）'}</div>
                            <div className="text-[10px] text-blue-400 font-mono">{lo.order.phone}</div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className={cn('text-sm font-bold font-mono', lo.collectAmt === 0 ? 'text-emerald-600' : 'text-rose-brand')}>
                              {lo.collectAmt === 0 ? '$0 (免收)' : `$${fmt(lo.collectAmt)}`}
                            </div>
                            <div className="text-[10px] text-blue-400">{lo.order.status}</div>
                          </div>
                          <button
                            onClick={() => setLoadedOrders(prev => prev.filter(l => l.order.id !== lo.order.id))}
                            className="ml-2 p-1 hover:bg-blue-100 rounded-lg text-blue-300 hover:text-blue-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Item breakdown */}
                        {orderLines.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-blue-100 space-y-0.5">
                            {orderLines.map((line, i) => (
                              <div key={i} className="flex justify-between text-[11px] text-blue-600 font-medium">
                                <span className="truncate">{line.name}</span>
                                <span className="font-mono font-bold shrink-0 ml-2">× {line.qty}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cart.length > 0 && <div className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest px-1 pt-1">新增品項</div>}
                </div>
              )}

              {/* New items in cart */}
              {cart.length === 0 && loadedOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-coffee-300 space-y-2 opacity-50">
                  <ShoppingBag className="w-12 h-12" />
                  <p className="font-bold">尚無商品</p>
                  <p className="text-xs">或點擊「查詢訂單」載入既有訂單</p>
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
    
            <div className="p-4 border-t border-coffee-100 bg-white space-y-3">
              {/* Breakdown if mixed */}
              {loadedOrders.length > 0 && cart.length > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-coffee-400">
                    <span>既有訂單應收</span>
                    <span className="font-mono">${fmt(totalLoadedUnpaid)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-coffee-400">
                    <span>新增品項小計</span>
                    <span className="font-mono">${fmt(totalNewItemsAmt)}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-end">
                <div className="text-sm font-bold text-coffee-400">合計應收</div>
                <div className="text-right">
                  <div className="text-3xl font-serif-brand font-bold text-rose-brand leading-none">
                    <span className="text-sm mr-1">$</span>{fmt(totalCartAmt)}
                  </div>
                </div>
              </div>
              <button
                disabled={cart.length === 0 && loadedOrders.length === 0}
                onClick={() => setCheckoutModal(true)}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2",
                  loadedOrders.length > 0 && cart.length === 0
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                    : "bg-rose-brand text-white hover:bg-rose-600 shadow-rose-200"
                )}
              >
                {loadedOrders.length > 0 && cart.length === 0 ? '確認取貨' : '結帳收款'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Order Search Modal */}
      <AnimatePresence>
        {orderSearchModal && (
          <OrderSearchModal
            todayOrders={dailyData.orders}
            onClose={() => setOrderSearchModal(false)}
            onLoad={handleLoadOrders}
          />
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {checkoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCheckoutModal(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={cn("glass-panel w-full bg-white border-0 shadow-2xl rounded-3xl relative z-10 overflow-hidden max-h-[90vh] flex flex-col", checkoutData.paymentMethod === '現結' ? "max-w-2xl" : "max-w-md")}>
              {/* Header */}
              <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-coffee-50">
                <h3 className="text-xl font-bold text-coffee-800">
                  {loadedOrders.length > 0 && cart.length === 0 ? '確認取貨' : '結帳收款'}
                </h3>
                <button onClick={() => setCheckoutModal(false)} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
              </div>

              {/* Credit error banner */}
              {creditError && (
                <div className="mx-8 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs font-bold text-red-600">{creditError}</span>
                  <button onClick={() => setCreditError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {/* Loaded orders summary */}
              {loadedOrders.length > 0 && (
                <div className="mx-8 mt-3 p-3 bg-blue-50 rounded-xl space-y-1">
                  <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">載入訂單明細</div>
                  {loadedOrders.map(lo => (
                    <div key={lo.order.id} className="flex justify-between text-xs font-bold">
                      <span className="text-blue-700">{lo.order.buyer}</span>
                      <span className={lo.collectAmt === 0 ? 'text-emerald-600' : 'text-rose-brand font-mono'}>
                        {lo.collectAmt === 0 ? '免收' : `$${fmt(lo.collectAmt)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Body — two columns when 現結 */}
              <div className={cn("flex-1 overflow-y-auto p-8 pt-6 gap-6", checkoutData.paymentMethod === '現結' ? "grid grid-cols-2 items-start" : "flex flex-col space-y-4")}>


                {/* ── Left: form fields ── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
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
                  <CustomerAutocomplete
                    customers={customers}
                    phoneInput={checkoutData.phone}
                    setPhoneInput={phone => setCheckoutData({ ...checkoutData, phone })}
                    onSelectCustomer={c => {
                      setSelectedCust(c);
                      setCheckoutData({ ...checkoutData, buyer: c.name, phone: c.phone });
                    }}
                  />

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-coffee-400 block">付款方式</label>
                      {selectedCust && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          儲值餘額: ${fmt(selectedCust.creditBalance || 0)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {Array.from(new Set([...(settings.paymentMethods || ['現結', '匯款', '未結帳款']), '儲值金扣款'])).map(m => (
                        <button
                          key={m}
                          onClick={() => {
                            if (m === '儲值金扣款' && selectedCust) {
                              const bal = Number(selectedCust.creditBalance || 0);
                              const targetAmt = totalCartAmt - checkoutData.discAmt;
                              if (targetAmt > bal) {
                                alert(`提醒：顧客儲值餘額 ($${bal}) 小於結帳應付總計 ($${targetAmt})`);
                              }
                            }
                            setCheckoutData({...checkoutData, paymentMethod: m as any});
                          }}
                          className={cn(
                            "py-2 rounded-xl text-[11px] font-bold border transition-all truncate px-1",
                            checkoutData.paymentMethod === m
                              ? m === '儲值金扣款' ? "bg-emerald-600 border-emerald-600 text-white shadow-xs" : "bg-rose-brand border-rose-brand text-white shadow-xs"
                              : "bg-white border-coffee-100 text-coffee-500 hover:border-coffee-300"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-coffee-400 mb-1 block">取貨日期 (預設為今日)</label>
                    <input
                      type="date"
                      value={checkoutData.pickupDate}
                      onChange={e => setCheckoutData({...checkoutData, pickupDate: e.target.value})}
                      className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
                    />
                    {checkoutData.pickupDate !== dailyData.date && (
                      <p className="text-[10px] text-amber-600 mt-1 font-bold">
                        注意：這是一筆預購單！今天將只記錄現金，商品數量與營收將在取貨日認列。
                      </p>
                    )}
                  </div>

                  <div className="p-4 bg-coffee-50 rounded-2xl space-y-2">
                    <div className="flex justify-between text-sm font-bold text-coffee-500">
                      <span>商品小計</span><span className="font-mono">${fmt(totalCartAmt)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-rose-brand">
                      <span>折讓金額</span><span className="font-mono">-${fmt(checkoutData.discAmt)}</span>
                    </div>
                    <div className="h-px bg-coffee-100 my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-coffee-800">應收總金額</span>
                      <span className="text-2xl font-serif-brand font-bold text-rose-brand">${fmt(totalCartAmt - checkoutData.discAmt)}</span>
                    </div>
                  </div>

                  {/* 實收 / 找零 — only when 現結 */}
                  {checkoutData.paymentMethod === '現結' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-coffee-400 block">實收金額</label>
                      <div className="w-full bg-white border-2 border-mint-brand/40 rounded-xl px-3 py-3 text-3xl font-bold text-mint-brand shadow-inner font-mono text-center select-none min-h-[64px] flex items-center justify-center">
                        {receivedInput || <span className="text-coffee-200 text-base font-bold">— 請輸入 —</span>}
                      </div>
                      {/* Always rendered to prevent layout shift; invisible when no input */}
                      <div className={cn(
                        "p-3 bg-mint-brand/5 border border-mint-brand/10 rounded-xl flex justify-between items-center transition-all",
                        checkoutData.receivedAmt > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}>
                        <span className="text-xs text-coffee-400 font-bold">應找零</span>
                        <span className="text-xl font-serif-brand font-bold text-mint-brand">
                          ${fmt(Math.max(0, checkoutData.receivedAmt - (totalCartAmt - checkoutData.discAmt)))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Right: numeric keypad (現結 only) ── */}
                {checkoutData.paymentMethod === '現結' && (
                  <div className="flex flex-col justify-start pt-1">
                    <NumericKeypad
                      value={receivedInput}
                      onChange={(val) => {
                        setReceivedInput(val);
                        setCheckoutData({...checkoutData, receivedAmt: Number(val) || 0});
                      }}
                      dueAmount={totalCartAmt - checkoutData.discAmt}
                    />
                  </div>
                )}
              </div>

              {/* Footer: confirm button spans full width below both columns */}
              <div className="px-8 pb-8 pt-4 border-t border-coffee-50">
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
                {finalCheckModal.order.status === '儲值金扣款' && finalCheckModal.creditBalanceAfter !== undefined && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-1">
                      <div className="text-xs font-bold text-emerald-500">儲值金扣款明細</div>
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-coffee-500">扣款金額</span>
                        <span className="text-rose-brand font-mono">-${fmt(finalCheckModal.order.actualAmt)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-coffee-500">扣款後餘額</span>
                        <span className="text-emerald-700 font-mono">${fmt(finalCheckModal.creditBalanceAfter)}</span>
                      </div>
                    </div>
                  )}
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

      {/* ── Topup Modal ── */}
      <AnimatePresence>
        {topupModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTopupModal(false)} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel w-full max-w-sm bg-white border-0 shadow-2xl rounded-3xl relative z-10 overflow-hidden">
              <div className="flex justify-between items-center px-7 pt-6 pb-4 border-b border-coffee-50">
                <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-500" /> 儲值充值
                </h3>
                <button onClick={() => setTopupModal(false)} className="p-2 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5 text-coffee-400" /></button>
              </div>

              {topupSuccess ? (
                <div className="p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-coffee-800 text-lg">{topupSuccess.name}</p>
                    <p className="text-emerald-600 font-bold text-2xl font-mono mt-1">+${fmt(topupSuccess.amt)}</p>
                    <p className="text-xs text-coffee-400 mt-1">儲值後餘額：<span className="font-bold text-coffee-700">${fmt(topupSuccess.balAfter)}</span></p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-700">
                    ✓ 已記入當日收銀機帳目
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setTopupSuccess(null); }} className="flex-1 py-3 bg-coffee-100 text-coffee-700 rounded-2xl font-bold hover:bg-coffee-200 transition-all">繼續儲值</button>
                    <button onClick={() => setTopupModal(false)} className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all">完成</button>
                  </div>
                </div>
              ) : (
                <div className="p-7 space-y-4">
                  {/* Phone search */}
                  <div>
                    <label className="text-xs font-bold text-coffee-400 mb-1.5 block">搜尋顧客電話</label>
                    <input
                      type="tel"
                      value={topupPhone}
                      onChange={e => {
                        setTopupPhone(e.target.value);
                        const found = customers.find(c => c.phone === e.target.value || c.phone?.includes(e.target.value));
                        setTopupCust(e.target.value.length >= 4 && found ? found : null);
                      }}
                      placeholder="輸入電話號碼"
                      className="w-full px-4 py-3 bg-coffee-50 border border-coffee-100 rounded-xl text-sm font-bold text-coffee-700 outline-none focus:border-emerald-400"
                    />
                    {/* Live results */}
                    {topupPhone.length >= 4 && (
                      <div className="mt-1.5 space-y-1">
                        {customers.filter(c => (c.phone || '').includes(topupPhone)).slice(0, 4).map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setTopupCust(c); setTopupPhone(c.phone); }}
                            className={cn(
                              'w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all border',
                              topupCust?.id === c.id ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-coffee-100 text-coffee-700 hover:border-coffee-300'
                            )}
                          >
                            <span>{c.name}</span>
                            <span className="text-coffee-400 ml-2 font-mono">{c.phone}</span>
                            <span className="ml-2 text-emerald-600">餘額 ${fmt(c.creditBalance || 0)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {topupCust && (
                    <div className="p-3 bg-emerald-50 rounded-xl flex justify-between items-center">
                      <span className="text-sm font-bold text-emerald-800">{topupCust.name}</span>
                      <span className="text-sm font-bold text-emerald-600 font-mono">目前餘額 ${fmt(topupCust.creditBalance || 0)}</span>
                    </div>
                  )}

                  {/* Amount */}
                  <div>
                    <label className="text-xs font-bold text-coffee-400 mb-1.5 block">儲值金額</label>
                    <input
                      type="number"
                      value={topupAmt}
                      onChange={e => setTopupAmt(e.target.value)}
                      placeholder="例：500"
                      className="w-full px-4 py-3 bg-coffee-50 border border-coffee-100 rounded-xl text-xl font-bold text-emerald-700 font-mono outline-none focus:border-emerald-400"
                    />
                    {/* Quick amounts */}
                    <div className="flex gap-2 mt-2">
                      {[500, 1000, 2000, 3000].map(q => (
                        <button key={q} onClick={() => setTopupAmt(String(q))} className="flex-1 py-1.5 text-xs font-bold bg-coffee-50 border border-coffee-100 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all">
                          ${q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment method */}
                  <div>
                    <label className="text-xs font-bold text-coffee-400 mb-1.5 block">付款方式</label>
                    <div className="flex gap-2">
                      {(['現結', '匯款'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setTopupMethod(m)}
                          className={cn(
                            'flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                            topupMethod === m ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-coffee-100 text-coffee-500 hover:border-coffee-300'
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {topupError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="text-xs font-bold text-red-600">{topupError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleTopup}
                    disabled={topupLoading || !topupCust || !topupAmt}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {topupLoading ? '處理中...' : `確認儲值 ${topupAmt ? `$${fmt(Number(topupAmt))}` : ''}`}
                    {!topupLoading && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                </div>
              )}
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

/* ── On-screen Numeric Keypad ── */
function NumericKeypad({
  value,
  onChange,
  dueAmount,
}: {
  value: string;
  onChange: (v: string) => void;
  dueAmount: number;
}) {
  const press = (digit: string) => {
    if (digit === 'C') { onChange(''); return; }
    if (digit === '⌫') { onChange(value.slice(0, -1)); return; }
    // Prevent leading zeros
    const next = value === '0' ? digit : value + digit;
    onChange(next);
  };

  const quickFill = (amt: number) => onChange(String(amt));

  const dueStr = String(Math.ceil(dueAmount));
  // Round-up quick amounts
  const quickAmts = Array.from(new Set([
    dueAmount,
    Math.ceil(dueAmount / 100) * 100,
    Math.ceil(dueAmount / 500) * 500,
    Math.ceil(dueAmount / 1000) * 1000,
  ])).filter((v, i, a) => a.indexOf(v) === i && v >= dueAmount).sort((a, b) => a - b).slice(0, 4);

  const keys = ['7','8','9','4','5','6','1','2','3','0','⌫','C'];

  return (
    <div className="space-y-2">
      {/* Quick-fill buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {quickAmts.map(amt => (
          <button
            key={amt}
            type="button"
            onClick={() => quickFill(amt)}
            className="py-2 bg-mint-brand/10 border border-mint-brand/20 text-mint-brand text-xs font-bold rounded-xl hover:bg-mint-brand/20 active:scale-95 transition-all"
          >
            ${fmt(amt)}
          </button>
        ))}
      </div>
      {/* Digit grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 select-none",
              k === 'C'
                ? 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                : k === '⌫'
                ? 'bg-coffee-50 text-coffee-500 hover:bg-coffee-100'
                : 'bg-coffee-50 text-coffee-800 hover:bg-coffee-100 shadow-sm'
            )}
          >
            {k}
          </button>
        ))}
      </div>
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
                {totalExpenses > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">合計支出</span>
                    <span className="font-mono text-rose-brand">-${fmt(totalExpenses)}</span>
                  </div>
                )}
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
