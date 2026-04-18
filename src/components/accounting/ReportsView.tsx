import React, { useState, useMemo } from 'react';
import { JournalEntry, COAItem } from '../../types';
import { fmt } from '../../lib/utils';
import { Calendar, Filter, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FilterState {
  type: 'month' | 'ytd' | 'full-year' | 'custom' | 'all';
  value: string;
}

const getFilterRange = (filter: FilterState, customDates: { start: string, end: string }, currentYear: number) => {
  let start: Date | null = null;
  let end: Date | null = null;
  if (filter.type === 'month') {
    const month = parseInt(filter.value);
    start = new Date(currentYear, month - 1, 1);
    end = new Date(currentYear, month, 0);
  } else if (filter.type === 'ytd') {
    const month = parseInt(filter.value);
    start = new Date(currentYear, 0, 1);
    end = new Date(currentYear, month, 0);
  } else if (filter.type === 'full-year') {
    start = new Date(currentYear, 0, 1);
    end = new Date(currentYear, 11, 31);
  } else if (filter.type === 'custom') {
    start = customDates.start ? new Date(customDates.start) : null;
    end = customDates.end ? new Date(customDates.end) : null;
  }
  return { start, end };
};

interface AccountBalance extends COAItem {
  balance: number;
}

const calculateBalances = (entries: JournalEntry[], coa: COAItem[], start: Date | null, end: Date | null, isCutoff = false): Record<string, AccountBalance> => {
  const filtered = entries.filter(e => {
    const d = new Date(e.date);
    if (!isCutoff && start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });

  const balances: Record<string, AccountBalance> = {};
  coa.forEach(a => balances[a.id] = { ...a, balance: 0 });
  
  filtered.forEach(entry => {
    entry.lines.forEach(line => {
      if (!balances[line.accountId]) return;
      const account = balances[line.accountId];
      if (account.side === 'debit') {
        if (line.type === 'debit') account.balance += Number(line.amount);
        else account.balance -= Number(line.amount);
      } else {
        if (line.type === 'credit') account.balance += Number(line.amount);
        else account.balance -= Number(line.amount);
      }
    });
  });
  return balances;
};

export default function ReportsView({ entries, coa, selectedYear }: { entries: JournalEntry[], coa: COAItem[], selectedYear: number }) {
  const [activeReport, setActiveReport] = useState<'is' | 'bs' | 'cf'>('is');
  const [hideZero, setHideZero] = useState(false);
  
  // IS Filters
  const [isFilter, setIsFilter] = useState<FilterState>({ type: 'month', value: String(new Date().getMonth() + 1) });
  const [isCustomDates, setIsCustomDates] = useState({ start: '', end: '' });
  
  // BS Filters
  const [bsFilter, setBsFilter] = useState<FilterState>({ type: 'full-year', value: '' });
  const [bsCustomDates, setBsCustomDates] = useState({ start: '', end: '' });

  // CF Filters
  const [cfFilter, setCfFilter] = useState<FilterState>({ type: 'full-year', value: '' });
  const [cfCustomDates, setCfCustomDates] = useState({ start: '', end: '' });

  // IS Calculation
  const isLedger = useMemo<Record<string, AccountBalance>>(() => {
    const { start, end } = getFilterRange(isFilter, isCustomDates, selectedYear);
    return calculateBalances(entries, coa, start, end);
  }, [entries, coa, isFilter, isCustomDates, selectedYear]);

  // BS Calculation (Requires all historical entries up to date)
  const bsLedger = useMemo<Record<string, AccountBalance>>(() => {
    const { end } = getFilterRange(bsFilter, bsCustomDates, selectedYear);
    // In a real app, 'entries' should be all historical entries. 
    // For this view, we assume the parent passed relevant entries.
    return calculateBalances(entries, coa, null, end, true);
  }, [entries, coa, bsFilter, bsCustomDates, selectedYear]);

  // CF Calculation
  const cfData = useMemo(() => {
    const { start, end } = getFilterRange(cfFilter, cfCustomDates, selectedYear);
    const periodStart = start || new Date(selectedYear, 0, 1);
    const periodEnd = end || new Date(selectedYear, 11, 31);
    
    const startBalDate = new Date(periodStart);
    startBalDate.setDate(startBalDate.getDate() - 1);
    
    const bsStart = calculateBalances(entries, coa, null, startBalDate, true);
    const bsEnd = calculateBalances(entries, coa, null, periodEnd, true);
    
    // Period earnings
    const isPeriod = calculateBalances(entries, coa, periodStart, periodEnd);
    const netIncome = Object.values(isPeriod).reduce((sum, a) => {
      if (['收入', '成本', '費用', '營業外收入', '營業外費損'].includes(a.type)) {
        return sum + (a.side === 'credit' ? a.balance : -a.balance);
      }
      return sum;
    }, 0);

    const cashAccounts = coa.filter(a => a.id.startsWith('11') && a.type === '資產');
    const begCash = cashAccounts.reduce((sum, a) => sum + (bsStart[a.id]?.balance || 0), 0);
    const endCash = cashAccounts.reduce((sum, a) => sum + (bsEnd[a.id]?.balance || 0), 0);
    const netCashChange = endCash - begCash;

    return { begCash, endCash, netCashChange, netIncome };
  }, [entries, coa, cfFilter, cfCustomDates, selectedYear]);

  const PeriodSelector = ({ filter, setFilter, customDates, setCustomDates, label, mode = 'range' }: any) => (
    <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4 bg-coffee-50/50 p-4 rounded-2xl border border-coffee-50">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-coffee-300" />
        <span className="text-xs font-bold text-coffee-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select 
          className="bg-white border border-coffee-100 rounded-xl px-4 py-2 text-xs font-bold text-coffee-700 outline-none focus:ring-2 focus:ring-rose-brand/20 shadow-sm"
          value={`${filter.type}-${filter.value}`}
          onChange={(e) => {
            const [type, value] = e.target.value.split('-');
            setFilter({ type: type as any, value });
          }}
        >
          <option value="all-">全部期間</option>
          <optgroup label="單月報表">
            {[...Array(12)].map((_, i) => (
              <option key={i} value={`month-${i+1}`}>{i+1} 月月份</option>
            ))}
          </optgroup>
          {mode === 'range' && (
            <optgroup label="年初至今 (YTD)">
              {[...Array(12)].map((_, i) => (
                <option key={i} value={`ytd-${i+1}`}>年初到 {i+1} 月</option>
              ))}
            </optgroup>
          )}
          <option value="full-year-">全年度 ({selectedYear})</option>
          <option value="custom-">自訂時間</option>
        </select>
        
        {filter.type === 'custom' && (
          <div className="flex gap-2 items-center ml-2">
            {mode === 'range' && (
              <input type="date" className="border border-coffee-100 rounded-lg p-1.5 text-xs outline-none" value={customDates.start} onChange={e => setCustomDates({...customDates, start: e.target.value})} />
            )}
            <span className="text-coffee-200">~</span>
            <input type="date" className="border border-coffee-100 rounded-lg p-1.5 text-xs outline-none" value={customDates.end} onChange={e => setCustomDates({...customDates, end: e.target.value})} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab Switcher */}
      <div className="flex gap-4 border-b border-coffee-50">
        {[
          { id: 'is', label: '損益表', icon: '📈' },
          { id: 'bs', label: '資產負債表', icon: '⚖️' },
          { id: 'cf', label: '現金流量表', icon: '💵' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveReport(t.id as any)}
            className={cn(
              "px-8 py-4 font-bold transition-all border-b-2 flex items-center gap-2",
              activeReport === t.id 
                ? "text-coffee-800 border-rose-brand bg-rose-brand/5 rounded-t-2xl" 
                : "text-coffee-300 border-transparent hover:text-coffee-600"
            )}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
        
        <div className="ml-auto flex items-center gap-4 px-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={hideZero} 
              onChange={e => setHideZero(e.target.checked)}
              className="w-4 h-4 text-rose-brand rounded focus:ring-rose-brand/30 border-coffee-100"
            />
            <span className="text-xs font-bold text-coffee-400 group-hover:text-coffee-600 transition-colors">隱藏零額科目</span>
          </label>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {activeReport === 'is' && (
          <div className="glass-panel p-10 bg-white border border-coffee-50 flex flex-col min-h-[600px]">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-bold font-serif-brand text-coffee-800 tracking-tight underline decoration-rose-brand decoration-4 underline-offset-8">損益表 (Income Statement)</h3>
              <button disabled className="p-3 text-coffee-200 hover:text-coffee-400"><Download className="w-5 h-5" /></button>
            </div>
            
            <PeriodSelector label="計算期間" filter={isFilter} setFilter={setIsFilter} customDates={isCustomDates} setCustomDates={setIsCustomDates} />

            <div className="flex-1 space-y-6">
              <ReportSection label="營業收入" items={(Object.values(isLedger) as AccountBalance[]).filter(a => a.type === '收入')} hideZero={hideZero} />
              <ReportSection label="營業成本" items={(Object.values(isLedger) as AccountBalance[]).filter(a => a.type === '成本')} hideZero={hideZero} />
              
              <div className="flex justify-between items-center py-4 px-4 bg-coffee-50/30 rounded-2xl border-l-4 border-mint-brand">
                <span className="font-bold text-coffee-800">營業毛利</span>
                <span className="font-serif-brand font-bold text-2xl text-mint-brand">
                  ${fmt((Object.values(isLedger) as AccountBalance[]).filter(a => a.type === '收入').reduce((s, a) => s + a.balance, 0) - (Object.values(isLedger) as AccountBalance[]).filter(a => a.type === '成本').reduce((s, a) => s + a.balance, 0))}
                </span>
              </div>

              <ReportSection label="營業費用" items={(Object.values(isLedger) as AccountBalance[]).filter(a => a.type === '費用')} hideZero={hideZero} />
              
              <div className="flex justify-between items-center py-4 px-4 bg-coffee-50/30 rounded-2xl border-l-4 border-rose-brand">
                <span className="font-bold text-coffee-800">本期淨利 (EBIT)</span>
                <span className="font-serif-brand font-bold text-2xl text-rose-brand">
                  ${fmt((Object.values(isLedger) as AccountBalance[]).reduce((s, a) => {
                    if (['收入', '成本', '費用', '營業外收入', '營業外費損'].includes(a.type)) {
                      return s + (a.side === 'credit' ? a.balance : -a.balance);
                    }
                    return s;
                  }, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeReport === 'bs' && (
          <div className="glass-panel p-10 bg-white border border-coffee-50 flex flex-col min-h-[600px]">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-bold font-serif-brand text-coffee-800 tracking-tight underline decoration-blue-400 decoration-4 underline-offset-8">資產負債表 (Balance Sheet)</h3>
            </div>
            <PeriodSelector label="結算截止日期" mode="cutoff" filter={bsFilter} setFilter={setBsFilter} customDates={bsCustomDates} setCustomDates={setBsCustomDates} />
            
            <div className="flex-1 space-y-6">
              <ReportSection label="資產 (Assets)" items={(Object.values(bsLedger) as AccountBalance[]).filter(a => a.type === '資產')} hideZero={hideZero} />
              <ReportSection label="負債 (Liabilities)" items={(Object.values(bsLedger) as AccountBalance[]).filter(a => a.type === '負債')} hideZero={hideZero} />
              <ReportSection label="業主權益 (Equity)" items={(Object.values(bsLedger) as AccountBalance[]).filter(a => a.type === '權益')} hideZero={hideZero} />
              
              <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-coffee-100">
                <div className="bg-blue-50/50 p-6 rounded-[24px] border border-blue-100">
                  <div className="text-[10px] font-bold text-blue-400 uppercase mb-2">資產總計</div>
                  <div className="text-3xl font-serif-brand font-bold text-blue-600">${fmt((Object.values(bsLedger) as AccountBalance[]).filter(a => a.type === '資產').reduce((s, a) => s + a.balance, 0))}</div>
                </div>
                <div className="bg-rose-50/50 p-6 rounded-[24px] border border-rose-100">
                  <div className="text-[10px] font-bold text-rose-400 uppercase mb-2">負債與權益總計</div>
                  <div className="text-3xl font-serif-brand font-bold text-rose-600">
                    ${fmt((Object.values(bsLedger) as AccountBalance[]).reduce((s, a) => {
                      if (['負債', '權益'].includes(a.type)) return s + a.balance;
                      if (['收入', '成本', '費用', '營業外收入', '營業外費損'].includes(a.type)) return s + (a.side === 'credit' ? a.balance : -a.balance);
                      return s;
                    }, 0))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeReport === 'cf' && (
          <div className="glass-panel p-10 bg-white border border-coffee-50 flex flex-col min-h-[600px]">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-bold font-serif-brand text-coffee-800 tracking-tight underline decoration-mint-brand decoration-4 underline-offset-8">現金流量表 (Cash Flow)</h3>
            </div>
            <PeriodSelector label="計算期間" filter={cfFilter} setFilter={setCfFilter} customDates={cfCustomDates} setCustomDates={setCfCustomDates} />
            
            <div className="space-y-8">
              <div className="flex justify-between items-center p-6 bg-coffee-50/50 rounded-3xl border border-coffee-100">
                <span className="font-bold text-coffee-800">期初現金餘額</span>
                <span className="text-2xl font-serif-brand font-bold text-coffee-800">${fmt(cfData.begCash)}</span>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-bold text-coffee-300 uppercase tracking-widest ml-4">本期活動摘要</div>
                <div className="flex justify-between items-center text-sm py-2 px-6">
                  <span className="text-coffee-600 font-medium">本期淨利流入</span>
                  <span className="font-serif-brand font-bold text-mint-brand">+${fmt(cfData.netIncome)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-2 px-6 border-b border-coffee-50">
                  <span className="text-coffee-600 font-medium">本期現金增減額</span>
                  <span className={cn("font-serif-brand font-bold", cfData.netCashChange >= 0 ? "text-mint-brand" : "text-rose-brand")}>
                    {cfData.netCashChange >= 0 ? '+' : '-'}${fmt(Math.abs(cfData.netCashChange))}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center p-8 bg-mint-brand/10 rounded-[32px] border-2 border-mint-brand/20 shadow-inner">
                <span className="text-lg font-bold text-coffee-800">期末現金及約當現金</span>
                <span className="text-4xl font-serif-brand font-bold text-mint-brand">${fmt(cfData.endCash)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportSection({ label, items, hideZero }: { label: string, items: any[], hideZero: boolean }) {
  const filteredItems = hideZero ? items.filter(a => a.balance !== 0) : items;
  if (filteredItems.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-coffee-300 uppercase tracking-widest mb-1 ml-2">{label}</div>
      <div className="space-y-1">
        {filteredItems.map(a => (
          <div key={a.id} className="flex justify-between items-center py-2 px-4 hover:bg-coffee-50/50 rounded-xl transition-colors group">
            <span className="text-sm font-bold text-coffee-700 group-hover:text-coffee-950">{a.name}</span>
            <span className="font-serif-brand font-bold text-lg text-coffee-600/80">${fmt(a.balance)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
