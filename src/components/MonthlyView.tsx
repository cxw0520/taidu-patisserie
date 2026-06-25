import React, { useState, useEffect, useMemo } from 'react';
import ProductAnalyticsTab from './ProductAnalyticsTab';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { fmt, parseNum, monthISO, uid, normalizeFlavorName } from '../lib/utils';
import { DailyReport, Settings, Order, Material } from '../types';
import { Wallet, PieChart as ChartIcon, TrendingUp, ReceiptText, Users, Home, Lightbulb, Wrench, Info, Megaphone, Trash2, Plus, X, Truck, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface RecipeItem {
  id: string;
  type: 'material' | 'half';
  itemId: string;
  quantity: number;
}

interface Recipe {
  id: string;
  name: string;
  type: 'finished' | 'half';
  yield: number;
  unit: string;
  items: RecipeItem[];
}

export default function MonthlyView({ settings, shopId, forcedSubTab }: { settings: Settings, shopId: string, forcedSubTab?: string }) {
  const [selectedMonth, setSelectedMonth] = useState(monthISO());
  const [monthData, setMonthData] = useState<DailyReport[]>([]);
  const [fixedCosts, setFixedCosts] = useState<{ id: string, label: string, amount: number }[]>([]);
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});
  const [monthlyLogisticsVal, setMonthlyLogisticsVal] = useState<number>(0);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [expenses, setExpenses] = useState<import('../types').ExpenseRecord[]>([]);
  const [purchases, setPurchases] = useState<import('../types').Purchase[]>([]);
  const [physicalCounts, setPhysicalCounts] = useState<import('../types').PhysicalCountRecord[]>([]);
  const [assets, setAssets] = useState<import('../types').FixedAsset[]>([]);
  const [depLog, setDepLog] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'finance' | 'product'>('finance');
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);

  useEffect(() => {
    if (forcedSubTab && ['reports', 'products'].includes(forcedSubTab)) {
      setActiveTab(forcedSubTab === 'reports' ? 'finance' : 'product');
    }
  }, [forcedSubTab]);
  
  // AR Modal State
  const [showARModal, setShowARModal] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<string | null>(null);

  useEffect(() => {
    const qDaily = query(
      collection(db, 'shops', shopId, 'daily'),
      where('date', '>=', `${selectedMonth}-01`),
      where('date', '<=', `${selectedMonth}-31`)
    );
    const unsubDaily = onSnapshot(qDaily, (snap) => {
      setMonthData(
        snap.docs.map(d => ({ ...(d.data() as DailyReport), _docId: d.id } as DailyReport))
      );
    });

    const unsubMonthly = onSnapshot(doc(db, 'shops', shopId, 'monthly', selectedMonth), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.fixedCostsList)) {
          setFixedCosts(data.fixedCostsList);
        } else {
          // Legacy migration
          setFixedCosts([
            { id: 'rent', label: '店鋪房租', amount: parseNum(data.fixed?.rent) || 0 },
            { id: 'util', label: '水電雜支', amount: parseNum(data.fixed?.util) || 0 },
            { id: 'staff', label: '人事費用', amount: parseNum(data.fixed?.staff) || 0 },
            { id: 'maint', label: '設備維修', amount: parseNum(data.fixed?.maint) || 0 },
            { id: 'misc', label: '會計雜項', amount: parseNum(data.fixed?.misc) || 0 },
            { id: 'ads', label: '行銷廣告', amount: parseNum(data.fixed?.ads) || 0 },
          ]);
        }
        if (data.costOverrides) {
          setCostOverrides(data.costOverrides);
        } else {
          setCostOverrides({});
        }
        if (data.monthlyLogisticsVal !== undefined) {
          setMonthlyLogisticsVal(data.monthlyLogisticsVal);
        } else {
          setMonthlyLogisticsVal(0);
        }
      } else {
        // Try fetching the most recent month to carry over custom fixed cost definitions
        const qMonths = query(collection(db, 'shops', shopId, 'monthly'));
        const monthSnaps = await getDocs(qMonths);
        
        let previousDefs = [
          { id: uid(), label: '店鋪房租', amount: 0 },
          { id: uid(), label: '水電雜支', amount: 0 },
          { id: uid(), label: '人事費用', amount: 0 },
          { id: uid(), label: '行銷廣告', amount: 0 },
          { id: uid(), label: '網路費', amount: 0 }
        ];

        if (!monthSnaps.empty) {
          const sorted = monthSnaps.docs.map(d => d.data()).sort((a,b) => b.ym?.localeCompare(a.ym));
          const latest = sorted[0];
          if (latest && Array.isArray(latest.fixedCostsList)) {
            // Carry over definitions but reset amounts to 0 to prevent accidental charge? 
            // The prompt says "新增後的保留紀錄下月可以不用再重新新增". 
            // It might imply keeping amounts or resetting. Let's keep amounts! Users usually have same rent.
            previousDefs = latest.fixedCostsList.map((c: any) => ({ ...c, id: uid() })); // Assign new IDs or keep same? better keep new or same. Let's keep same.
            previousDefs = latest.fixedCostsList;
          }
        }
        setFixedCosts(previousDefs);
      }
    });

    const unsubMat = onSnapshot(query(collection(db, 'shops', shopId, 'materials')), (snap) => {
      setMaterials(snap.docs.map(d => d.data() as Material));
    });

    const unsubRec = onSnapshot(query(collection(db, 'shops', shopId, 'recipes')), (snap) => {
      setRecipes(snap.docs.map(d => d.data() as Recipe));
    });

    const qExpenses = query(
      collection(db, 'shops', shopId, 'expenses'),
      where('yearMonth', '==', selectedMonth)
    );
    const unsubExpenses = onSnapshot(qExpenses, (snap) => {
      setExpenses(snap.docs.map(d => d.data() as import('../types').ExpenseRecord));
    });

    const qPurchases = query(
      collection(db, 'shops', shopId, 'purchases'),
      where('date', '>=', `${selectedMonth}-01`),
      where('date', '<=', `${selectedMonth}-31`)
    );
    const unsubPurchases = onSnapshot(qPurchases, (snap) => {
      setPurchases(snap.docs.map(d => d.data() as import('../types').Purchase));
    });

    // Need previous month count for opening balance if no specific opening balance exists
    const prevMonthDate = new Date(`${selectedMonth}-01`);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);

    const qCounts = query(
      collection(db, 'shops', shopId, 'physicalCounts'),
      where('yearMonth', 'in', [selectedMonth, prevMonthStr])
    );
    const unsubCounts = onSnapshot(qCounts, (snap) => {
      setPhysicalCounts(snap.docs.map(d => d.data() as import('../types').PhysicalCountRecord));
    });

    const unsubAssets = onSnapshot(query(collection(db, 'shops', shopId, 'assets')), (snap) => {
      setAssets(snap.docs.map(d => ({id: d.id, ...d.data()} as import('../types').FixedAsset)));
    });

    const unsubDepLog = onSnapshot(doc(db, 'shops', shopId, 'meta', 'depLog'), (snap) => {
      if (snap.exists()) setDepLog(snap.data());
    });

    return () => { unsubDaily(); unsubMonthly(); unsubMat(); unsubRec(); unsubExpenses(); unsubPurchases(); unsubCounts(); unsubAssets(); unsubDepLog(); };
  }, [selectedMonth, shopId]);

  useEffect(() => {
    if (selectedMonth === '2026-05' && monthData && monthData.length > 0) {
      console.log('--- EXPORTING ALL MAY DATA FOR DIAGNOSIS ---');
      const exportData = async () => {
        try {
          const entriesSnap = await getDocs(query(collection(db, 'shops', shopId, 'entries'), where('year', '==', 2026)));
          const entries = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const expensesSnap = await getDocs(query(collection(db, 'shops', shopId, 'expenses'), where('yearMonth', '==', '2026-05')));
          const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const purchasesSnap = await getDocs(query(collection(db, 'shops', shopId, 'purchases'), where('date', '>=', '2026-05-01'), where('date', '<=', '2026-05-31')));
          const purchases = purchasesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const coaSnap = await getDoc(doc(db, 'shops', shopId, 'meta', 'coa'));
          const coa = coaSnap.exists() ? coaSnap.data().list : [];

          const monthlySnap = await getDoc(doc(db, 'shops', shopId, 'monthly', '2026-05'));
          const monthly = monthlySnap.exists() ? monthlySnap.data() : {};

          const materialsSnap = await getDocs(collection(db, 'shops', shopId, 'materials'));
          const materials = materialsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const payload = {
            monthData,
            entries,
            expenses,
            purchases,
            coa,
            monthly,
            assets,
            materials
          };

          await fetch('http://localhost:3001/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          console.log('--- EXPORT COMPLETED SUCCESSFULLY ---');
        } catch (err) {
          console.error('Failed to export diagnostics data:', err);
        }
      };
      exportData();
    }
  }, [monthData, selectedMonth, shopId, assets]);

  // Temporary fix for voucher 26050702
  useEffect(() => {
    if (!shopId) return;
    const fixVoucher = async () => {
      try {
        const docRef = doc(db, 'shops', shopId, 'entries', '26050702');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          let needsUpdate = false;
          const nextLines = (data.lines || []).map((line: any) => {
            // 1. Change cockroach bait ($99) from 6201 (薪資支出) to 6108 (雜項支出)
            if (line.lineDescription === '殺蟑餌劑8入' && line.accountId === '6201') {
              needsUpdate = true;
              return { ...line, accountId: '6108', accountName: '雜項支出' };
            }
            // 2. Change rubber band ($25) from 5103 (運費) to 6108 (雜項支出)
            if (line.lineDescription === '橡皮筋' && line.accountId === '5103') {
              needsUpdate = true;
              return { ...line, accountId: '6108', accountName: '雜項支出' };
            }
            return line;
          });
          if (needsUpdate) {
            console.log('✏️ Fixing voucher 26050702 in Firestore...');
            await setDoc(docRef, { lines: nextLines }, { merge: true });
            console.log('✅ Voucher 26050702 fixed successfully.');
          }
        }
      } catch (err) {
        console.error('Failed to fix voucher 26050702:', err);
      }
    };
    fixVoucher();
  }, [shopId]);

  // Cost calculation function
  const getRecipeCost = useMemo(() => {
    const memo: Record<string, number> = {};
    const calculate = (recipeId: string, visited = new Set<string>()): number => {
      if (memo[recipeId] !== undefined) return memo[recipeId];
      if (visited.has(recipeId)) return 0;
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe || recipe.yield <= 0) return 0;
      
      let total = 0;
      for (const item of recipe.items) {
        if (item.type === 'material') {
          const mat = materials.find(m => m.id === item.itemId);
          total += (mat?.avgCost || 0) * item.quantity;
        } else {
          total += calculate(item.itemId, new Set([...visited, recipeId])) * item.quantity;
        }
      }
      const unitCost = total / recipe.yield;
      memo[recipeId] = unitCost;
      return unitCost;
    };
    return (nameOrItem: string | any) => {
      const name = typeof nameOrItem === 'string' ? normalizeFlavorName(nameOrItem) : normalizeFlavorName(nameOrItem.name);
      const itemId = typeof nameOrItem === 'object' ? nameOrItem.id : null;
      
      // Try finding by name (finished product)
      const recipe = recipes.find(r => (normalizeFlavorName(r.name) === name || r.id === itemId) && r.type === 'finished');
      if (recipe) return calculate(recipe.id);

      // Fallback for Gift Boxes: use their internal recipe if it exists
      const item = settings.giftItems.find(i => normalizeFlavorName(i.name) === name || i.id === itemId);
      if (item && item.recipe) {
        let total = 0;
        Object.entries(item.recipe).forEach(([flavor, qty]) => {
          total += calculateRecipeByName(flavor) * parseNum(qty);
        });
        return total;
      }
      return 0;
    };
  }, [recipes, materials, settings.giftItems]);

  const calculateRecipeByName = (name: string) => {
    const r = recipes.find(rec => normalizeFlavorName(rec.name) === normalizeFlavorName(name));
    if (!r) return 0;
    
    const memo: Record<string, number> = {};
    const calculate = (recipeId: string, visited = new Set<string>()): number => {
      if (memo[recipeId] !== undefined) return memo[recipeId];
      if (visited.has(recipeId)) return 0;
      const recipe = recipes.find(res => res.id === recipeId);
      if (!recipe || recipe.yield <= 0) return 0;
      let total = 0;
      for (const it of recipe.items) {
        if (it.type === 'material') {
          const mat = materials.find(m => m.id === it.itemId);
          total += (mat?.avgCost || 0) * it.quantity;
        } else {
          total += calculate(it.itemId, new Set([...visited, recipeId])) * it.quantity;
        }
      }
      const unit = total / recipe.yield;
      memo[recipeId] = unit;
      return unit;
    };
    return calculate(r.id);
  };

  // Rest of the UI calculation logic...
  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        
        {/* Sub-tabs hidden as they are managed by drawer */}
        <div className="flex-1"></div>

        <div className="relative w-full md:w-auto">
          <button 
            onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
            className="w-full md:w-auto bg-white border border-coffee-200 rounded-xl px-4 py-2.5 font-bold text-coffee-700 flex items-center justify-center gap-2 shadow-sm hover:border-coffee-300 transition-colors"
          >
            <Calendar className="w-5 h-5 text-coffee-400" />
            <span>{selectedMonth.split('-')[0]} 年 {parseInt(selectedMonth.split('-')[1], 10)} 月</span>
          </button>

          <AnimatePresence>
            {isMonthPickerOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-20" onClick={() => setIsMonthPickerOpen(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 mt-2 z-30 bg-white border border-coffee-100 rounded-2xl shadow-xl p-4 w-72"
                >
                  <div className="flex justify-between items-center mb-4">
                    <button 
                      onClick={() => setSelectedMonth(prev => `${parseInt(prev.split('-')[0])-1}-${prev.split('-')[1]}`)}
                      className="p-1 hover:bg-coffee-50 rounded-lg text-coffee-400"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-bold text-coffee-800">{selectedMonth.split('-')[0]} 年度</span>
                    <button 
                      onClick={() => setSelectedMonth(prev => `${parseInt(prev.split('-')[0])+1}-${prev.split('-')[1]}`)}
                      className="p-1 hover:bg-coffee-50 rounded-lg text-coffee-400"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                      const mStr = m.toString().padStart(2, '0');
                      const isActive = selectedMonth.split('-')[1] === mStr;
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedMonth(`${selectedMonth.split('-')[0]}-${mStr}`);
                            setIsMonthPickerOpen(false);
                          }}
                          className={cn(
                            "py-2 rounded-xl text-sm font-bold transition-all",
                            isActive ? "bg-coffee-600 text-white shadow-md" : "text-coffee-600 hover:bg-coffee-50"
                          )}
                        >
                          {m} 月
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {activeTab === 'finance' && (
        <FinanceTab 
          monthData={monthData} 
          settings={settings} 
          shopId={shopId} 
          selectedMonth={selectedMonth}
          fixedCosts={fixedCosts}
          setFixedCosts={setFixedCosts}
          costOverrides={costOverrides}
          setCostOverrides={setCostOverrides}
          monthlyLogisticsVal={monthlyLogisticsVal}
          setMonthlyLogisticsVal={setMonthlyLogisticsVal}
          getRecipeCost={getRecipeCost}
          materials={materials}
          recipes={recipes}
          expenses={expenses}
          purchases={purchases}
          physicalCounts={physicalCounts}
          assets={assets}
          depLog={depLog}
          showARModal={showARModal}
          setShowARModal={setShowARModal}
          selectedBuyer={selectedBuyer}
          setSelectedBuyer={setSelectedBuyer}
        />
      )}
      
      {activeTab === 'product' && (
        <ProductAnalyticsTab
          monthData={monthData}
          settings={settings}
          shopId={shopId}
          selectedMonth={selectedMonth}
        />
      )}
    </div>
  );
}

function ARReconciliationModal({ monthData, settings, shopId, onClose, selectedBuyer, setSelectedBuyer }: any) {
  const getCollected = (o: Order) => parseNum((o as any).arCollectedCash) + parseNum((o as any).arCollectedRemit);
  const getRemaining = (o: Order) => Math.max(0, parseNum(o.actualAmt) - getCollected(o));
  const [collectForm, setCollectForm] = useState<Record<string, { method: '現金' | '匯款'; amount: string }>>({});
  const itemNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    [...(settings.giftItems || []), ...(settings.singleItems || []), ...((settings.customCategories || []).flatMap((c: any) => c.items || []))]
      .forEach((item: any) => {
        map[item.id] = item.name;
      });
    return map;
  }, [settings]);
  const getDisplayItemName = (itemKey: string) => {
    const found = itemNameMap[itemKey];
    if (found) return found;
    if (/^id_[a-z0-9]+$/i.test(itemKey)) return '未知品項';
    return itemKey;
  };

  // Aggregate AR orders
  const buyerGroups = useMemo(() => {
    const groups: Record<string, { total: number, orders: (Order & { date: string; sourceDocId: string })[] }> = {};
    monthData.forEach((d: DailyReport) => {
      d.orders.forEach(o => {
        if (o.status === '未結帳款' || o.status === '已收帳款') {
          const name = o.buyer || '未知買家';
          if (!groups[name]) groups[name] = { total: 0, orders: [] };
          const remain = getRemaining(o);
          groups[name].total += remain;
          groups[name].orders.push({ ...o, date: d.date, sourceDocId: (d as any)._docId || d.date });
        }
      });
    });
    return groups;
  }, [monthData]);

  const resolveDayRef = async (sourceDocId: string, date: string) => {
    const directRef = doc(db, 'shops', shopId, 'daily', sourceDocId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return directRef;
    const normalized = date.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, (_, y, m, d) => `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`);
    const legacy = date.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, (_, y, m, d) => `${y}-${Number(m)}-${Number(d)}`);
    const normalizedRef = doc(db, 'shops', shopId, 'daily', normalized);
    const normalizedSnap = await getDoc(normalizedRef);
    if (normalizedSnap.exists()) return normalizedRef;
    if (legacy !== normalized) {
      const legacyRef = doc(db, 'shops', shopId, 'daily', legacy);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) return legacyRef;
    }
    return normalizedRef;
  };

  const collectArPayment = async (order: Order & { date: string; sourceDocId: string }) => {
    const rowKey = `${order.date}-${order.id}`;
    const method = collectForm[rowKey]?.method || '現金';
    const amount = parseNum(collectForm[rowKey]?.amount || 0);
    const remaining = getRemaining(order);
    const applyAmount = Math.min(amount, remaining);
    if (applyAmount <= 0) return;

    try {
      const dayData = monthData.find((d: any) => ((d as any)._docId || d.date) === order.sourceDocId);
      if (!dayData) return;

      const newOrders = dayData.orders.map((o: Order) => {
        if (o.id === order.id) {
          const prevCash = parseNum((o as any).arCollectedCash);
          const prevRemit = parseNum((o as any).arCollectedRemit);
          const nextCash = method === '現金' ? prevCash + applyAmount : prevCash;
          const nextRemit = method === '匯款' ? prevRemit + applyAmount : prevRemit;
          const totalCollected = nextCash + nextRemit;
          const fullyCollected = totalCollected >= parseNum(o.actualAmt);
          return {
            ...o,
            arCollectedCash: nextCash,
            arCollectedRemit: nextRemit,
            isReconciled: fullyCollected,
            status: fullyCollected ? '已收帳款' : '未結帳款'
          };
        }
        return o;
      });

      const dayRef = await resolveDayRef(order.sourceDocId, order.date);
      await setDoc(dayRef, { orders: newOrders }, { merge: true });
      setCollectForm(prev => ({
        ...prev,
        [rowKey]: { method, amount: '' }
      }));
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
      >
        <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
          <h3 className="font-bold text-coffee-800 flex items-center gap-2">
            <Info className="w-5 h-5 text-rose-brand" /> 
            {selectedBuyer ? `應收帳款紀錄 - ${selectedBuyer}` : '本月應收帳款統整'}
          </h3>
          <button onClick={selectedBuyer ? () => setSelectedBuyer(null) : onClose} className="p-1 hover:bg-coffee-200 rounded-lg text-coffee-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          {!selectedBuyer ? (
            <div className="space-y-2">
              {Object.keys(buyerGroups).length === 0 && (
                <div className="text-center py-8 text-coffee-400 font-bold">本月無應收帳款紀錄</div>
              )}
              {Object.entries(buyerGroups).map(([name, group]: [string, any]) => (
                <div 
                  key={name}
                  onClick={() => setSelectedBuyer(name)}
                  className="flex justify-between items-center p-4 bg-white border border-coffee-100 hover:border-rose-300 hover:shadow-md rounded-xl cursor-pointer transition"
                >
                  <span className="font-bold text-coffee-700">{name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-coffee-400">{group.orders.length} 筆交易</span>
                    <span className={cn("font-mono font-bold text-lg", group.total > 0 ? "text-rose-brand" : "text-mint-brand")}>
                      ${fmt(group.total)} <span className="text-xs font-sans font-normal text-coffee-400 ml-1">未收</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {buyerGroups[selectedBuyer]?.orders.map(o => {
                const rowKey = `${o.date}-${o.id}`;
                const remaining = getRemaining(o);
                const collected = getCollected(o);
                return (
                <div key={o.id} className={cn("flex justify-between items-center p-4 border rounded-xl transition", o.isReconciled ? "bg-mint-50/30 border-mint-200" : "bg-white border-rose-100")}>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-coffee-400">{o.date}</span>
                    <span className="font-bold text-coffee-800">
                      {Object.entries(o.items || {})
                        .filter(([_, q]) => parseNum(q) > 0)
                        .map(([k, q]) => `${getDisplayItemName(k)}x${q}`)
                        .join(', ')}
                    </span>
                    <span className="text-xs text-coffee-500">已收 ${fmt(collected)} / 未收 ${fmt(remaining)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg text-coffee-700 min-w-[88px] text-right">${fmt(o.actualAmt)}</span>
                    <select
                      value={collectForm[rowKey]?.method || '現金'}
                      onChange={(e) => setCollectForm(prev => ({ ...prev, [rowKey]: { method: e.target.value as '現金' | '匯款', amount: prev[rowKey]?.amount || '' } }))}
                      className="border border-coffee-200 rounded-lg px-2 py-1 text-sm font-bold text-coffee-700 bg-white"
                      disabled={remaining <= 0}
                    >
                      <option value="現金">現金</option>
                      <option value="匯款">匯款</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      value={collectForm[rowKey]?.amount || ''}
                      onChange={(e) => setCollectForm(prev => ({ ...prev, [rowKey]: { method: prev[rowKey]?.method || '現金', amount: e.target.value } }))}
                      className="w-24 text-right border border-coffee-200 rounded-lg px-2 py-1 font-mono font-bold text-coffee-800 outline-none focus:border-coffee-500"
                      placeholder="收回金額"
                      disabled={remaining <= 0}
                    />
                    <button
                      onClick={() => collectArPayment(o)}
                      disabled={remaining <= 0}
                      className="px-3 py-1.5 rounded-lg font-bold text-sm transition bg-coffee-800 text-white hover:bg-coffee-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      入帳
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function FinanceTab({ monthData, settings, shopId, selectedMonth, fixedCosts, setFixedCosts, costOverrides, setCostOverrides, monthlyLogisticsVal, setMonthlyLogisticsVal, getRecipeCost, materials, recipes, expenses, purchases, physicalCounts, assets, depLog, showARModal, setShowARModal, selectedBuyer, setSelectedBuyer }: any) {
  const [showFoodCostModal, setShowFoodCostModal] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const stats = useMemo(() => {
    let salesTotal = 0;
    let discTotal = 0;
    let prTotal = 0;
    let remit = 0;
    let cash = 0;
    let ar = 0;
    let normalShip = 0;
    let topup = 0;
    let topupCash = 0;
    let topupRemit = 0;
    let prepay = 0;
    let prepayCash = 0;
    let prepayRemit = 0;
    let preorderPay = 0;
    let prepaidPay = 0;

    let prShip = 0;
    let logSpent = 0;

    // Ingredients
    const itemSales: Record<string, number> = {};
    const itemPR: Record<string, number> = {}; 
    const itemQuantities: Record<string, number> = {}; // item.id -> total qty sold (sales + PR)

    // Spoilage
    let lossCost = 0;

    // Packaging usage
    const pkgUsage: Record<string, number> = {}; // name -> qty

    monthData.forEach((d: DailyReport) => {
      // Daily Logistics
      logSpent += parseNum(d.ar?.logSpent);
      
      // Spoilage
      (d.losses || []).forEach(loss => {
        const cost = getRecipeCost(loss.flavor);
        lossCost += cost * loss.qty;
      });

      // Daily packaging: replaced by auto-deduction from materialRecipe (see below)
      // Keep for backward compat with old packagingUsage field if present
      Object.entries(d.packagingUsage || {}).forEach(([pkgId, qty]) => {
        const pkg = settings.packagingItems.find((p: any) => p.id === pkgId);
        if (pkg) {
          pkgUsage[pkg.name] = (pkgUsage[pkg.name] || 0) + parseNum(qty);
        }
      });

      (d.orders || []).forEach(o => {
          if (o.status === '已取消' || o.status === '已刪除') return;
          
          // 1. 儲值金充值 (Topup)
          if (o.orderType === 'topup') {
            topup += parseNum(o.actualAmt);
            if (o.status === '現結') {
              topupCash += parseNum(o.actualAmt);
            } else if (o.status === '匯款') {
              topupRemit += parseNum(o.actualAmt);
            }
            return;
          }

          // 2. 預購預付款 (Prepayment)
          if (o.orderType === 'prepayment') {
            prepay += parseNum(o.actualAmt);
            if (o.status === '現結') {
              prepayCash += parseNum(o.actualAmt);
            } else if (o.status === '匯款') {
              prepayRemit += parseNum(o.actualAmt);
            }
            return;
          }

          if (o.status === '公關品') {
            prTotal += o.prodAmt || 0;
            prShip += o.shipAmt || 0; 
            return;
          }

          // 3. 銷售與付款認列
          salesTotal += o.prodAmt || 0;
          discTotal += o.discAmt || 0;
          normalShip += o.shipAmt || 0;

          if (o.orderType === 'pickup') {
            // 預定商品取貨付款
            preorderPay += (o.prodAmt - o.discAmt + o.shipAmt) || 0;
          } else {
            // 一般直接銷售
            if (o.status === '匯款') remit += o.actualAmt || 0;
            else if (o.status === '現結') cash += o.actualAmt || 0;
            else if (o.status === '儲值金扣款') prepaidPay += o.actualAmt || 0;
            else if (o.status === '未結帳款' || o.status === '已收帳款' || o.status === '已付訂金') ar += o.actualAmt || 0;
          }

        // Calculate sold items / components
        Object.entries(o.items || {}).forEach(([itemId, qtyStr]) => {
          const qty = parseNum(qtyStr);
          if (qty <= 0) return;

          // Find the item definition to see if it has a recipe
          const item = settings.singleItems.find((i: any) => i.id === itemId) || 
                       settings.giftItems.find((i: any) => i.id === itemId) ||
                       (settings.customCategories || []).flatMap(c => c.items).find((i: any) => i.id === itemId);

          if (item) {
            if (item.recipe) {
              // It's a gift or complex item with a recipe - break it down
              Object.entries(item.recipe || {}).forEach(([flavor, rQty]) => {
                const normFlavor = normalizeFlavorName(flavor);
                const vol = qty * parseNum(rQty);
                itemSales[normFlavor] = (itemSales[normFlavor] || 0) + vol;
                if (o.status === '公關品') itemPR[normFlavor] = (itemPR[normFlavor] || 0) + vol;
              });
              
            // If it's specifically a gift box, track packaging via materialRecipe (new system)
              const isGift = settings.giftItems.find((i: any) => i.id === itemId);
              if (isGift && isGift.materialRecipe) {
                Object.entries(isGift.materialRecipe).forEach(([matId, pkgQty]: [string, any]) => {
                  pkgUsage[matId] = (pkgUsage[matId] || 0) + parseNum(pkgQty) * qty;
                });
              } else if (isGift) {
                // Legacy fallback
                pkgUsage['禮盒紙盒'] = (pkgUsage['禮盒紙盒'] || 0) + qty;
                pkgUsage['小卡'] = (pkgUsage['小卡'] || 0) + qty;
              }
            } else {
              // It's a simple item - count it directly
              const normName = normalizeFlavorName(item.name);
              itemSales[normName] = (itemSales[normName] || 0) + qty;
              if (o.status === '公關品') itemPR[normName] = (itemPR[normName] || 0) + qty;

              // Track packaging via materialRecipe
              if (item.materialRecipe) {
                Object.entries(item.materialRecipe).forEach(([matId, pkgQty]: [string, any]) => {
                  pkgUsage[matId] = (pkgUsage[matId] || 0) + parseNum(pkgQty) * qty;
                });
              }
            }
          }
        });
      });
    });

    // Item Detailed Cost Breakdown (based on dessert/flavor names)
    const flavorNames = Array.from(new Set([...Object.keys(itemSales), ...Object.keys(itemPR)]));
    
    const itemCostBreakdown = flavorNames.map((name: string) => {
      const qty = (itemSales[name] || 0); // itemSales already includes both sales and PR in the loop above
      // We need an ID for costOverrides if available
      const itemDef = settings.singleItems.find((i: any) => i.name === name) || 
                      settings.giftItems.find((i: any) => i.name === name) ||
                      (settings.customCategories || []).flatMap(c => c.items).find((i: any) => i.name === name);
      
      const targetId = itemDef?.id || name;
      const unitCost = costOverrides[targetId] !== undefined ? costOverrides[targetId] : getRecipeCost(name);
      return { 
        id: targetId,
        name: name,
        qty,
        unitCost,
        subtotal: qty * unitCost
      };
    }).filter((i: any) => i.qty > 0);

    const netRevenue = salesTotal - discTotal + normalShip; 
    
    // Ingredients cost sum
    const theoreticalIngredCost = itemCostBreakdown.reduce((acc, cur) => acc + cur.subtotal, 0);

    // --- 新版成本計算邏輯 ---
    // 1. 食材與包材進貨總金額
    let materialPurchaseTotal = 0;
    let packagingPurchaseTotal = 0;
    const vendorMaterialPurchases: Record<string, number> = {};

    (purchases || []).forEach((p: any) => {
      p.lines.forEach((l: any) => {
        const mat = materials.find(m => m.id === l.materialId);
        if (mat?.category === '食材' || !mat?.category) { // 預設食材
          materialPurchaseTotal += l.amount;
          vendorMaterialPurchases[p.vendor] = (vendorMaterialPurchases[p.vendor] || 0) + l.amount;
        } else if (mat?.category === '包材') {
          packagingPurchaseTotal += l.amount;
        }
      });
    });

    // 2. 費用支出分類 (人事、食材雜支、包材雜支、固定支出、其他支出)
    let staffCost = 0;
    let otherExpenseTotal = 0;
    let totalFixedCostFromExpenses = 0;
    const fixedExpenseCategories: Record<string, number> = {};
    const miscExpenseCategories: Record<string, number> = {};

    (expenses || []).forEach((e: any) => {
      if (e.isTransfer) return;
      (e.lines || []).forEach((line: any) => {
        const cat = settings?.expenseCategories?.find((c: any) => c.id === line.categoryId);
        if (cat) {
          if (cat.name.includes('人事') || cat.name.includes('薪資') || cat.name.includes('勞保') || cat.name.includes('健保')) {
            staffCost += line.amount;
          } else if (cat.isMaterialCost || cat.name.includes('食材') || cat.name.includes('原料')) {
            materialPurchaseTotal += line.amount;
            const vendorName = e.vendor || '雜支零買';
            vendorMaterialPurchases[vendorName] = (vendorMaterialPurchases[vendorName] || 0) + line.amount;
          } else if (cat.name.includes('包材') || cat.name.includes('包裝') || cat.name.includes('貼紙') || cat.name.includes('名片')) {
            packagingPurchaseTotal += line.amount;
          } else if (cat.name.includes('運費') || cat.name.includes('物流') || cat.name.includes('宅配')) {
            logSpent += line.amount;
          } else if (cat.isFixedCost || cat.name.includes('水電') || line.note?.includes('水費') || line.note?.includes('電費')) {
            totalFixedCostFromExpenses += line.amount;
            fixedExpenseCategories[cat.name] = (fixedExpenseCategories[cat.name] || 0) + line.amount;
          } else {
            otherExpenseTotal += line.amount;
            miscExpenseCategories[cat.name] = (miscExpenseCategories[cat.name] || 0) + line.amount;
          }
        }
      });
    });

    const totalLogisticsCost = logSpent + monthlyLogisticsVal;
    
    // 變動成本 = 食材進貨 + 包材進貨 + 物流
    const totalVariableCost = materialPurchaseTotal + packagingPurchaseTotal + totalLogisticsCost;

    // 計算本月折舊
    let depreciationTotal = 0;
    const selYear = parseInt(selectedMonth.split('-')[0]);
    const selMon = parseInt(selectedMonth.split('-')[1]);
    
    assets.forEach(asset => {
      const purchaseDate = new Date(asset.purchaseDate);
      const targetDate = new Date(selYear, selMon, 0);
      const totalMonths = asset.usefulLife * 12;
      const monthlyDep = totalMonths > 0 ? (asset.totalCost - asset.residualValue) / totalMonths : 0;
      
      let monthsUsed = (targetDate.getFullYear() - purchaseDate.getFullYear()) * 12 + (targetDate.getMonth() - purchaseDate.getMonth());
      if (targetDate.getDate() < purchaseDate.getDate()) monthsUsed--;
      monthsUsed = Math.max(0, monthsUsed);
      
      const accumulated = Math.min(asset.totalCost - asset.residualValue, monthlyDep * monthsUsed);
      const bookValue = asset.totalCost - accumulated;
      
      let status = '折舊中';
      if (asset.status === '已售出') status = '停止折舊';
      else if (bookValue <= asset.residualValue || monthsUsed >= totalMonths) status = '折舊結束';
      else if (targetDate < purchaseDate) status = '尚未開始';
      
      if (status === '折舊中') {
        depreciationTotal += Math.round(monthlyDep);
      }
    });

    // 固定支出 = 支出總表的固定支出 + 本月折舊
    const totalFixedCost = totalFixedCostFromExpenses + depreciationTotal;

    // 淨利 = 營收 - 變動成本 - 人事成本 - 固定支出 - 其他雜支
    const netProfit = netRevenue - totalVariableCost - staffCost - totalFixedCost - otherExpenseTotal;

    return {
      salesTotal, discTotal, prTotal, netRevenue,
      remit, cash, ar, normalShip, topup, topupCash, topupRemit, prepay, prepayCash, prepayRemit, preorderPay, prepaidPay,
      itemSales, theoreticalIngredCost, itemCostBreakdown, itemPR,
      materialPurchaseTotal, packagingPurchaseTotal, vendorMaterialPurchases,
      logSpent, totalLogisticsCost,
      totalVariableCost,
      staffCost,
      totalFixedCostFromExpenses, depreciationTotal, totalFixedCost,
      fixedExpenseCategories,
      otherExpenseTotal, miscExpenseCategories,
      netProfit,
      selYear, selMon
    };
  }, [monthData, settings, getRecipeCost, materials, costOverrides, monthlyLogisticsVal, expenses, purchases, physicalCounts, assets]);

  const handleRecordDepreciation = async () => {
    const key = `${stats.selYear}-${stats.selMon}`;
    if (depLog[key] || stats.depreciationTotal === 0) return;

    if (!confirm(`確定要產生 ${stats.selYear}年${stats.selMon}月 的折舊傳票嗎？`)) return;

    const voucherNo = `DEP-${stats.selYear}${String(stats.selMon).padStart(2, '0')}`;
    const entry = {
      id: voucherNo,
      voucherNo,
      date: new Date(stats.selYear, stats.selMon, 0).toISOString().split('T')[0],
      year: stats.selYear,
      description: `${stats.selYear}/${stats.selMon} 固定資產折舊提列`,
      lines: [
        { id: uid(), type: 'debit', accountId: '6105', accountName: '折舊費用', amount: stats.depreciationTotal, lineDescription: '本月資產折舊' },
        { id: uid(), type: 'credit', accountId: '1402', accountName: '累計折舊', amount: stats.depreciationTotal, lineDescription: '本月資產折舊' }
      ],
      debitTotal: stats.depreciationTotal,
      creditTotal: stats.depreciationTotal
    };

    try {
      await setDoc(doc(db, 'shops', shopId, 'entries', voucherNo), entry);
      await setDoc(doc(db, 'shops', shopId, 'meta', 'depLog'), { ...depLog, [key]: true }, { merge: true });
      alert('折舊傳票產生成功！');
    } catch (err) {
      console.error(err);
      alert('產生失敗');
    }
  };

  const updateCostOverride = async (itemId: string, cost: number) => {
    const next = { ...costOverrides, [itemId]: cost };
    setCostOverrides(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      costOverrides: next 
    }, { merge: true });
  };

  const [showDiagDetails, setShowDiagDetails] = useState(false);
  const diagnostic = useMemo(() => {
    let totalShippingNormal = 0;
    let totalPrepaidRevenue = 0;
    let totalCancelledRevenue = 0;
    let totalPrepaymentAmt = 0;
    let totalPickupProdAmt = 0;

    const cancelledOrders: any[] = [];
    const prepaidOrders: any[] = [];
    const normalOrdersWithShip: any[] = [];
    const otherStatusOrders: any[] = [];
    const prepaymentOrders: any[] = [];
    const pickupOrders: any[] = [];
    const amountMismatchOrders: any[] = [];

    monthData.forEach((d: DailyReport) => {
      (d.orders || []).forEach(o => {
        if (!o) return;
        const status = o.status;
        const prodAmt = parseNum(o.prodAmt);
        const discAmt = parseNum(o.discAmt);
        const shipAmt = parseNum(o.shipAmt);
        const actualAmt = parseNum(o.actualAmt);
        const netAmt = prodAmt - discAmt;

        if (status === '公關品') {
          return;
        }

        if (status === '已取消' || status === '已刪除') {
          totalCancelledRevenue += actualAmt;
          cancelledOrders.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, netAmt, actualAmt });
          return;
        }

        if (o.orderType === 'prepayment') {
          totalPrepaymentAmt += actualAmt;
          prepaymentOrders.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, netAmt, actualAmt });
        } else if (o.orderType === 'pickup') {
          const itemVal = prodAmt - discAmt + shipAmt;
          totalPickupProdAmt += itemVal;
          pickupOrders.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, netAmt: itemVal, actualAmt });
        } else {
          // 一般直接銷售：檢查 actualAmt 是否與 prodAmt-discAmt+shipAmt 一致
          const expectedAmt = prodAmt - discAmt + shipAmt;
          if (Math.abs(actualAmt - expectedAmt) > 0 && status !== '儲值金扣款') {
            amountMismatchOrders.push({
              id: o.id, date: d.date, buyer: o.buyer || '無', status,
              prodAmt, discAmt, shipAmt,
              expectedAmt,
              actualAmt,
              diff: actualAmt - expectedAmt
            });
          }
        }

        if (status === '儲值金扣款') {
          totalPrepaidRevenue += actualAmt;
          prepaidOrders.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, netAmt, actualAmt });
        } else if (status === '匯款' || status === '現結' || status === '未結帳款' || status === '已收帳款' || status === '已付訂金') {
          if (shipAmt > 0) {
            totalShippingNormal += shipAmt;
            normalOrdersWithShip.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, shipAmt, actualAmt: parseNum(o.actualAmt) });
          }
        } else {
          otherStatusOrders.push({ id: o.id, date: d.date, buyer: o.buyer || '無', status, netAmt, actualAmt: parseNum(o.actualAmt) });
        }
      });
    });

    const netRevenue = stats.netRevenue;
    const cashRemitArSum = stats.cash + stats.remit + stats.ar + stats.prepaidPay + stats.preorderPay;
    const diff = netRevenue - cashRemitArSum;

    return {
      diff,
      netRevenue,
      cashRemitArSum,
      totalShippingNormal,
      totalPrepaidRevenue,
      totalCancelledRevenue,
      totalPrepaymentAmt,
      totalPickupProdAmt,
      cancelledOrders,
      prepaidOrders,
      normalOrdersWithShip,
      otherStatusOrders,
      prepaymentOrders,
      pickupOrders,
      amountMismatchOrders
    };
  }, [monthData, stats.netRevenue, stats.cash, stats.remit, stats.ar, stats.prepaidPay, stats.preorderPay]);

  return (
    <div className="space-y-8">
      {/* 財務對帳與差額診斷工具 - 折疊為圖示 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowDiagDetails(!showDiagDetails)}
          title="對帳與差額診斷"
          className={cn(
            "relative w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all border",
            diagnostic.diff === 0
              ? "bg-mint-50 border-mint-200 text-mint-brand hover:bg-mint-100"
              : "bg-rose-50 border-rose-200 text-rose-brand hover:bg-rose-100"
          )}
        >
          <Info className="w-5 h-5" />
          {diagnostic.diff !== 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-brand border-2 border-white" />
          )}
        </button>
      </div>

        <AnimatePresence>
          {showDiagDetails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onClick={() => setShowDiagDetails(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Modal 標題列 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-coffee-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center text-rose-brand">
                      <Info className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-coffee-800">對帳與差額診斷</h3>
                      <p className="text-[11px] text-coffee-400">比較營業淨額與金流加總的數學差額</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDiagDetails(false)}
                    className="w-8 h-8 rounded-full bg-coffee-50 hover:bg-coffee-100 flex items-center justify-center text-coffee-400 hover:text-coffee-700 transition-all font-bold text-lg"
                  >
                    ×
                  </button>
                </div>

                {/* 差額摘要 */}
                <div className="px-6 py-4 border-b border-coffee-50 grid grid-cols-3 gap-3">
                  <div className="bg-coffee-50/50 p-3 rounded-xl text-center">
                    <span className="text-[10px] text-coffee-400 font-bold block mb-1">A. 營業淨額</span>
                    <span className="text-lg font-mono font-bold text-coffee-800">${fmt(diagnostic.netRevenue)}</span>
                  </div>
                  <div className="bg-coffee-50/50 p-3 rounded-xl text-center">
                    <span className="text-[10px] text-coffee-400 font-bold block mb-1">B. 金流加總</span>
                    <span className="text-lg font-mono font-bold text-coffee-800">${fmt(diagnostic.cashRemitArSum)}</span>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${diagnostic.diff === 0 ? 'bg-mint-50' : 'bg-rose-50'}`}>
                    <span className="text-[10px] text-coffee-400 font-bold block mb-1">差額 (A－B)</span>
                    <span className={`text-lg font-mono font-bold ${diagnostic.diff === 0 ? 'text-mint-brand' : 'text-rose-brand'}`}>
                      ${fmt(diagnostic.diff)}
                    </span>
                  </div>
                </div>

                {/* 可捲動內容區 */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              <div className="bg-[#faf7f2] p-4 rounded-xl border border-coffee-100 text-sm text-coffee-700 space-y-3 leading-relaxed">
                <h4 className="font-bold text-coffee-800 text-sm">💡 為什麼會有這個差額？</h4>
                <p>
                  當前系統已將<strong>已取消與已刪除訂單完全排除</strong>在營業額外，且<strong>營業淨額 (A) 已計入運費收入</strong>。<br />
                  營業淨額 A 是以<strong>商品取貨日</strong>認列商品銷售（包含本月取貨但先前已付清的訂單，不包含本月已付款但未來才取貨的訂單）。<br />
                  而金流與付款加總 B 則是依據<strong>實際收款與扣款時間</strong>（包含本月預付但尚未取貨的訂單，不包含本月取貨但先前已預先付款的訂單）。<br />
                  因此，兩者之間的差額來源為：<strong>跨月預購與取貨的款項時間差</strong>：
                </p>
                <div className="p-3 bg-white rounded-lg border border-coffee-100 font-mono text-xs space-y-1">
                  <div className="font-bold text-coffee-800 mb-1">對帳數學公式：</div>
                  <div>營業淨額 A ＝ 各管道收款與付款加總 B + (本月預購取貨商品額) ─ (本月商品預付款)</div>
                  <div className="text-rose-brand font-bold mt-1">
                    實際對帳：
                    營業淨額 A (${fmt(diagnostic.netRevenue)}) ─ 各管道收款與付款加總 B (${fmt(diagnostic.cashRemitArSum)}) ＝ 對帳差額 (${fmt(diagnostic.diff)}) 元
                  </div>
                  <div className="text-coffee-600 mt-2 font-sans text-[11px] leading-relaxed">
                    * 註：當差額小於 0 (例如五月為 -9,940 元)，代表本月收取的商品預付款 (共計 ${fmt(diagnostic.totalPrepaymentAmt)} 元，商品未來出貨) 大於本月認列的預購取貨金額 (共計 ${fmt(diagnostic.totalPickupProdAmt)} 元，錢先前已收)，兩者差額會完全對應。
                  </div>
                </div>
              </div>

              {/* 已取消訂單 */}
              {diagnostic.cancelledOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    已取消 / 已刪除的訂單 (共計 ${fmt(diagnostic.totalCancelledRevenue)} 元，已完全排除於月報表外)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">訂單金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.cancelledOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.actualAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 未識別付款狀態的訂單 */}
              {diagnostic.otherStatusOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    未列入金流統計之其他狀態訂單 (共計 {diagnostic.otherStatusOrders.length} 筆，這會導致對帳差額)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">訂單金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.otherStatusOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.actualAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 實收金額與應收金額不符的訂單 */}
              {diagnostic.amountMismatchOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    ⚠️ 實收金額與應收金額不符的訂單 (這是對帳差額的來源！)
                  </h5>
                  <p className="text-[11px] text-coffee-500 leading-relaxed">
                    以下訂單的「實收金額(actualAmt)」與「商品金額 - 折扣 + 運費」計算結果不一致。
                    營業淨額用計算結果，金流加總用實收金額，兩者之差就是對帳差額。
                  </p>
                  <div className="overflow-x-auto border border-amber-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-amber-50 text-[10px] uppercase font-bold text-amber-500">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">商品金額</th>
                          <th className="px-4 py-2 text-right">折扣</th>
                          <th className="px-4 py-2 text-right">運費</th>
                          <th className="px-4 py-2 text-right">應收(計算值)</th>
                          <th className="px-4 py-2 text-right">實收金額</th>
                          <th className="px-4 py-2 text-right">差額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.amountMismatchOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-amber-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-bold">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono">${fmt(o.prodAmt)}</td>
                            <td className="px-4 py-2 text-right font-mono text-rose-500">-${fmt(o.discAmt)}</td>
                            <td className="px-4 py-2 text-right font-mono">+${fmt(o.shipAmt)}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold">${fmt(o.expectedAmt)}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-amber-700">${fmt(o.actualAmt)}</td>
                            <td className={`px-4 py-2 text-right font-mono font-bold ${o.diff > 0 ? 'text-mint-brand' : 'text-rose-brand'}`}>{o.diff > 0 ? '+' : ''}{fmt(o.diff)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 儲值金扣款 */}
              {diagnostic.prepaidOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    儲值金扣款訂單 (共計 ${fmt(diagnostic.totalPrepaidRevenue)} 元，已計入營業淨額，於金流中獨立核算)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">扣款金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.prepaidOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.actualAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 預購付款項目 */}
              {diagnostic.prepaymentOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    本月收到的商品預付款訂單 (共計 ${fmt(diagnostic.totalPrepaymentAmt)} 元，本月已收金流，商品於未來取貨)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">金流金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.prepaymentOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.actualAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 預購取貨項目 */}
              {diagnostic.pickupOrders.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    本月預購取貨出貨訂單 (共計 ${fmt(diagnostic.totalPickupProdAmt)} 元，本月計入商品營業淨額，金流已於先前月份預收)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">出貨商品金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.pickupOrders.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.netAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 運費項目 */}
              {diagnostic.normalOrdersWithShip.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-bold text-xs text-coffee-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    包含運費之訂單 (共計 ${fmt(diagnostic.totalShippingNormal)} 元，已納入營業淨額與實收金流中)
                  </h5>
                  <div className="overflow-x-auto border border-coffee-100 rounded-xl">
                    <table className="min-w-full text-xs text-left text-coffee-600">
                      <thead className="bg-coffee-50 text-[10px] uppercase font-bold text-coffee-400">
                        <tr>
                          <th className="px-4 py-2">日期</th>
                          <th className="px-4 py-2">訂單ID</th>
                          <th className="px-4 py-2">顧客</th>
                          <th className="px-4 py-2">付款狀態</th>
                          <th className="px-4 py-2 text-right">運費金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.normalOrdersWithShip.map((o: any) => (
                          <tr key={o.id} className="border-t border-coffee-50 bg-white">
                            <td className="px-4 py-2 font-mono">{o.date}</td>
                            <td className="px-4 py-2 font-mono truncate max-w-[120px]">{o.id}</td>
                            <td className="px-4 py-2">{o.buyer}</td>
                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold">{o.status}</span></td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">${fmt(o.shipAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* KPI Header */}
      <div className="flex flex-wrap md:flex-nowrap gap-2 items-stretch">
        <div className="flex-1 min-w-[120px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">本期淨營業額</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-coffee-800">${fmt(stats.netRevenue)}</span>
          <span className="text-xs text-transparent mt-1">100%</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[120px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">變動成本</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.totalVariableCost)}</span>
          <span className="text-xs font-bold text-coffee-400 mt-1">{stats.netRevenue > 0 ? ((stats.totalVariableCost / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[120px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">人事成本</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.staffCost)}</span>
          <span className="text-xs font-bold text-coffee-400 mt-1">{stats.netRevenue > 0 ? ((stats.staffCost / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[120px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">固定支出</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.totalFixedCost)}</span>
          <span className="text-xs font-bold text-coffee-400 mt-1">{stats.netRevenue > 0 ? ((stats.totalFixedCost / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[120px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">其他營業雜支</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.otherExpenseTotal)}</span>
          <span className="text-xs font-bold text-coffee-400 mt-1">{stats.netRevenue > 0 ? ((stats.otherExpenseTotal / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">=</div>
        <div className="flex-[1.2] min-w-[140px] kpi-card bg-[#faf7f2] border border-coffee-100 shadow-md flex flex-col justify-center items-center py-4 px-2 relative overflow-hidden">
          <span className="text-coffee-500 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">本期淨利</span>
          <span className={cn("text-2xl md:text-3xl font-mono font-bold", stats.netProfit >= 0 ? "text-mint-brand" : "text-danger-brand")}>
            ${fmt(stats.netProfit)}
          </span>
          <span className={cn("text-xs font-bold mt-1", stats.netProfit >= 0 ? "text-mint-600" : "text-danger-600")}>
            {stats.netRevenue > 0 ? ((stats.netProfit / stats.netRevenue) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Overview */}
        <div className="glass-panel p-6 bg-white flex flex-col gap-6">
          <div className="border-b-2 border-coffee-800 pb-3">
            <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2 tracking-wider">
              <Wallet className="w-5 h-5 text-coffee-600" /> 營收概況
            </h3>
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="flex justify-between items-center bg-coffee-50/50 p-3 rounded-xl border border-coffee-50">
              <span className="text-coffee-600 font-bold text-sm">售出產品總價值</span>
              <span className="font-mono font-bold">${fmt(stats.salesTotal)}</span>
            </div>
            <div className="flex justify-between items-center bg-coffee-50/50 p-3 rounded-xl border border-coffee-50">
              <span className="text-coffee-600 font-bold text-sm">折讓總金額</span>
              <span className="font-mono font-bold text-rose-brand">-${fmt(stats.discTotal)}</span>
            </div>
            <div className="flex justify-between items-center bg-coffee-50/50 p-3 rounded-xl border border-coffee-50">
              <span className="text-coffee-600 font-bold text-sm">運費收入總額</span>
              <span className="font-mono font-bold">${fmt(stats.normalShip)}</span>
            </div>
            <div className="flex justify-between items-center bg-coffee-50/50 p-3 rounded-xl border border-coffee-50">
              <span className="text-coffee-600 font-bold text-sm">公關品總價值</span>
              <span className="font-mono font-bold text-coffee-500">(${fmt(stats.prTotal)})</span>
            </div>
            <div className="flex justify-between items-center bg-coffee-100/50 p-4 rounded-xl border border-coffee-200 shadow-sm mt-2">
              <span className="text-coffee-800 font-bold">本月淨營業額 (含運費)</span>
              <span className="font-mono font-bold text-xl">${fmt(stats.netRevenue)}</span>
            </div>

            <div className="pt-4 mt-4 border-t border-coffee-100 space-y-3">
              <h4 className="text-sm font-bold text-coffee-400 uppercase tracking-widest mb-2">營業淨額組成 (不含儲值/預購)</h4>
              <div className="flex justify-between items-center px-2">
                <span className="text-coffee-600 text-sm font-bold">現金收入 (現結)</span>
                <span className="font-mono font-bold text-mint-brand">${fmt(stats.cash)}</span>
              </div>
              <div className="flex justify-between items-center px-2">
                <span className="text-coffee-600 text-sm font-bold">匯款收入 (匯款)</span>
                <span className="font-mono font-bold text-mint-brand">${fmt(stats.remit)}</span>
              </div>
              <button 
                onClick={() => setShowARModal(true)}
                className="w-full flex justify-between items-center px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition active:scale-95 group"
              >
                <span className="text-rose-brand text-sm font-bold flex items-center gap-1">應收帳款 <Info className="w-3 h-3 group-hover:scale-110 transition"/></span>
                <span className="font-mono font-bold text-rose-brand">${fmt(stats.ar)}</span>
              </button>
              <div className="flex justify-between items-center px-2">
                <span className="text-coffee-600 text-sm font-bold">儲值金付款</span>
                <span className="font-mono font-bold text-emerald-600">${fmt(stats.prepaidPay)}</span>
              </div>
              <div className="flex justify-between items-center px-2 border-t border-dashed border-coffee-100 pt-2">
                <span className="text-coffee-600 text-sm font-bold">預定金付款 (預購取貨)</span>
                <span className="font-mono font-bold text-blue-600">${fmt(stats.preorderPay)}</span>
              </div>
              <div className="text-[10px] text-coffee-400 text-right font-semibold italic">↳ 以上五項加總即為營業淨額</div>

              <h4 className="text-sm font-bold text-coffee-400 uppercase tracking-widest mb-2 pt-2 border-t border-coffee-50">儲值金充值 (金流獨立)</h4>
              <div className="flex justify-between items-center px-2 text-xs text-coffee-600">
                <span>現金儲值</span>
                <span className="font-mono font-semibold">${fmt(stats.topupCash)}</span>
              </div>
              <div className="flex justify-between items-center px-2 text-xs text-coffee-600">
                <span>匯款儲值</span>
                <span className="font-mono font-semibold">${fmt(stats.topupRemit)}</span>
              </div>
              <div className="flex justify-between items-center px-2 font-bold text-emerald-600 border-t border-dashed border-coffee-100 pt-2">
                <span>儲值金充值總額</span>
                <span className="font-mono">${fmt(stats.topup)}</span>
              </div>

              <h4 className="text-sm font-bold text-coffee-400 uppercase tracking-widest mb-2 pt-2 border-t border-coffee-50">預購預付款 (金流獨立)</h4>
              <div className="flex justify-between items-center px-2 text-xs text-coffee-600">
                <span>現金預收</span>
                <span className="font-mono font-semibold">${fmt(stats.prepayCash)}</span>
              </div>
              <div className="flex justify-between items-center px-2 text-xs text-coffee-600">
                <span>匯款預收</span>
                <span className="font-mono font-semibold">${fmt(stats.prepayRemit)}</span>
              </div>
              <div className="flex justify-between items-center px-2 font-bold text-blue-600 border-t border-dashed border-coffee-100 pt-2">
                <span>預購預付金總額</span>
                <span className="font-mono">${fmt(stats.prepay)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Variable Costs */}
        <div className="glass-panel p-6 bg-white flex flex-col gap-6">
          <div className="border-b-2 border-coffee-800 pb-3">
            <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2 tracking-wider">
              <ChartIcon className="w-5 h-5 text-coffee-600" /> 營業變動成本
            </h3>
          </div>
          
          <div className="space-y-4 flex-1">
            {/* 食材進貨 */}
            <div className="flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <div className="flex justify-between items-center">
                <span className="text-coffee-800 font-bold flex items-center gap-2">食材進貨總計</span>
                <div className="flex flex-col items-end">
                  <span className="font-mono font-bold text-rose-brand">${fmt(stats.materialPurchaseTotal)}</span>
                  <span className="text-xs text-coffee-400">{stats.netRevenue > 0 ? ((stats.materialPurchaseTotal / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
              {Object.keys(stats.vendorMaterialPurchases).length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-coffee-100 pt-2">
                  <div className="grid grid-cols-2 text-[10px] text-coffee-400 font-bold uppercase mb-1">
                    <span>廠商</span>
                    <span className="text-right">進貨金額</span>
                  </div>
                  {Object.entries(stats.vendorMaterialPurchases).map(([vendor, amt], i) => (
                    <div key={i} className="grid grid-cols-2 text-xs text-coffee-600">
                      <span className="truncate">{vendor}</span>
                      <span className="text-right font-mono font-semibold">${fmt(amt as number)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 包材進貨 */}
            <div className="flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <div className="flex justify-between items-center">
                <span className="text-coffee-800 font-bold">包材進貨總計</span>
                <div className="flex flex-col items-end">
                  <span className="font-mono font-bold text-rose-brand">${fmt(stats.packagingPurchaseTotal)}</span>
                  <span className="text-xs text-coffee-400">{stats.netRevenue > 0 ? ((stats.packagingPurchaseTotal / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            </div>

            {/* 物流成本 */}
            <div className="flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <div className="flex justify-between items-center">
                <span className="text-coffee-800 font-bold">物流成本總計</span>
                <div className="flex flex-col items-end">
                  <span className="font-mono font-bold text-rose-brand">${fmt(stats.totalLogisticsCost)}</span>
                  <span className="text-xs text-coffee-400">{stats.netRevenue > 0 ? ((stats.totalLogisticsCost / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-2 border-t border-coffee-100 pt-2 text-sm">
                <div className="flex justify-between items-center text-coffee-600">
                   <span className="font-bold flex items-center gap-1"><Truck className="w-3 h-3"/>物流月結金額</span>
                   <div className="flex items-center gap-1">
                     <span className="text-xs font-mono">$</span>
                     <input 
                       type="number"
                       value={monthlyLogisticsVal || ''}
                       onChange={async e => {
                          const val = parseNum(e.target.value);
                          setMonthlyLogisticsVal(val);
                          await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { monthlyLogisticsVal: val }, { merge: true });
                       }}
                       className="w-20 text-right bg-white border border-coffee-200 rounded px-1 py-0.5 outline-none font-mono font-bold text-coffee-800 focus:border-coffee-500"
                     />
                   </div>
                </div>
                <div className="flex justify-between items-center text-coffee-600">
                   <span className="font-bold text-xs pl-4">日報表運費實支</span>
                   <span className="font-mono font-bold">${fmt(stats.logSpent)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm mt-4">
              <span className="text-rose-900 font-bold">本月變動成本</span>
              <span className="font-mono font-bold text-xl text-rose-brand">${fmt(stats.totalVariableCost)}</span>
            </div>
          </div>
        </div>

        {/* Staff Costs */}
        <div className="glass-panel p-6 bg-white flex flex-col gap-6">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-coffee-600" /> 人事成本
              </h3>
            </div>
            <div className="space-y-4 flex-1">
              <div className="flex flex-col gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-blue-900 font-bold">人事與薪資總額</span>
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-bold text-rose-brand text-lg">${fmt(stats.staffCost)}</span>
                    <span className="text-xs font-bold text-blue-400">{stats.netRevenue > 0 ? ((stats.staffCost / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
                <div className="text-xs text-blue-500 font-bold border-t border-blue-100 pt-2 mt-1">
                  💡 系統已自動將您當月分類為「人事、薪資、勞健保」的支出加總於此。
                </div>
              </div>
            </div>
        </div>

        {/* Fixed Costs */}
        <div className="glass-panel p-6 bg-white flex flex-col gap-6">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                <Home className="w-5 h-5 text-coffee-600" /> 固定支出與營業雜支
              </h3>
            </div>
          
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '350px' }}>
              
              {/* 固定支出分類 */}
              {Object.keys(stats.fixedExpenseCategories).length > 0 && (
                <div className="pt-3 pb-1 mt-2">
                  <span className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest bg-coffee-100 px-2 py-0.5 rounded-full">設定為「固定支出」的項目</span>
                </div>
              )}
              {Object.entries(stats.fixedExpenseCategories).map(([catName, amt]) => (
                <div key={catName} className="flex justify-between items-center p-2 bg-gray-50/50 rounded-lg border border-gray-100 mt-1">
                  <span className="text-coffee-600 text-sm font-bold pl-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300"></span>{catName}
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-bold text-coffee-800">${fmt(amt as number)}</span>
                    <span className="text-[10px] text-coffee-400 font-bold">{stats.netRevenue > 0 ? (((amt as number) / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
              ))}
              
              <div className="flex justify-between items-center p-2 bg-gray-50/50 rounded-lg border border-gray-100 mt-1">
                <span className="text-coffee-600 text-sm font-bold pl-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span>本月設備折舊攤提
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono font-bold text-coffee-800">${fmt(stats.depreciationTotal)}</span>
                  <button 
                    onClick={handleRecordDepreciation} 
                    disabled={depLog[`${stats.selYear}-${stats.selMon}`] || stats.depreciationTotal === 0} 
                    className={cn("text-[10px] px-2 py-0.5 rounded font-bold transition",
                      depLog[`${stats.selYear}-${stats.selMon}`] ? "bg-green-100 text-green-700 cursor-not-allowed" : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    )}
                  >
                    {depLog[`${stats.selYear}-${stats.selMon}`] ? '已產生折舊傳票' : '產生本月折舊傳票'}
                  </button>
                </div>
              </div>

              {/* 自動加總的其他雜支分類 */}
              {Object.keys(stats.miscExpenseCategories).length > 0 && (
                <div className="pt-3 pb-1 mt-2">
                  <span className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest bg-coffee-100 px-2 py-0.5 rounded-full">其他營業雜支</span>
                </div>
              )}
              {Object.entries(stats.miscExpenseCategories).map(([catName, amt]) => (
                <div key={catName} className="flex justify-between items-center p-2 bg-gray-50/50 rounded-lg border border-gray-100 mt-1">
                  <span className="text-coffee-600 text-sm font-bold pl-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-coffee-300"></span>{catName}
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-bold text-coffee-800">${fmt(amt as number)}</span>
                    <span className="text-[10px] text-coffee-400 font-bold">{stats.netRevenue > 0 ? (((amt as number) / stats.netRevenue) * 100).toFixed(1) : 0}%</span>
                  </div>
                </div>
              ))}

            </div>

            <div className="flex justify-between items-center bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm mt-4">
              <span className="text-rose-900 font-bold">本月固定支出</span>
              <span className="font-mono font-bold text-xl text-rose-brand">${fmt(stats.totalFixedCost)}</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showARModal && (
          <ARReconciliationModal 
            monthData={monthData} 
            settings={settings}
            shopId={shopId} 
            onClose={() => { setShowARModal(false); setSelectedBuyer(null); }}
            selectedBuyer={selectedBuyer}
            setSelectedBuyer={setSelectedBuyer}
          />
        )}
        {showFoodCostModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden h-[80vh]"
             >
               <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
                 <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                   <TrendingUp className="w-5 h-5 text-rose-brand" /> 
                   食材成本明細
                 </h3>
                 <button onClick={() => setShowFoodCostModal(false)} className="p-1 hover:bg-coffee-200 rounded-lg text-coffee-500 transition">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto">
                 <table className="w-full text-sm text-left border-collapse">
                   <thead className="bg-[#faf7f2] text-coffee-500 font-bold text-xs sticky top-0 z-10 shadow-sm">
                     <tr>
                       <th className="px-6 py-4 border-b border-coffee-100">品項名稱</th>
                       <th className="px-6 py-4 border-b border-coffee-100 text-center">銷售數量</th>
                       <th className="px-6 py-4 border-b border-coffee-100 text-right">單件成本</th>
                       <th className="px-6 py-4 border-b border-coffee-100 text-right">小計</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-coffee-50">
                     {stats.itemCostBreakdown.map((item: any) => (
                       <tr key={item.id} className="hover:bg-coffee-50/30 transition">
                         <td className="px-6 py-4 font-bold text-coffee-800">{item.name}</td>
                         <td className="px-6 py-4 text-center font-mono font-semibold">{item.qty}</td>
                         <td className="px-6 py-4 text-right">
                           <div className="flex flex-col items-end gap-2">
                              <select 
                                className="text-[10px] bg-coffee-50 border border-coffee-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-rose-brand max-w-[120px] font-sans"
                                value={recipes.find(r => r.name === item.name && r.type === 'finished')?.id || ''}
                                onChange={(e) => {
                                  const r = recipes.find(rec => rec.id === e.target.value);
                                  if (r) {
                                    updateCostOverride(item.id, getRecipeCost(r));
                                  }
                                }}
                              >
                                <option value="">選擇成品配方...</option>
                                {recipes.filter(r => r.type === 'finished').map(r => (
                                  <option key={r.id} value={r.id}>{r.name} (${fmt(getRecipeCost(r))})</option>
                                ))}
                              </select>
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-[10px] text-coffee-300 font-mono font-bold">$</span>
                                <input 
                                  type="number"
                                  value={item.unitCost || ''}
                                  onChange={(e) => updateCostOverride(item.id, parseNum(e.target.value))}
                                  className="w-16 text-right bg-transparent border-b border-coffee-200 focus:border-coffee-500 outline-none font-mono font-bold text-coffee-700"
                                />
                              </div>
                            </div>
                          </td>
                         <td className="px-6 py-4 text-right font-mono font-bold text-coffee-900">${fmt(item.subtotal)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 {stats.itemCostBreakdown.length === 0 && (
                   <div className="text-center py-20 text-coffee-400 font-bold">本月尚無銷售資料</div>
                 )}
               </div>
               
               <div className="p-6 border-t border-coffee-100 bg-white">
                 <div className="flex justify-between items-center">
                   <span className="text-lg font-bold text-coffee-800">總計</span>
                   <span className="text-2xl font-mono font-bold text-rose-brand">${fmt(stats.ingredCost)}</span>
                 </div>
               </div>
             </motion.div>
           </div>
        )}
        {showPRModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[80vh]"
             >
               <div className="flex justify-between items-center p-4 border-b border-indigo-100 bg-indigo-50/50">
                 <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                   <Info className="w-5 h-5 text-indigo-600" /> 
                   公關品費用明細
                 </h3>
                 <button onClick={() => setShowPRModal(false)} className="p-1 hover:bg-indigo-200 rounded-lg text-indigo-500 transition">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 <div className="space-y-2">
                   <h4 className="text-sm font-bold text-indigo-800 border-b border-indigo-100 pb-1">公關品口味成本清單</h4>
                   {Object.entries(stats.itemPR).length > 0 ? (
                     <table className="w-full text-sm text-left">
                       <thead className="text-indigo-400 text-xs uppercase font-bold">
                         <tr><th>口味名稱</th><th className="text-right">數量</th><th className="text-right">小計</th></tr>
                       </thead>
                       <tbody className="divide-y divide-indigo-50/50">
                         {Object.entries(stats.itemPR).filter(([_, q]) => (q as number) > 0).map(([flavor, qty]) => {
                           const cost = getRecipeCost(flavor) || 0;
                           return (
                             <tr key={flavor} className="text-indigo-800">
                               <td className="py-2">{flavor}</td>
                               <td className="py-2 text-right font-mono font-bold">{qty as number}</td>
                               <td className="py-2 text-right font-mono font-bold text-indigo-600">${fmt((qty as number) * cost)}</td>
                             </tr>
                           );
                         })}
                       </tbody>
                     </table>
                   ) : (
                     <div className="text-xs text-indigo-400 py-2 italic">本月無公關品送出</div>
                   )}
                 </div>
               </div>
               
               <div className="p-4 border-t border-indigo-100 bg-indigo-50/30 flex flex-col gap-2 shadow-inner">
                 <div className="flex justify-between items-center text-sm">
                   <span className="font-bold text-indigo-800">公關品硬體成本</span>
                   <span className="font-mono font-bold text-indigo-600">${fmt(stats.prIngredCost)}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="font-bold text-indigo-800">送出運費總額</span>
                   <span className="font-mono font-bold text-indigo-600">${fmt(stats.prShip)}</span>
                 </div>
                 <div className="h-px bg-indigo-200 my-1"></div>
                 <div className="flex justify-between items-center">
                   <span className="text-lg font-bold text-indigo-900">總計</span>
                   <span className="text-2xl font-mono font-bold text-indigo-700">${fmt(stats.prMarketingCost)}</span>
                 </div>
               </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ProductTab replaced by ProductAnalyticsTab (see ProductAnalyticsTab.tsx)
function _ProductTab_UNUSED({ monthData, settings }: any) {
  const productStats = useMemo(() => {
    const stats: Record<string, { qty: number, rev: number, category: string }> = {};

    const allItems = [
      ...settings.giftItems, 
      ...settings.singleItems, 
      ...(settings.customCategories || []).flatMap(c => c.items)
    ];

    allItems.forEach((item: any) => {
      stats[item.id] = { qty: 0, rev: 0, category: item.category || 'single' };
    });

    monthData.forEach((d: DailyReport) => {
      d.orders.forEach(o => {
        if (o.status === '公關品') return; 
        
        Object.entries(o.items || {}).forEach(([itemId, qtyStr]) => {
          const qty = parseNum(qtyStr);
          if (qty <= 0) return;
          
          if (stats[itemId]) {
            stats[itemId].qty += qty;
            const item = allItems.find((i:any) => i.id === itemId);
            if (item) {
              stats[itemId].rev += qty * (item.price || 0);
            }
          }
        });
      });
    });

    return stats;
  }, [monthData, settings]);

  const allItems = [
    ...settings.giftItems, 
    ...settings.singleItems, 
    ...(settings.customCategories || []).flatMap(c => c.items)
  ];

  const sortedItems = Object.entries(productStats)
    .sort((a: [string, any],b: [string, any]) => b[1].qty - a[1].qty)
    .map(([id, stat]: [string, any]) => {
      const item = allItems.find((i:any) => i.id === id);
      return { id, name: item?.name || '未知', ...stat };
    })
    .filter((stat: any) => stat.qty > 0);

  return (
    <div className="glass-panel p-6 bg-white space-y-6">
      <div className="border-b-2 border-coffee-800 pb-3">
        <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2 tracking-wider">
          <ChartIcon className="w-5 h-5 text-coffee-600" /> 產品銷售數據 (不含公關品)
        </h3>
      </div>
      
      {sortedItems.length === 0 ? (
        <div className="text-center text-coffee-400 py-10 font-bold border border-dashed border-coffee-200 rounded-xl bg-[#faf7f2]">
          本月尚無產品銷售資料
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#faf7f2] text-coffee-400 font-bold tracking-widest uppercase text-xs">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">產品名稱按銷售量排序</th>
                <th className="px-4 py-3">分類</th>
                <th className="px-4 py-3 text-right">銷售數量</th>
                <th className="px-4 py-3 text-right rounded-r-xl">預估創造營收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede8]">
              {sortedItems.map(item => {
                const isGift = item.category === 'gift' || settings.giftItems?.some((g: any) => g.id === item.id);
                return (
                  <tr key={item.id} className="hover:bg-coffee-50/30 transition">
                    <td className="px-4 py-3 font-bold text-coffee-800">{item.name}</td>
                    <td className="px-4 py-3 text-coffee-500 text-xs">
                      <span className={cn("px-2 py-1 rounded-md font-bold", isGift ? "bg-rose-100 text-rose-700" : "bg-coffee-100 text-coffee-700")}>
                        {isGift ? '禮盒' : '單顆'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-coffee-700">{item.qty}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-coffee-600">${fmt(item.rev)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

