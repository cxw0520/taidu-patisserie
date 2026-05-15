import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, DailyReport, Order, Customer } from '../../types';
import { uid, fmt, cn, parseNum, normalizeDateKey, copyText } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, getDoc, writeBatch, collection, query, onSnapshot } from 'firebase/firestore';
import { UploadCloud, CheckCircle, Copy, AlertCircle, CalendarDays, FileUp, Wand2 } from 'lucide-react';
import { upsertCustomerFromOrder, MergeConflictModal } from '../CustomerView';


export default function ImportTab({ settings, shopId, currentDate, dailyData, updateDaily, customers, onConflict }: {
  settings: Settings; shopId: string; currentDate: string; dailyData: DailyReport;
  updateDaily: (patch: Partial<DailyReport>) => void;
  customers: import('../../types').Customer[];
  onConflict: (candidates: import('../../types').Customer[], resolve: (action: 'merge'|'new', targetId?: string) => void) => void;
}) {
  const [importText, setImportText] = useState('');
  const [parsedOrders, setParsedOrders] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [weeklyData, setWeeklyData] = useState<DailyReport[]>([]);
  const [weekRange, setWeekRange] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const fetchWeekly = async () => {
      const [y, m, d] = currentDate.split('-').map(Number);
      const selDate = new Date(y, m - 1, d);
      const day = selDate.getDay();
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const monday = new Date(selDate);
      monday.setDate(selDate.getDate() + diffToMon);
      
      const sunday = new Date(monday); 
      sunday.setDate(monday.getDate() + 6);
      
      const fmtYMD = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      
      const p1 = fmtYMD(monday);
      const p2 = fmtYMD(sunday);
      setWeekRange(`${p1} 至 ${p2}`);

      // Read by document id (YYYY-MM-DD) to avoid relying on mutable `date` field.
      const days: DailyReport[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const key = fmtYMD(d);
        const ref = doc(db, 'shops', shopId, 'daily', key);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          days.push({ ...(snap.data() as DailyReport), date: key });
        }
      }
      setWeeklyData(days);
    };
    fetchWeekly();
  }, [currentDate, shopId, dailyData, refreshKey]); // adding dailyData and refreshKey dependency so it refreshes

  const parseDateFromCell = (raw: string) => {
    const s = (raw || '').trim().replace(/\//g, '-');
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  };

  const processImport = async () => {
    const raw = importText.trim();
    if (!raw) return alert("請貼上資料");

    const Papa = (await import('papaparse')).default;
    const { data } = Papa.parse(raw, { skipEmptyLines: 'greedy' });
    const rows = data as string[][];

    if (rows.length < 2) return alert("資料格式不正確 (需包含標題列)");

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const getIdx = (keywords: string[]) => {
      for (const k of keywords) {
        const found = headers.findIndex(h => h.trim() === k);
        if (found !== -1) return found;
      }
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    const idxBuyer = getIdx(['訂購人姓名', '姓名']);
    const idxPhone = getIdx(['訂購人電話', '電話', '聯絡電話']);
    const idxAddr = getIdx(['宅配地址', '地址', '收件地址']);
    const idxRecipientName = getIdx(['收件人姓名']);
    const idxRecipientStatus = getIdx(['收件人']);
    const idxRecipientPhone = getIdx(['收件人電話']);
    const idxStoreDate = getIdx(['預約取貨日期', '店取', '取貨日']);
    const idxShipDate = getIdx(['宅配出貨日', '出貨', '出貨日']);
    const idxMethod = getIdx(['取貨方式', '物流', '運送方式']);
    const idxEmail = getIdx(['電子郵件', '信箱', 'Email', 'email', 'e-mail']);

    const itemMap: { item: any; colIdx: number }[] = [];
    const allPossibleItems = [
      ...(settings.giftItems || []),
      ...(settings.singleItems || []),
    ];

    headers.forEach((h, colIdx) => {
      const cleanH = h.trim();
      const isGBHeader = cleanH.includes('禮盒') || cleanH.includes('盒');
      const isSGHeader = cleanH.includes('單顆') || cleanH.includes('個');

      let bestMatch = null;
      if (isGBHeader) {
        bestMatch = (settings.giftItems || []).find((i) => cleanH.includes(i.name) || i.name.includes(cleanH));
        if (!bestMatch) {
          if (cleanH.includes('綜合')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('綜合'));
          if (cleanH.includes('原味')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('原味'));
          if (cleanH.includes('伯爵')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('伯爵'));
          if (cleanH.includes('可可')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('可可'));
          if (cleanH.includes('抹茶')) bestMatch = (settings.giftItems || []).find(i => i.name.includes('抹茶'));
        }
      } else if (isSGHeader) {
        bestMatch = (settings.singleItems || []).find((i) => cleanH.includes(i.name) || i.name.includes(cleanH));
        if (!bestMatch) {
          if (cleanH.includes('原味')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('原味'));
          if (cleanH.includes('伯爵')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('伯爵'));
          if (cleanH.includes('可可')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('可可'));
          if (cleanH.includes('抹茶')) bestMatch = (settings.singleItems || []).find(i => i.name.includes('抹茶'));
        }
      }

      if (!bestMatch) {
        bestMatch = (settings.giftItems || []).find((i) => cleanH.includes(i.name)) || 
                    (settings.singleItems || []).find((i) => cleanH.includes(i.name));
      }

      if (bestMatch && !itemMap.some((m) => m.colIdx === colIdx)) {
        itemMap.push({ item: bestMatch, colIdx });
      }
    });

    const parsed: any[] = [];
    dataRows.forEach((row) => {
      if (!row.some(c => c)) return;
      const rowStr = row.join('');
      if (rowStr.includes('欄')) return; // Skip helper rows

      const method = idxMethod !== -1 && row[idxMethod] ? String(row[idxMethod]) : '';
      let targetDate = '';
      if (method && (method.includes('店') || method.includes('自取'))) {
        targetDate = idxStoreDate !== -1 && row[idxStoreDate] ? String(row[idxStoreDate]) : '';
      } else if (method && (method.includes('宅配') || method.includes('出貨') || method.includes('寄送'))) {
        targetDate = idxShipDate !== -1 && row[idxShipDate] ? String(row[idxShipDate]) : '';
      } else {
        targetDate = (idxStoreDate !== -1 && row[idxStoreDate] ? String(row[idxStoreDate]) : '') || (idxShipDate !== -1 && row[idxShipDate] ? String(row[idxShipDate]) : '');
      }

      const parsedDate = parseDateFromCell(targetDate);
      const d = parsedDate || normalizeDateKey(currentDate);
      
      const buyer = idxBuyer !== -1 && row[idxBuyer] ? String(row[idxBuyer]) : '未知';
      const phone = idxPhone !== -1 && row[idxPhone] ? String(row[idxPhone]) : '';
      const email = idxEmail !== -1 && row[idxEmail] ? String(row[idxEmail]).trim() : '';
      const addr = idxAddr !== -1 && row[idxAddr] ? String(row[idxAddr]) : '';

      const rNameRaw = idxRecipientName !== -1 ? String(row[idxRecipientName] || '').trim() : '';
      const rStatusRaw = idxRecipientStatus !== -1 ? String(row[idxRecipientStatus] || '').trim() : '';
      
      let recipientName = '';
      if (rNameRaw && !['與訂購人相同', '與訂購人不同'].includes(rNameRaw)) {
        recipientName = rNameRaw;
      } else if (rStatusRaw && !['與訂購人相同', '與訂購人不同'].includes(rStatusRaw)) {
        recipientName = rStatusRaw;
      } else {
        recipientName = buyer;
      }
      
      let recipientPhone = idxRecipientPhone !== -1 && row[idxRecipientPhone] ? String(row[idxRecipientPhone]) : '';
      if (!recipientPhone) recipientPhone = phone;
      
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
            buyer, phone, email, addr, recipientName, recipientPhone, items, prodAmt,
            method: method || ''
          });
        }
    });

    if (parsed.length === 0) {
      alert("解析完成，但未找到有效訂單資料。請檢查標題列是否包含「姓名/電話/取貨方式/項目名稱」等關鍵字。");
    }
    setParsedOrders(parsed);
  };

  const confirmImport = async () => {
    if (parsedOrders.length === 0 || importing) return;
    setImporting(true);

    // Group by date
    const byDate: Record<string, any[]> = {};
    parsedOrders.forEach(po => {
      const dKey = normalizeDateKey(po.date);
      if (!byDate[dKey]) byDate[dKey] = [];
      byDate[dKey].push(po);
    });

    try {
      const currentKey = normalizeDateKey(currentDate);
      const batch = writeBatch(db);
      const currentDateOrdersToAppend: Order[] = [];

      for (const [date, orders] of Object.entries(byDate)) {
        const dateKey = normalizeDateKey(date);
        const appended = orders.map(po => {
          // Determine delivery method from CSV
          let deliveryMethod: '宅配' | '自取' | undefined;
          if (po.method) {
            const m = String(po.method);
            if (m.includes('宅') || m.includes('配送') || m.includes('寄送')) deliveryMethod = '宅配';
            else if (m.includes('店') || m.includes('取') || m.includes('自取')) deliveryMethod = '自取';
          } else if (po.addr) {
            deliveryMethod = '宅配'; // has address → likely delivery
          }
          return ({
          id: uid(),
          buyer: po.buyer,
          items: po.items,
          prodAmt: po.prodAmt,
          shipAmt: 0,
          discAmt: 0,
          actualAmt: po.prodAmt,
          status: '匯款' as const,
          note: '',
          phone: po.phone,
          address: po.addr,
          email: po.email,
          recipientName: po.recipientName,
          recipientPhone: po.recipientPhone,
          deliveryMethod,
          source: 'import' as const,
          createdAt: new Date().toISOString(),
        });
        });

        const ref = doc(db, 'shops', shopId, 'daily', dateKey);
        const snap = await getDoc(ref);
        let existingOrders: Order[] = [];
        let existingData: any = {};
        if (snap.exists()) {
          existingData = snap.data();
          existingOrders = snap.data().orders || [];
        }

        batch.set(ref, {
          ...existingData,
          date: dateKey,
          orders: [...existingOrders, ...appended]
        }, { merge: true });

        if (dateKey === currentKey) {
          currentDateOrdersToAppend.push(...appended);
        }
      }

      await batch.commit();

      // ── Sync to customer database ──────────────────────────────
      const allAppended: Array<{ order: Order; date: string }> = [];
      for (const [date, orders] of Object.entries(byDate)) {
        const dateKey = normalizeDateKey(date);
        const appended = orders.map(po => ({
          id: po._orderId || uid(), buyer: po.buyer, phone: po.phone || '',
          items: po.items, prodAmt: po.prodAmt, actualAmt: po.prodAmt, status: '匯款' as const,
          shipAmt: 0, discAmt: 0, note: '', address: po.addr || '',
          recipientName: po.recipientName || '', recipientPhone: po.recipientPhone || '',
        } as Order));
        appended.forEach(order => allAppended.push({ order, date: dateKey }));
      }
      // rebuild full appended list with correct ids from earlier
      // We use parsedOrders to get buyer/phone/email for customer upsert
      const latestCustomers: import('../../types').Customer[] = [...customers];
      for (const po of parsedOrders) {
        const dateKey = normalizeDateKey(po.date || currentDate);
        // find the order we just committed (match by buyer+phone+date)
        await upsertCustomerFromOrder(
          shopId,
          latestCustomers,
          {
            orderId: uid(), // we don't have the exact id here but dedup is by phone/name
            date: dateKey,
            buyer: po.buyer || '',
            phone: po.phone || '',
            email: po.email || '',
            prodAmt: po.prodAmt || 0,
            actualAmt: po.prodAmt || 0,
            items: po.items || {},
            status: '匯款',
          },
          onConflict
        );
      }
      // ──────────────────────────────────────────────────────────

      if (currentDateOrdersToAppend.length > 0) {
        updateDaily({ orders: [...dailyData.orders, ...currentDateOrdersToAppend] });
      }

      setRefreshKey(prev => prev + 1);
      setImportText('');
      setParsedOrders([]);
      alert("匯入成功！");
    } catch (err) {
      console.error(err);
      alert("匯入發生錯誤，請稍後再試。");
    } finally {
      setImporting(false);
    }
  };

    const copyText = (text: string, e: React.MouseEvent<HTMLButtonElement>) => {
      navigator.clipboard.writeText(text).then(() => {
        const btn = e.currentTarget;
        const oldClass = btn.className;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-mint-brand"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
        }, 1500);
      });
    };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-6 shadow-sm border border-coffee-100">
        <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-mint-brand/40">
          <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
            <FileUp className="w-5 h-5 text-mint-brand" /> 訂單匯入
          </h2>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-coffee-200 bg-white text-coffee-600 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition active:scale-95" onClick={() => { setImportText(''); setParsedOrders([]); }}>清空</button>
            <button className="px-4 py-2 bg-coffee-600 text-white font-bold rounded-xl shadow-sm hover:bg-coffee-700 transition active:scale-95 flex items-center gap-2" onClick={processImport}>
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
              <button 
                disabled={importing}
                className={cn("px-4 py-2 text-white font-bold rounded-lg shadow-sm transition", importing ? "bg-gray-400 cursor-not-allowed" : "bg-mint-brand hover:bg-mint-brand/80")} 
                onClick={confirmImport}
              >
                {importing ? "匯入中..." : "確認匯入以上資料"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center border-collapse bg-white border border-gray-100 rounded-lg">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 border-b border-gray-100">日期</th>
                    <th className="p-2 border-b border-gray-100">訂購人</th>
                    <th className="p-2 border-b border-gray-100 text-left">收件人</th>
                    <th className="p-2 border-b border-gray-100 text-left">項目</th>
                    <th className="p-2 border-b border-gray-100 text-right">總額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedOrders.map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-2 font-mono font-bold">{o.date}</td>
                      <td className="p-2 font-bold">{o.buyer}</td>
                      <td className="p-2 text-left">
                        <div className="flex flex-col">
                          <span className="font-bold text-coffee-700">{o.recipientName}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{o.recipientPhone}</span>
                        </div>
                      </td>
                      <td className="p-2 text-left">{Object.keys(o.items).length} 項品項</td>
                      <td className="p-2 font-bold text-rose-brand font-mono text-right">${fmt(o.prodAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Weekly View */}
      <div className="glass-panel p-6 border border-coffee-100 shadow-sm bg-transparent">
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-coffee-100">
          <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
            <CalendarDays className="w-5 h-5 text-coffee-500" /> 當週訂購名單 (依日期分組)
          </h2>
          <span className="text-sm font-bold text-coffee-400 bg-white px-3 py-1 rounded-lg border border-coffee-100">{weekRange}</span>
        </div>
        
        <div className="space-y-8">
          {Array.from({length: 7}).map((_, i) => {
            const [y, m, d] = currentDate.split('-').map(Number);
            const selDate = new Date(y, m - 1, d);
            const day = selDate.getDay();
            const diffToMon = (day === 0 ? -6 : 1 - day);
            const curDate = new Date(selDate);
            curDate.setDate(selDate.getDate() + diffToMon + i);
            const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}-${String(curDate.getDate()).padStart(2,'0')}`;
            
            const data = weeklyData.find(w => w.date === dateStr) || (dailyData.date === dateStr ? dailyData : null);
            const validOrders = data?.orders?.filter(o => o.buyer.trim() || o.actualAmt > 0) || [];

            if (validOrders.length === 0) return null;

            return (
              <div key={dateStr} className="flex flex-col bg-white rounded-xl shadow-sm border border-coffee-100 overflow-hidden">
                <h3 className="bg-coffee-50 p-3 font-bold text-coffee-800 text-sm border-b border-coffee-100 flex items-center gap-2 sticky top-0 z-10">
                  <CalendarDays className="w-4 h-4 text-rose-brand" /> {dateStr}
                  <span className="ml-auto text-[10px] text-coffee-400 font-bold uppercase tracking-wider">共 {validOrders.length} 筆訂單</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#a2d2ff]/5 text-coffee-500 font-bold">
                      <tr>
                        <th className="p-3 border-b border-coffee-50">訂購人/金額</th>
                        <th className="p-3 border-b border-coffee-50">項目內容</th>
                        <th className="p-3 border-b border-coffee-50">收件資訊</th>
                        <th className="p-3 border-b border-coffee-50 text-right">備註/地址</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-coffee-50">
                      {validOrders.map((o: any) => {
                        const getItemName = (id: string) => {
                          const item = [...settings.giftItems, ...settings.singleItems, ...(settings.customCategories || []).flatMap(c => c.items || [])].find(i => i?.id === id);
                          return item ? item.name : id;
                        };

                        return (
                          <tr key={o.id} className="hover:bg-coffee-50/30 transition">
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-coffee-800 text-[13px]">{o.buyer}</span>
                                <span className="font-mono font-bold text-rose-brand text-[11px]">${fmt(o.actualAmt)}</span>
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <div className="text-coffee-600 leading-relaxed font-medium">
                                {(o.items ? Object.entries(o.items) : [])
                                  .filter(([_, q]) => parseNum(q) > 0)
                                  .map(([k, q]) => `${getItemName(k)} x ${q}`)
                                  .join(', ')}
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-1.5 min-w-[120px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-coffee-700">{o.recipientName || o.buyer}</span>
                                  <button onClick={(e) => copyText(o.recipientName || o.buyer, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製收件人">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold text-coffee-400 bg-coffee-50 px-1.5 py-0.5 rounded border border-coffee-100">
                                    {o.recipientPhone || o.phone || '無電話'}
                                  </span>
                                  {(o.recipientPhone || o.phone) && (
                                    <button onClick={(e) => copyText(o.recipientPhone || o.phone, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製電話">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right align-top">
                              <div className="flex flex-col items-end gap-1.5">
                                {o.address ? (
                                  <div className="flex items-center gap-1.5 justify-end group">
                                    <span className="text-[10px] text-coffee-500 max-w-[150px] truncate" title={o.address}>
                                      {o.address}
                                    </span>
                                    <button onClick={(e) => copyText(o.address, e)} className="p-1 hover:bg-mint-100 rounded text-coffee-300 hover:text-mint-brand transition" title="複製地址">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-coffee-300 italic">無收件地址</span>
                                )}
                                {o.note && (
                                  <div className="text-[10px] text-coffee-400 italic max-w-[180px] break-all">
                                    備註: {o.note}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          
          {weekRange && !Array.from({length: 7}).some((_, i) => {
            const [y, m, d] = currentDate.split('-').map(Number);
            const selDate = new Date(y, m - 1, d);
            const day = selDate.getDay();
            const diffToMon = (day === 0 ? -6 : 1 - day);
            const curDate = new Date(selDate);
            curDate.setDate(selDate.getDate() + diffToMon + i);
            const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}-${String(curDate.getDate()).padStart(2,'0')}`;
            const data = weeklyData.find(w => w.date === dateStr) || (dailyData.date === dateStr ? dailyData : null);
            return (data?.orders?.filter(o => o.buyer.trim() || o.actualAmt > 0) || []).length > 0;
          }) && (
            <div className="col-span-full flex justify-center items-center py-12 bg-white/50 border border-dashed border-coffee-200 rounded-xl">
              <span className="text-coffee-400 font-bold">本週尚無任何訂單紀錄</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

