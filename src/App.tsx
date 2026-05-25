/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
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
  Users,
  Clock,
  Target,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { todayISO, monthISO, cn, uid } from './lib/utils';
import { Settings, DailyReport, JournalEntry, COAItem } from './types';
import { handleFirestoreError } from './lib/firebase';
import OperatorLockScreen from './components/auth/OperatorLockScreen';
import { Role, Operator, Permissions } from './types';
import { Lock } from 'lucide-react';

// Lazy load heavy components
const JournalView = lazy(() => import('./components/JournalView'));
const DailyView = lazy(() => import('./components/DailyView'));
const MonthlyView = lazy(() => import('./components/MonthlyView'));
const CostView = lazy(() => import('./components/CostView'));
const InventoryView = lazy(() => import('./components/InventoryView'));
const CustomerView = lazy(() => import('./components/CustomerView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));
const HRView = lazy(() => import('./components/hr/HRView'));

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
  const [activeTab, setActiveTab] = useState<'journal' | 'daily' | 'inventory' | 'monthly' | 'cost' | 'customers' | 'pos' | 'settings' | 'hr'>(() => {
    return (localStorage.getItem('app_active_tab') as any) || 'journal';
  });
  const [globalSubTabs, setGlobalSubTabs] = useState<Record<string, string>>(() => {
    return JSON.parse(localStorage.getItem('app_global_subtabs') || '{}');
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

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

  const toggleSection = (section: string) => {
    setOpenSection(prev => prev === section ? null : section);
  };

  const openDrawer = () => {
    const sectionMap: Record<string, string> = {
      journal: 'finance', daily: 'reports', monthly: 'reports',
      hr: 'hr', inventory: 'operations', cost: 'operations', customers: 'operations',
    };
    setOpenSection(sectionMap[activeTab] || null);
    setIsDrawerOpen(true);
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

  // Operator System State
  const [roles, setRoles] = useState<Role[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [currentOperator, setCurrentOperator] = useState<Operator | null>(null);
  const [forceUnlocked, setForceUnlocked] = useState(false);

  const [targetShopId, setTargetShopId] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setTargetShopId(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'user_shops', user.uid), (snap) => {
      if (snap.exists() && snap.data()?.targetShopId) {
        setTargetShopId(snap.data().targetShopId);
      } else {
        setTargetShopId(null);
      }
    }, (err) => {
      console.error('Link snapshot error:', err);
    });
    return unsub;
  }, [user]);

  const shopId = targetShopId || user?.uid || '';

  useEffect(() => {
    if (!user || !shopId) return;

    // 只有當讀取自身原生店舖時，才執行預設初始化寫入，避免覆蓋目標主店舖的元數據
    if (shopId === user.uid) {
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

          // 2) bootstrap doc
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
    }

    const settingsRef = doc(db, 'shops', shopId, 'meta', 'settings');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setSettings(snap.data() as Settings);
    });

    const rolesRef = collection(db, 'shops', shopId, 'roles');
    const unsubRoles = onSnapshot(rolesRef, (snap) => {
      setRoles(snap.docs.map(d => d.data() as Role));
    });

    const opsRef = collection(db, 'shops', shopId, 'operators');
    const unsubOps = onSnapshot(opsRef, (snap) => {
      setOperators(snap.docs.map(d => d.data() as Operator));
    });

    return () => {
      unsubSettings();
      unsubRoles();
      unsubOps();
    };
  }, [user, shopId]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
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

  const hasPermission = (key: keyof Permissions) => {
    if (operators.length === 0 || forceUnlocked) return true;
    if (!currentOperator) return false;
    const role = roles.find(r => r.id === currentOperator.roleId);
    if (!role) return false;
    // Backward compatibility: if a permission key doesn't exist in old role data,
    // owner roles get full access, others get false
    if (role.permissions[key] === undefined) {
      return role.isOwner === true || role.permissions.manage_system === true;
    }
    return role.permissions[key];
  };

  const isLocked = operators.length > 0 && !currentOperator && !forceUnlocked;

  const getPageTitle = () => {
    const baseName = `${settings?.shopName || '態度貳貳甜點工作室'} 內部運營系統`;

    let category = '';
    let sub = '';

    if (activeTab === 'pos') {
      return `${baseName}-POS 收銀機`;
    } else if (activeTab === 'settings') {
      return `${baseName}-系統設定`;
    } else if (activeTab === 'journal') {
      category = '財務會計';
      const s = globalSubTabs['journal'] || 'entries';
      if (s === 'entries') sub = '日記簿';
      else if (s === 'reports') sub = '財務報表';
      else if (s === 'ledger') sub = '分類帳';
      else if (s === 'coa') sub = '會計科目';
      else if (s === 'assets') sub = '資產總表';
      else if (s === 'expenses') sub = '雜支與零用金記帳本';
    } else if (activeTab === 'daily') {
      category = '日月報表';
      const s = globalSubTabs['daily'] || 'dashboard';
      if (s === 'dashboard') sub = '日報表-銷售與戰情室';
      else if (s === 'import') sub = '日報表-訂單匯入';
      else if (s === 'settings') sub = '日報表-品項設定';
    } else if (activeTab === 'monthly') {
      category = '日月報表';
      const s = globalSubTabs['monthly'] || 'reports';
      if (s === 'reports') sub = '月報表-財務報表';
      else if (s === 'products') sub = '月報表-產品數據';
    } else if (activeTab === 'inventory') {
      category = '營運管理';
      const s = globalSubTabs['inventory'] || 'purchases';
      if (s === 'purchases') sub = '進貨管理';
      else if (s === 'stock') sub = '安全庫存設定';
      else if (s === 'periodic_count') sub = '實地盤點 (月末結算)';
    } else if (activeTab === 'cost') {
      category = '營運管理';
      sub = '成本分析';
    } else if (activeTab === 'hr') {
      category = '人事與薪資';
      const s = globalSubTabs['hr'] || 'roster';
      if (s === 'roster') sub = '排班管理';
      else if (s === 'attendance') sub = '出勤打卡紀錄';
      else if (s === 'payroll') sub = '薪資結算總表';
    } else if (activeTab === 'customers') {
      category = '營運管理';
      sub = '顧客資料';
    }

    if (category && sub) {
      return `${baseName}-${category}[${sub}]`;
    }
    return baseName;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {isLocked && (
        <OperatorLockScreen
          shopId={shopId}
          operators={operators}
          settings={settings}
          onUnlock={setCurrentOperator}
          onForceGoogleUnlock={() => {
            if (confirm(`這將使用您的 Google 帳號 (${user.email}) 強制登入系統，確定要繼續嗎？`)) {
              setForceUnlocked(true);
            }
          }}
        />
      )}
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
            <h1 className="text-xl md:text-3xl font-light text-coffee-600 tracking-[2px]">{getPageTitle()}</h1>
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
          {operators.length > 0 && (
            <button onClick={() => { setCurrentOperator(null); setForceUnlocked(false); }} className="p-2 bg-white text-coffee-600 rounded-xl shadow-sm border border-coffee-100 hover:bg-coffee-50 transition flex items-center gap-2">
              <Lock className="w-5 h-5" />
              <span className="hidden sm:inline font-bold text-sm">鎖定</span>
            </button>
          )}
          <button onClick={openDrawer} className="p-2 bg-coffee-800 text-white rounded-xl shadow-lg hover:bg-coffee-900 transition flex items-center gap-2">
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
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 text-coffee-400 hover:text-coffee-600 hover:bg-coffee-50 bg-white rounded-full border border-coffee-100 shadow-sm transition"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {hasPermission('pos') && (
                <div className="space-y-1">
                  <button onClick={() => navigateTo('pos', 'pos')} className="w-full flex items-center p-3 bg-rose-brand text-white rounded-xl font-bold shadow-md hover:bg-rose-brand/90 transition">
                    <ShoppingBag className="w-5 h-5 mr-3" /> POS 收銀機
                  </button>
                </div>
              )}

              {/* 手風琴選單 */}
              {[  
                {
                  key: 'finance',
                  label: '財務會計',
                  show: hasPermission('finance'),
                  items: [
                    { label: '日記簿', icon: <BookOpen />, tab: 'journal', sub: 'entries' },
                    { label: '財務報表', icon: <BarChart3 />, tab: 'journal', sub: 'reports' },
                    { label: '分類帳', icon: <Layers />, tab: 'journal', sub: 'ledger' },
                    { label: '雜支與零用金', icon: <FileSpreadsheet />, tab: 'journal', sub: 'expenses' },
                    { label: '會計科目', icon: <Settings2 />, tab: 'journal', sub: 'coa' },
                    { label: '資產總表', icon: <Gem />, tab: 'journal', sub: 'assets' },
                  ]
                },
                {
                  key: 'reports',
                  label: '日月報表',
                  show: hasPermission('daily') || hasPermission('monthly'),
                  items: [
                    ...(hasPermission('daily') ? [
                      { label: '銷售與戰情室', icon: <ClipboardList />, tab: 'daily', sub: 'dashboard' },
                      { label: '訂單匯入', icon: <Download />, tab: 'daily', sub: 'import' },
                      { label: '品項設定', icon: <Settings2 />, tab: 'daily', sub: 'settings' },
                    ] : []),
                    ...(hasPermission('monthly') ? [
                      { label: '財務報表', icon: <CalendarDays />, tab: 'monthly', sub: 'reports' },
                      { label: '產品數據', icon: <BarChart3 />, tab: 'monthly', sub: 'products' },
                    ] : []),
                  ]
                },
                {
                  key: 'hr',
                  label: '人事與薪資',
                  show: hasPermission('hr'),
                  items: [
                    { label: '排班管理', icon: <Calendar />, tab: 'hr', sub: 'roster' },
                    { label: '出勤打卡紀錄', icon: <Clock />, tab: 'hr', sub: 'attendance' },
                    { label: '薪資結算總表', icon: <FileSpreadsheet />, tab: 'hr', sub: 'payroll' },
                  ]
                },
                {
                  key: 'operations',
                  label: '營運管理',
                  show: hasPermission('inventory') || hasPermission('cost') || hasPermission('customers'),
                  items: [
                    ...(hasPermission('inventory') ? [
                      { label: '進貨管理', icon: <Package />, tab: 'inventory', sub: 'purchases' },
                      { label: '安全庫存設定', icon: <ClipboardList />, tab: 'inventory', sub: 'stock' },
                      { label: '實地盤點 (月末結算)', icon: <Target />, tab: 'inventory', sub: 'periodic_count' },
                    ] : []),
                    ...(hasPermission('cost') ? [{ label: '成本分析', icon: <BarChart3 />, tab: 'cost', sub: 'cost' }] : []),
                    ...(hasPermission('customers') ? [{ label: '顧客資料', icon: <Users />, tab: 'customers', sub: 'customers' }] : []),
                  ]
                },
              ].filter(s => s.show).map(section => {
                const isOpen = openSection === section.key;
                const isActive = section.items.some(item => activeTab === item.tab);
                return (
                  <div key={section.key} className="bg-white rounded-2xl shadow-sm border border-coffee-50 overflow-hidden">
                    {/* 分組標題按鈕 */}
                    <button
                      onClick={() => toggleSection(section.key)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 font-bold text-sm transition-colors",
                        isActive ? "text-coffee-800 bg-coffee-50" : "text-coffee-500 hover:bg-coffee-50/50"
                      )}
                    >
                      <span className={cn("uppercase tracking-widest text-[11px]", isActive ? "text-rose-brand" : "text-coffee-400")}>
                        {section.label}
                      </span>
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-coffee-300" />
                      </motion.div>
                    </button>

                    {/* 展開的子項目 */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-2 pb-2 space-y-0.5 border-t border-coffee-50">
                            {section.items.map(item => (
                              <NavMenuItem
                                key={`${item.tab}-${item.sub}`}
                                label={item.label}
                                icon={item.icon}
                                onClick={() => navigateTo(item.tab, item.sub)}
                                active={activeTab === item.tab && globalSubTabs[item.tab] === item.sub}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="pt-4 pb-12 space-y-3">
                {hasPermission('manage_system') && (
                  <>
                    <button
                      onClick={() => navigateTo('settings')}
                      className={cn("w-full p-3 rounded-xl transition-colors font-bold text-sm flex items-center justify-center gap-2", activeTab === 'settings' ? "bg-coffee-600 text-white shadow-md" : "bg-white text-coffee-800 border border-coffee-200 hover:bg-coffee-50")}
                    >
                      <Settings2 className="w-4 h-4" />
                      <span>系統設定</span>
                    </button>
                    <button
                      onClick={() => signOut(auth)}
                      className="w-full p-3 text-danger-brand hover:bg-danger-brand/5 rounded-xl transition-colors font-bold text-sm flex items-center justify-center gap-2 border border-danger-brand/20"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>登出整個系統 (Google 帳號)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <main className="flex-1 px-3 md:px-10 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${globalSubTabs[activeTab] || ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            <Suspense fallback={
              <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coffee-800"></div>
              </div>
            }>
              {activeTab === 'hr' && <HRView forcedSubTab={globalSubTabs['hr']} shopId={shopId} operators={operators} settings={settings} />}
              {activeTab === 'journal' && <JournalView forcedSubTab={globalSubTabs['journal']} selectedYear={selectedYear} shopId={shopId} settings={settings} />}
              {activeTab === 'daily' && <DailyView forcedSubTab={globalSubTabs['daily']} currentDate={currentDate} setCurrentDate={setCurrentDate} settings={settings} shopId={shopId} onNavigateToTab={navigateTo} />}
              {activeTab === 'pos' && <DailyView forcedSubTab={'pos'} currentDate={currentDate} setCurrentDate={setCurrentDate} settings={settings} shopId={shopId} onNavigateToTab={navigateTo} />}
              {activeTab === 'customers' && <CustomerView shopId={shopId} settings={settings} />}
              {activeTab === 'inventory' && <InventoryView forcedSubTab={globalSubTabs['inventory']} selectedYear={selectedYear} shopId={shopId} />}
              {activeTab === 'monthly' && <MonthlyView forcedSubTab={globalSubTabs['monthly']} settings={settings} shopId={shopId} />}
              {activeTab === 'cost' && <CostView settings={settings} shopId={shopId} />}
              {activeTab === 'settings' && <SettingsView shopId={shopId} roles={roles} operators={operators} settings={settings} />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
