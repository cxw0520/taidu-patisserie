import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Material, Purchase, InventoryAdj } from '../types';
import { Package, ShoppingCart, Target, Menu, X, Calculator, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import PurchasingTab from './inventory/PurchasingTab';
import StockTab from './inventory/StockTab';
import MaterialCostTab from './inventory/MaterialCostTab';
import DailyUsageTab from './inventory/DailyUsageTab';

type SubTab = 'purchases' | 'stock' | 'material_cost' | 'daily_usage';

export default function InventoryView({ selectedYear, shopId }: { selectedYear: number, shopId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('purchases');
  const [isMobileSubTabOpen, setIsMobileSubTabOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shops', shopId, 'materials'), (snap) => {
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as Material)));
    });
    return unsub;
  }, [shopId]);

  useEffect(() => {
    // For analytical purpose, we load the selected year purchases.
    const q = query(
      collection(db, 'shops', shopId, 'purchases'),
      where('year', '==', selectedYear)
    );
    const unsub = onSnapshot(q, (snap) => {
      const p = snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase));
      p.sort((a, b) => b.date.localeCompare(a.date)); // descending date is handled client-side if needed, actually b.date.localeCompare(a.date) is desc
      setPurchases(p);
    });
    return unsub;
  }, [selectedYear, shopId]);

  const subTabs = [
    { id: 'purchases', label: '進貨管理', icon: ShoppingCart },
    { id: 'stock', label: '庫存與盤點', icon: Target },
    { id: 'material_cost', label: '食材成本', icon: Calculator },
    { id: 'daily_usage', label: '本日使用量', icon: Calendar },
  ];

  return (
    <div className="space-y-8 h-full flex flex-col">
      <div className="flex justify-center items-center">
        <div className="w-full md:w-auto relative">
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileSubTabOpen(v => !v)}
              className="w-full bg-white/80 border border-coffee-100 rounded-xl px-4 py-2.5 font-bold text-coffee-700 flex items-center justify-between"
            >
              <span>{subTabs.find(t => t.id === activeSubTab)?.label}</span>
              {isMobileSubTabOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {isMobileSubTabOpen && (
              <div className="absolute z-20 mt-2 w-full bg-white border border-coffee-100 rounded-xl shadow-lg overflow-hidden">
                {subTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveSubTab(tab.id as SubTab); setIsMobileSubTabOpen(false); }}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm font-bold border-b border-coffee-50 last:border-b-0 flex items-center gap-2",
                      activeSubTab === tab.id ? "bg-coffee-50 text-coffee-700" : "text-coffee-500"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="hidden md:flex bg-white/50 backdrop-blur-sm p-1.5 rounded-[24px] border border-coffee-50 shadow-inner overflow-x-auto no-scrollbar max-w-full">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as SubTab)}
                className={cn(
                  "px-8 py-3 rounded-2xl transition-all duration-500 font-bold flex items-center gap-2 text-sm whitespace-nowrap",
                  activeSubTab === tab.id 
                    ? "bg-coffee-600 text-white shadow-xl scale-105 active:scale-100" 
                    : "text-coffee-300 hover:text-coffee-600 hover:bg-white/40"
                )}
              >
                <tab.icon className={cn("w-4 h-4", activeSubTab === tab.id ? "text-white" : "text-coffee-200")} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 glass-panel p-4 md:p-10 bg-white/40 border-0 shadow-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {activeSubTab === 'purchases' && (
              <PurchasingTab purchases={purchases} materials={materials} selectedYear={selectedYear} shopId={shopId} />
            )}
            {activeSubTab === 'stock' && (
              <StockTab materials={materials} shopId={shopId} />
            )}
            {activeSubTab === 'material_cost' && (
              <MaterialCostTab materials={materials} shopId={shopId} />
            )}
            {activeSubTab === 'daily_usage' && (
              <DailyUsageTab materials={materials} shopId={shopId} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
