import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Material, Purchase, InventoryAdj } from '../types';
import { Package, ShoppingCart, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import PurchasingTab from './inventory/PurchasingTab';
import StockTab from './inventory/StockTab';

type SubTab = 'purchases' | 'stock';

export default function InventoryView({ selectedYear, shopId }: { selectedYear: number, shopId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('purchases');
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
  ];

  return (
    <div className="space-y-8 h-full flex flex-col">
      <div className="flex justify-center items-center">
        <nav className="flex bg-white/50 backdrop-blur-sm p-1.5 rounded-[24px] border border-coffee-50 shadow-inner overflow-x-auto no-scrollbar max-w-full">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
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

      <div className="flex-1 glass-panel p-10 bg-white/40 border-0 shadow-none">
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
