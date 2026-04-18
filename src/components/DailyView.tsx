import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, query, collection, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { fmt, uid, parseNum, todayISO } from '../lib/utils';
import { DailyReport, Settings, Order, LossEntry } from '../types';
import { 
  Plus, 
  Trash2, 
  FileUp, 
  Save, 
  TrendingUp, 
  Truck, 
  Box, 
  AlertTriangle,
  History,
  Copy,
  LayoutDashboard,
  Settings as SettingsIcon,
  Check,
  RefreshCw,
  CircleDollarSign,
  FileText,
  PackageSearch,
  BarChart3,
  Wand2,
  CalendarDays,
  Gift,
  Cookie,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function DailyView({ 
  currentDate, 
  setCurrentDate, 
  settings, 
  shopId 
}: { 
  currentDate: string, 
  setCurrentDate: (d: string) => void, 
  settings: Settings,
  shopId: string 
}) {
  const [subTab, setSubTab] = useState<'dashboard' | 'import' | 'settings'>('dashboard');
  const [dailyData, setDailyData] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    const docRef = doc(db, 'shops', shopId, 'daily', currentDate);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setDailyData(snap.data() as DailyReport);
      } else {
        setDailyData({
          date: currentDate,
          orders: [],
          ar: { accum: 0, collect: 0, logSpent: 0, actualTotal: 0 },
          inventory: {},
          losses: [],
          packagingUsage: {}
        });
      }
      setLoading(false);
    });
    return unsub;
  }, [currentDate, shopId]);

  // Debounced Save
  useEffect(() => {
    if (!dailyData || loading) return;
    const t = setTimeout(async () => {
      setSaveStatus('saving');
      await setDoc(doc(db, 'shops', shopId, 'daily', currentDate), dailyData);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1000);
    return () => clearTimeout(t);
  }, [dailyData, currentDate, shopId]);

  const updateDaily = (patch: Partial<DailyReport>) => {
    setDailyData(prev => prev ? { ...prev, ...patch } : null);
  };

  const metrics = useMemo(() => {
    if (!dailyData) return null;
    let m = {
        rev: 0, ship: 0, prShip: 0, disc: 0, prVal: 0, recv: 0, act: 0, remit: 0, cash: 0, unpaid: 0,
        qty: { gb: {} as Record<string,number>, sg: {} as Record<string,number>, prGB: {} as Record<string,number>, prSG: {} as Record<string,number> },
        inventoryOut: {} as Record<string, number>
    };

    settings.giftItems.forEach(i => { m.qty.gb[i.name] = 0; m.qty.prGB[i.name] = 0; });
    settings.singleItems.forEach(i => { m.qty.sg[i.name] = 0; m.qty.prSG[i.name] = 0; });

    dailyData.orders.forEach(o => {
        const isPR = o.status === '公關品';
        m.rev += o.prodAmt; 
        m.disc += o.discAmt;
        
        if(isPR) { 
            m.prVal += o.prodAmt; 
            m.prShip += o.shipAmt;
        } else {
            m.ship += o.shipAmt;
            m.recv += o.actualAmt;
            if(o.status === '匯款') { m.remit += o.actualAmt; m.act += o.actualAmt; }
            if(o.status === '現結') { m.cash += o.actualAmt; m.act += o.actualAmt; }
            if(o.status === '未結帳款') { m.unpaid += o.actualAmt; }
        }

        settings.giftItems.forEach(i => {
            const count = (o.items[i.id] || 0);
            if(isPR) m.qty.prGB[i.name] += count;
            else m.qty.gb[i.name] += count;
        });
        settings.singleItems.forEach(i => {
            const count = (o.items[i.id] || 0);
            if(isPR) m.qty.prSG[i.name] += count;
            else m.qty.sg[i.name] += count;
        });

        // Inventory out
        const allItems = [...settings.giftItems, ...settings.singleItems];
        allItems.forEach(item => {
            const qty = o.items[item.id] || 0;
            if (qty <= 0) return;
            if (item.category === 'gift' && item.recipe) {
                Object.entries(item.recipe).forEach(([flavor, count]) => {
                    m.inventoryOut[flavor] = (m.inventoryOut[flavor] || 0) + (qty * count);
                });
            } else if (item.category === 'single') {
                m.inventoryOut[item.name] = (m.inventoryOut[item.name] || 0) + qty;
            }
        });
    });

    return m;
  }, [dailyData, settings]);

  const [syncingInv, setSyncingInv] = useState(false);
  const syncInventory = async () => {
    if (!dailyData || syncingInv) return;
    setSyncingInv(true);
    try {
      // Basic consumption auto-deduction based on daily sales
      const consumption: Record<string, number> = {};
      dailyData.orders.forEach(o => {
        [...settings.giftItems, ...settings.singleItems].forEach(item => {
          const qty = o.items[item.id] || 0;
          if (qty > 0 && item.materialRecipe) {
            Object.entries(item.materialRecipe).forEach(([matId, usage]) => {
              consumption[matId] = (consumption[matId] || 0) + (qty * usage);
            });
          }
        });
      });

      // Execute deduction
      for (const [matId, qty] of Object.entries(consumption)) {
        const ref = doc(db, 'shops', shopId, 'materials', matId);
        const md = await getDoc(ref);
        if (md.exists()) {
          const mat = md.data();
          await setDoc(ref, { ...mat, stock: mat.stock - qty });
        }
      }
      alert('庫存扣減完成！');
    } catch(e) {
      alert('扣減庫存發生錯誤');
    }
    setSyncingInv(false);
  };

  if (loading || !dailyData) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="bg-white border border-coffee-200 rounded-xl px-4 py-2 font-bold text-coffee-700 shadow-sm focus:ring-2 focus:ring-coffee-300 outline-none"
          />
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-coffee-400">
            {saveStatus === 'saving' && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><RefreshCw className="w-4 h-4" /></motion.div>}
            {saveStatus === 'saved' && <Check className="w-4 h-4 text-green-500" />}
            {saveStatus === 'saved' ? "已儲存" : saveStatus === 'saving' ? "同步中..." : "雲端存檔"}
          </div>
        </div>

        <div className="flex bg-coffee-100/50 p-1 rounded-xl">
          {[
            { id: 'dashboard', label: '銷售與戰情室', icon: LayoutDashboard },
            { id: 'import', label: '訂單匯入', icon: FileUp },
            { id: 'settings', label: '品項設定', icon: SettingsIcon },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                subTab === t.id ? "bg-white text-coffee-700 shadow-sm" : "text-coffee-400 hover:text-coffee-600"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
        
        <button 
          onClick={syncInventory}
          disabled={syncingInv}
          className="px-4 py-2 rounded-lg font-bold text-sm text-white bg-mint-brand shadow-sm hover:bg-mint-brand/80 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4 md:mt-0"
          title="根據本表配方自動扣減庫存"
        >
          {syncingInv ? '扣減中...' : '扣除今日庫存'}
        </button>
      </div>

      {subTab === 'dashboard' && (
        <div className="flex flex-col gap-8">
          {/* Sales List */}
          <div className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-title">
                <LayoutDashboard className="w-5 h-5 inline-block mr-2 mb-1" /> 銷售明細
              </h3>
              <button 
                onClick={() => {
                  const newOrder: Order = {
                    id: uid(), buyer: '', phone: '', address: '', items: {},
                    prodAmt: 0, shipAmt: 0, discAmt: 0, actualAmt: 0, status: '匯款', note: ''
                  };
                  updateDaily({ orders: [...dailyData.orders, newOrder] });
                }}
                className="bg-coffee-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-coffee-700 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" /> 新增訂單
              </button>
            </div>

            <div className="rounded-2xl overflow-x-auto border border-coffee-50 bg-white/50">
              <table className="w-full text-xs md:text-sm text-center border-collapse">
                <thead className="bg-[#faf7f2]">
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider">
                    <th className="px-3 py-4 text-left border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">購買人</th>
                    {settings.giftItems.filter(i => i.active).length > 0 && (
                      <th colSpan={settings.giftItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#ffcbf2]/30 border-r border-[#ffb3c1]/30">禮盒</th>
                   )}
                   {settings.singleItems.filter(i => i.active).length > 0 && (
                     <th colSpan={settings.singleItems.filter(i => i.active).length} className="px-2 py-4 border-b border-[#f0ede8] bg-[#a2d2ff]/30 border-r border-[#83c5be]/30">單顆</th>
                   )}
                    <th colSpan={4} className="px-2 py-4 border-b border-[#f0ede8] bg-[#e2ece9]/30">金額結算</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">收款狀態</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8]">備註</th>
                    <th className="px-3 py-4 border-b border-[#f0ede8] text-right sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">操作</th>
                  </tr>
                  <tr className="text-coffee-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="px-3 py-3 border-b border-[#f0ede8] sticky left-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">姓名</th>
                    {settings.giftItems.filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#ffb3c1]/30 bg-[#ffcbf2]/20">{i.name}</th>)}
                    {settings.singleItems.filter(i => i.active).map(i => <th key={i.id} className="px-2 py-3 border-b border-[#83c5be]/30 bg-[#a2d2ff]/20">{i.name}</th>)}
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">商品金額</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">運費</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">折讓</th>
                    <th className="px-2 py-3 border-b border-[#f0ede8] bg-[#e2ece9]/20">應收金額</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">狀態</th>
                    <th className="px-3 py-3 border-b border-[#f0ede8]">金流說明</th>
                    <th className="px-3 py-3 text-right border-b border-[#f0ede8] sticky right-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md">刪除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {dailyData.orders.map((order, idx) => (
                    <tr key={order.id} className="group hover:bg-coffee-50/50 transition-colors">
                      <td className="px-3 py-3 sticky left-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-r border-[#f0ede8]">
                        <input 
                          className="w-20 md:w-28 bg-transparent font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="姓名"
                          value={order.buyer}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].buyer = e.target.value;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      {settings.giftItems.filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#ffcbf2]/5">
                          <input 
                            type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items[i.id] || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...settings.giftItems, ...settings.singleItems].forEach(item => {
                                pAmt += (orders[idx].items[item.id] || 0) * item.price;
                              });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + orders[idx].shipAmt - orders[idx].discAmt;
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      {settings.singleItems.filter(i => i.active).map(i => (
                        <td key={i.id} className="px-2 py-3 bg-[#a2d2ff]/5">
                          <input 
                            type="number"
                            className="w-12 bg-transparent text-center font-bold text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                            value={order.items[i.id] || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const orders = [...dailyData.orders];
                              orders[idx].items[i.id] = parseNum(e.target.value);
                              let pAmt = 0;
                              [...settings.giftItems, ...settings.singleItems].forEach(item => {
                                pAmt += (orders[idx].items[item.id] || 0) * item.price;
                              });
                              orders[idx].prodAmt = pAmt;
                              orders[idx].actualAmt = pAmt + orders[idx].shipAmt - orders[idx].discAmt;
                              updateDaily({ orders });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-3 font-serif-brand font-bold text-gray-500 bg-[#e2ece9]/5">
                        ${fmt(order.prodAmt)}
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input 
                          type="number"
                          className="w-16 bg-transparent text-center font-bold text-coffee-700 outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.shipAmt || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].shipAmt = parseNum(e.target.value);
                            orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-2 py-3 bg-[#e2ece9]/5">
                        <input 
                          type="number"
                          className="w-16 bg-transparent text-center font-bold text-rose-brand outline-none border-b border-transparent focus:border-rose-brand"
                          value={order.discAmt || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].discAmt = parseNum(e.target.value);
                            orders[idx].actualAmt = orders[idx].prodAmt + orders[idx].shipAmt - orders[idx].discAmt;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-2 py-3 font-serif-brand font-bold text-mint-brand bg-[#e2ece9]/10">
                        ${fmt(order.actualAmt)}
                      </td>
                      <td className="px-3 py-3">
                        <select 
                          value={order.status}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].status = e.target.value as any;
                            updateDaily({ orders });
                          }}
                          className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-lg outline-none",
                            order.status === '匯款' && "bg-blue-50 text-blue-600",
                            order.status === '現結' && "bg-green-50 text-green-600",
                            order.status === '未結帳款' && "bg-danger-brand/10 text-danger-brand",
                            order.status === '公關品' && "bg-purple-50 text-purple-600"
                          )}
                        >
                          <option value="匯款">匯款</option>
                          <option value="現結">現結</option>
                          <option value="未結帳款">未結</option>
                          <option value="公關品">公關</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input 
                          type="text"
                          className="w-32 bg-transparent text-sm text-coffee-600 outline-none border-b border-transparent focus:border-rose-brand"
                          placeholder="地址/電話/說明"
                          value={order.note || ''}
                          onChange={(e) => {
                            const orders = [...dailyData.orders];
                            orders[idx].note = e.target.value;
                            updateDaily({ orders });
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white/90 backdrop-blur-sm group-hover:bg-[#faf7f2]/90 border-l border-[#f0ede8]">
                        <button 
                          onClick={() => {
                            const orders = dailyData.orders.filter(o => o.id !== order.id);
                            updateDaily({ orders });
                          }}
                          className="p-2 text-coffee-300 hover:text-danger-brand hover:bg-danger-brand/5 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 金流總結 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-[#ffb3c1]/40 pb-3 mb-4">
                <CircleDollarSign className="w-5 h-5 text-rose-brand" /> 金流總結
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center"><span className="text-coffee-600">商品營業總額</span><span className="font-bold font-serif-brand">${fmt(metrics?.rev || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">運費</span><span className="font-bold font-serif-brand">${fmt(metrics?.ship || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">折讓</span><span className="font-bold font-serif-brand text-danger-brand">${fmt(metrics?.disc || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">公關品折算總額</span><span className="font-bold font-serif-brand">${fmt(metrics?.prVal || 0)}</span></div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center"><span className="font-bold text-coffee-800">營業淨額</span><span className="font-bold font-serif-brand">${fmt((metrics?.recv || 0) - (metrics?.ship || 0))}</span></div>
                <div className="flex justify-between items-center text-lg"><span className="font-bold text-coffee-800">應收總額</span><span className="font-bold font-serif-brand text-rose-brand">${fmt(metrics?.recv || 0)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-coffee-800">實收總額</span>
                  <input 
                    type="number"
                    value={dailyData.ar.actualTotal || ''}
                    onChange={e => updateDaily({ ar: { ...dailyData.ar, actualTotal: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-serif-brand text-mint-brand focus:border-mint-brand focus:ring-2 focus:ring-mint-brand/20 outline-none"
                  />
                </div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center"><span className="text-coffee-600">已收-匯款</span><span className="font-bold font-serif-brand">${fmt(metrics?.remit || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">已收-現金</span><span className="font-bold font-serif-brand">${fmt(metrics?.cash || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">今日未結帳款</span><span className="font-bold font-serif-brand text-danger-brand">${fmt(metrics?.unpaid || 0)}</span></div>
              </div>
            </div>

            {/* 前期應收帳款管理 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300 flex flex-col">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-mint-brand/40 pb-3 mb-4">
                <FileText className="w-5 h-5 text-mint-brand" /> 前期應收帳款管理
              </h3>
              <div className="space-y-4 text-sm flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">累積前期未結</span>
                  <input 
                    type="number"
                    value={dailyData.ar.accum || ''}
                    onChange={e => updateDaily({ ar: { ...dailyData.ar, accum: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-bold font-serif-brand text-coffee-700 outline-none focus:border-coffee-400"
                  />
                </div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">今日新增未結</span><span className="font-bold font-serif-brand">${fmt(metrics?.unpaid || 0)}</span></div>
                <div className="h-px bg-coffee-100 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">今日回款 (沖銷)</span>
                  <input 
                    type="number"
                    value={dailyData.ar.collect || ''}
                    onChange={e => updateDaily({ ar: { ...dailyData.ar, collect: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-serif-brand text-mint-brand focus:border-mint-brand outline-none"
                  />
                </div>
              </div>
              <div className="h-px bg-coffee-100 my-4" />
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold text-coffee-800">剩餘總未結帳款</span>
                <span className="font-bold font-serif-brand text-danger-brand">${fmt((dailyData.ar.accum || 0) + (metrics?.unpaid || 0) - (dailyData.ar.collect || 0))}</span>
              </div>
            </div>

            {/* 物流與包材 */}
            <div className="glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-amber-200 pb-3 mb-4">
                <Truck className="w-5 h-5 text-amber-500" /> 物流分析與包材
              </h3>
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between items-center"><span className="text-coffee-600">運費實收 (明細)</span><span className="font-bold font-serif-brand">${fmt(metrics?.ship || 0)}</span></div>
                <div className="flex justify-between items-center"><span className="text-coffee-600">公關品運費 (不計入)</span><span className="font-bold font-serif-brand text-danger-brand">${fmt(metrics?.prShip || 0)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">運費實支 (支出)</span>
                  <input 
                    type="number"
                    value={dailyData.ar.logSpent || ''}
                    onChange={e => updateDaily({ ar: { ...dailyData.ar, logSpent: parseNum(e.target.value) } })}
                    className="w-24 text-right bg-white border border-coffee-100 rounded-lg px-2 py-1 font-bold font-serif-brand outline-none focus:border-coffee-400"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-coffee-600">物流服務額</span>
                  <span className={cn("font-bold font-serif-brand", ((metrics?.ship || 0) - (dailyData.ar.logSpent || 0)) < 0 ? 'text-danger-brand' : 'text-mint-brand')}>
                    ${fmt((metrics?.ship || 0) - (dailyData.ar.logSpent || 0))}
                  </span>
                </div>
              </div>

              <h4 className="flex items-center gap-2 text-[13px] font-bold text-coffee-600 mb-2">
                <PackageSearch className="w-4 h-4" /> 包材計算
              </h4>
              <div className="overflow-x-auto rounded-lg border border-coffee-100 mb-2">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-[#e2ece9]/30">
                    <tr><th className="p-2 text-left">包材</th><th className="p-2">單價</th><th className="p-2">數量</th><th className="p-2 text-right">小計</th></tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50 bg-white">
                    {settings.packagingItems.filter(p => p.active).map(pkg => {
                      const qty = dailyData.packagingUsage[pkg.id] || 0;
                      return (
                        <tr key={pkg.id}>
                          <td className="p-2 text-left">{pkg.name}</td>
                          <td className="p-2">${pkg.price}</td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              className="w-12 text-center border border-gray-200 rounded py-0.5 outline-none focus:border-coffee-400" 
                              value={qty || ''}
                              onChange={e => updateDaily({ packagingUsage: { ...dailyData.packagingUsage, [pkg.id]: parseNum(e.target.value) } })}
                            />
                          </td>
                          <td className="p-2 font-bold text-right text-rose-brand">${fmt(qty * pkg.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-right text-sm">
                <span className="text-coffee-600 mr-2">包材總支出:</span>
                <span className="font-bold font-serif-brand text-rose-brand">
                  ${fmt(settings.packagingItems.reduce((sum, pkg) => sum + (pkg.price * (dailyData.packagingUsage[pkg.id] || 0)), 0))}
                </span>
              </div>
            </div>

            {/* 動態商情與庫存分析 */}
            <div className="lg:col-span-3 glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800 border-b-2 border-blue-200 pb-3 mb-4">
                <BarChart3 className="w-5 h-5 text-blue-500" /> 動態商情與庫存分析
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="text-[13px] font-bold text-coffee-600 mb-2">禮盒銷售統計</h4>
                  <div className="overflow-x-auto rounded-lg border border-coffee-100">
                    <table className="w-full text-xs text-center border-collapse bg-white">
                      <thead className="bg-[#ffcbf2]/20 text-coffee-600">
                        <tr><th className="p-2 text-left">品項</th><th className="p-2">販售</th><th className="p-2">公關</th><th className="p-2 font-bold">總數</th></tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-50">
                        {settings.giftItems.filter(i => i.active || (metrics.qty.gb[i.name] + metrics.qty.prGB[i.name] > 0)).map(i => (
                          <tr key={i.id}>
                            <td className="p-2 text-left font-medium">{i.name}</td>
                            <td className="p-2">{metrics.qty.gb[i.name] || 0}</td>
                            <td className="p-2 text-purple-600">{metrics.qty.prGB[i.name] || 0}</td>
                            <td className="p-2 font-bold text-rose-brand">{(metrics.qty.gb[i.name] || 0) + (metrics.qty.prGB[i.name] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-coffee-600 mb-2">單顆銷售統計</h4>
                  <div className="overflow-x-auto rounded-lg border border-coffee-100">
                    <table className="w-full text-xs text-center border-collapse bg-white">
                      <thead className="bg-[#a2d2ff]/20 text-coffee-600">
                        <tr><th className="p-2 text-left">品項</th><th className="p-2">販售</th><th className="p-2">公關</th><th className="p-2 font-bold">總數</th></tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-50">
                        {settings.singleItems.filter(i => i.active || (metrics.qty.sg[i.name] + metrics.qty.prSG[i.name] > 0)).map(i => (
                          <tr key={i.id}>
                            <td className="p-2 text-left font-medium">{i.name}</td>
                            <td className="p-2">{metrics.qty.sg[i.name] || 0}</td>
                            <td className="p-2 text-purple-600">{metrics.qty.prSG[i.name] || 0}</td>
                            <td className="p-2 font-bold text-rose-brand">{(metrics.qty.sg[i.name] || 0) + (metrics.qty.prSG[i.name] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end mb-2">
                <h4 className="text-[13px] font-bold text-coffee-600">單一口味產能庫存推算</h4>
                <div className="text-[10px] text-coffee-400 font-medium">* 「出貨總量」 = 單顆賣出 + 特定口味禮盒賣出 + (綜合禮盒數量 × 配方)</div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-coffee-100">
                <table className="w-full text-xs text-center border-collapse bg-white">
                  <thead className="bg-[#e2ece9]/30 text-coffee-600">
                    <tr>
                      <th className="p-2 text-left">口味</th>
                      <th className="p-2">原庫存</th>
                      <th className="p-2">預產量</th>
                      <th className="p-2">實產量</th>
                      <th className="p-2">耗損</th>
                      <th className="p-2 whitespace-nowrap">出貨總量</th>
                      <th className="p-2 font-bold">結存</th>
                      <th className="p-2">損耗率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                    {(() => {
                        const uniqueFlavors = Array.from(new Set([
                            ...settings.giftItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name),
                            ...settings.singleItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name)
                        ]));

                        return uniqueFlavors.map(f => {
                            const inv = dailyData.inventory[f] || { org: 0, exp: 0, act: 0, los: 0 };
                            
                            let gbConsumption = 0;
                            settings.giftItems.forEach(gb => {
                                const countInBox = (gb.recipe && gb.recipe[f]) ? gb.recipe[f] : 0;
                                const totalGBSold = (metrics.qty.gb[gb.name] || 0) + (metrics.qty.prGB[gb.name] || 0);
                                gbConsumption += totalGBSold * countInBox;
                            });
            
                            const outTotal = (metrics.qty.sg[f]||0) + (metrics.qty.prSG[f]||0) + gbConsumption;
                            const flavorLossTotal = dailyData.losses.filter(l => l.flavor === f).reduce((sum, l) => sum + l.qty, 0);

                            const todayRemain = inv.org + inv.act - flavorLossTotal - outTotal;
                            let rate = 0; if(inv.act > 0) rate = (flavorLossTotal / inv.act) * 100;

                            return (
                                <tr key={f}>
                                    <td className="p-2 text-left font-bold">{f}</td>
                                    <td className="p-2"><input type="number" readOnly value={inv.org || 0} className="w-10 text-center bg-gray-100 rounded text-gray-500 outline-none" /></td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={inv.exp || ''} 
                                            onChange={e => updateDaily({ inventory: { ...dailyData.inventory, [f]: { ...inv, exp: parseNum(e.target.value) } } })}
                                            className="w-12 text-center border border-gray-200 rounded focus:border-coffee-400 outline-none" 
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={inv.act || ''} 
                                            onChange={e => updateDaily({ inventory: { ...dailyData.inventory, [f]: { ...inv, act: parseNum(e.target.value) } } })}
                                            className="w-12 text-center border border-gray-200 rounded focus:border-coffee-400 outline-none" 
                                        />
                                    </td>
                                    <td className="p-2"><input type="number" readOnly value={flavorLossTotal} className="w-10 text-center bg-gray-100 rounded text-gray-500 outline-none" /></td>
                                    <td className="p-2 font-bold text-coffee-600">{outTotal}</td>
                                    <td className={cn("p-2 font-bold text-sm", todayRemain < 0 ? 'text-danger-brand' : 'text-mint-brand')}>{todayRemain}</td>
                                    <td className="p-2 text-coffee-400">{rate.toFixed(1)}%</td>
                                </tr>
                            );
                        });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 耗損紀錄簿 */}
            <div className="lg:col-span-3 glass-panel p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="flex items-center gap-2 text-lg font-bold text-coffee-800">
                  <Trash2 className="w-5 h-5 text-gray-400" /> 耗損紀錄簿
                </h3>
                <button 
                  onClick={() => {
                    const flavors = Array.from(new Set([
                      ...settings.giftItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name),
                      ...settings.singleItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name)
                    ]));
                    updateDaily({
                      losses: [...dailyData.losses, { id: uid(), flavor: flavors[0] || '', qty: 0, type: '技術', notes: '' }]
                    })
                  }}
                  className="px-3 py-1.5 bg-rose-brand text-white text-xs font-bold rounded-lg hover:bg-rose-brand/90 transition-colors shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 新增耗損
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-coffee-100">
                <table className="w-full text-xs text-center border-collapse bg-white">
                  <thead className="bg-rose-50/50 text-rose-800">
                    <tr>
                      <th className="p-3 text-left w-[120px]">品項口味</th>
                      <th className="p-3 w-[80px]">數量</th>
                      <th className="p-3 w-[100px]">耗損類別</th>
                      <th className="p-3 text-left">詳細備註</th>
                      <th className="p-3 w-[60px] text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                    {dailyData.losses.map((loss, idx) => {
                      const allFlavors = Array.from(new Set([
                        ...settings.giftItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name),
                        ...settings.singleItems.filter(i=>i.active && i.name!=='綜合').map(i=>i.name)
                      ]));
                      return (
                        <tr key={loss.id}>
                          <td className="p-2">
                            <select 
                              value={loss.flavor} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].flavor = e.target.value;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 outline-none text-coffee-700"
                            >
                              {allFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              value={loss.qty || ''} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].qty = parseNum(e.target.value);
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-[60px] text-center border border-gray-200 rounded py-1 outline-none focus:border-rose-brand" 
                            />
                          </td>
                          <td className="p-2">
                            <select 
                              value={loss.type} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].type = e.target.value as any;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 outline-none text-coffee-700"
                            >
                              <option value="技術">技術</option>
                              <option value="人為">人為</option>
                              <option value="過期">過期</option>
                              <option value="吃掉">吃掉</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={loss.notes || ''} 
                              onChange={e => {
                                const newLosses = [...dailyData.losses];
                                newLosses[idx].notes = e.target.value;
                                updateDaily({ losses: newLosses });
                              }}
                              className="w-full border border-gray-200 rounded px-2 py-1 outline-none focus:border-rose-brand" 
                            />
                          </td>
                          <td className="p-2 text-right">
                            <button 
                              onClick={() => updateDaily({ losses: dailyData.losses.filter(l => l.id !== loss.id) })}
                              className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/5 rounded transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {dailyData.losses.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-gray-400 italic bg-gray-50">尚無耗損紀錄</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'import' && (
        <ImportTab settings={settings} shopId={shopId} currentDate={currentDate} dailyData={dailyData} updateDaily={updateDaily} />
      )}

      {subTab === 'settings' && (
        <SettingsTab settings={settings} shopId={shopId} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components for DailyView (to keep the main component readable)
// -----------------------------------------------------------------------------

function SettingsTab({ settings, shopId }: { settings: Settings; shopId: string }) {
  const updateSettings = async (newSettings: Settings) => {
    try {
      await setDoc(doc(db, 'shops', shopId, 'meta', 'settings'), newSettings);
    } catch (e: any) {
      alert('設定儲存失敗: ' + e.message);
      console.error(e);
    }
  };

  const handleToggle = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number, active: boolean) => {
    const newItems = [...settings[type]];
    newItems[idx] = { ...newItems[idx], active };
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleChange = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number, field: string, val: any) => {
    const newItems = [...settings[type]];
    newItems[idx] = { ...newItems[idx], [field]: val };
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleDelete = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number) => {
    // Note: window.confirm is blocked in iframe previews, directly deleting instead
    const newItems = [...settings[type]];
    newItems.splice(idx, 1);
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleAdd = (type: 'giftItems' | 'singleItems' | 'packagingItems') => {
    const newItems = [...settings[type], { id: uid(), name: '新品項', price: 0, active: true }];
    updateSettings({ ...settings, [type]: newItems });
  };

  // Custom Categories handlers
  const handleAddCustomCategory = () => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.push({
        id: uid(),
        name: `自訂新類別 ${newCategories.length + 1}`,
        items: []
    });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleRenameCustomCategory = (idx: number, newName: string) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[idx].name = newName;
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleDeleteCustomCategory = (idx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.splice(idx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomToggle = (catIdx: number, itemIdx: number, active: boolean) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items[itemIdx].active = active;
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomChange = (catIdx: number, itemIdx: number, field: string, val: any) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items[itemIdx] = { ...newCategories[catIdx].items[itemIdx], [field]: val };
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomDelete = (catIdx: number, itemIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.splice(itemIdx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleAddCustomItem = (catIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.push({ id: uid(), name: '新品項', price: 0, active: true });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const [recipeModal, setRecipeModal] = useState<{ isOpen: boolean; gbIndex: number | null }>({ isOpen: false, gbIndex: null });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center glass-panel p-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
          <SettingsIcon className="w-6 h-6 text-coffee-600" /> 品項與價格全域設定
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={handleAddCustomCategory} className="bg-coffee-600 text-white border text-sm font-bold border-coffee-600 px-4 py-2 rounded-xl hover:bg-coffee-700 transition shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> 自訂新類別
          </button>
          <button onClick={() => window.location.reload()} className="bg-white border text-sm font-bold border-coffee-200 px-4 py-2 rounded-xl text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> 重新整理
          </button>
        </div>
      </div>

      {[{ type: 'giftItems', title: '禮盒', icon: Gift }, { type: 'singleItems', title: '單顆', icon: Cookie }, { type: 'packagingItems', title: '物流包材', icon: Box }].map(t => {
        const typeTag = t.type as 'giftItems' | 'singleItems' | 'packagingItems';
        return (
          <div key={t.type} className="glass-panel p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
              <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
                <t.icon className="w-5 h-5 text-mint-brand" /> {t.title}品項設定
              </h2>
              <button 
                onClick={() => handleAdd(typeTag)}
                className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> 新增
              </button>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-coffee-100">
              <table className="w-full text-sm text-center border-collapse bg-white">
                <thead className="bg-[#faf7f2] text-coffee-600">
                  <tr>
                    <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (顯示於明細)</th>
                    <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                    <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                    {t.type === 'giftItems' && <th className="p-3 border-b border-[#f0ede8]">內容配方</th>}
                    <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {settings[typeTag].map((item, idx) => (
                    <tr key={item.id} className="hover:bg-coffee-50 transition">
                      <td className="p-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={item.active} onChange={(e) => handleToggle(typeTag, idx, e.target.checked)} />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                        </label>
                      </td>
                      <td className="p-3">
                        <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleChange(typeTag, idx, 'name', e.target.value)} />
                      </td>
                      <td className="p-3">
                        <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleChange(typeTag, idx, 'price', parseNum(e.target.value))} />
                      </td>
                      {t.type === 'giftItems' && (
                        <td className="p-3">
                          <button 
                            onClick={() => setRecipeModal({ isOpen: true, gbIndex: idx })}
                            className="text-xs bg-coffee-100 hover:bg-coffee-200 text-coffee-700 font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            📝 配方 ({Object.values(item.recipe || {}).reduce((a,b)=>a+b, 0)}顆)
                          </button>
                        </td>
                      )}
                      <td className="p-3">
                        <button onClick={() => handleDelete(typeTag, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {settings[typeTag].length === 0 && <tr><td colSpan={t.type === 'giftItems' ? 5 : 4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(settings.customCategories || []).map((cat, catIdx) => (
        <div key={cat.id} className="glass-panel p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
            <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
              <Package className="w-5 h-5 text-mint-brand" /> 
              <input 
                className="bg-transparent outline-none border-b border-transparent focus:border-coffee-300 w-32 md:w-auto" 
                value={cat.name} 
                onChange={(e) => handleRenameCustomCategory(catIdx, e.target.value)} 
              />
            </h2>
            <div className="flex gap-2">
                <button 
                  onClick={() => handleAddCustomItem(catIdx)}
                  className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> 新增
                </button>
                <button 
                  onClick={() => handleDeleteCustomCategory(catIdx)}
                  className="bg-white border text-sm font-bold border-red-200 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition shadow-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> 刪除類別
                </button>
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-lg border border-coffee-100">
            <table className="w-full text-sm text-center border-collapse bg-white">
              <thead className="bg-[#faf7f2] text-coffee-600">
                <tr>
                  <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (顯示於明細)</th>
                  <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                  <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                  <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede8]">
                {cat.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-coffee-50 transition">
                    <td className="p-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={item.active} onChange={(e) => handleCustomToggle(catIdx, idx, e.target.checked)} />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                      </label>
                    </td>
                    <td className="p-3">
                      <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleCustomChange(catIdx, idx, 'name', e.target.value)} />
                    </td>
                    <td className="p-3">
                      <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleCustomChange(catIdx, idx, 'price', parseNum(e.target.value))} />
                    </td>
                    <td className="p-3">
                      <button onClick={() => handleCustomDelete(catIdx, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {cat.items.length === 0 && <tr><td colSpan={4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {recipeModal.isOpen && recipeModal.gbIndex !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99] flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800">設定「{settings.giftItems[recipeModal.gbIndex].name}」配方</h3>
              <button onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })} className="p-1 text-gray-400 hover:text-coffee-600 rounded"><Trash2 className="w-5 h-5 hidden"/><span className="text-xl leading-none">&times;</span></button>
            </div>
            <div className="p-6 space-y-4">
              {settings.singleItems.map(sg => {
                const gb = settings.giftItems[recipeModal.gbIndex!];
                const count = gb.recipe?.[sg.name] || 0;
                return (
                  <div key={sg.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="font-bold text-coffee-700">{sg.name}</span>
                    <input 
                      type="number" 
                      min="0"
                      className="w-16 text-center border-none shadow-sm rounded-md py-1 font-bold text-coffee-800 outline-none focus:ring-2 focus:ring-mint-brand" 
                      value={count}
                      onChange={(e) => {
                        const newGBItems = [...settings.giftItems];
                        if(!newGBItems[recipeModal.gbIndex!].recipe) newGBItems[recipeModal.gbIndex!].recipe = {};
                        newGBItems[recipeModal.gbIndex!].recipe![sg.name] = parseNum(e.target.value);
                        updateSettings({ ...settings, giftItems: newGBItems });
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })}
                className="bg-brand-brown text-white font-bold bg-coffee-800 px-6 py-2 rounded-xl shadow-md hover:bg-coffee-900 transition active:scale-95"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportTab({ settings, shopId, currentDate, dailyData, updateDaily }: { settings: Settings; shopId: string; currentDate: string; dailyData: DailyReport; updateDaily: (patch: Partial<DailyReport>) => void }) {
  const [importText, setImportText] = useState('');
  const [parsedOrders, setParsedOrders] = useState<any[]>([]);

  const processImport = () => {
    const raw = importText.trim();
    if (!raw) return alert("請貼上資料");

    const isTSV = raw.indexOf('\t') !== -1;
    let rows: string[][] = [];
    if (isTSV) {
      rows = raw.split('\n').map(r => r.split('\t').map(c => c.trim()));
    } else {
      rows = raw.split('\n').map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i+1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      });
    }

    if (rows.length < 2) return alert("資料格式不正確 (需包含標題列)");

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const getIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const idxBuyer = getIdx(['訂購人姓名', '姓名']);
    const idxPhone = getIdx(['訂購人電話', '電話']);
    const idxAddr = getIdx(['宅配地址', '地址']);
    const idxStoreDate = getIdx(['預約取貨日期', '店取']);
    const idxShipDate = getIdx(['宅配出貨日', '出貨']);
    const idxMethod = getIdx(['取貨方式', '物流']);

    const customItemsAcc = (settings.customCategories || []).flatMap(cat => cat.items);
    const allItems = [...settings.giftItems, ...settings.singleItems, ...settings.packagingItems, ...customItemsAcc].sort((a,b) => b.name.length - a.name.length);
    const itemMap: { item: any, colIdx: number }[] = [];
    
    headers.forEach((h, colIdx) => {
      const match = allItems.find(i => h.includes(i.name) || i.name.includes(h));
      if (match) {
        if (!itemMap.some(m => m.colIdx === colIdx)) {
          itemMap.push({ item: match, colIdx });
        }
      }
    });

    const parsed: any[] = [];
    dataRows.forEach((row, rowIdx) => {
      if (row.length < 3 || !row.some(c => c)) return;

      const method = idxMethod !== -1 && row[idxMethod] ? row[idxMethod] : '';
      let targetDate = '';
      if (method && method.includes('店')) {
        targetDate = idxStoreDate !== -1 ? row[idxStoreDate] : '';
      } else if (method && method.includes('宅配')) {
        targetDate = idxShipDate !== -1 ? row[idxShipDate] : '';
      } else {
        targetDate = (idxStoreDate !== -1 && row[idxStoreDate]) || (idxShipDate !== -1 && row[idxShipDate]) || '';
      }

      const d = targetDate.trim() ? targetDate.trim().replace(/\//g, '-') : currentDate;

      const buyer = idxBuyer !== -1 ? row[idxBuyer] : `未命名訂單 (${rowIdx+1})`;
      const phone = idxPhone !== -1 ? row[idxPhone] : '';
      let addr = idxAddr !== -1 ? row[idxAddr] : '';
      if (!addr && method) addr = method; // fall back to method if address is empty

      let shipAmt = 0;
      if (method) {
        const smatch = method.match(/運費(\d+)/);
        if (smatch) {
          shipAmt = parseInt(smatch[1]);
        }
      }

      const items: Record<string, number> = {};
      let prodAmt = 0;
      itemMap.forEach(m => {
        const val = row[m.colIdx];
        if (val) {
          const match = val.match(/(\d+)\s*份/) || val.match(/(\d+)/);
          if (match) {
            const qty = parseInt(match[1]);
            if (qty > 0) {
              items[m.item.id] = qty;
              prodAmt += qty * m.item.price;
            }
          }
        }
      });

      if (Object.keys(items).length > 0) {
        parsed.push({
          date: d,
          buyer, phone, addr, items, prodAmt, shipAmt
        });
      }
    });

    setParsedOrders(parsed);
  };

  const confirmImport = async () => {
    // Note: window.confirm is blocked in iframe previews, performing import directly
    // Group by date
    const byDate: Record<string, any[]> = {};
    parsedOrders.forEach(po => {
      if (!byDate[po.date]) byDate[po.date] = [];
      byDate[po.date].push(po);
    });

    for (const [date, orders] of Object.entries(byDate)) {
      if (date === currentDate) {
        const appended = orders.map(po => ({
          id: uid(),
          buyer: po.buyer,
          items: po.items,
          prodAmt: po.prodAmt,
          shipAmt: po.shipAmt,
          discAmt: 0,
          actualAmt: po.prodAmt + po.shipAmt,
          status: '匯款' as const,
          note: `${po.phone} | ${po.addr}`.trim(),
          phone: po.phone,
          address: po.addr
        }));
        updateDaily({ orders: [...dailyData.orders, ...appended] });
      } else {
        const ref = doc(db, 'shops', shopId, 'daily', date);
        const snap = await getDoc(ref);
        let existingOrders: Order[] = [];
        let existingData = {};
        if (snap.exists()) {
          existingData = snap.data();
          existingOrders = snap.data().orders || [];
        }

        const appended = orders.map(po => ({
          id: uid(),
          buyer: po.buyer,
          items: po.items,
          prodAmt: po.prodAmt,
          shipAmt: po.shipAmt,
          discAmt: 0,
          actualAmt: po.prodAmt + po.shipAmt,
          status: '匯款' as const,
          note: `${po.phone} | ${po.addr}`.trim(),
          phone: po.phone,
          address: po.addr
        }));
        
        await setDoc(ref, { 
          ...existingData, 
          date, 
          orders: [...existingOrders, ...appended] 
        }, { merge: true });
      }
    }

    alert("匯入成功！");
    setImportText('');
    setParsedOrders([]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-6 shadow-sm border border-coffee-100">
        <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-mint-brand/40">
          <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
            <FileUp className="w-5 h-5 text-mint-brand" /> 訂單匯入
          </h2>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-coffee-200 bg-white text-coffee-600 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition" onClick={() => { setImportText(''); setParsedOrders([]); }}>清空</button>
            <button className="px-4 py-2 bg-coffee-600 text-white font-bold rounded-xl shadow-sm hover:bg-coffee-700 transition flex items-center gap-2" onClick={processImport}>
              <Wand2 className="w-4 h-4" /> 解析資料
            </button>
          </div>
        </div>

        <textarea 
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder="在此貼上 Google 表單或 Excel 複製來的整列資料..." 
          className="w-full h-32 md:h-48 rounded-xl border border-coffee-100 p-4 font-mono text-sm bg-white/70 outline-none focus:ring-2 focus:ring-mint-brand focus:border-transparent placeholder:text-gray-300 shadow-inner"
        />

        {parsedOrders.length > 0 && (
          <div className="mt-6 p-4 bg-mint-brand/5 border border-mint-brand/20 rounded-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-mint-brand">待匯入預覽 ({parsedOrders.length} 筆)</h3>
              <button className="px-4 py-2 bg-mint-brand text-white font-bold rounded-lg shadow-sm hover:bg-mint-brand/80 transition" onClick={confirmImport}>
                確認匯入以上資料
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center border-collapse bg-white border border-gray-100 rounded-lg">
                <thead className="bg-gray-50 text-gray-500">
                  <tr><th className="p-2 border-b border-gray-100">日期</th><th className="p-2 border-b border-gray-100">訂購人</th><th className="p-2 border-b border-gray-100">電話</th><th className="p-2 border-b border-gray-100 text-left">項目</th><th className="p-2 border-b border-gray-100">運費</th><th className="p-2 border-b border-gray-100">總額</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedOrders.map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-2">{o.date}</td>
                      <td className="p-2 font-bold">{o.buyer}</td>
                      <td className="p-2">{o.phone}</td>
                      <td className="p-2 text-left">{Object.keys(o.items).reduce((acc, curr) => acc + o.items[curr], 0)} 件商品</td>
                      <td className="p-2">{o.shipAmt > 0 ? `$${fmt(o.shipAmt)}` : '-'}</td>
                      <td className="p-2 font-bold text-rose-brand">${fmt(o.prodAmt + o.shipAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Weekly View (Optional Placeholder) */}
      <div className="glass-panel p-6 border border-coffee-100 shadow-sm bg-coffee-50/30">
        <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800 mb-4">
          <CalendarDays className="w-5 h-5 text-coffee-500" /> 匯入與歷史說明
        </h2>
        <div className="text-sm text-coffee-600 bg-white p-4 rounded-xl shadow-sm border border-coffee-50 leading-relaxed">
          若有匯入到其他日期的訂單，請切換上方的日期挑選器至該日，即可檢視明細並自動結算總金額及存貨扣減。<br/><br/>
          * 解析時會自動使用您在「品項設定」中的名稱對應表單欄位，請確認表單欄位名稱包含品項關鍵字（例：包含「原味」或「原味禮盒」字眼）。
        </div>
      </div>
    </div>
  );
}
