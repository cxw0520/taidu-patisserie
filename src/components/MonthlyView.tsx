import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { fmt, parseNum, monthISO, uid, normalizeFlavorName } from '../lib/utils';
import { DailyReport, Settings, Order, Material } from '../types';
import { Wallet, PieChart as ChartIcon, TrendingUp, ReceiptText, Users, Home, Lightbulb, Wrench, Info, Megaphone, Trash2, Plus, X, Truck } from 'lucide-react';
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

export default function MonthlyView({ settings, shopId }: { settings: Settings, shopId: string }) {
  const [selectedMonth, setSelectedMonth] = useState(monthISO());
  const [monthData, setMonthData] = useState<DailyReport[]>([]);
  const [fixedCosts, setFixedCosts] = useState<{ id: string, label: string, amount: number }[]>([]);
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});
  const [monthlyLogisticsVal, setMonthlyLogisticsVal] = useState<number>(0);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activeTab, setActiveTab] = useState<'finance' | 'product'>('finance');
  
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

    return () => { unsubDaily(); unsubMonthly(); unsubMat(); unsubRec(); };
  }, [selectedMonth, shopId]);

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
      {/* Month Selector and Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex bg-coffee-100/50 p-1 rounded-2xl w-fit border border-coffee-100">
          <button 
            onClick={() => setActiveTab('finance')}
            className={cn("px-6 py-2.5 rounded-xl font-bold transition flex items-center gap-2", activeTab === 'finance' ? 'bg-white text-coffee-800 shadow-sm' : 'text-coffee-500 hover:text-coffee-700')}
          >
            財務報表
          </button>
          <button 
            onClick={() => setActiveTab('product')}
            className={cn("px-6 py-2.5 rounded-xl font-bold transition flex items-center gap-2", activeTab === 'product' ? 'bg-white text-coffee-800 shadow-sm' : 'text-coffee-500 hover:text-coffee-700')}
          >
            產品數據
          </button>
        </div>
        <input 
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-white border border-coffee-200 rounded-xl px-4 py-2.5 font-bold text-coffee-600 outline-none focus:border-coffee-500 transition-all shadow-sm"
        />
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
          showARModal={showARModal}
          setShowARModal={setShowARModal}
          selectedBuyer={selectedBuyer}
          setSelectedBuyer={setSelectedBuyer}
        />
      )}
      
      {activeTab === 'product' && (
        <ProductTab monthData={monthData} settings={settings} />
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

function FinanceTab({ monthData, settings, shopId, selectedMonth, fixedCosts, setFixedCosts, costOverrides, setCostOverrides, monthlyLogisticsVal, setMonthlyLogisticsVal, getRecipeCost, materials, recipes, showARModal, setShowARModal, selectedBuyer, setSelectedBuyer }: any) {
  const [showFoodCostModal, setShowFoodCostModal] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const stats = useMemo(() => {
    let salesTotal = 0;
    let discTotal = 0;
    let prTotal = 0;
    let remit = 0;
    let cash = 0;
    let ar = 0;

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

      // Daily packaging (from forms)
      Object.entries(d.packagingUsage || {}).forEach(([pkgId, qty]) => {
        const pkg = settings.packagingItems.find((p: any) => p.id === pkgId);
        if (pkg) {
          pkgUsage[pkg.name] = (pkgUsage[pkg.name] || 0) + parseNum(qty);
        }
      });

      (d.orders || []).forEach(o => {
          if (o.status === '公關品') {
            prTotal += o.prodAmt || 0;
            prShip += o.shipAmt || 0; 
          } else {
            salesTotal += o.prodAmt || 0;
            discTotal += o.discAmt || 0;
            if (o.status === '匯款') remit += o.actualAmt || 0;
            if (o.status === '現結') cash += o.actualAmt || 0;
            cash += parseNum((o as any).arCollectedCash);
            remit += parseNum((o as any).arCollectedRemit);
            if (o.status === '未結帳款' || o.status === '已收帳款') {
              const remaining = Math.max(0, parseNum(o.actualAmt) - parseNum((o as any).arCollectedCash) - parseNum((o as any).arCollectedRemit));
              ar += remaining;
            }
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
              
              // If it's specifically a gift box, we still need to track packaging separately
              const isGift = settings.giftItems.find((i: any) => i.id === itemId);
              if (isGift) {
                pkgUsage['禮盒紙盒'] = (pkgUsage['禮盒紙盒'] || 0) + qty;
                pkgUsage['小卡'] = (pkgUsage['小卡'] || 0) + qty;
              }
            } else {
              // It's a simple item - count it directly
              const normName = normalizeFlavorName(item.name);
              itemSales[normName] = (itemSales[normName] || 0) + qty;
              if (o.status === '公關品') itemPR[normName] = (itemPR[normName] || 0) + qty;
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

    const netRevenue = salesTotal - discTotal - prTotal; 
    
    // Ingredients cost sum
    // Use the breakdown sum for consistency
    const ingredCost = itemCostBreakdown.reduce((acc, cur) => acc + cur.subtotal, 0);

    const prIngredCost = Object.entries(itemPR).reduce((acc, [flavor, qty]) => acc + qty * getRecipeCost(flavor), 0);

    // Packaging cost sum
    let pkgCostTotal = 0;
    const pkgDetails = Object.entries(pkgUsage).map(([name, qty]) => {
      const mat = materials.find((m: Material) => m.name === name && m.category === '包材');
      const unitCost = mat?.avgCost || 0;
      const totalCost = qty * unitCost;
      pkgCostTotal += totalCost;
      return { name, qty, unitCost, totalCost };
    });

    const totalLogisticsCost = logSpent + monthlyLogisticsVal;
    const totalVariableCost = ingredCost + pkgCostTotal + totalLogisticsCost + lossCost;

    const prMarketingCost = prIngredCost + prShip;
    const totalFixedCostsInput = fixedCosts.reduce((acc: number, cur: any) => acc + parseNum(cur.amount), 0);
    const totalMarketingAndFixed = totalFixedCostsInput + prMarketingCost;

    const netProfit = netRevenue - totalVariableCost - totalMarketingAndFixed;

    return {
      salesTotal, discTotal, prTotal, netRevenue,
      remit, cash, ar,
      itemSales, ingredCost, itemCostBreakdown, itemPR,
      pkgDetails, pkgCostTotal,
      logSpent, lossCost, totalLogisticsCost,
      totalVariableCost,
      prIngredCost, prShip, prMarketingCost,
      totalFixedCostsInput, totalMarketingAndFixed,
      netProfit
    };
  }, [monthData, settings, getRecipeCost, materials, fixedCosts, costOverrides, monthlyLogisticsVal]);

  const updateFixedCostAmount = async (id: string, amount: number) => {
    const next = fixedCosts.map((c: any) => c.id === id ? { ...c, amount } : c);
    setFixedCosts(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      ym: selectedMonth, 
      fixedCostsList: next,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [newFixedName, setNewFixedName] = useState('');

  const confirmAddFixed = async () => {
    if (!newFixedName.trim()) {
      setIsAddingFixed(false);
      return;
    }
    const next = [...fixedCosts, { id: uid(), label: newFixedName.trim(), amount: 0 }];
    setFixedCosts(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      ym: selectedMonth, 
      fixedCostsList: next,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setNewFixedName('');
    setIsAddingFixed(false);
  };

  const removeFixedCost = async (id: string) => {
    const next = fixedCosts.filter((c: any) => c.id !== id);
    setFixedCosts(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      ym: selectedMonth, 
      fixedCostsList: next,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  const updateCostOverride = async (itemId: string, cost: number) => {
    const next = { ...costOverrides, [itemId]: cost };
    setCostOverrides(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      costOverrides: next 
    }, { merge: true });
  };

  return (
    <div className="space-y-8">
      {/* KPI Header */}
      <div className="flex flex-wrap md:flex-nowrap gap-4 items-stretch">
        <div className="flex-1 min-w-[150px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">本期淨營業額</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-coffee-800">${fmt(stats.netRevenue)}</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[150px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">本期變動成本</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.totalVariableCost)}</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">-</div>
        <div className="flex-1 min-w-[150px] kpi-card bg-white border border-coffee-50 shadow-sm flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-400 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">行銷與固定支出</span>
          <span className="text-xl md:text-2xl font-mono font-bold text-rose-brand">${fmt(stats.totalMarketingAndFixed)}</span>
        </div>
        <div className="flex items-center justify-center text-coffee-300 font-bold text-xl">=</div>
        <div className="flex-[1.2] min-w-[180px] kpi-card bg-[#faf7f2] border border-coffee-100 shadow-md flex flex-col justify-center items-center py-4 px-2">
          <span className="text-coffee-500 font-bold text-[10px] mb-1 uppercase tracking-wider text-center">本期淨利</span>
          <span className={cn("text-2xl md:text-3xl font-mono font-bold", stats.netProfit >= 0 ? "text-mint-brand" : "text-danger-brand")}>
            ${fmt(stats.netProfit)}
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
              <span className="text-coffee-600 font-bold text-sm">公關品總價值</span>
              <span className="font-mono font-bold text-coffee-500">(${fmt(stats.prTotal)})</span>
            </div>
            <div className="flex justify-between items-center bg-coffee-100/50 p-4 rounded-xl border border-coffee-200 shadow-sm mt-2">
              <span className="text-coffee-800 font-bold">本月淨營業額</span>
              <span className="font-mono font-bold text-xl">${fmt(stats.netRevenue)}</span>
            </div>

            <div className="pt-4 mt-4 border-t border-coffee-100 space-y-3">
              <h4 className="text-sm font-bold text-coffee-400 uppercase tracking-widest mb-2">金流情況</h4>
              <div className="flex justify-between items-center px-2">
                <span className="text-coffee-600 text-sm font-bold">現金收款</span>
                <span className="font-mono font-bold text-mint-brand">${fmt(stats.cash)}</span>
              </div>
              <div className="flex justify-between items-center px-2">
                <span className="text-coffee-600 text-sm font-bold">銀行匯款</span>
                <span className="font-mono font-bold text-mint-brand">${fmt(stats.remit)}</span>
              </div>
              <button 
                onClick={() => setShowARModal(true)}
                className="w-full flex justify-between items-center px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition active:scale-95 group"
              >
                <span className="text-rose-brand text-sm font-bold flex items-center gap-1">應收帳款 <Info className="w-3 h-3 group-hover:scale-110 transition"/></span>
                <span className="font-mono font-bold text-rose-brand">${fmt(stats.ar)}</span>
              </button>
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
            <button 
              onClick={() => setShowFoodCostModal(true)}
              className="w-full flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100 hover:border-coffee-300 hover:shadow-md transition active:scale-[0.98] group text-left"
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-coffee-800 font-bold flex items-center gap-2">食材成本 <Plus className="w-3 h-3 text-coffee-400 group-hover:text-coffee-600"/></span>
                <span className="font-mono font-bold text-rose-brand">${fmt(stats.ingredCost)}</span>
              </div>
              <div className="text-xs text-coffee-400 leading-tight">
                點擊查看各品項銷售與成本明細。
              </div>
            </button>

            <div className="flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <div className="flex justify-between items-center">
                <span className="text-coffee-800 font-bold">包材成本</span>
                <span className="font-mono font-bold text-rose-brand">${fmt(stats.pkgCostTotal)}</span>
              </div>
              {stats.pkgDetails.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-coffee-100 pt-2">
                  <div className="grid grid-cols-4 text-[10px] text-coffee-400 font-bold uppercase">
                    <span className="col-span-1">項目</span>
                    <span className="text-right">使用量</span>
                    <span className="text-right">單價</span>
                    <span className="text-right">總費</span>
                  </div>
                  {stats.pkgDetails.map((p, i) => (
                    <div key={i} className="grid grid-cols-4 text-xs text-coffee-600">
                      <span className="col-span-1 truncate">{p.name}</span>
                      <span className="text-right font-mono font-semibold">{p.qty}</span>
                      <span className="text-right font-mono font-semibold">${fmt(p.unitCost)}</span>
                      <span className="text-right font-mono font-bold">${fmt(p.totalCost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <div className="flex justify-between items-center">
                <span className="text-coffee-800 font-bold">物流成本</span>
                <span className="font-mono font-bold text-rose-brand">${fmt(stats.totalLogisticsCost)}</span>
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

            <div className="flex justify-between items-center p-3 bg-[#faf7f2] rounded-xl border border-coffee-100">
              <span className="text-coffee-800 font-bold">耗損成本</span>
              <span className="font-mono font-bold text-rose-brand">${fmt(stats.lossCost)}</span>
            </div>

            <div className="flex justify-between items-center bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm mt-4">
              <span className="text-rose-900 font-bold">本月變動成本</span>
              <span className="font-mono font-bold text-xl text-rose-brand">${fmt(stats.totalVariableCost)}</span>
            </div>
          </div>
        </div>

        {/* Fixed Costs */}
        <div className="glass-panel p-6 bg-white flex flex-col gap-6">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                <Home className="w-5 h-5 text-coffee-600" /> 行銷與固定成本
              </h3>
              {isAddingFixed ? (
                <div className="flex items-center gap-1">
                  <input 
                    autoFocus
                    value={newFixedName}
                    onChange={(e) => setNewFixedName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmAddFixed()}
                    placeholder="項目名稱"
                    className="text-xs border border-coffee-200 rounded px-1 py-1 outline-none w-24"
                  />
                  <button onClick={confirmAddFixed} className="text-xs bg-mint-brand text-white px-2 py-1 rounded font-bold hover:bg-mint-brand/80">
                    確認
                  </button>
                  <button onClick={() => setIsAddingFixed(false)} className="text-xs text-coffee-400 hover:text-coffee-600 px-1">
                    取消
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingFixed(true)}
                  className="text-xs bg-coffee-800 text-white px-2 py-1 rounded-md font-bold flex items-center gap-1 hover:bg-coffee-900 transition"
                >
                  <Plus className="w-3 h-3" /> 新增
                </button>
              )}
            </div>
          
          <div className="space-y-3 flex-1 flex flex-col">
            <button onClick={() => setShowPRModal(true)} className="flex justify-between items-center p-3 bg-indigo-50/50 hover:bg-indigo-50 transition rounded-xl border border-indigo-100 group text-left cursor-pointer active:scale-[0.98]">
              <div className="flex flex-col">
                <span className="text-indigo-900 font-bold text-sm flex items-center gap-1">行銷費用-公關品 <Info className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600"/></span>
                <span className="text-[10px] text-indigo-400">公關品耗材成本 + 寄出運費</span>
              </div>
              <span className="font-mono font-bold text-indigo-600">${fmt(stats.prMarketingCost)}</span>
            </button>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '250px' }}>
              {fixedCosts.map((cost: any) => (
                <div key={cost.id} className="flex justify-between items-center p-2 hover:bg-coffee-50/50 rounded-lg group transition">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => removeFixedCost(cost.id)}
                      className="opacity-0 group-hover:opacity-100 text-danger-brand p-1 hover:bg-danger-brand/10 rounded transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="text-coffee-600 text-sm font-bold">{cost.label}</span>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-coffee-300 font-mono text-xs mb-1">$</span>
                    <input 
                      type="number"
                      value={cost.amount || ''}
                      onChange={(e) => updateFixedCostAmount(cost.id, parseNum(e.target.value))}
                      className="w-20 text-right bg-transparent border-b border-coffee-200 outline-none focus:border-coffee-500 font-mono font-bold text-coffee-800"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm mt-4">
              <span className="text-rose-900 font-bold">本月行銷與固定成本</span>
              <span className="font-mono font-bold text-xl text-rose-brand">${fmt(stats.totalMarketingAndFixed)}</span>
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

function ProductTab({ monthData, settings }: any) {
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
              {sortedItems.map(item => (
                <tr key={item.id} className="hover:bg-coffee-50/30 transition">
                  <td className="px-4 py-3 font-bold text-coffee-800">{item.name}</td>
                  <td className="px-4 py-3 text-coffee-500 text-xs">
                    <span className={cn("px-2 py-1 rounded-md font-bold", item.category === 'gift' ? "bg-rose-100 text-rose-700" : "bg-coffee-100 text-coffee-700")}>
                      {item.category === 'gift' ? '禮盒' : '單顆'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-coffee-700">{item.qty}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-coffee-600">${fmt(item.rev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

