import React, { useState, useMemo } from 'react';
import { JournalEntry, COAItem } from '../../types';
import { fmt } from '../../lib/utils';
import { Search } from 'lucide-react';

export default function LedgerView({ entries, coa }: { entries: JournalEntry[], coa: COAItem[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  
  const accountInfo = coa.find(a => a.id === selectedAccountId);
  
  const relevantLines = useMemo(() => {
    const lines: any[] = [];
    let runningBalance = 0;
    if (!accountInfo) return lines;

    // Entries are already sorted by date in parent, but let's ensure order
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.id.localeCompare(b.id);
    });

    sortedEntries.forEach(entry => {
      entry.lines.forEach(line => {
        if (line.accountId === selectedAccountId) {
          const isDebit = line.type === 'debit';
          const amount = Number(line.amount) || 0;
          
          if (accountInfo.side === 'debit') {
            runningBalance += isDebit ? amount : -amount;
          } else {
            runningBalance += isDebit ? -amount : amount;
          }

          lines.push({
            date: entry.date,
            voucherId: entry.voucherNo,
            description: entry.description,
            lineDescription: line.lineDescription,
            debit: isDebit ? amount : 0,
            credit: !isDebit ? amount : 0,
            balance: runningBalance
          });
        }
      });
    });
    return lines;
  }, [selectedAccountId, accountInfo, entries]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-8 bg-white/50 border border-coffee-50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1 max-w-md">
            <label className="text-[10px] font-bold text-coffee-300 uppercase mb-2 block ml-1 tracking-widest">選擇科目查詢分類帳</label>
            <div className="relative">
              <select 
                value={selectedAccountId} 
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full bg-white border border-coffee-100 rounded-2xl px-5 py-3 outline-none focus:ring-2 focus:ring-rose-brand/20 focus:border-rose-brand transition-all font-bold text-coffee-800 appearance-none pr-12 shadow-sm"
              >
                <option value="">請選擇科目...</option>
                {coa.map(a => <option key={a.id} value={a.id}>{a.id} {a.name}</option>)}
              </select>
              <Search className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-300 pointer-events-none" />
            </div>
          </div>
          
          {accountInfo && (
            <div className="flex gap-4">
              <div className="bg-white/80 p-4 rounded-2xl border border-coffee-50 shadow-sm text-center min-w-[120px]">
                <div className="text-[10px] font-bold text-coffee-300 mb-1">科目類型</div>
                <div className="text-sm font-bold text-coffee-600">{accountInfo.type}</div>
              </div>
              <div className="bg-white/80 p-4 rounded-2xl border border-coffee-50 shadow-sm text-center min-w-[120px]">
                <div className="text-[10px] font-bold text-coffee-300 mb-1">餘額方向</div>
                <div className="text-sm font-bold text-coffee-600">{accountInfo.side === 'debit' ? '借方 (Dr)' : '貸方 (Cr)'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedAccountId ? (
        <div className="rounded-[24px] overflow-hidden border border-coffee-50 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-[#faf7f2]">
              <tr className="text-coffee-400 font-bold uppercase tracking-wider">
                <th className="px-6 py-4 text-left">日期</th>
                <th className="px-6 py-4 text-left">編號</th>
                <th className="px-6 py-4 text-left">傳票摘要</th>
                <th className="px-6 py-4 text-left">明細摘要</th>
                <th className="px-6 py-4 text-right">借方金額</th>
                <th className="px-6 py-4 text-right">貸方金額</th>
                <th className="px-6 py-4 text-right pr-10">餘額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-50">
              {relevantLines.length > 0 ? (
                relevantLines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-coffee-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-coffee-800">{line.date}</td>
                    <td className="px-6 py-4 font-bold text-coffee-300 text-[10px] tracking-tighter uppercase">{line.voucherId}</td>
                    <td className="px-6 py-4 text-coffee-600 font-medium">{line.description}</td>
                    <td className="px-6 py-4 text-coffee-400 italic text-xs">{line.lineDescription || '-'}</td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-mint-brand">{line.debit ? `$${fmt(line.debit)}` : ''}</td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-rose-brand">{line.credit ? `$${fmt(line.credit)}` : ''}</td>
                    <td className="px-6 py-4 text-right font-serif-brand font-bold text-coffee-800 text-base pr-10 tracking-tight">${fmt(line.balance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-coffee-300 italic">此科目目前尚無交易分錄紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-20 text-center glass-panel border border-dashed border-coffee-100 bg-white/30 rounded-[32px]">
          <div className="w-16 h-16 bg-coffee-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-coffee-200" />
          </div>
          <p className="text-coffee-400 font-medium tracking-wide">請從上方下拉選單選擇會計科目以查看分類帳明細</p>
        </div>
      )}
    </div>
  );
}
