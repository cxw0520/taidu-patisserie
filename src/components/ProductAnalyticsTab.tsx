import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { DailyReport, Settings, Item, Order } from '../types';
import { parseNum } from '../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie, ResponsiveContainer, LineChart, Line,
} from 'recharts';

// ── Color palette (warm, coffee-theme) ──────────────────────────
const PALETTE = [
  '#e8806f', '#6aab80', '#7e96cc', '#e8a84a', '#b87bc8',
  '#5aaec8', '#d4955a', '#5aae7a', '#c87070', '#8a8acc',
  '#5a9ec8', '#c8934a', '#7ac8b8', '#b8c87a', '#c87ab8',
];

const WEEKDAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

// ── Helpers ──────────────────────────────────────────────────────
const normalizeDate = (date: string): string =>
  date.replace(
    /^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/,
    (_, y, m, d) => `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
  );

const hexToRgb = (hex: string): string => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}`
    : '107, 76, 42';
};

// Extract sold qty per item from orders (excluding PR, cancelled, topup, prepayment)
const getOrderQtys = (orders: Order[]): Record<string, number> => {
  const qtys: Record<string, number> = {};
  (orders || []).forEach((o) => {
    if (!o) return;
    if (o.status === '公關品' || o.status === '已取消' || o.status === '已刪除') return;
    if (o.orderType === 'topup' || o.orderType === 'prepayment') return;
    Object.entries(o.items || {}).forEach(([itemId, qty]) => {
      const n = typeof qty === 'number' ? qty : parseNum(qty as any);
      if (n > 0) qtys[itemId] = (qtys[itemId] || 0) + n;
    });
  });
  return qtys;
};

// ── Custom Tooltip ────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter((p: any) => (p.value || 0) > 0);
  if (!filtered.length) return null;
  return (
    <div className="bg-white border border-coffee-100 rounded-xl shadow-xl p-3 text-sm max-w-[220px] z-50">
      <p className="font-bold text-coffee-800 mb-2 border-b border-coffee-50 pb-1 text-xs">{label}</p>
      {filtered.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill || p.stroke }} />
          <span className="text-coffee-600 flex-1 text-xs truncate">{p.name}</span>
          <span className="font-mono font-bold text-coffee-800 ml-2 text-xs">
            {typeof p.value === 'number' && !Number.isInteger(p.value)
              ? p.value.toFixed(1)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const PANEL = 'bg-white rounded-2xl border border-coffee-100 shadow-sm p-6';

// ── Main Component ────────────────────────────────────────────────
interface Props {
  monthData: DailyReport[];
  settings: Settings;
  shopId: string;
  selectedMonth: string;
}

export default function ProductAnalyticsTab({ monthData, settings, shopId, selectedMonth }: Props) {
  const [multiMonthData, setMultiMonthData] = useState<Record<string, DailyReport[]>>({});
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [compareWeekday, setCompareWeekday] = useState<number>(2); // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun (default 2 = Wednesday)

  const allItems: Item[] = useMemo(() => [
    ...(settings.giftItems || []),
    ...(settings.singleItems || []),
    ...((settings.customCategories || []).flatMap((c) => c.items || [])),
  ], [settings]);

  // Load past 6 months data for trend chart
  useEffect(() => {
    if (!shopId || !selectedMonth) return;
    setLoadingTrend(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    Promise.all(
      months.map(async (m) => {
        if (m === selectedMonth) return [m, monthData] as [string, DailyReport[]];
        try {
          const snap = await getDocs(query(
            collection(db, 'shops', shopId, 'daily'),
            where('date', '>=', `${m}-01`),
            where('date', '<=', `${m}-31`)
          ));
          return [m, snap.docs.map(d => d.data() as DailyReport)] as [string, DailyReport[]];
        } catch {
          return [m, []] as [string, DailyReport[]];
        }
      })
    ).then((results) => {
      const obj: Record<string, DailyReport[]> = {};
      results.forEach(([m, data]) => { obj[m] = data; });
      setMultiMonthData(obj);
      setLoadingTrend(false);
    });
  }, [shopId, selectedMonth]); // Intentionally excludes monthData to avoid re-fetch loop

  // Total qty per item this month
  const productStats = useMemo(() => {
    const stats: Record<string, number> = {};
    monthData.forEach((d) => {
      Object.entries(getOrderQtys(d.orders)).forEach(([id, qty]) => {
        stats[id] = (stats[id] || 0) + qty;
      });
    });
    return stats;
  }, [monthData]);

  // Items with at least 1 sale, sorted by qty descending
  const activeItems = useMemo(() =>
    allItems
      .filter((item) => (productStats[item.id] || 0) > 0)
      .sort((a, b) => (productStats[b.id] || 0) - (productStats[a.id] || 0)),
    [allItems, productStats]
  );

  // Consistent color mapping per item (used across all 6 charts)
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    activeItems.forEach((item, i) => { map[item.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [activeItems]);

  // ① Ranking data
  const rankingData = useMemo(() =>
    activeItems.map((item) => ({
      name: item.name,
      qty: productStats[item.id] || 0,
      color: colorMap[item.id],
    })),
    [activeItems, productStats, colorMap]
  );

  // ② Heatmap data
  const { daysInMonth, heatGrid, maxHeatQty } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const grid: Record<string, Record<string, number>> = {};
    monthData.forEach((d) => {
      const norm = normalizeDate(d.date);
      if (!grid[norm]) grid[norm] = {};
      Object.entries(getOrderQtys(d.orders)).forEach(([id, qty]) => {
        grid[norm][id] = (grid[norm][id] || 0) + qty;
      });
    });
    let maxQ = 0;
    Object.values(grid).forEach((day) =>
      Object.values(day).forEach((q) => { if (q > maxQ) maxQ = q; })
    );
    return { daysInMonth: days, heatGrid: grid, maxHeatQty: maxQ || 1 };
  }, [monthData, selectedMonth]);

  // ③ Pie data
  const pieData = useMemo(() =>
    activeItems.map((item) => ({
      name: item.name,
      value: productStats[item.id] || 0,
      color: colorMap[item.id],
    })),
    [activeItems, productStats, colorMap]
  );
  const totalQty = pieData.reduce((a, b) => a + b.value, 0);

  // ④ Multi-month trend data
  const trendData = useMemo(() =>
    Object.keys(multiMonthData)
      .sort()
      .map((m) => {
        const data = multiMonthData[m] || [];
        const row: Record<string, any> = {
          month: `${parseInt(m.split('-')[1])}月`,
          _key: m,
        };
        data.forEach((d) => {
          Object.entries(getOrderQtys(d.orders)).forEach(([id, qty]) => {
            row[id] = (row[id] || 0) + qty;
          });
        });
        return row;
      }),
    [multiMonthData]
  );

  // ⑤ Weekday average data
  const weekdayData = useMemo(() => {
    const totals: Record<number, Record<string, number>> = {};
    const counts: Record<number, number> = {};
    for (let i = 0; i < 7; i++) { totals[i] = {}; counts[i] = 0; }
    monthData.forEach((d) => {
      const jsDay = new Date(`${normalizeDate(d.date)}T12:00:00`).getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 … Sun=6
      counts[idx]++;
      Object.entries(getOrderQtys(d.orders)).forEach(([id, qty]) => {
        totals[idx][id] = (totals[idx][id] || 0) + qty;
      });
    });
    return WEEKDAYS.map((label, i) => {
      const row: Record<string, any> = { day: label };
      activeItems.forEach((item) => {
        const t = totals[i][item.id] || 0;
        const c = counts[i] || 1;
        row[item.id] = parseFloat((t / c).toFixed(1));
      });
      return row;
    });
  }, [monthData, activeItems]);

  // ⑥ Week breakdown data (calendar weeks: Mon–Sun, merging 5th/6th weeks if present)
  const { weekNumData, weekNotes } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    // 1. Identify all raw calendar weeks (Mon–Sun)
    const rawWeeks: { start: number; end: number }[] = [];
    let currentStart = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun, 1=Mon ... 6=Sat
      if (jsDay === 0 || d === daysInMonth) {
        rawWeeks.push({ start: currentStart, end: d });
        currentStart = d + 1;
      }
    }

    const finalWeeks: { start: number; end: number; mergedLabel?: string }[] = [];
    const notes: string[] = [];

    if (rawWeeks.length === 4) {
      finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[0].end });
      finalWeeks.push({ start: rawWeeks[1].start, end: rawWeeks[1].end });
      finalWeeks.push({ start: rawWeeks[2].start, end: rawWeeks[2].end });
      finalWeeks.push({ start: rawWeeks[3].start, end: rawWeeks[3].end });
    } else if (rawWeeks.length === 5) {
      const firstWeekLen = rawWeeks[0].end - rawWeeks[0].start + 1;
      if (firstWeekLen < 4) {
        // Merge first week into second week (becomes new Week 1)
        finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[1].end, mergedLabel: '★' });
        finalWeeks.push({ start: rawWeeks[2].start, end: rawWeeks[2].end });
        finalWeeks.push({ start: rawWeeks[3].start, end: rawWeeks[3].end });
        finalWeeks.push({ start: rawWeeks[4].start, end: rawWeeks[4].end });
        notes.push(`★ 因首週 (${rawWeeks[0].start}-${rawWeeks[0].end}日) 未滿 4 天已併入第 1 週合併計算`);
      } else {
        // Merge fifth week into fourth week (becomes new Week 4)
        finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[0].end });
        finalWeeks.push({ start: rawWeeks[1].start, end: rawWeeks[1].end });
        finalWeeks.push({ start: rawWeeks[2].start, end: rawWeeks[2].end });
        finalWeeks.push({ start: rawWeeks[3].start, end: rawWeeks[4].end, mergedLabel: '★' });
        notes.push(`★ 因當月有第 5 週 (${rawWeeks[4].start}-${rawWeeks[4].end}日) 已併入第 4 週合併計算`);
      }
    } else if (rawWeeks.length >= 6) {
      // Merge first week into second week, and fifth/sixth weeks into fourth week
      finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[1].end, mergedLabel: '★' });
      finalWeeks.push({ start: rawWeeks[2].start, end: rawWeeks[2].end });
      finalWeeks.push({ start: rawWeeks[3].start, end: rawWeeks[3].end });
      finalWeeks.push({ start: rawWeeks[4].start, end: rawWeeks[rawWeeks.length - 1].end, mergedLabel: '★' });
      notes.push(`★ 因首週 (${rawWeeks[0].start}-${rawWeeks[0].end}日) 未滿 4 天已併入第 1 週，且當月有第 5/6 週 (${rawWeeks[4].start}-${rawWeeks[rawWeeks.length - 1].end}日) 已併入第 4 週合併計算`);
    }

    // Initialize sales totals for the 4 final weeks
    const weeksSales: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {} };
    monthData.forEach((d) => {
      const dayNum = parseInt(normalizeDate(d.date).split('-')[2]);
      let wn = 4;
      for (let i = 0; i < 4; i++) {
        if (dayNum >= finalWeeks[i]?.start && dayNum <= finalWeeks[i]?.end) {
          wn = i + 1;
          break;
        }
      }
      Object.entries(getOrderQtys(d.orders)).forEach(([id, qty]) => {
        weeksSales[wn][id] = (weeksSales[wn][id] || 0) + qty;
      });
    });

    const data = [1, 2, 3, 4].map((w) => {
      const info = finalWeeks[w - 1];
      const star = info?.mergedLabel || '';
      const row: Record<string, any> = {
        week: `第${w}週 (${info?.start}-${info?.end})${star}`,
      };
      activeItems.forEach((item) => {
        row[item.id] = weeksSales[w][item.id] || 0;
      });
      return row;
    });

    return { weekNumData: data, weekNotes: notes };
  }, [monthData, activeItems, selectedMonth]);

  // ⑦ Specific weekday cross-week comparison data
  const weekdayCompareData = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const rawWeeks: { start: number; end: number }[] = [];
    let currentStart = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const jsDay = new Date(y, m - 1, d).getDay();
      if (jsDay === 0 || d === daysInMonth) {
        rawWeeks.push({ start: currentStart, end: d });
        currentStart = d + 1;
      }
    }

    const finalWeeks: { start: number; end: number }[] = [];
    if (rawWeeks.length === 4) {
      finalWeeks.push(...rawWeeks);
    } else if (rawWeeks.length === 5) {
      const firstWeekLen = rawWeeks[0].end - rawWeeks[0].start + 1;
      if (firstWeekLen < 4) {
        finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[1].end });
        finalWeeks.push(rawWeeks[2], rawWeeks[3], rawWeeks[4]);
      } else {
        finalWeeks.push(rawWeeks[0], rawWeeks[1], rawWeeks[2]);
        finalWeeks.push({ start: rawWeeks[3].start, end: rawWeeks[4].end });
      }
    } else if (rawWeeks.length >= 6) {
      finalWeeks.push({ start: rawWeeks[0].start, end: rawWeeks[1].end });
      finalWeeks.push(rawWeeks[2], rawWeeks[3]);
      finalWeeks.push({ start: rawWeeks[4].start, end: rawWeeks[rawWeeks.length - 1].end });
    }

    const getWeekIndex = (dayNum: number): number => {
      for (let i = 0; i < 4; i++) {
        if (dayNum >= finalWeeks[i]?.start && dayNum <= finalWeeks[i]?.end) {
          return i + 1;
        }
      }
      return 4;
    };

    const matchingDays: { dateStr: string; dayNum: number; weekNum: number; sales: Record<string, number> }[] = [];

    const salesMap: Record<string, Record<string, number>> = {};
    monthData.forEach((d) => {
      const dateStr = normalizeDate(d.date);
      salesMap[dateStr] = getOrderQtys(d.orders);
    });

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      const jsDay = new Date(`${dateStr}T12:00:00`).getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 ... Sun=6
      if (idx === compareWeekday) {
        const sales = salesMap[dateStr] || {};
        matchingDays.push({
          dateStr,
          dayNum: d,
          weekNum: getWeekIndex(d),
          sales,
        });
      }
    }

    const rows: Record<string, any>[] = matchingDays.map((day) => {
      const row: Record<string, any> = {
        name: `${day.dayNum}日 (第${day.weekNum}週)`,
        isAverage: false,
      };
      activeItems.forEach((item) => {
        row[item.id] = day.sales[item.id] || 0;
      });
      return row;
    });

    const avgRow: Record<string, any> = {
      name: '當月平均值',
      isAverage: true,
    };
    activeItems.forEach((item) => {
      let sum = 0;
      let count = 0;
      matchingDays.forEach((day) => {
        if (salesMap[day.dateStr]) {
          sum += day.sales[item.id] || 0;
          count++;
        }
      });
      avgRow[item.id] = count > 0 ? parseFloat((sum / count).toFixed(1)) : 0;
    });
    rows.push(avgRow);

    return rows;
  }, [monthData, activeItems, selectedMonth, compareWeekday]);

  if (activeItems.length === 0) {
    return (
      <div className={PANEL}>
        <div className="text-center text-coffee-400 py-12 font-bold border-2 border-dashed border-coffee-200 rounded-xl bg-[#faf7f2]">
          本月尚無產品銷售資料
        </div>
      </div>
    );
  }

  const toggleLine = (dataKey: string) =>
    setHiddenLines(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));

  const rankingHeight = Math.max(220, activeItems.length * 42);

  return (
    <div className="space-y-6">

      {/* ─── Row 1: ① Ranking + ③ Pie ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ① Monthly Sales Ranking */}
        <div className={`lg:col-span-2 ${PANEL}`}>
          <div className="mb-5">
            <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">①</span>
              月銷售量排行
            </h4>
            <p className="text-xs text-coffee-400 mt-1 ml-8">按銷售數量由高至低排序（不含公關品）</p>
          </div>
          <ResponsiveContainer width="100%" height={rankingHeight}>
            <BarChart data={rankingData} layout="vertical" margin={{ top: 0, right: 48, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ede8" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#9c7e65' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fontSize: 11, fill: '#5c3d2a', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#faf7f2' }} />
              <Bar dataKey="qty" name="銷售量" radius={[0, 6, 6, 0]} maxBarSize={26}>
                {rankingData.map((_, i) => (
                  <Cell key={i} fill={rankingData[i].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ③ Product Share Donut */}
        <div className={PANEL}>
          <div className="mb-3">
            <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">③</span>
              各品項銷售佔比
            </h4>
            <p className="text-xs text-coffee-400 mt-1 ml-8">佔當月總銷售量百分比</p>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={75}
                dataKey="value"
                paddingAngle={2}
                stroke="white"
                strokeWidth={2}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val: any) => [`${val} 個`, '銷售數量']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
                <span className="text-coffee-700 flex-1 truncate">{item.name}</span>
                <span className="font-mono font-bold text-coffee-600">
                  {totalQty > 0 ? ((item.value / totalQty) * 100).toFixed(1) : '0'}%
                </span>
                <span className="text-coffee-400 font-mono text-[10px]">({item.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── ② Sales Heatmap ────────────────────────────────────── */}
      <div className={PANEL}>
        <div className="mb-4">
          <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
            <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">②</span>
            銷售熱力圖
          </h4>
          <p className="text-xs text-coffee-400 mt-1 ml-8">每日各品項銷售量 ‧ 顏色越深銷量越高 ‧ <span className="text-rose-400">紅字為週末</span></p>
        </div>
        <div className="overflow-x-auto pb-2">
          <div style={{ minWidth: `${daysInMonth * 30 + 188}px` }}>
            {/* Day header row */}
            <div className="flex mb-2 ml-[188px]">
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const jsDay = new Date(`${selectedMonth}-${String(dayNum).padStart(2, '0')}T12:00:00`).getDay();
                const isWeekend = jsDay === 0 || jsDay === 6;
                return (
                  <div
                    key={i}
                    className={`w-[30px] flex-shrink-0 text-center text-[9px] font-bold ${isWeekend ? 'text-rose-400' : 'text-coffee-400'}`}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
            {/* One row per active item */}
            {activeItems.map((item) => {
              const color = colorMap[item.id];
              const rgb = hexToRgb(color);
              return (
                <div key={item.id} className="flex items-center mb-1">
                  <div className="w-[188px] flex-shrink-0 pr-3 text-right text-[11px] text-coffee-700 font-semibold truncate">
                    {item.name}
                  </div>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayStr = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
                    const qty = heatGrid[dayStr]?.[item.id] || 0;
                    const intensity = qty / maxHeatQty;
                    return (
                      <div
                        key={i}
                        title={qty > 0 ? `${item.name}  ${i + 1}日：${qty} 個` : undefined}
                        className="w-[30px] h-[26px] flex-shrink-0 rounded-sm mx-[0px] flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110 cursor-default"
                        style={{
                          backgroundColor: qty > 0
                            ? `rgba(${rgb}, ${Math.max(0.2, intensity * 0.85 + 0.15)})`
                            : '#f5f0ea',
                          color: intensity > 0.5 ? 'white' : qty > 0 ? color : '#d5c9bd',
                        }}
                      >
                        {qty > 0 ? qty : ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── ④ Cross-month trend ────────────────────────────────── */}
      <div className={PANEL}>
        <div className="mb-4">
          <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
            <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">④</span>
            跨月銷售趨勢
          </h4>
          <p className="text-xs text-coffee-400 mt-1 ml-8">近 6 個月各品項銷售量變化 ‧ 點擊圖例可隱藏／顯示品項</p>
        </div>
        {loadingTrend ? (
          <div className="flex items-center justify-center py-16 gap-3 text-coffee-400">
            <div className="w-5 h-5 border-2 border-coffee-200 border-t-coffee-500 rounded-full animate-spin" />
            <span className="text-sm font-bold">載入歷史數據中...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#9c7e65' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9c7e65' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                onClick={(e: any) => toggleLine(e.dataKey)}
                wrapperStyle={{ fontSize: '11px', cursor: 'pointer', paddingTop: '14px' }}
                formatter={(value: string, entry: any) => (
                  <span style={{
                    color: hiddenLines[entry.dataKey] ? '#ccc' : '#5c3d2a',
                    textDecoration: hiddenLines[entry.dataKey] ? 'line-through' : 'none',
                  }}>
                    {value}
                  </span>
                )}
              />
              {activeItems.map((item, i) => (
                <Line
                  key={item.id}
                  type="monotone"
                  dataKey={item.id}
                  name={item.name}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: PALETTE[i % PALETTE.length], strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  hide={!!hiddenLines[item.id]}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ─── ⑤ Weekday avg + ⑥ Week breakdown ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ⑤ Weekday average */}
        <div className={PANEL}>
          <div className="mb-4">
            <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">⑤</span>
              星期別平均銷售量
            </h4>
            <p className="text-xs text-coffee-400 mt-1 ml-8">各星期幾的平均出貨量（以本月實際出現次數計算）</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weekdayData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#9c7e65' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9c7e65' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#faf7f2' }} />
              {activeItems.map((item, i) => (
                <Bar
                  key={item.id}
                  dataKey={item.id}
                  name={item.name}
                  stackId="s"
                  fill={PALETTE[i % PALETTE.length]}
                  maxBarSize={42}
                  radius={i === activeItems.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ⑥ Week breakdown */}
        <div className={PANEL}>
          <div className="mb-4">
            <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">⑥</span>
              各週銷售量
            </h4>
            <p className="text-xs text-coffee-400 mt-1 ml-8">以星期一至星期日為一週單位，括號為當月實際日期範圍</p>
            {weekNotes.map((note, idx) => (
              <p key={idx} className="text-xs text-amber-600 mt-1 ml-8 font-bold animate-pulse">
                {note}
              </p>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weekNumData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: '#9c7e65' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9c7e65' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#faf7f2' }} />
              {activeItems.map((item, i) => (
                <Bar
                  key={item.id}
                  dataKey={item.id}
                  name={item.name}
                  stackId="s"
                  fill={PALETTE[i % PALETTE.length]}
                  maxBarSize={52}
                  radius={i === activeItems.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── ⑦ Weekday cross-week comparison and stock reference ─── */}
      <div className={PANEL}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-coffee-100 pb-4">
          <div>
            <h4 className="font-bold text-coffee-800 text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-coffee-800 text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">⑦</span>
              特定星期跨週銷售對比與備貨參考
            </h4>
            <p className="text-xs text-coffee-400 mt-1 ml-8">
              選擇特定星期幾，對比當月各週該日的銷售量與當月平均，作為下月首週備貨依據
            </p>
          </div>
          {/* Weekday Selector Button Group */}
          <div className="flex flex-wrap gap-1 bg-coffee-50 p-1 rounded-lg self-start md:self-auto">
            {WEEKDAYS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCompareWeekday(idx)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  compareWeekday === idx
                    ? 'bg-coffee-800 text-white shadow-sm'
                    : 'text-coffee-600 hover:bg-coffee-100/60'
                }`}
              >
                {label.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Left Column: Stacked Bar Chart */}
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weekdayCompareData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#9c7e65', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: '#9c7e65' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#faf7f2' }} />
                {activeItems.map((item, i) => (
                  <Bar
                    key={item.id}
                    dataKey={item.id}
                    name={item.name}
                    stackId="s"
                    fill={PALETTE[i % PALETTE.length]}
                    maxBarSize={48}
                    radius={i === activeItems.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right Column: Key Takeaway / Reference Data for Stocking */}
          <div className="bg-[#faf7f2] border border-coffee-100 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="border-b border-coffee-200 pb-2 mb-3">
                <h5 className="font-bold text-coffee-800 text-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-3 bg-amber-500 rounded-full" />
                  下月首週 {WEEKDAYS[compareWeekday]} 備貨建議
                </h5>
              </div>
              <p className="text-xs text-coffee-600 leading-relaxed mb-3">
                欲預估下個月第 1 週的 {WEEKDAYS[compareWeekday]} 銷量，請優先參考以下數據對比：
              </p>
              <div className="space-y-2">
                {(() => {
                  const week1Row = weekdayCompareData.find(row => row.name.includes('第1週'));
                  const avgRow = weekdayCompareData.find(row => row.isAverage);
                  
                  if (!week1Row || !avgRow) return null;
                  
                  const week1Total = activeItems.reduce((sum, item) => sum + (week1Row[item.id] || 0), 0);
                  const avgTotal = activeItems.reduce((sum, item) => sum + (avgRow[item.id] || 0), 0);

                  return (
                    <>
                      <div className="flex justify-between items-center text-xs p-2 bg-white rounded-lg border border-coffee-50 shadow-sm">
                        <span className="text-coffee-600 font-semibold">本月第1週 {WEEKDAYS[compareWeekday]} 總銷量</span>
                        <span className="font-mono font-bold text-coffee-800 text-sm">{week1Total} 個</span>
                      </div>
                      <div className="flex justify-between items-center text-xs p-2 bg-white rounded-lg border border-coffee-50 shadow-sm">
                        <span className="text-coffee-600 font-semibold">當月 {WEEKDAYS[compareWeekday]} 平均總銷量</span>
                        <span className="font-mono font-bold text-coffee-800 text-sm">{avgTotal.toFixed(1)} 個</span>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-100/50 rounded-lg mt-2">
                        <span className="text-[11px] font-bold text-amber-800 block mb-1">💡 備貨提醒</span>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          第 1 週通常受月初效應影響，銷量可能與月平均有偏差。建議以前期首週（{week1Total} 個）為基準，搭配當月平均（{avgTotal.toFixed(1)} 個）進行備貨。
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Shared legend for ⑤ & ⑥ ───────────────────────────── */}
      <div className={`${PANEL} py-4`}>
        <p className="text-[10px] font-bold text-coffee-400 uppercase tracking-widest mb-3">
          品項顏色對照表（對應圖表 ⑤ ⑥）
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {activeItems.map((item, i) => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs min-w-0">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-coffee-700 font-medium truncate">{item.name}</span>
              <span className="text-coffee-400 font-mono text-[10px]">({productStats[item.id] || 0})</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
