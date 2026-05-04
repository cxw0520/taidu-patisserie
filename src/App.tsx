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
  Package,
  Menu,
  X,
  ShoppingBag,
  BookOpen,
  Gem,
  Download,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { todayISO, monthISO, cn, uid } from './lib/utils';
import { Settings, DailyReport, JournalEntry, COAItem } from './types';
import { handleFirestoreError } from './lib/firebase';
// Components (Inline for now to ensure visibility)
// We'll move these to separate chunks if it gets too large
import JournalView from './components/JournalView';
import DailyView from './components/DailyView';
import MonthlyView from './components/MonthlyView';
import CostView from './components/CostView';
import InventoryView from './components/InventoryView';
import CustomerView from './components/CustomerView';

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
  const [activeTab, setActiveTab] = useState<'journal' | 'daily' | 'inventory' | 'monthly' | 'cost' | 'customers' | 'pos'>(() => {
    return (localStorage.getItem('app_active_tab') as any) || 'journal';
  });
  const [globalSubTabs, setGlobalSubTabs] = useState<Record<string, string>>(() => {
    return JSON.parse(localStorage.getItem('app_global_subtabs') || '{}');
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('app_active_tab', activeTab);
    localStorage.setItem('app_global_subtabs', JSON.stringify(globalSubTabs));
  }, [activeTab, globalSubTabs]);

  const navigateTo = (tab: any, subTab?: string) => {
    setActiveTab(tab);
    if (subTab) {
      setGlobalSubTabs(prev => ({ ...prev, [tab]: subTab }));
    }
    setIsDrawerOpen(false);
  };

  const NavMenuItem = ({ label, icon, onClick, active }: { label: string, icon: any, onClick: () => void, active: boolean }) => (
    <button 
      onClick={onClick} 
      className={cn("w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm", active ? "bg-coffee-100 text-coffee-800 shadow-sm" : "text-coffee-600 hover:bg-coffee-50")}
    >
      <div className={cn("mr-3", active ? "text-rose-brand" : "text-coffee-400")}>
        {React.cloneElement(icon, { className: "w-5 h-5" })}
      </div>
      {label}
    </button>
  );
  const [currentDate, setCurrentDate] = useState(todayISO());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [loginError, setLoginError] = useState<string | null>(null);

  const shopId = user?.uid || '';

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user || !shopId) return;

    (async () => {
      try {
        // 1) 建立此帳號專屬 shop root doc（doc id = uid）
        await setDoc(
          doc(db, 'shops', shopId),
          {
            id: shopId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ownerUid: user.uid,
          },
          { merge: true }
        );

        // 2) bootstrap doc（你原本那段）
        await setDoc(
          doc(db, 'shops', shopId, 'meta', 'bootstrap'),
          {
            at: new Date().toISOString(),
            from: 'app-bootstrap',
            uid: auth.currentUser?.uid ?? null,
          },
          { merge: true }
        );

        // 3) settings init
        const settingsRef = doc(db, 'shops', shopId, 'meta', 'settings');
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) {
          await setDoc(settingsRef, DEFAULT_SETTINGS);
        }

        console.log('[bootstrap] root/meta/settings ready');
      } catch (e: any) {
        console.error('[bootstrap] failed:', e?.code, e?.message, e);
      }
    })();

    const settingsRef = doc(db, 'shops', shopId, 'meta', 'settings');
    const unsub = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setSettings(snap.data() as Settings);
    });

    return unsub;
  }, [user, shopId]);

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
  
  // Tabs are now managed via Drawer menu

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
      <header className="px-4 md:px-10 py-5 md:py-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-transparent">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-16 h-16 bg-coffee-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-[0_4px_12px_rgba(93,46,23,0.2)] overflow-hidden relative">
            {settings.logo ? (
              <img src={settings.logo} alt="logo" className="w-full h-full object-cover" />
            ) : (
              "22"
            )}
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-light text-coffee-600 tracking-[2px]">態度貳貳日記簿</h1>
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
        
        <div className="flex items-center gap-3 self-end lg:self-auto">
          <button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-coffee-800 text-white rounded-xl shadow-lg hover:bg-coffee-900 transition flex items-center gap-2">
            <Menu className="w-6 h-6" />
            <span className="hidden sm:inline font-bold">選單</span>
          </button>
        </div>
      </header>

      {/* Drawer Backdrop */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer Menu */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
             initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
             transition={{ type: 'spring', damping: 25, stiffness: 200 }}
             className="fixed top-0 right-0 bottom-0 w-80 bg-[#faf7f2] z-50 shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-coffee-100 flex justify-between items-center bg-white shadow-sm">
              <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-white border border-coffee-200 rounded-xl px-4 py-2 text-coffee-800 font-bold outline-none flex-1 mr-4 focus:border-rose-brand"
                >
                  {[2026, 2027, 2028, 2029, 2030, 2031].map(y => (
                    <option key={y} value={y}>{y} 年度</option>
                  ))}
                </select>
                <button onClick={() => setIsDrawerOpen(false)} className="p-2 text-coffee-400 hover:text-coffee-600 hover:bg-coffee-50 bg-white rounded-full border border-coffee-100 shadow-sm transition"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
               <div className="space-y-1">
                 <button onClick={() => navigateTo('pos', 'pos')} className="w-full flex items-center p-3 bg-rose-brand text-white rounded-xl font-bold shadow-md hover:bg-rose-brand/90 transition">
                    <ShoppingBag className="w-5 h-5 mr-3" /> POS 收銀機
                 </button>
               </div>
               
               <div className="bg-white p-3 rounded-2xl shadow-sm border border-coffee-50">
                 <h3 className="text-[10px] font-bold text-coffee-400 mb-2 px-3 uppercase tracking-widest">財務會計</h3>
                 <div className="space-y-1">
                   <NavMenuItem label="日記簿" icon={<BookOpen/>} onClick={() => navigateTo('journal', 'entries')} active={activeTab==='journal'&&globalSubTabs['journal']==='entries'} />
                   <NavMenuItem label="財務報表" icon={<BarChart3/>} onClick={() => navigateTo('journal', 'reports')} active={activeTab==='journal'&&globalSubTabs['journal']==='reports'} />
                   <NavMenuItem label="分類帳" icon={<Layers/>} onClick={() => navigateTo('journal', 'ledger')} active={activeTab==='journal'&&globalSubTabs['journal']==='ledger'} />
                   <NavMenuItem label="會計科目" icon={<Settings2/>} onClick={() => navigateTo('journal', 'coa')} active={activeTab==='journal'&&globalSubTabs['journal']==='coa'} />
                   <NavMenuItem label="資產總表" icon={<Gem/>} onClick={() => navigateTo('journal', 'assets')} active={activeTab==='journal'&&globalSubTabs['journal']==='assets'} />
                 </div>
               </div>

               <div className="bg-white p-3 rounded-2xl shadow-sm border border-coffee-50">
                 <h3 className="text-[10px] font-bold text-coffee-400 mb-2 px-3 uppercase tracking-widest">日月報表</h3>
                 <div className="space-y-1">
                   <div className="px-3 py-1 mt-1 text-[11px] font-bold text-coffee-300">日報表</div>
                   <NavMenuItem label="銷售與戰情室" icon={<ClipboardList/>} onClick={() => navigateTo('daily', 'dashboard')} active={activeTab==='daily'&&globalSubTabs['daily']==='dashboard'} />
                   <NavMenuItem label="訂單匯入" icon={<Download/>} onClick={() => navigateTo('daily', 'import')} active={activeTab==='daily'&&globalSubTabs['daily']==='import'} />
                   <NavMenuItem label="品項設定" icon={<Settings2/>} onClick={() => navigateTo('daily', 'settings')} active={activeTab==='daily'&&globalSubTabs['daily']==='settings'} />
                   
                   <div className="px-3 py-1 mt-3 text-[11px] font-bold text-coffee-300">月報表</div>
                   <NavMenuItem label="財務報表" icon={<CalendarDays/>} onClick={() => navigateTo('monthly', 'reports')} active={activeTab==='monthly'&&globalSubTabs['monthly']==='reports'} />
                   <NavMenuItem label="產品數據" icon={<BarChart3/>} onClick={() => navigateTo('monthly', 'products')} active={activeTab==='monthly'&&globalSubTabs['monthly']==='products'} />
                 </div>
               </div>

               <div className="bg-white p-3 rounded-2xl shadow-sm border border-coffee-50">
                 <h3 className="text-[10px] font-bold text-coffee-400 mb-2 px-3 uppercase tracking-widest">營運管理</h3>
                 <div className="space-y-1">
                   <div className="px-3 py-1 mt-1 text-[11px] font-bold text-coffee-300">進貨與庫存</div>
                   <NavMenuItem label="進貨管理" icon={<Package/>} onClick={() => navigateTo('inventory', 'purchasing')} active={activeTab==='inventory'&&globalSubTabs['inventory']==='purchasing'} />
                   <NavMenuItem label="庫存與盤點" icon={<ClipboardList/>} onClick={() => navigateTo('inventory', 'stock')} active={activeTab==='inventory'&&globalSubTabs['inventory']==='stock'} />
                   <NavMenuItem label="本日使用量" icon={<BarChart3/>} onClick={() => navigateTo('inventory', 'daily')} active={activeTab==='inventory'&&globalSubTabs['inventory']==='daily'} />
                   
                   <div className="w-full h-px bg-coffee-50 my-3"></div>
                   
                   <NavMenuItem label="成本分析" icon={<BarChart3/>} onClick={() => navigateTo('cost', 'cost')} active={activeTab==='cost'} />
                   <NavMenuItem label="顧客資料" icon={<Users/>} onClick={() => navigateTo('customers', 'customers')} active={activeTab==='customers'} />
                 </div>
               </div>
               
               <div className="pt-4 pb-12">
                 <button 
                  onClick={() => signOut(auth)}
                  className="w-full p-3 text-danger-brand hover:bg-danger-brand/5 rounded-xl transition-colors font-bold text-sm flex items-center justify-center gap-2 border border-danger-brand/20"
                >
                  <LogOut className="w-4 h-4" />
                  <span>登出系統</span>
                </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <main className="flex-1 px-3 md:px-10 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {activeTab === 'journal' && <JournalView forcedSubTab={globalSubTabs['journal']} selectedYear={selectedYear} shopId={shopId} />}
            {activeTab === 'daily' && <DailyView forcedSubTab={globalSubTabs['daily']} currentDate={currentDate} setCurrentDate={setCurrentDate} settings={settings} shopId={shopId} />}
            {activeTab === 'pos' && <DailyView forcedSubTab={'pos'} currentDate={currentDate} setCurrentDate={setCurrentDate} settings={settings} shopId={shopId} />}
            {activeTab === 'customers' && <CustomerView shopId={shopId} settings={settings} />}
            {activeTab === 'inventory' && <InventoryView forcedSubTab={globalSubTabs['inventory']} selectedYear={selectedYear} shopId={shopId} />}
            {activeTab === 'monthly' && <MonthlyView forcedSubTab={globalSubTabs['monthly']} settings={settings} shopId={shopId} />}
            {activeTab === 'cost' && <CostView settings={settings} shopId={shopId} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
