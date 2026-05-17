import React, { useState } from 'react';
import { JournalEntry, COAItem } from '../../types';

interface AccountBalance extends COAItem {
  balance: number;
}

const calculateBalances = (entries: JournalEntry[], coa: COAItem[], start: Date | null, end: Date | null, isCutoff = false): Record<string, AccountBalance> => {
  const formatDateToYMD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const startStr = start ? formatDateToYMD(start) : '';
  const endStr = end ? formatDateToYMD(end) : '';

  const filtered = entries.filter(e => {
    if (!e.date) return false;
    // Normalize date format from '2026/05/18' to '2026-05-18'
    const entryStr = e.date.replace(/\//g, '-');
    
    if (!isCutoff && startStr && entryStr < startStr) return false;
    if (endStr && entryStr > endStr) return false;
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

export default function ExportModal({ onClose, entries, coa, selectedYear, purchases = [] }: { onClose: () => void, entries: JournalEntry[], coa: COAItem[], selectedYear: number, purchases?: any[] }) {
  const [contentType, setContentType] = useState('journal');
  const [format, setFormat] = useState('pdf');
  const [costMode, setCostMode] = useState<'cogs' | 'purchases'>('cogs');
  const [isExporting, setIsExporting] = useState(false);
  const currentYear = selectedYear;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (contentType === 'raw') {
        const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dessert_full_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        onClose();
        return;
      }

      if (format === 'excel') {
        await exportToExcel();
      } else {
        await exportToPdf();
      }
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    let data: any[] = [];
    let filename = '';

    if (contentType === 'journal') {
      filename = `${currentYear}年度_普通日記簿`;
      entries.forEach(entry => {
        entry.lines.forEach((line, idx) => {
          data.push({
            '傳票編號': idx === 0 ? entry.voucherNo : '',
            '日期': idx === 0 ? entry.date : '',
            '總摘要': idx === 0 ? entry.description : '',
            '會計科目': coa.find(c => c.id === line.accountId)?.name || '未知',
            '摘要': line.lineDescription || '',
            '借方': line.type === 'debit' ? line.amount : 0,
            '貸方': line.type === 'credit' ? line.amount : 0
          });
        });
      });
    } else if (contentType === 'is') {
      const displayModeName = costMode === 'purchases' ? '即期採購成本制' : '實際消耗成本制';
      filename = `${currentYear}年度_損益表_${displayModeName}`;
      const balances = calculateBalances(entries, coa, new Date(currentYear, 0, 1), new Date(currentYear, 11, 31));
      const revenue = Object.values(balances).filter(a => a.type === '收入');
      const cost = Object.values(balances).filter(a => a.type === '成本');
      const expense = Object.values(balances).filter(a => a.type === '費用');
      const nonOpRev = Object.values(balances).filter(a => a.type === '營業外收入');
      const nonOpExp = Object.values(balances).filter(a => a.type === '營業外費損');

      // Calculate annual purchase total from database
      const purchaseTotal = purchases
        .filter(p => {
          const d = new Date(p.date);
          return d.getFullYear() === currentYear;
        })
        .reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);

      const totalRev = revenue.reduce((s, a) => s + a.balance, 0);
      const totalCost = cost.reduce((s, a) => s + a.balance, 0);
      const displayCost = costMode === 'purchases' ? purchaseTotal : totalCost;
      const totalExp = expense.reduce((s, a) => s + a.balance, 0);
      const totalNonOp = nonOpRev.reduce((s, a) => s + a.balance, 0) - nonOpExp.reduce((s, a) => s + a.balance, 0);

      data.push({ '項目': '計算模式', '金額': displayModeName });
      data.push({ '項目': '營業收入', '金額': totalRev });
      revenue.forEach(a => data.push({ '項目': `  ${a.name}`, '金額': a.balance }));
      
      if (costMode === 'cogs') {
        data.push({ '項目': '營業成本', '金額': totalCost });
        cost.forEach(a => data.push({ '項目': `  ${a.name}`, '金額': a.balance }));
      } else {
        data.push({ '項目': '營業成本 (當期進貨總額)', '金額': purchaseTotal });
        data.push({ '項目': '  進貨單累計總額 (進貨管理)', '金額': purchaseTotal });
      }

      data.push({ '項目': '營業毛利', '金額': totalRev - displayCost });
      data.push({ '項目': '營業費用', '金額': totalExp });
      expense.forEach(a => data.push({ '項目': `  ${a.name}`, '金額': a.balance }));
      data.push({ '項目': '營業利益', '金額': totalRev - displayCost - totalExp });
      data.push({ '項目': '營業外收支', '金額': totalNonOp });
      data.push({ '項目': '本期淨利', '金額': totalRev - displayCost - totalExp + totalNonOp });
    } else {
      filename = `${currentYear}年度_資產負債表`;
      const balances = calculateBalances(entries, coa, null, new Date(currentYear, 11, 31), true);
      const assets = Object.values(balances).filter(a => a.type === '資產');
      const liabilities = Object.values(balances).filter(a => a.type === '負債');
      const equity = Object.values(balances).filter(a => a.type === '權益');
      const netIncome = Object.values(balances).filter(a => ['收入', '成本', '費用', '營業外收入', '營業外費損'].includes(a.type))
        .reduce((s, a) => a.side === 'credit' ? s + a.balance : s - a.balance, 0);

      data.push({ '類別': '資產', '科目': '', '金額': assets.reduce((s, a) => s + a.balance, 0) });
      assets.forEach(a => data.push({ '類別': '', '科目': a.name, '金額': a.balance }));
      data.push({ '類別': '負債', '科目': '', '金額': liabilities.reduce((s, a) => s + a.balance, 0) });
      liabilities.forEach(a => data.push({ '類別': '', '科目': a.name, '金額': a.balance }));
      data.push({ '類別': '權益', '科目': '', '金額': equity.reduce((s, a) => s + a.balance, 0) + netIncome });
      equity.forEach(a => data.push({ '類別': '', '科目': a.name, '金額': a.balance }));
      data.push({ '類別': '', '科目': '累積淨利', '金額': netIncome });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "報表");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPdf = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.createElement('div');
    element.className = 'p-8 bg-white text-gray-800 font-sans';
    
    let title = contentType === 'journal' ? '普通日記簿' : (contentType === 'is' ? '損益表' : '資產負債表');
    let html = `<h1 class="text-3xl font-bold mb-2 text-center text-gray-900">態度貳貳 - ${title}</h1>`;
    html += `<p class="text-center text-sm text-gray-500 mb-6">年度：${currentYear} | 列印日期：${new Date().toLocaleDateString()}</p>`;

    if (contentType === 'journal') {
      html += `
        <table class="w-full border-collapse border border-gray-300 text-xs">
          <thead>
            <tr class="bg-gray-100 text-gray-700">
              <th class="border border-gray-300 p-2 w-24">日期/編號</th>
              <th class="border border-gray-300 p-2 w-32">總摘要</th>
              <th class="border border-gray-300 p-2">會計科目 / 摘要</th>
              <th class="border border-gray-300 p-2 text-right w-20">借方</th>
              <th class="border border-gray-300 p-2 text-right w-20">貸方</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td class="border border-gray-300 p-2 align-top">
                  <div class="font-bold">${e.date}</div>
                  <div class="text-[10px] text-coffee-600 font-mono">#${e.voucherNo}</div>
                </td>
                <td class="border border-gray-300 p-2 align-top text-gray-600">${e.description}</td>
                <td class="border border-gray-300 p-0" colspan="3">
                  <table class="w-full border-none">
                    ${e.lines.map(l => `
                      <tr>
                        <td class="p-2 border-b border-gray-100 text-gray-800">
                          <div class="font-medium ${l.type === 'credit' ? 'pl-4' : ''}">${coa.find(c => c.id === l.accountId)?.name}</div>
                          <div class="text-[10px] text-gray-400 italic">${l.lineDescription || ''}</div>
                        </td>
                        <td class="p-2 border-b border-gray-100 text-right w-20 font-mono">${l.type === 'debit' ? (l.amount||0).toLocaleString() : ''}</td>
                        <td class="p-2 border-b border-gray-100 text-right w-20 font-mono">${l.type === 'credit' ? (l.amount||0).toLocaleString() : ''}</td>
                      </tr>
                    `).join('')}
                  </table>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (contentType === 'is') {
      const displayModeName = costMode === 'purchases' ? '即期採購成本制' : '實際消耗成本制';
      title = `損益表 (${displayModeName})`;
      
      const balances = calculateBalances(entries, coa, new Date(currentYear, 0, 1), new Date(currentYear, 11, 31));
      const revenue = Object.values(balances).filter(a => a.type === '收入');
      const cost = Object.values(balances).filter(a => a.type === '成本');
      const expense = Object.values(balances).filter(a => a.type === '費用');
      const nonOpRev = Object.values(balances).filter(a => a.type === '營業外收入');
      const nonOpExp = Object.values(balances).filter(a => a.type === '營業外費損');

      // Calculate annual purchase total from database
      const purchaseTotal = purchases
        .filter(p => {
          const d = new Date(p.date);
          return d.getFullYear() === currentYear;
        })
        .reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);

      const totalRev = revenue.reduce((s, a) => s + a.balance, 0);
      const totalCost = cost.reduce((s, a) => s + a.balance, 0);
      const displayCost = costMode === 'purchases' ? purchaseTotal : totalCost;
      const totalExp = expense.reduce((s, a) => s + a.balance, 0);
      const totalNonOp = nonOpRev.reduce((s, a) => s + a.balance, 0) - nonOpExp.reduce((s, a) => s + a.balance, 0);

      const row = (label: string, value: number, isBold = false, indent = false) => `
        <tr class="${isBold ? 'font-bold bg-gray-50' : ''}">
          <td class="border border-gray-300 p-2 ${indent ? 'pl-8' : ''}">${label}</td>
          <td class="border border-gray-300 p-2 text-right font-mono">${(value||0).toLocaleString()}</td>
        </tr>
      `;

      html += `
        <table class="w-full max-w-2xl mx-auto border-collapse border border-gray-300 text-sm">
          <thead>
            <tr class="bg-gray-100 text-gray-700">
              <th class="border border-gray-300 p-2 text-left">項目</th>
              <th class="border border-gray-300 p-2 text-right">金額 (TWD)</th>
            </tr>
          </thead>
          <tbody>
            ${row('營業收入', totalRev, true)}
            ${revenue.map(a => row(a.name, a.balance, false, true)).join('')}
            
            ${costMode === 'cogs' ? `
              ${row('營業成本', totalCost, true)}
              ${cost.map(a => row(a.name, a.balance, false, true)).join('')}
            ` : `
              ${row('營業成本 (當期進貨總額)', purchaseTotal, true)}
              ${row('進貨單累計總額 (進貨管理)', purchaseTotal, false, true)}
            `}
            
            ${row('營業毛利', totalRev - displayCost, true)}
            ${row('營業費用', totalExp, true)}
            ${expense.map(a => row(a.name, a.balance, false, true)).join('')}
            ${row('營業利益', totalRev - displayCost - totalExp, true)}
            ${row('營業外收支淨額', totalNonOp, true)}
            ${row('本期淨利', totalRev - displayCost - totalExp + totalNonOp, true)}
          </tbody>
        </table>
      `;
    } else {
      const balances = calculateBalances(entries, coa, null, new Date(currentYear, 11, 31), true);
      const assets = Object.values(balances).filter(a => a.type === '資產');
      const liabilities = Object.values(balances).filter(a => a.type === '負債');
      const equity = Object.values(balances).filter(a => a.type === '權益');
      const netIncome = Object.values(balances).filter(a => ['收入', '成本', '費用', '營業外收入', '營業外費損'].includes(a.type))
        .reduce((s, a) => a.side === 'credit' ? s + a.balance : s - a.balance, 0);

      const section = (title: string, items: AccountBalance[], total: number) => `
        <tr class="bg-blue-50 font-bold"><td class="border border-gray-300 p-2" colspan="2">${title}</td></tr>
        ${items.map(a => `<tr><td class="border border-gray-300 p-2 pl-8">${a.name}</td><td class="border border-gray-300 p-2 text-right font-mono">${(a.balance||0).toLocaleString()}</td></tr>`).join('')}
        ${title === '權益' ? `<tr><td class="border border-gray-300 p-2 pl-8">本期淨利 (累積)</td><td class="border border-gray-300 p-2 text-right font-mono">${(netIncome||0).toLocaleString()}</td></tr>` : ''}
        <tr class="font-bold"><td class="border border-gray-300 p-2 text-right">${title}總計</td><td class="border border-gray-300 p-2 text-right font-mono">${(total||0).toLocaleString()}</td></tr>
      `;

      html += `
        <table class="w-full max-w-2xl mx-auto border-collapse border border-gray-300 text-sm">
          <thead>
            <tr class="bg-gray-100 text-gray-700">
              <th class="border border-gray-300 p-2 text-left">會計科目</th>
              <th class="border border-gray-300 p-2 text-right">金額 (TWD)</th>
            </tr>
          </thead>
          <tbody>
            ${section('資產', assets, assets.reduce((s, a) => s + a.balance, 0))}
            ${section('負債', liabilities, liabilities.reduce((s, a) => s + a.balance, 0))}
            ${section('權益', equity, equity.reduce((s, a) => s + a.balance, 0) + netIncome)}
          </tbody>
        </table>
      `;
    }

    element.innerHTML = html;
    document.body.appendChild(element);

    const opt = {
      margin: 0.5,
      filename: `${title}_${currentYear}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      document.body.removeChild(element);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-coffee-50 flex justify-between items-center bg-coffee-50">
          <h3 className="text-xl font-bold text-coffee-600">匯出中心</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-2xl font-light">✕</button>
        </div>
        
        <div className="p-6 space-y-6">
          <section>
            <label className="block text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">1. 選擇匯出內容</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'journal', label: '普通日記簿', icon: '📝' },
                { id: 'is', label: '損益表', icon: '📈' },
                { id: 'bs', label: '資產負債表', icon: '⚖️' },
                { id: 'raw', label: '原始資料(備份)', icon: '💾' }
              ].map(item => (
                <button 
                  key={item.id} onClick={() => setContentType(item.id)}
                  className={`p-3 rounded-xl border-2 transition text-left flex flex-col gap-1 ${contentType === item.id ? 'border-coffee-600 bg-coffee-50' : 'border-gray-100 hover:border-coffee-200'}`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className={`text-sm font-medium ${contentType === item.id ? 'text-coffee-700' : 'text-gray-600'}`}>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          
          {contentType === 'is' && (
            <section className="animate-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">成本計算模式</label>
              <div className="flex bg-coffee-50 p-1 rounded-xl">
                <button
                  onClick={() => setCostMode('cogs')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${costMode === 'cogs' ? 'bg-white text-coffee-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  📈 實際消耗成本 (COGS)
                </button>
                <button
                  onClick={() => setCostMode('purchases')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${costMode === 'purchases' ? 'bg-white text-coffee-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  🛒 即期採購成本 (Purchases)
                </button>
              </div>
            </section>
          )}

          <section>
            <label className="block text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">2. 選擇檔案格式</label>
            <div className="flex gap-4">
              {contentType === 'raw' ? (
                <div className="flex-1 p-3 rounded-xl border-2 border-coffee-600 bg-coffee-50 flex items-center gap-3">
                  <span className="text-xl">📄</span><span className="text-sm font-medium text-coffee-700">JSON 格式</span>
                </div>
              ) : (
                <>
                  <button onClick={() => setFormat('pdf')} className={`flex-1 p-3 rounded-xl border-2 transition flex items-center gap-3 ${format === 'pdf' ? 'border-coffee-600 bg-coffee-50' : 'border-gray-100 hover:border-coffee-200'}`}>
                    <span className="text-xl">📕</span><span className={`text-sm font-medium ${format === 'pdf' ? 'text-coffee-700' : 'text-gray-600'}`}>PDF 報表</span>
                  </button>
                  <button onClick={() => setFormat('excel')} className={`flex-1 p-3 rounded-xl border-2 transition flex items-center gap-3 ${format === 'excel' ? 'border-coffee-600 bg-coffee-50' : 'border-gray-100 hover:border-coffee-200'}`}>
                    <span className="text-xl">📊</span><span className={`text-sm font-medium ${format === 'excel' ? 'text-coffee-700' : 'text-gray-600'}`}>Excel 試算表</span>
                  </button>
                </>
              )}
            </div>
          </section>

          <button disabled={isExporting} onClick={handleExport} className="w-full py-4 bg-coffee-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-coffee-700 transition-all active:scale-[0.98] mt-4 disabled:opacity-50 flex justify-center items-center gap-2">
            {isExporting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : '開始匯出 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
}
