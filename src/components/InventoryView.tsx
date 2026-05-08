import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Material, Purchase, InventoryAdj } from '../types';
import { Package, ShoppingCart, Target, Menu, X, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PurchasingTab from './inventory/PurchasingTab';
import StockTab from './inventory/StockTab';
import PeriodicCountTab from './inventory/PeriodicCountTab';

type SubTab = 'purchases' | 'stock' | 'periodic_count';

export default function InventoryView({ selectedYear, shopId, forcedSubTab }: { selectedYear: number, shopId: string, forcedSubTab?: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('purchases');
  
  useEffect(() => {
    if (forcedSubTab && ['purchases', 'stock', 'periodic_count'].includes(forcedSubTab)) {
      setActiveSubTab(forcedSubTab as any);
    }
  }, [forcedSubTab]);

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
    { id: 'stock', label: '材料與安全庫存', icon: Package },
    { id: 'periodic_count', label: '月底實地盤點', icon: Target },
  ];

  return (
    <div className="space-y-8 h-full flex flex-col">
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
            {activeSubTab === 'periodic_count' && (
              <PeriodicCountTab materials={materials} shopId={shopId} selectedYear={selectedYear} purchases={purchases} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
