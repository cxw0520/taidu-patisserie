import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Material, Recipe, DailyUsageRec, DailyUsageItem } from '../../types';
import { fmt, uid, todayISO } from '../../lib/utils';
import { Calendar, Plus, Trash2, PieChart } from 'lucide-react';

export default function DailyUsageTab({ materials, shopId }: { materials: Material[], shopId: string }) {
  const [date, setDate] = useState(todayISO());
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [record, setRecord] = useState<DailyUsageRec | null>(null);

  // New item states
  const [itemType, setItemType] = useState<'material' | 'recipe'>('material');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState<number | ''>('');

  useEffect(() => {
    const qRec = query(collection(db, 'shops', shopId, 'recipes'));
    const unsubRec = onSnapshot(qRec, snap => {
      setRecipes(snap.docs.map(d => d.data() as Recipe));
    });
    return unsubRec;
  }, [shopId]);

  useEffect(() => {
    if (!date) return;
    const unsub = onSnapshot(doc(db, 'shops', shopId, 'dailyUsages', date), snap => {
      if (snap.exists()) {
        setRecord(snap.data() as DailyUsageRec);
      } else {
        setRecord({ id: date, date, items: [], totalValue: 0 });
      }
    });
    return unsub;
  }, [date, shopId]);

  // Recursively calculate recipe cost
  const costs = useMemo(() => {
    const memo: Record<string, number> = {};
    const getCost = (recipeId: string, visited = new Set<string>()): number => {
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
          total += getCost(item.itemId, new Set([...visited, recipeId])) * item.quantity;
        }
      }
      const unitCost = total / recipe.yield;
      memo[recipeId] = unitCost;
      return unitCost;
    };

    const costMap: Record<string, number> = {};
    recipes.forEach(r => {
      costMap[r.id] = getCost(r.id);
    });
    return costMap;
  }, [recipes, materials]);

  const handleAddItem = async () => {
    if (!record) return;
    if (!selectedItemId || qty === '' || qty <= 0) return alert('請填寫完整項目與數量');

    let unitCost = 0;
    if (itemType === 'material') {
      const mat = materials.find(m => m.id === selectedItemId);
      if (!mat) return;
      unitCost = mat.avgCost; // The cost updated via material cost tab (per stock unit)
    } else {
      unitCost = costs[selectedItemId] || 0;
    }

    const totalCost = unitCost * qty;
    
    const recipeYield = itemType === 'recipe' ? recipes.find(r => r.id === selectedItemId)?.yield : undefined;

    const newItem: DailyUsageItem = {
      id: uid(),
      type: itemType,
      itemId: selectedItemId,
      qty: qty,
      unitCost,
      totalCost,
      recipeYield
    };

    const updatedItems = [...record.items, newItem];
    const newTotal = updatedItems.reduce((acc, curr) => acc + curr.totalCost, 0);

    const updatedRecord: DailyUsageRec = {
      ...record,
      items: updatedItems,
      totalValue: newTotal
    };

    await setDoc(doc(db, 'shops', shopId, 'dailyUsages', date), updatedRecord);
    setQty('');
    setSelectedItemId('');
  };

  const removeItem = async (itemId: string) => {
    if (!record) return;
    const updatedItems = record.items.filter(i => i.id !== itemId);
    const newTotal = updatedItems.reduce((acc, curr) => acc + curr.totalCost, 0);
    const updatedRecord: DailyUsageRec = {
      ...record,
      items: updatedItems,
      totalValue: newTotal
    };
    await setDoc(doc(db, 'shops', shopId, 'dailyUsages', date), updatedRecord);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">本日使用量</h2>
          <p className="text-sm text-coffee-400">登錄每日食材使用量與配方製作份量，自動計算出今日使用價值。</p>
        </div>
        <div className="flex bg-white border border-coffee-100 rounded-2xl p-2 items-center shadow-sm">
          <Calendar className="w-5 h-5 text-coffee-400 mx-3" />
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="bg-transparent outline-none font-bold text-coffee-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 bg-[#faf7f2]/80 border shadow-md border-coffee-100 rounded-[24px]">
            <h3 className="font-bold text-coffee-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-coffee-400" /> 新增使用量
            </h3>
            
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-coffee-100/50 rounded-xl">
                <button
                  onClick={() => { setItemType('material'); setSelectedItemId(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${itemType === 'material' ? 'bg-white shadow text-coffee-800' : 'text-coffee-400 hover:text-coffee-600'}`}
                >
                  單一食材
                </button>
                <button
                  onClick={() => { setItemType('recipe'); setSelectedItemId(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${itemType === 'recipe' ? 'bg-white shadow text-coffee-800' : 'text-coffee-400 hover:text-coffee-600'}`}
                >
                  配方組合
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold text-coffee-400 block mb-1 uppercase tracking-widest">{itemType === 'material' ? '選擇食材' : '選擇現有配方'}</label>
                <select
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-3 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-500 appearance-none"
                >
                  <option value="">請選擇...</option>
                  {itemType === 'material' ? (
                    materials.map(m => <option key={m.id} value={m.id}>{m.name} (單價: ${fmt(m.avgCost)}/{m.unit})</option>)
                  ) : (
                    recipes.map(r => <option key={r.id} value={r.id}>{r.name} (一份產出 {r.yield}{r.unit}, 單價: ${fmt(costs[r.id] || 0)})</option>)
                  )}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-coffee-400 block mb-1 uppercase tracking-widest">{itemType === 'material' ? '使用量' : '製作份數'}</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={itemType === 'material' ? "輸入消耗數量..." : "輸入配方份量(可含小數)..."}
                    value={qty}
                    onChange={e => setQty(parseFloat(e.target.value) || '')}
                    className="w-full bg-white border border-coffee-200 rounded-xl px-4 py-3 font-serif-brand text-lg font-bold text-coffee-800 outline-none focus:border-coffee-500 pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-coffee-400 font-bold">
                    {itemType === 'material' ? materials.find(m => m.id === selectedItemId)?.unit || '' : '份'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-coffee-50/50 rounded-xl border border-coffee-100 flex justify-between items-center text-sm">
                <span className="font-bold text-coffee-500">預估成本</span>
                <span className="font-serif-brand font-bold text-rose-brand">
                  ${selectedItemId && qty !== '' ? (() => {
                    const unitCost = itemType === 'material'
                      ? (materials.find(m => m.id === selectedItemId)?.avgCost || 0)
                      : (costs[selectedItemId] || 0);
                    return fmt(unitCost * (qty as number));
                  })() : 0}
                </span>
              </div>

              <button
                onClick={handleAddItem}
                className="w-full bg-coffee-800 text-white rounded-xl py-3 font-bold hover:bg-coffee-900 transition flex items-center justify-center gap-2 shadow-md active:scale-95 text-sm"
              >
                加入紀錄
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 bg-white border border-coffee-50 shadow-sm rounded-[24px]">
            <div className="flex justify-between items-end mb-6 pb-4 border-b border-coffee-50">
              <h3 className="font-bold text-coffee-800 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-coffee-400" /> 今日消耗清單
              </h3>
              <div className="text-right">
                <div className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest">今日總消耗價值</div>
                <div className="text-2xl font-serif-brand font-bold text-rose-brand">${fmt(record?.totalValue || 0)}</div>
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {record?.items.map(item => {
                const name = item.type === 'material' 
                  ? materials.find(m => m.id === item.itemId)?.name || '（已刪除食材）' 
                  : recipes.find(r => r.id === item.itemId)?.name || '（已刪除配方）';
                
                const unit = item.type === 'material'
                  ? materials.find(m => m.id === item.itemId)?.unit || ''
                  : `份 (產出 ${(item.recipeYield || 1) * item.qty} ${recipes.find(r => r.id === item.itemId)?.unit || ''})`;

                return (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#faf7f2]/50 border border-coffee-100 rounded-2xl hover:bg-coffee-50/50 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${item.type === 'material' ? 'bg-mint-brand/10 text-mint-brand' : 'bg-rose-brand/10 text-rose-brand'}`}>
                          {item.type === 'material' ? '食材' : '配方'}
                        </span>
                        <span className="font-bold text-coffee-800 text-sm md:text-base">{name}</span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-coffee-400">
                        用量: <span className="font-serif-brand text-coffee-600">{item.qty}</span> {unit}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] text-coffee-400">耗用價值</div>
                        <div className="font-serif-brand font-bold text-coffee-800 text-lg">${fmt(item.totalCost)}</div>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-coffee-300 hover:text-danger-brand border border-coffee-100 hover:border-danger-brand transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(!record || record.items.length === 0) && (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-coffee-50 text-coffee-200 mb-2">
                    <PieChart className="w-8 h-8" />
                  </div>
                  <p className="text-coffee-400 font-bold text-sm">今日尚無消耗紀錄</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
