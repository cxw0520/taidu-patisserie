import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { fmt, parseNum, monthISO } from '../lib/utils';
import { DailyReport, Settings } from '../types';
import { Wallet, PieChart as ChartIcon, TrendingUp, ReceiptText, Users, Home, Lightbulb, Wrench, Info, Megaphone } from 'lucide-react';
import { cn } from '../lib/utils';

export default function MonthlyView({ settings, shopId }: { settings: Settings, shopId: string }) {
  const [selectedMonth, setSelectedMonth] = useState(monthISO());
  const [monthData, setMonthData] = useState<DailyReport[]>([]);
  const [fixedCosts, setFixedCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonth = async () => {
      setLoading(true);
      const q = query(
        collection(db, 'shops', shopId, 'daily'),
        where('date', '>=', `${selectedMonth}-01`),
        where('date', '<=', `${selectedMonth}-31`)
      );
      const snap = await getDocs(q);
      setMonthData(snap.docs.map(d => d.data() as DailyReport));
      setLoading(false);
    };
    fetchMonth();

    const unsub = onSnapshot(doc(db, 'shops', shopId, 'monthly', selectedMonth), (snap) => {
      if (snap.exists()) setFixedCosts(snap.data().fixed || {});
      else setFixedCosts({});
    });
    return () => unsub();
  }, [selectedMonth, shopId]);

  const stats = useMemo(() => {
    const s = {
      rev: 0,
      ship: 0,
      disc: 0,
      pr: 0,
      remit: 0,
      cash: 0,
      ar: 0,
      logSpent: 0,
      pkgCost: 0,
      ingredCost: 0
    };

    monthData.forEach(d => {
      d.orders.forEach(o => {
        const isPR = o.status === '公關品';
        if (isPR) {
          s.pr += o.prodAmt;
        } else {
          s.rev += o.prodAmt;
          s.ship += o.shipAmt;
          s.disc += o.discAmt;
          if (o.status === '匯款') s.remit += o.actualAmt;
          if (o.status === '現結') s.cash += o.actualAmt;
          if (o.status === '未結帳款') s.ar += o.actualAmt;
        }
        
        // Estimate ingredient cost (simplified)
        Object.entries(o.items).forEach(([id, qty]) => {
          const item = [...settings.giftItems, ...settings.singleItems].find(i => i.id === id);
          if (item) {
            const unitCost = item.category === 'gift' ? 420 : 45;
            s.ingredCost += parseNum(qty) * unitCost;
          }
        });
      });
      s.logSpent += parseNum(d.ar.logSpent);
      Object.entries(d.packagingUsage || {}).forEach(([id, qty]) => {
        const p = settings.packagingItems.find(x => x.id === id);
        if (p) s.pkgCost += parseNum(qty) * parseNum(p.price);
      });
    });

    const fixedTotal: number = Object.values(fixedCosts).reduce<number>((acc, val) => acc + parseNum(val), 0);
    const variable: number = s.ingredCost + s.pkgCost + s.logSpent;
    const net: number = s.rev - s.disc - variable - fixedTotal;

    return { ...s, fixedTotal, variable, net };
  }, [monthData, fixedCosts, settings]);

  const updateFixed = async (key: string, val: number) => {
    const next = { ...fixedCosts, [key]: val };
    setFixedCosts(next);
    await setDoc(doc(db, 'shops', shopId, 'monthly', selectedMonth), { 
      ym: selectedMonth, 
      fixed: next,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 h-full">
      <div className="glass-panel p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h3 className="section-title">
              <ReceiptText className="w-5 h-5 inline-block mr-2 mb-1" /> 態度貳貳營運月報表
            </h3>
            <p className="text-coffee-400 text-sm mt-1">匯總單月數據，深入分析營收與固定支出佔比。</p>
          </div>
          <input 
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-coffee-200 rounded-full px-6 py-2 font-bold text-coffee-600 outline-none focus:ring-2 focus:ring-rose-brand/20 focus:border-rose-brand transition-all shadow-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <div className="kpi-card border border-coffee-50 shadow-sm">
            <span className="kpi-label">本月營業淨額</span>
            <span className="kpi-value">${fmt(stats.rev - stats.disc)}</span>
          </div>
          <div className="kpi-card border border-coffee-50 shadow-sm">
            <span className="kpi-label">變動成本合計</span>
            <span className="kpi-value text-rose-brand">${fmt(stats.variable)}</span>
          </div>
          <div className="kpi-card border border-coffee-50 shadow-sm">
            <span className="kpi-label">本月固定支出</span>
            <span className="kpi-value text-rose-brand">${fmt(stats.fixedTotal)}</span>
          </div>
          <div className="kpi-card border border-coffee-50 shadow-sm bg-[#faf7f2]">
            <span className="kpi-label">全月預估獲利</span>
            <span className="kpi-value text-mint-brand">${fmt(stats.net)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-12 space-y-8">
            <div className="rounded-[24px] overflow-hidden border border-coffee-50 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-[#faf7f2]">
                  <tr className="text-coffee-400 font-bold uppercase tracking-widest text-[10px]">
                    <th className="px-6 py-4 text-left border-b border-[#f0ede8]">財務明細項目</th>
                    <th className="px-6 py-4 text-right border-b border-[#f0ede8]">金額</th>
                    <th className="px-6 py-4 text-left border-b border-[#f0ede8] pl-10">對應說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  <tr className="hover:bg-coffee-50/20 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-mint-brand/10 rounded-full flex items-center justify-center text-mint-brand">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-coffee-700">銷售營業總額</span>
                    </td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-lg text-coffee-800">${fmt(stats.rev)}</td>
                    <td className="px-6 py-4 text-coffee-400 pl-10">當月合計商品訂單金額 (未扣折扣)</td>
                  </tr>
                  <tr className="hover:bg-coffee-50/20 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-rose-brand/10 rounded-full flex items-center justify-center text-rose-brand">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-coffee-700">行銷折讓與公關品</span>
                    </td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-lg text-rose-brand">-${fmt(stats.disc + stats.pr)}</td>
                    <td className="px-6 py-4 text-coffee-400 pl-10">含折扣、手續費、運補及公關成本</td>
                  </tr>
                  <tr className="hover:bg-coffee-50/20 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-coffee-100 rounded-full flex items-center justify-center text-coffee-600">
                        <ChartIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-coffee-700">全月變動成本</span>
                    </td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-lg text-rose-brand">-${fmt(stats.variable)}</td>
                    <td className="px-6 py-4 text-coffee-400 pl-10">含預估食材、包材支出與實際物流費用</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="glass-panel p-8">
              <h3 className="section-title mb-8">
                <Users className="w-5 h-5 inline-block mr-2 mb-1" /> 固定支出管理 (Fixed Expenses)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                {[
                  { id: 'rent', label: '店鋪房租', icon: Home },
                  { id: 'util', label: '水電雜支', icon: Lightbulb },
                  { id: 'staff', label: '人事費用', icon: Users },
                  { id: 'maint', label: '設備維修', icon: Wrench },
                  { id: 'misc', label: '會計雜項', icon: Info },
                  { id: 'ads', label: '行銷廣告', icon: Megaphone },
                ].map(item => (
                  <div key={item.id} className="kpi-card border border-coffee-50 group hover:border-rose-brand hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-coffee-50 rounded-xl flex items-center justify-center text-coffee-600 group-hover:bg-rose-brand group-hover:text-white transition-colors">
                          <item.icon className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-coffee-700 text-sm">{item.label}</span>
                      </div>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-coffee-300 font-serif-brand text-xs mb-1">$</span>
                      <input 
                        type="number"
                        className="w-full text-2xl font-serif-brand font-bold bg-transparent border-b border-transparent focus:border-rose-brand outline-none text-coffee-800 transition-all placeholder:text-coffee-50"
                        placeholder="0"
                        value={fixedCosts[item.id] || ''}
                        onChange={(e) => updateFixed(item.id, parseNum(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
