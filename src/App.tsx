/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  CalendarDays, 
  BarChart3, 
  Settings2, 
  LogOut, 
  RefreshCw, 
  Calendar,
  Layers,
  FileSpreadsheet,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { todayISO, monthISO, cn, uid } from './lib/utils';
import { Settings, DailyReport, JournalEntry, COAItem } from './types';

// Components (Inline for now to ensure visibility)
// We'll move these to separate chunks if it gets too large
import JournalView from './components/JournalView';
import DailyView from './components/DailyView';
import MonthlyView from './components/MonthlyView';
import CostView from './components/CostView';
import InventoryView from './components/InventoryView';

const DEFAULT_SETTINGS: Settings = {
  giftItems: [
    { id: uid(), name: '綜合禮盒（6顆）', price: 1080, active: true, recipe: { '原味': 2, '可可': 2, '伯爵': 1, '抹茶': 1 }, category: 'gift' },
    { id: uid(), name: '原味禮盒', price: 360, active: true, recipe: { '原味': 3 }, category: 'gift' },
    { id: uid(), name: '可可禮盒', price: 360, active: true, recipe: { '可可': 3 }, category: 'gift' },
    { id: uid(), name: '伯爵禮盒', price: 360, active: true, recipe: { '伯爵': 3 }, category: 'gift' },
    { id: uid(), name: '抹茶禮盒', price: 360, active: true, recipe: { '抹茶': 3 }, category: 'gift' }
  ],
  singleItems: [
    { id: uid(), name: '原味', price: 120, active: true, category: 'single' },
    { id: uid(), name: '可可', price: 120, active: true, category: 'single' },
    { id: uid(), name: '伯爵', price: 120, active: true, category: 'single' },
    { id: uid(), name: '抹茶', price: 120, active: true, category: 'single' }
  ],
  packagingItems: [
    { id: uid(), name: '手提袋', price: 10, active: true },
    { id: uid(), name: '宅配紙箱', price: 15, active: true }
  ]
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'journal' | 'daily' | 'inventory' | 'monthly' | 'cost'>('journal');
  const [currentDate, setCurrentDate] = useState(todayISO());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [loginError, setLoginError] = useState<string | null>(null);

  const shopId = 'tai_du_2025';

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const settingsRef = doc(db, 'shops', shopId, 'meta', 'settings');
    const unsub = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Settings;
        setSettings(data);
      } else {
        // Init default settings if not exists
        setDoc(settingsRef, DEFAULT_SETTINGS).catch(e => console.error("Failed to init settings:", e));
      }
    }, (error) => {
      console.error("Firestore settings permission error:", error);
    });

    return unsub;
  }, [user]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/configuration-not-found') {
        setLoginError('Firebase Authentication 尚未啟動 Google 登入功能。請至 Firebase 控制台啟用 Google 供應商。');
      } else {
        setLoginError('登入發生錯誤：' + (error.message || '未知錯誤'));
      }
    }
  };

  const tabs = [
    { id: 'journal', label: '日記簿', icon: ClipboardList },
    { id: 'daily', label: '日報表', icon: Calendar },
    { id: 'inventory', label: '進貨與庫存', icon: Package },
    { id: 'monthly', label: '月報表', icon: CalendarDays },
    { id: 'cost', label: '成本分析', icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary-brand border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-cream">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 max-w-md w-full text-center space-y-6"
        >
          <div className="w-24 h-24 bg-coffee-600 rounded-2xl mx-auto flex items-center justify-center text-white text-4xl font-bold shadow-xl">
            22
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-coffee-800">態度貳貳甜點店</h1>
            <p className="text-coffee-600">營運管理系統</p>
          </div>

          {loginError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-danger-brand/10 border border-danger-brand/20 text-danger-brand text-xs p-3 rounded-lg text-left"
            >
              {loginError}
            </motion.div>
          )}

          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-coffee-600 text-white rounded-xl font-bold hover:bg-coffee-700 transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95"
          >
            <RefreshCw className="w-5 h-5" />
            使用 Google 登入
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-10 py-6 md:py-8 flex items-center justify-between bg-transparent">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-coffee-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-[0_4px_12px_rgba(93,46,23,0.2)] overflow-hidden relative font-serif-brand">
            {settings.logo ? (
              <img src={settings.logo} alt="logo" className="w-full h-full object-cover" />
            ) : (
              "22"
            )}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-light text-coffee-600 tracking-[2px] font-serif-brand">態度貳貳日記簿</h1>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-mint-brand mt-1">
              <span className={cn(
                "w-2 h-2 rounded-full",
                syncStatus === 'error' ? "bg-danger-brand" : "bg-mint-brand"
              )} />
              {syncStatus === 'synced' ? "雲端已同步" : "同步中..."}
              <span className="hidden sm:inline opacity-70">({auth.currentUser?.email})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-coffee-200 rounded-full px-4 py-1.5 text-sm text-coffee-600 cursor-pointer outline-none hover:border-rose-brand transition-colors"
            >
              {[2026, 2027, 2028, 2029, 2030, 2031].map(y => (
                <option key={y} value={y}>{y} 年度</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={() => signOut(auth)}
            className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-full transition-colors font-bold text-sm flex items-center gap-2"
            title="登出"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">登出</span>
          </button>
        </div>
      </header>

      <nav className="flex justify-center gap-4 md:gap-8 mb-6">
        {tabs.map((tab) => {
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "nav-tab flex items-center gap-2",
                activeTab === tab.id && "nav-tab-active"
              )}
            >
              <span className="text-sm md:text-base font-bold">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="flex-1 px-4 md:px-10 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {activeTab === 'journal' && <JournalView selectedYear={selectedYear} shopId={shopId} />}
            {activeTab === 'daily' && <DailyView currentDate={currentDate} setCurrentDate={setCurrentDate} settings={settings} shopId={shopId} />}
            {activeTab === 'inventory' && <InventoryView selectedYear={selectedYear} shopId={shopId} />}
            {activeTab === 'monthly' && <MonthlyView settings={settings} shopId={shopId} />}
            {activeTab === 'cost' && <CostView settings={settings} shopId={shopId} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
