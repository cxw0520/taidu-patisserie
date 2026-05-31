import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { JournalEntry, COAItem } from '../../types';
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
  const [isClosing, setIsClosing] = useState(initialData?.isClosing || false);
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
      })),
      isClosing
    };
    onSave(entry);
    if (!initialData) {
      setDescription('');
      setIsClosing(false);
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

      {/* 月底結帳傳票標記開關 */}
      <div className="flex items-center gap-3.5 bg-rose-50/20 hover:bg-rose-50/40 p-3.5 rounded-2xl border border-rose-100/30 transition-colors w-full">
        <input 
          type="checkbox" 
          id="isClosing" 
          checked={isClosing} 
          onChange={e => setIsClosing(e.target.checked)}
          className="w-4.5 h-4.5 text-rose-brand rounded focus:ring-rose-brand/30 border-coffee-250 cursor-pointer"
        />
        <div className="flex flex-col cursor-pointer select-none" onClick={() => setIsClosing(!isClosing)}>
          <span className="text-xs font-extrabold text-coffee-800">📅 月底損益結轉傳票（結帳分錄）</span>
          <span className="text-[10px] text-coffee-450 mt-0.5 font-medium">若勾選此項，系統會自動在「損益表」的營業額與費損統計中排除此傳票，以確保損益表不會被清零，且日記簿、分類帳與資產負債表能正常結轉平衡。</span>
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
  const [displayCount, setDisplayCount] = useState(50);

  interface VoucherTemplate {
    id: string;
    name: string;
    description: string;
    debitAccountId: string;
    creditAccountId: string;
  }

  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [selectedTplForUse, setSelectedTplForUse] = useState<VoucherTemplate | null>(null);
  
  // Use state variables
  const [useDate, setUseDate] = useState('');
  const [useAmount, setUseAmount] = useState<number>(0);

  // Manage state variables
  const [editingTpl, setEditingTpl] = useState<VoucherTemplate | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplDesc, setNewTplDesc] = useState('');
  const [newTplDebit, setNewTplDebit] = useState('');
  const [newTplCredit, setNewTplCredit] = useState('');

  // Listen to quick templates from Firestore
  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, 'shops', shopId, 'meta', 'voucherTemplates'), async (snap) => {
      if (snap.exists() && snap.data()?.list) {
        setTemplates(snap.data().list);
      } else {
        const defaultTemplates: VoucherTemplate[] = [
          {
            id: 'tpl-rent',
            name: '🏢 房租',
            description: '支付本月房屋租金',
            debitAccountId: '6101', // 租金支出
            creditAccountId: '1102', // 銀行存款
          },
          {
            id: 'tpl-tax',
            name: '📊 營業稅',
            description: '繳納本期營業稅',
            debitAccountId: '6109', // 稅捐
            creditAccountId: '1102', // 銀行存款
          },
          {
            id: 'tpl-marketing',
            name: '📣 行銷公司',
            description: '支付行銷公司服務費',
            debitAccountId: '6301', // 行銷費
            creditAccountId: '1102', // 銀行存款
          }
        ];
        await setDoc(doc(db, 'shops', shopId, 'meta', 'voucherTemplates'), { list: defaultTemplates }, { merge: true });
      }
    });
    return unsub;
  }, [shopId]);

  const handleSaveTemplates = async (updatedList: VoucherTemplate[]) => {
    await setDoc(doc(db, 'shops', shopId, 'meta', 'voucherTemplates'), { list: updatedList }, { merge: true });
  };

  const handleSaveSingleTemplate = async () => {
    if (isAddMode) {
      if (!newTplName || !newTplDesc || !newTplDebit || !newTplCredit) {
        return alert('請填寫完整範本資訊！');
      }
      const newTpl: VoucherTemplate = {
        id: 'tpl-' + uid(),
        name: newTplName,
        description: newTplDesc,
        debitAccountId: newTplDebit,
        creditAccountId: newTplCredit
      };
      const updated = [...templates, newTpl];
      await handleSaveTemplates(updated);
      setIsAddMode(false);
    } else if (editingTpl) {
      if (!editingTpl.name || !editingTpl.description || !editingTpl.debitAccountId || !editingTpl.creditAccountId) {
        return alert('請填寫完整範本資訊！');
      }
      const updated = templates.map(t => t.id === editingTpl.id ? editingTpl : t);
      await handleSaveTemplates(updated);
      setEditingTpl(null);
    }
    alert('範本儲存成功！');
  };

  const handleDeleteTemplate = async (tplId: string) => {
    if (confirm('確定要刪除此傳票範本嗎？')) {
      const updated = templates.filter(t => t.id !== tplId);
      await handleSaveTemplates(updated);
      alert('範本刪除成功！');
    }
  };

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

  const handleQuickSubmit = async () => {
    if (!selectedTplForUse) return;
    if (!useDate) return alert('請選擇日期！');
    if (useAmount <= 0) return alert('請輸入大於 0 的金額！');

    const entryId = generateVoucherId(useDate);
    const year = Number(useDate.substring(0, 4));

    const debitAcc = coa.find(c => c.id === selectedTplForUse.debitAccountId);
    const creditAcc = coa.find(c => c.id === selectedTplForUse.creditAccountId);

    if (!debitAcc || !creditAcc) {
      return alert('範本中的會計科目不存在，請檢查！');
    }

    const entry: JournalEntry = {
      id: entryId,
      date: useDate,
      year,
      voucherNo: entryId,
      description: selectedTplForUse.description,
      debitTotal: useAmount,
      creditTotal: useAmount,
      lines: [
        {
          id: uid(),
          type: 'debit',
          accountId: selectedTplForUse.debitAccountId,
          accountName: debitAcc.name,
          amount: useAmount,
          lineDescription: selectedTplForUse.description
        },
        {
          id: uid(),
          type: 'credit',
          accountId: selectedTplForUse.creditAccountId,
          accountName: creditAcc.name,
          amount: useAmount,
          lineDescription: selectedTplForUse.description
        }
      ]
    };

    await handleSaveEntry(entry);
    setIsUseModalOpen(false);
    setSelectedTplForUse(null);
    alert('已成功快速建立傳票！');
  };

  useEffect(() => {
    setDisplayCount(50);
  }, [selectedYear]);
  
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
            onClick={async () => {
              const XLSX = await import('xlsx');
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

      {/* 常用傳票快速通道 */}
      <div className="bg-coffee-50/40 border border-coffee-100/60 p-5 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-bold text-coffee-800 flex items-center gap-1.5">
            <span>✨</span> 常用傳票快速通道 <span className="text-xs text-rose-600 ml-2 font-normal">(⚠️ 凡涉及「支出與花費」請改至「支出總表」輸入，財報才會正確認列)</span>
          </span>
          <button 
            onClick={() => setIsManageOpen(true)}
            className="text-xs font-bold text-coffee-600 hover:text-coffee-800 hover:underline flex items-center gap-1 bg-white border border-coffee-200 px-2 py-1 rounded-lg shadow-sm"
          >
            ⚙️ 管理範本
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          {templates.length === 0 ? (
            <span className="text-xs text-gray-400 italic">尚無常用範本，可點擊右側管理範本新增</span>
          ) : templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => {
                setSelectedTplForUse(tpl);
                const today = new Date();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setUseDate(`${selectedYear}-${mm}-${dd}`);
                setUseAmount(0);
                setIsUseModalOpen(true);
              }}
              className="bg-white border border-coffee-200/80 text-coffee-805 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-coffee-50 hover:border-coffee-300 transition duration-150 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1.5"
            >
              {tpl.name}
            </button>
          ))}
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
            ) : entries.slice(0, displayCount).map(entry => (
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
                        {line.accountName || coa.find(c => c.id === line.accountId)?.name || '未知名稱'}
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

      {entries.length > displayCount && (
        <div className="flex justify-center pt-6">
          <button 
            onClick={() => setDisplayCount(prev => prev + 50)}
            className="bg-coffee-600 border border-coffee-700 text-white hover:bg-coffee-700 px-6 py-3 rounded-full font-bold shadow-md transition active:scale-95 text-sm flex items-center gap-2"
          >
            <span>✨</span> 顯示更多分錄 (已顯示 {displayCount} / 共 {entries.length} 筆)
          </button>
        </div>
      )}

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

      {/* 快速使用範本彈出視窗 */}
      <AnimatePresence>
        {isUseModalOpen && selectedTplForUse && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 relative">
              <button 
                onClick={() => { setIsUseModalOpen(false); setSelectedTplForUse(null); }}
                className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-650 rounded-full hover:bg-gray-100 transition"
              >
                ✕
              </button>
              <h3 className="text-lg font-bold text-coffee-800 mb-4 flex items-center gap-1.5">
                <span>🚀 快速建立傳票</span> · {selectedTplForUse.name}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">交易日期</label>
                  <input 
                    type="date" 
                    value={useDate} 
                    onChange={e => setUseDate(e.target.value)} 
                    className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-coffee-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">交易金額</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input 
                      type="number" 
                      value={useAmount || ''} 
                      onChange={e => setUseAmount(Number(e.target.value))} 
                      className="w-full pl-8 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-coffee-500 outline-none font-mono font-bold text-lg text-coffee-950" 
                      placeholder="請輸入金額"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="bg-coffee-50/50 p-4 rounded-2xl border border-coffee-100 space-y-1.5 text-xs text-coffee-700 font-bold">
                  <div className="flex justify-between">
                    <span>總摘要 (自動帶入)</span>
                    <span className="text-gray-500 font-normal">{selectedTplForUse.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>借方科目 (自動對帳)</span>
                    <span className="text-blue-600">{coa.find(c => c.id === selectedTplForUse.debitAccountId)?.name || '未知'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>貸方科目 (自動對帳)</span>
                    <span className="text-red-505">{coa.find(c => c.id === selectedTplForUse.creditAccountId)?.name || '未知'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button 
                  onClick={() => { setIsUseModalOpen(false); setSelectedTplForUse(null); }}
                  className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl font-bold hover:bg-gray-50 transition active:scale-95 text-sm"
                >
                  取消
                </button>
                <button 
                  onClick={handleQuickSubmit}
                  className="flex-1 py-3 bg-coffee-800 text-white rounded-xl font-bold shadow-md hover:bg-coffee-900 transition active:scale-95 text-sm"
                >
                  確認建立
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 管理範本彈出視窗 */}
      <AnimatePresence>
        {isManageOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-sans">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 relative flex flex-col max-h-[85vh]">
              <button 
                onClick={() => { setIsManageOpen(false); setEditingTpl(null); setIsAddMode(false); }}
                className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
              >
                ✕
              </button>
              <h3 className="text-lg font-bold text-coffee-800 mb-4 flex items-center gap-1.5">
                <span>⚙️ 管理常用傳票範本</span>
              </h3>

              {/* 編輯 / 新增介面 */}
              {(isAddMode || editingTpl) ? (
                <div className="space-y-4 border border-coffee-100 bg-coffee-50/20 p-4 rounded-2xl overflow-y-auto">
                  <h4 className="text-sm font-bold text-coffee-800">{isAddMode ? '➕ 新增範本' : '✏️ 編輯範本'}</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">按鈕名稱 (例：🏢 房租)</label>
                      <input 
                        type="text" 
                        value={isAddMode ? newTplName : editingTpl?.name || ''} 
                        onChange={e => isAddMode ? setNewTplName(e.target.value) : setEditingTpl({...editingTpl!, name: e.target.value})} 
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-coffee-500" 
                        placeholder="建議包含表情符號如：🏢 房租"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">傳票總摘要 (例：支付本月房租)</label>
                      <input 
                        type="text" 
                        value={isAddMode ? newTplDesc : editingTpl?.description || ''} 
                        onChange={e => isAddMode ? setNewTplDesc(e.target.value) : setEditingTpl({...editingTpl!, description: e.target.value})} 
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-coffee-500" 
                        placeholder="此摘要將寫入該筆傳票的摘要中"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">借方會計科目 (費用/成本類)</label>
                      <select 
                        value={isAddMode ? newTplDebit : editingTpl?.debitAccountId || ''} 
                        onChange={e => isAddMode ? setNewTplDebit(e.target.value) : setEditingTpl({...editingTpl!, debitAccountId: e.target.value})} 
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-coffee-500 font-bold text-coffee-800"
                      >
                        <option value="" disabled>請選擇科目...</option>
                        {coa.map(c => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">貸方會計科目 (資金/資產類)</label>
                      <select 
                        value={isAddMode ? newTplCredit : editingTpl?.creditAccountId || ''} 
                        onChange={e => isAddMode ? setNewTplCredit(e.target.value) : setEditingTpl({...editingTpl!, creditAccountId: e.target.value})} 
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-coffee-500 font-bold text-coffee-800"
                      >
                        <option value="" disabled>請選擇科目...</option>
                        {coa.map(c => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={() => { setIsAddMode(false); setEditingTpl(null); }}
                      className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-xl font-bold hover:bg-gray-100 text-xs transition"
                    >
                      取消
                    </button>
                    <button 
                      onClick={handleSaveSingleTemplate}
                      className="flex-1 py-2 bg-coffee-600 text-white rounded-xl font-bold hover:bg-coffee-700 text-xs transition shadow"
                    >
                      儲存範本
                    </button>
                  </div>
                </div>
              ) : (
                // 列表介面
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-400">目前已有範本</span>
                    <button 
                      onClick={() => {
                        setNewTplName('');
                        setNewTplDesc('');
                        setNewTplDebit(coa[0]?.id || '');
                        setNewTplCredit(coa[0]?.id || '');
                        setIsAddMode(true);
                      }}
                      className="text-xs font-bold text-mint-brand hover:underline flex items-center gap-1"
                    >
                      ➕ 新增範本
                    </button>
                  </div>
                  
                  {templates.map(tpl => (
                    <div key={tpl.id} className="border border-gray-150 p-4 rounded-2xl flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 transition">
                      <div className="text-left">
                        <div className="font-bold text-sm text-coffee-800">{tpl.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{tpl.description}</div>
                        <div className="text-[10px] text-gray-500 mt-1 flex gap-2 font-semibold">
                          <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">借: {coa.find(c => c.id === tpl.debitAccountId)?.name || tpl.debitAccountId}</span>
                          <span className="text-red-505 bg-red-50 px-1.5 py-0.5 rounded">貸: {coa.find(c => c.id === tpl.creditAccountId)?.name || tpl.creditAccountId}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => setEditingTpl(tpl)}
                          className="px-2.5 py-1.5 text-xs font-bold bg-white text-coffee-600 border border-coffee-200 rounded-lg hover:bg-coffee-50 transition"
                        >
                          編輯
                        </button>
                        <button 
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          className="px-2.5 py-1.5 text-xs font-bold bg-white text-danger-brand border border-red-200 rounded-lg hover:bg-red-50 transition"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}

                  {templates.length === 0 && (
                    <div className="text-center text-gray-400 text-xs py-8 italic">目前無任何傳票範本</div>
                  )}
                </div>
              )}

              <div className="mt-6 border-t border-gray-100 pt-4 flex justify-end">
                <button 
                  onClick={() => { setIsManageOpen(false); setEditingTpl(null); setIsAddMode(false); }}
                  className="px-6 py-2.5 bg-coffee-800 text-white rounded-xl font-bold hover:bg-coffee-900 transition shadow-sm text-sm"
                >
                  關閉
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
