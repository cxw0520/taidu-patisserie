import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ExpenseRecord, ExpenseLine, FundingSource, ExpenseCategory, COAItem, JournalEntry, JournalLine } from '../../types';
import { Plus, Trash2, Edit2, FileText, ChevronDown, ChevronUp, ArrowRightLeft, X, BookOpen, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uid, todayISO } from '../../lib/utils';

interface Props {
  shopId: string;
  selectedYear: number;
  fundingSources: FundingSource[];
  expenseCategories: ExpenseCategory[];
  coa?: COAItem[];
}

export default function ExpenseLogView({ shopId, selectedYear, fundingSources, expenseCategories, coa = [] }: Props) {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'records' | 'ledger'>('records');
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [selectedVoucherRecord, setSelectedVoucherRecord] = useState<ExpenseRecord | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'shops', shopId, 'expenses'), where('dateKey', '>=', `${selectedYear}-01-01`), where('dateKey', '<=', `${selectedYear}-12-31`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpenseRecord));
      data.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.createdAt.localeCompare(a.createdAt));
      setRecords(data);
    });
    return unsub;
  }, [shopId, selectedYear]);

  const handleOpenModal = (record?: ExpenseRecord) => {
    if (record) {
      setEditingRecord(record);
    } else {
      setEditingRecord({
        id: '',
        dateKey: todayISO(),
        yearMonth: todayISO().slice(0, 7),
        vendor: '',
        fundingSourceId: fundingSources[0]?.id || '',
        isTransfer: false,
        lines: [],
        totalAmount: 0,
        createdAt: new Date().toISOString()
      });
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('確定要刪除這筆紀錄嗎？這將會影響月底成本與利潤計算！')) {
      await deleteDoc(doc(db, 'shops', shopId, 'expenses', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-coffee-100">
        <div>
          <h2 className="text-xl font-bold text-coffee-800">零用金與雜支記帳本</h2>
          <p className="text-sm text-coffee-400 mt-1">管理各項支出與代墊款，支援單一發票多筆分類明細</p>
          
          <div className="flex bg-gray-100 p-1 rounded-xl mt-4 w-fit">
            <button onClick={() => setActiveTab('records')} className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${activeTab === 'records' ? 'bg-white text-coffee-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              🛒 雜支明細
            </button>
            <button onClick={() => setActiveTab('ledger')} className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${activeTab === 'ledger' ? 'bg-white text-coffee-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              📖 登入資料的分類帳
            </button>
          </div>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-mint-brand text-white font-bold rounded-xl shadow-md hover:bg-mint-600 transition flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> 新增記帳
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-coffee-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-coffee-50/50 text-coffee-700 text-sm">
            <tr>
              <th className="p-4 border-b font-bold w-32">日期</th>
              <th className="p-4 border-b font-bold">廠商 / 摘要</th>
              <th className="p-4 border-b font-bold w-40 text-right">總金額</th>
              <th className="p-4 border-b font-bold w-40 text-center">資金來源</th>
              <th className="p-4 border-b font-bold w-32 text-center">明細</th>
              <th className="p-4 border-b font-bold w-32 text-right">{activeTab === 'ledger' ? '傳票狀態' : '操作'}</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400 font-bold">尚無記帳紀錄</td></tr>
            ) : records.map(r => {
              const fs = fundingSources.find(f => f.id === r.fundingSourceId);
              const targetFs = fundingSources.find(f => f.id === r.targetFundingSourceId);
              const isExpanded = expandedId === r.id;

              return (
                <React.Fragment key={r.id}>
                  <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${r.isTransfer ? 'bg-blue-50/30' : ''}`} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    <td className="p-4 font-mono text-coffee-600">{r.dateKey}</td>
                    <td className="p-4 font-bold text-coffee-800 flex items-center gap-2">
                      {r.isTransfer ? <ArrowRightLeft className="w-4 h-4 text-blue-500" /> : <FileText className="w-4 h-4 text-coffee-400" />}
                      {r.isTransfer ? '資金轉帳' : r.vendor || '未填寫廠商'}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-coffee-900">${r.totalAmount.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      {r.isTransfer ? (
                        <div className="flex flex-col items-center text-[10px] font-bold">
                          <span className="text-gray-500">轉出: {fs?.name}</span>
                          <span className="text-blue-600">轉入: {targetFs?.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold px-2 py-1 bg-coffee-100 text-coffee-700 rounded-lg">{fs?.name || '未知'}</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {!r.isTransfer && (
                        <button className="text-xs font-bold text-mint-brand hover:bg-mint-50 px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto">
                          {r.lines.length} 筆明細 {isExpanded ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                        </button>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {activeTab === 'ledger' ? (
                        r.voucherId ? (
                          <div className="flex justify-end items-center gap-1 text-green-600 text-sm font-bold">
                            <CheckCircle className="w-4 h-4" /> 已產生
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setSelectedVoucherRecord(r); setIsVoucherModalOpen(true); }} className="px-3 py-1 bg-coffee-800 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-coffee-900 transition flex items-center gap-1 ml-auto">
                            <BookOpen className="w-3 h-3"/> 產生傳票
                          </button>
                        )
                      ) : (
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleOpenModal(r)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4"/></button>
                          <button onClick={() => handleDelete(r.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      )}
                    </td>
                  </tr>
                  
                  {isExpanded && !r.isTransfer && (
                    <tr>
                      <td colSpan={6} className="bg-coffee-50/50 p-0 border-b border-gray-100">
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="p-4 px-12 space-y-2">
                          <div className="text-xs font-bold text-coffee-400 mb-2 border-b border-coffee-100 pb-2">拆單明細</div>
                          {r.lines.map((line, idx) => {
                            const cat = expenseCategories.find(c => c.id === line.categoryId);
                            return (
                              <div key={idx} className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cat?.isMaterialCost ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'}`}>
                                    {cat?.name || '未知分類'}
                                  </span>
                                  <span className="text-coffee-600">{line.note || '-'}</span>
                                </div>
                                <span className="font-mono text-coffee-800">${line.amount.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && editingRecord && (
        <ExpenseModal 
          shopId={shopId} 
          record={editingRecord} 
          fundingSources={fundingSources} 
          expenseCategories={expenseCategories} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
      {isVoucherModalOpen && selectedVoucherRecord && (
        <VoucherModal 
          shopId={shopId} 
          record={selectedVoucherRecord} 
          fundingSources={fundingSources} 
          expenseCategories={expenseCategories} 
          coa={coa}
          onClose={() => setIsVoucherModalOpen(false)} 
        />
      )}
    </div>
  );
}

function ExpenseModal({ shopId, record, fundingSources, expenseCategories, onClose }: { shopId: string, record: ExpenseRecord, fundingSources: FundingSource[], expenseCategories: ExpenseCategory[], onClose: () => void }) {
  const [data, setData] = useState<ExpenseRecord>(record);

  const addLine = () => {
    setData({
      ...data,
      lines: [...data.lines, { id: uid(), categoryId: expenseCategories[0]?.id || '', amount: 0, note: '' }]
    });
  };

  const removeLine = (idx: number) => {
    const newLines = [...data.lines];
    newLines.splice(idx, 1);
    setData({ ...data, lines: newLines });
  };

  const updateLine = (idx: number, field: keyof ExpenseLine, value: any) => {
    const newLines = [...data.lines];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setData({ ...data, lines: newLines });
  };

  const totalLinesAmount = data.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const isBalanceError = !data.isTransfer && data.lines.length > 0 && totalLinesAmount !== data.totalAmount;

  const handleSave = async () => {
    if (!data.dateKey) return alert('請填寫日期');
    if (!data.isTransfer && !data.vendor) return alert('請填寫廠商或摘要');
    if (data.totalAmount <= 0) return alert('總金額必須大於 0');
    if (isBalanceError) return alert('明細總和必須等於發票總額！');
    if (data.isTransfer && (!data.fundingSourceId || !data.targetFundingSourceId || data.fundingSourceId === data.targetFundingSourceId)) {
      return alert('請選擇正確且不同的轉出與轉入帳戶！');
    }

    const id = data.id || uid();
    const payload: ExpenseRecord = {
      ...data,
      id,
      yearMonth: data.dateKey.slice(0, 7),
      lines: data.isTransfer ? [] : data.lines, // 轉帳沒有明細
    };

    await setDoc(doc(db, 'shops', shopId, 'expenses', id), payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-coffee-50/50 rounded-t-3xl">
          <h3 className="text-xl font-bold text-coffee-800">{data.id ? '編輯記帳' : '新增記帳'}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Type Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setData({...data, isTransfer: false})} className={`flex-1 py-2 font-bold text-sm rounded-lg transition-colors ${!data.isTransfer ? 'bg-white text-coffee-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              🛒 一般記帳 (發票/雜支)
            </button>
            <button onClick={() => setData({...data, isTransfer: true})} className={`flex-1 py-2 font-bold text-sm rounded-lg transition-colors ${data.isTransfer ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              🔄 資金轉帳 (非費用支出)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">日期</label>
              <input type="date" value={data.dateKey} onChange={e => setData({...data, dateKey: e.target.value})} className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-coffee-500 outline-none" />
            </div>
            {!data.isTransfer && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">總發票金額</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input type="number" value={data.totalAmount || ''} onChange={e => setData({...data, totalAmount: Number(e.target.value)})} className="w-full pl-8 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-coffee-500 outline-none font-mono font-bold" />
                </div>
              </div>
            )}
          </div>

          {!data.isTransfer ? (
            // --- 一般記帳 ---
            <>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">廠商 / 地點 / 摘要</label>
                <input type="text" value={data.vendor} onChange={e => setData({...data, vendor: e.target.value})} className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-coffee-500 outline-none" placeholder="例如：好市多中和店" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">付款資金來源</label>
                <select value={data.fundingSourceId} onChange={e => setData({...data, fundingSourceId: e.target.value})} className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-coffee-500 outline-none font-bold text-coffee-700 bg-coffee-50">
                  <option value="" disabled>請選擇資金來源...</option>
                  {fundingSources.map(fs => <option key={fs.id} value={fs.id}>{fs.name}</option>)}
                </select>
              </div>

              <div className="border border-coffee-200 rounded-2xl overflow-hidden">
                <div className="bg-coffee-50 px-4 py-3 flex justify-between items-center border-b border-coffee-100">
                  <h4 className="font-bold text-coffee-800 text-sm">🧾 發票拆單明細</h4>
                  <button onClick={addLine} className="text-xs font-bold text-mint-brand hover:text-mint-600 flex items-center gap-1">
                    <Plus className="w-3 h-3"/> 新增項目
                  </button>
                </div>
                <div className="p-4 space-y-3 bg-white">
                  {data.lines.map((line, idx) => (
                    <div key={line.id} className="flex gap-2 items-start">
                      <select value={line.categoryId} onChange={e => updateLine(idx, 'categoryId', e.target.value)} className="w-1/3 border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none">
                        <option value="" disabled>分類...</option>
                        {expenseCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                      <input type="number" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} className="w-1/4 border border-gray-200 rounded-lg p-2 text-sm font-mono outline-none" placeholder="金額" />
                      <input type="text" value={line.note || ''} onChange={e => updateLine(idx, 'note', e.target.value)} className="flex-1 border border-gray-200 rounded-lg p-2 text-sm outline-none" placeholder="項目備註(選填)" />
                      <button onClick={() => removeLine(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg mt-0.5"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                  {data.lines.length === 0 && (
                    <div className="text-center text-gray-400 text-xs py-4">點擊右上角新增發票明細，發票只有單一項目也需要新增喔！</div>
                  )}
                  {data.lines.length > 0 && (
                    <div className={`mt-4 p-3 rounded-xl text-sm font-bold flex justify-between items-center ${isBalanceError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                      <span>明細加總：${totalLinesAmount.toLocaleString()}</span>
                      {isBalanceError && <span>⚠️ 與發票總額相差 ${(data.totalAmount - totalLinesAmount).toLocaleString()}</span>}
                      {!isBalanceError && <span>✅ 加總正確</span>}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            // --- 資金轉帳 ---
            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-6">
              <div className="text-sm text-blue-800 bg-blue-100 p-3 rounded-xl font-bold flex items-start gap-2">
                💡 資金互轉不會被認列為「費用支出」，也不會影響毛利計算。僅用於記錄錢從哪個帳戶移到哪個帳戶（例如：老闆拿回收銀現金代墊款）。
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">轉帳金額</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input type="number" value={data.totalAmount || ''} onChange={e => setData({...data, totalAmount: Number(e.target.value)})} className="w-full pl-8 pr-3 py-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-lg text-blue-900" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">從哪裡出帳？ (轉出)</label>
                  <select value={data.fundingSourceId} onChange={e => setData({...data, fundingSourceId: e.target.value})} className="w-full border border-blue-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-700 bg-white shadow-sm">
                    <option value="" disabled>請選擇轉出帳戶...</option>
                    {fundingSources.map(fs => <option key={fs.id} value={fs.id}>{fs.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">入到哪裡？ (轉入)</label>
                  <select value={data.targetFundingSourceId || ''} onChange={e => setData({...data, targetFundingSourceId: e.target.value})} className="w-full border border-blue-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700 bg-white shadow-sm">
                    <option value="" disabled>請選擇轉入帳戶...</option>
                    {fundingSources.map(fs => <option key={fs.id} value={fs.id}>{fs.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">備註 (選填)</label>
                <input type="text" value={data.memo || ''} onChange={e => setData({...data, memo: e.target.value})} className="w-full border border-blue-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如：還清 5/1 老闆代墊款" />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-3xl">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition">取消</button>
          <button onClick={handleSave} className="px-8 py-2.5 bg-coffee-800 text-white rounded-xl font-bold shadow-md hover:bg-coffee-900 transition flex items-center gap-2">
            儲存紀錄
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function VoucherModal({ shopId, record, fundingSources, expenseCategories, coa, onClose }: { shopId: string, record: ExpenseRecord, fundingSources: FundingSource[], expenseCategories: ExpenseCategory[], coa: COAItem[], onClose: () => void }) {
  const [date, setDate] = useState(record.dateKey);
  const [description, setDescription] = useState(record.vendor || '雜支支出');
  const [lines, setLines] = useState<JournalLine[]>([]);

  useEffect(() => {
    const newLines: JournalLine[] = [];
    
    // Auto map DEBIT lines (from lines)
    if (!record.isTransfer) {
      record.lines.forEach(rl => {
        const cat = expenseCategories.find(c => c.id === rl.categoryId);
        let debitCoa = coa.find(c => c.id === cat?.defaultCoaId);
        if (!debitCoa) debitCoa = coa.find(c => c.name === cat?.name);
        if (!debitCoa) debitCoa = coa.find(c => c.type === '費用' || c.type === '成本'); // fallback

        newLines.push({
          id: uid(),
          type: 'debit',
          accountId: debitCoa?.id || '',
          amount: rl.amount,
          lineDescription: rl.note || cat?.name || ''
        });
      });
    }

    // Auto map CREDIT line (from fundingSource)
    const fs = fundingSources.find(f => f.id === record.fundingSourceId);
    let creditCoa = coa.find(c => c.id === fs?.defaultCoaId);
    if (!creditCoa) creditCoa = coa.find(c => c.name.includes(fs?.name || '')) || coa.find(c => c.name === fs?.name);
    if (!creditCoa) creditCoa = coa.find(c => c.type === '資產'); // fallback

    newLines.push({
      id: uid(),
      type: 'credit',
      accountId: creditCoa?.id || '',
      amount: record.totalAmount,
      lineDescription: record.vendor || fs?.name || ''
    });

    // If it's a transfer, map DEBIT line (target funding source)
    if (record.isTransfer && record.targetFundingSourceId) {
      const targetFs = fundingSources.find(f => f.id === record.targetFundingSourceId);
      let targetCoa = coa.find(c => c.id === targetFs?.defaultCoaId);
      if (!targetCoa) targetCoa = coa.find(c => c.name.includes(targetFs?.name || '')) || coa.find(c => c.name === targetFs?.name);
      if (!targetCoa) targetCoa = coa.find(c => c.type === '資產');

      newLines.push({
        id: uid(),
        type: 'debit',
        accountId: targetCoa?.id || '',
        amount: record.totalAmount,
        lineDescription: record.memo || targetFs?.name || ''
      });
    }

    setLines(newLines);
  }, [record, fundingSources, expenseCategories, coa]);

  const debitTotal = lines.filter(l => l.type === 'debit').reduce((sum, l) => sum + Number(l.amount), 0);
  const creditTotal = lines.filter(l => l.type === 'credit').reduce((sum, l) => sum + Number(l.amount), 0);

  const handleSave = async () => {
    if (!date) return alert('請填寫日期');
    if (!description) return alert('請填寫總摘要');
    if (debitTotal !== creditTotal) return alert('借貸必須平衡！');
    if (lines.some(l => !l.accountId)) return alert('請為所有明細選擇會計科目！');

    const entryId = uid();
    const year = parseInt(date.split('-')[0]);
    const vNo = date.replace(/-/g, '') + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const entry: JournalEntry = {
      id: entryId,
      date,
      year,
      voucherNo: vNo,
      description,
      lines,
      debitTotal,
      creditTotal
    };

    await setDoc(doc(db, 'shops', shopId, 'entries', entryId), entry);
    await setDoc(doc(db, 'shops', shopId, 'expenses', record.id), { voucherId: entryId }, { merge: true });
    alert('已成功產生傳票！');
    onClose();
  };

  const updateLine = (idx: number, field: keyof JournalLine, value: any) => {
    const newLines = [...lines];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setLines(newLines);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-coffee-50/50 rounded-t-3xl">
          <h3 className="text-xl font-bold text-coffee-800">產生傳票</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">日期</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">總摘要 (廠商/地點/摘要)</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 outline-none" />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-coffee-800 text-sm">借貸明細</h4>
            {lines.map((l, idx) => (
              <div key={l.id} className={`flex gap-2 items-center p-3 rounded-xl border ${l.type === 'debit' ? 'bg-blue-50/30 border-blue-100' : 'bg-red-50/30 border-red-100'}`}>
                <span className={`px-2 py-1 text-xs font-bold rounded ${l.type === 'debit' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                  {l.type === 'debit' ? '借' : '貸'}
                </span>
                <select value={l.accountId} onChange={e => updateLine(idx, 'accountId', e.target.value)} className="flex-1 border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none">
                  <option value="" disabled>選擇會計科目...</option>
                  {coa.map(c => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
                </select>
                <input type="number" value={l.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} className="w-24 border border-gray-200 rounded-lg p-2 text-sm font-mono outline-none text-right" placeholder="金額" />
                <input type="text" value={l.lineDescription || ''} onChange={e => updateLine(idx, 'lineDescription', e.target.value)} className="flex-1 border border-gray-200 rounded-lg p-2 text-sm outline-none" placeholder="明細摘要" />
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100 font-bold font-mono">
             <div className="text-blue-700">借方總計：${debitTotal.toLocaleString()}</div>
             <div className="text-red-700">貸方總計：${creditTotal.toLocaleString()}</div>
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-3xl">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition">取消</button>
          <button onClick={handleSave} className="px-8 py-2.5 bg-coffee-800 text-white rounded-xl font-bold shadow-md hover:bg-coffee-900 transition flex items-center gap-2">
            儲存傳票
          </button>
        </div>
      </motion.div>
    </div>
  );
}
