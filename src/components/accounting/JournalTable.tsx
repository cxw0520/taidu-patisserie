import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { JournalEntry, COAItem } from '../../types';
import * as XLSX from 'xlsx';
import { cn, uid } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

function EntryForm({ 
  coa, 
  entries, 
  selectedYear, 
  initialData, 
  onSave, 
  onCancel 
}: { 
  coa: COAItem[], 
  entries: JournalEntry[], 
  selectedYear: number, 
  initialData?: JournalEntry | null, 
  onSave: (e: any) => void, 
  onCancel?: () => void 
}) {
  const [date, setDate] = useState(initialData?.date || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [lines, setLines] = useState<{accountId: string, amount: number, type: 'debit'|'credit', lineDescription: string}[]>(
    initialData?.lines.map(l => ({ ...l, amount: l.amount })) || [
    { accountId: '', amount: 0, type: 'debit', lineDescription: '' },
    { accountId: '', amount: 0, type: 'credit', lineDescription: '' }
  ]);

  useEffect(() => {
    if (!initialData) {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setDate(`${selectedYear}-${mm}-${dd}`);
    }
  }, [selectedYear, initialData]);

  const totalDebit = lines.filter(l => l.type === 'debit').reduce((sum, l) => sum + Number(l.amount), 0);
  const totalCredit = lines.filter(l => l.type === 'credit').reduce((sum, l) => sum + Number(l.amount), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const generateVoucherId = (selectedDate: string) => {
    const d = new Date(selectedDate);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const todayVouchers = entries
      .filter(e => e.date === selectedDate)
      .map(e => e.id)
      .filter(id => id.startsWith(datePrefix));
    
    let nextSeq = 1;
    if (todayVouchers.length > 0) {
      const maxSeq = Math.max(...todayVouchers.map(id => parseInt(id.slice(-2), 10) || 0));
      nextSeq = maxSeq + 1;
    }
    return `${datePrefix}${String(nextSeq).padStart(2, '0')}`;
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    (newLines[index] as any)[field] = value;
    setLines(newLines);
  };

  const addLine = (type: 'debit' | 'credit') => {
    const newLine = { accountId: '', amount: 0, type, lineDescription: '' };
    const newLines = [...lines];
    let insertIdx = newLines.length;
    for (let i = newLines.length - 1; i >= 0; i--) {
      if (newLines[i].type === type) { insertIdx = i + 1; break; }
    }
    if (type === 'debit' && insertIdx === newLines.length && !newLines.some(l => l.type === 'debit')) {
      insertIdx = 0;
    }
    newLines.splice(insertIdx, 0, newLine);
    setLines(newLines);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;
    const voucherId = initialData ? initialData.id : generateVoucherId(date);
    const entry = {
      id: voucherId,
      voucherNo: voucherId,
      date,
      year: Number(date.substring(0, 4)),
      description,
      debitTotal: totalDebit,
      creditTotal: totalCredit,
      lines: lines.map(l => ({
        ...l,
        accountName: coa.find(a => a.id === l.accountId)?.name || '未知名稱'
      }))
    };
    onSave(entry);
    if (!initialData) {
      setDescription('');
      setLines([
        { accountId: '', amount: 0, type: 'debit', lineDescription: '' },
        { accountId: '', amount: 0, type: 'credit', lineDescription: '' }
      ]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">交易日期</label>
          <input 
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-coffee-300 outline-none" required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">總摘要</label>
          <input 
            type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="例如：購買麵粉、今日營收..."
            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-coffee-300 outline-none" required
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-sm font-bold text-gray-500 uppercase tracking-wider px-2">
          <div className="col-span-4">會計科目</div>
          <div className="col-span-3">摘要</div>
          <div className="col-span-2 text-right">借方金額</div>
          <div className="col-span-2 text-right">貸方金額</div>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg">
            <div className="col-span-4 flex gap-1">
              <input 
                type="text" placeholder="代碼" value={line.accountId} onChange={e => handleLineChange(idx, 'accountId', e.target.value)}
                className="w-16 border rounded p-2 text-sm font-mono text-center focus:ring-2 focus:ring-coffee-300 outline-none placeholder-gray-300"
              />
              <select 
                value={line.accountId} onChange={e => handleLineChange(idx, 'accountId', e.target.value)}
                className="flex-1 w-0 border rounded p-2 bg-white text-sm focus:ring-2 focus:ring-coffee-300 outline-none truncate" required
              >
                <option value="" className="text-gray-400">選擇科目...</option>
                {coa.map(a => <option key={a.id} value={a.id}>{a.id} {a.name}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <input type="text" value={line.lineDescription} onChange={e => handleLineChange(idx, 'lineDescription', e.target.value)} placeholder="行摘要..." className="w-full border rounded p-2 text-sm" />
            </div>
            <div className="col-span-2">
              <input type="number" value={line.amount || ''} onChange={e => handleLineChange(idx, 'amount', Number(e.target.value))} placeholder={line.type === 'debit' ? '借方' : '貸方'} className={cn("w-full border rounded p-2 text-right text-sm", line.type === 'debit' ? 'border-blue-200' : 'border-red-200')} required />
            </div>
            <div className="col-span-2 flex gap-1 items-center">
              <select value={line.type} onChange={e => handleLineChange(idx, 'type', e.target.value)} className="text-xs border rounded p-1 flex-1">
                <option value="debit">借</option>
                <option value="credit">貸</option>
              </select>
              <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 p-1">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 border-t">
        <div className="flex gap-4">
          <button type="button" onClick={() => addLine('debit')} className="text-sm text-blue-600 hover:underline">+ 增加借方</button>
          <button type="button" onClick={() => addLine('credit')} className="text-sm text-red-600 hover:underline">+ 增加貸方</button>
        </div>
        <div className="text-right">
          <div className="text-sm mb-3">
            <span className={isBalanced ? 'text-green-600' : 'text-red-500'}>
              借貸平衡：{totalDebit.toLocaleString()} / {totalCredit.toLocaleString()}
            </span>
          </div>
          <div className="flex gap-2 justify-end">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-6 py-2 rounded-lg font-bold shadow bg-gray-100 text-gray-500 hover:bg-gray-200 transition">取消編輯</button>
            )}
            <button type="submit" disabled={!isBalanced} className={cn("px-6 py-2 rounded-lg font-bold shadow transition", isBalanced ? "bg-coffee-600 text-white hover:bg-coffee-700" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
              {initialData ? '儲存修改' : '儲存分錄'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function JournalTable({ entries, coa, selectedYear, shopId }: { entries: JournalEntry[], coa: COAItem[], selectedYear: number, shopId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  
  const [pendingAssets, setPendingAssets] = useState<any[]>([]);
  const [currentPendingAsset, setCurrentPendingAsset] = useState<any | null>(null);

  const handleSaveEntry = async (entry: JournalEntry) => {
    const entryRef = doc(db, 'shops', shopId, 'entries', entry.id);
    await setDoc(entryRef, { ...entry, updatedAt: new Date().toISOString() });
    setShowForm(false);
    setEditingEntryId(null);
    
    // Check for fixed assets
    const equipmentKeywords = [
      { key: '生財設備', cat: '生財設備' },
      { key: '租賃物改良', cat: '租賃物改良' },
      { key: '裝修工程', cat: '裝修工程' },
      { key: '運輸設備', cat: '運輸設備' },
      { key: '辦公設備', cat: '辦公設備' }
    ];
    
    const matchedAssets: any[] = [];
    entry.lines.forEach(line => {
      if (line.type === 'debit') {
        for (let eq of equipmentKeywords) {
          if (line.accountName.includes(eq.key)) {
            matchedAssets.push({
              id: uid(),
              status: '使用中',
              category: eq.cat,
              name: line.lineDescription || entry.description || eq.cat,
              purchaseDate: entry.date,
              totalCost: line.amount,
              quantity: 1,
              usefulLife: 5,
              residualValue: 0,
              remark: `憑證: ${entry.id}`
            });
            break;
          }
        }
      }
    });

    if (matchedAssets.length > 0) {
      setPendingAssets(matchedAssets);
      setCurrentPendingAsset(matchedAssets[0]);
    }
  };

  const handleDelete = async (id: string) => {
    // Note: window.confirm is blocked in iframe previews
    await deleteDoc(doc(db, 'shops', shopId, 'entries', id));
  };

  const handleSaveAsset = async () => {
    if (currentPendingAsset) {
      await setDoc(doc(db, 'shops', shopId, 'assets', currentPendingAsset.id), currentPendingAsset);
    }
    handleSkipAsset();
  };

  const handleSkipAsset = () => {
    const nextQueue = pendingAssets.slice(1);
    setPendingAssets(nextQueue);
    setCurrentPendingAsset(nextQueue.length > 0 ? nextQueue[0] : null);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <h2 className="text-lg md:text-xl font-semibold text-gray-700">{selectedYear} 年度 普通日記簿</h2>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => {
              const workbook = XLSX.utils.book_new();
              const worksheet = XLSX.utils.json_to_sheet(entries.map(e => ({
                日期: e.date, 傳票編號: e.voucherNo, 總摘要: e.description, 借方總額: e.debitTotal, 貸方總額: e.creditTotal,
                分錄: e.lines.map(l => `${coa.find(c => c.id === l.accountId)?.name} (${l.type === 'debit' ? '借' : '貸'}: ${l.amount})`).join('; ')
              })));
              XLSX.utils.book_append_sheet(workbook, worksheet, "Journal");
              XLSX.writeFile(workbook, `Journal_${selectedYear}.xlsx`);
            }}
            className="p-2 border rounded-lg text-coffee-600 hover:bg-gray-50 flex items-center shadow-sm font-bold text-sm"
          >
            匯出 Excel
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-coffee-600 text-white px-4 py-2 rounded-lg shadow hover:bg-coffee-700 transition flex items-center gap-2"
          >
            {showForm ? '取消' : '➕ 新增傳票'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-coffee-100">
          <h3 className="text-lg font-medium mb-4 text-coffee-700">記下一筆交易 ({selectedYear}年)</h3>
          <EntryForm coa={coa} entries={entries} selectedYear={selectedYear} onSave={handleSaveEntry} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <div className="overflow-x-auto no-scrollbar">
        <table className="w-full min-w-[980px] text-left border-collapse text-sm">
          <thead className="bg-coffee-50 text-coffee-700">
            <tr>
              <th className="p-4 border-b whitespace-nowrap">傳票編號 / 日期</th>
              <th className="p-4 border-b min-w-[150px]">總摘要</th>
              <th className="p-4 border-b">會計科目</th>
              <th className="p-4 border-b min-w-[200px]">摘要</th>
              <th className="p-4 border-b text-right w-24">借方</th>
              <th className="p-4 border-b text-right w-24">貸方</th>
              <th className="p-4 border-b text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">尚未有任何交易紀錄</td></tr>
            ) : entries.map(entry => (
              <React.Fragment key={entry.id}>
                {editingEntryId === entry.id ? (
                  <tr>
                    <td colSpan={7} className="p-0 border-b border-gray-200">
                      <div className="bg-amber-50 p-6 border-l-4 border-amber-400">
                        <div className="flex justify-between items-center mb-4 text-amber-800 font-bold">
                          <h4>正在編輯傳票 #{entry.voucherNo}</h4>
                        </div>
                        <EntryForm 
                          coa={coa} entries={entries} selectedYear={selectedYear}
                          initialData={entry} onSave={handleSaveEntry} onCancel={() => setEditingEntryId(null)}
                        />
                      </div>
                    </td>
                  </tr>
                ) : (
                  entry.lines.map((line, idx) => (
                    <tr key={`${entry.id}-${idx}`} className="border-b border-gray-100 bg-white last:border-b-0 hover:bg-gray-50 group">
                      {idx === 0 && (
                        <>
                          <td className="p-4 font-medium text-gray-600 align-top" rowSpan={entry.lines.length}>
                            <div className="text-coffee-600 font-mono font-bold text-sm">#{entry.voucherNo}</div>
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5">{entry.date}</div>
                          </td>
                          <td className="p-4 text-base font-medium text-gray-800 align-top" rowSpan={entry.lines.length}>
                            {entry.description}
                          </td>
                        </>
                      )}
                      <td className={cn("p-4 text-gray-700 font-medium", line.type === 'credit' && "pl-12")}>
                        {line.accountName}
                      </td>
                      <td className="p-4 text-xs text-gray-400 italic">{line.lineDescription || ''}</td>
                      <td className="p-4 text-right font-mono font-bold text-gray-700">{line.type === 'debit' ? line.amount.toLocaleString() : ''}</td>
                      <td className="p-4 text-right font-mono font-bold text-gray-700">{line.type === 'credit' ? line.amount.toLocaleString() : ''}</td>
                      {idx === 0 && (
                        <td className="p-4 align-top text-center" rowSpan={entry.lines.length}>
                          <div className="flex flex-col gap-2 justify-start items-center">
                            <button onClick={() => setEditingEntryId(entry.id)} className="px-3 py-1 text-xs bg-white text-blue-600 border border-blue-200 rounded hover:bg-blue-50 shadow-sm font-bold w-full">編輯</button>
                            <button onClick={() => handleDelete(entry.id)} className="px-3 py-1 text-xs bg-white text-red-500 border border-red-200 rounded hover:bg-red-50 shadow-sm font-bold w-full">刪除</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <AnimatePresence>
        {currentPendingAsset && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 font-sans border border-coffee-100 shadow-sm bg-transparent">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center bg-coffee-50">
                  <h3 className="font-bold text-coffee-700 flex items-center gap-2"><span>✨</span> 新增至資產總表?</h3>
              </div>
              <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 font-medium">偵測到借方有「{currentPendingAsset.category}」相關的支出，要順便加入資產總表以便日後自動計算折舊嗎？</p>
                  <div className="space-y-3">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">資產名稱</label>
                          <input type="text" value={currentPendingAsset.name} onChange={e => setCurrentPendingAsset({...currentPendingAsset, name: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-coffee-300 outline-none" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">使用年限 (年)</label>
                          <input type="number" value={currentPendingAsset.usefulLife} onChange={e => setCurrentPendingAsset({...currentPendingAsset, usefulLife: Number(e.target.value)})} className="w-full border p-2 rounded focus:ring-2 focus:ring-coffee-300 outline-none text-right font-mono font-bold" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">預估殘值</label>
                          <input type="number" value={currentPendingAsset.residualValue} onChange={e => setCurrentPendingAsset({...currentPendingAsset, residualValue: Number(e.target.value)})} className="w-full border p-2 rounded focus:ring-2 focus:ring-coffee-300 outline-none text-right font-mono font-bold" />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="text-gray-500 font-bold">金額: <span className="text-gray-800 font-mono font-bold">{(currentPendingAsset.totalCost).toLocaleString()}</span></div>
                      <div className="text-gray-500 font-bold">日期: <span className="text-gray-800 font-mono font-bold">{currentPendingAsset.purchaseDate}</span></div>
                  </div>
                  <div className="mt-8 flex gap-3">
                      <button onClick={handleSkipAsset} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition">不加入</button>
                      <button onClick={handleSaveAsset} className="flex-1 py-3 bg-coffee-600 text-white rounded-xl font-bold hover:bg-coffee-700 shadow-lg transition">✔️ 加入</button>
                  </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
