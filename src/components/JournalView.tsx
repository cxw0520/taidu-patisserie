import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, orderBy, setDoc } from 'firebase/firestore';
import { JournalEntry, COAItem } from '../types';
import { ClipboardList, BarChart3, BookOpen, Layers, Gem, Download, Upload, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// Sub-components
import JournalTable from './accounting/JournalTable';
import ReportsView from './accounting/ReportsView';
import LedgerView from './accounting/LedgerView';
import CoaView from './accounting/CoaView';
import AssetsView from './accounting/AssetsView';
import ExportModal from './accounting/ExportModal';

const DEFAULT_COA: COAItem[] = [
  { id: '1101', name: '現金', type: '資產', side: 'debit' },
  { id: '1102', name: '銀行存款', type: '資產', side: 'debit' },
  { id: '1103', name: '零用金', type: '資產', side: 'debit' },
  { id: '1201', name: '應收帳款', type: '資產', side: 'debit' },
  { id: '1202', name: '暫付款', type: '資產', side: 'debit' },
  { id: '1301', name: '食材存貨', type: '資產', side: 'debit' },
  { id: '1302', name: '包材存貨', type: '資產', side: 'debit' },
  { id: '1303', name: '裝飾品存貨', type: '資產', side: 'debit' },
  { id: '1401', name: '生財設備', type: '資產', side: 'debit' },
  { id: '1402', name: '減:生財設備折舊', type: '資產', side: 'credit' },
  { id: '1403', name: '租賃物改良', type: '資產', side: 'debit' },
  { id: '1404', name: '減:租賃物改良折舊', type: '資產', side: 'credit' },
  { id: '1405', name: '運輸設備', type: '資產', side: 'debit' },
  { id: '1406', name: '減:運輸設備折舊', type: '資產', side: 'credit' },
  { id: '1501', name: '存出保證金', type: '資產', side: 'debit' },
  { id: '1502', name: '預付購買設備款', type: '資產', side: 'debit' },
  { id: '2101', name: '應付帳款', type: '負債', side: 'credit' },
  { id: '3101', name: '業主資本', type: '權益', side: 'credit' },
  { id: '3102', name: '資本公積', type: '權益', side: 'credit' },
  { id: '3201', name: '本期損益', type: '權益', side: 'credit' },
  { id: '3202', name: '累積盈虧', type: '權益', side: 'credit' },
  { id: '4101', name: '銷貨收入', type: '收入', side: 'credit' },
  { id: '5101', name: '食材成本', type: '成本', side: 'debit' },
  { id: '5102', name: '包材成本', type: '成本', side: 'debit' },
  { id: '5103', name: '物流成本', type: '成本', side: 'debit' },
  { id: '5104', name: '耗損成本', type: '成本', side: 'debit' },
  { id: '5201', name: '薪資支出', type: '費用', side: 'debit' },
  { id: '6101', name: '租金支出', type: '費用', side: 'debit' },
  { id: '6102', name: '水電瓦斯費', type: '費用', side: 'debit' },
  { id: '6103', name: '折舊', type: '費用', side: 'debit' },
  { id: '6104', name: '店舖雜項', type: '費用', side: 'debit' },
  { id: '6105', name: '維修費', type: '費用', side: 'debit' },
  { id: '6106', name: '訂閱費', type: '費用', side: 'debit' },
  { id: '6107', name: '專業服務費', type: '費用', side: 'debit' },
  { id: '6108', name: '雜項', type: '費用', side: 'debit' },
  { id: '6109', name: '稅捐', type: '費用', side: 'debit' },
  { id: '6110', name: '保險', type: '費用', side: 'debit' },
  { id: '6111', name: '交通費', type: '費用', side: 'debit' },
  { id: '6201', name: '薪水支出', type: '費用', side: 'debit' },
  { id: '6202', name: '加班費', type: '費用', side: 'debit' },
  { id: '6203', name: '勞健保', type: '費用', side: 'debit' },
  { id: '6301', name: '行銷費', type: '費用', side: 'debit' },
  { id: '6302', name: '廣告費', type: '費用', side: 'debit' },
  { id: '6303', name: '公關品成本', type: '費用', side: 'debit' },
  { id: '6401', name: '其他費用', type: '費用', side: 'debit' },
  { id: '6402', name: '呆帳損失', type: '費用', side: 'debit' },
  { id: '6403', name: '資產報廢損失', type: '費用', side: 'debit' },
];

type SubTab = 'journal' | 'reports' | 'ledger' | 'coa' | 'assets';

export default function JournalView({ selectedYear, shopId }: { selectedYear: number, shopId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('journal');
  const [isMobileSubTabOpen, setIsMobileSubTabOpen] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [coa, setCoa] = useState<COAItem[]>(DEFAULT_COA);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'shops', shopId, 'entries'),
      where('year', '==', selectedYear)
    );
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(data);
    });
  }, [selectedYear, shopId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'shops', shopId, 'meta', 'coa'), async (snap) => {
      const dbList = snap.exists() ? snap.data().list : [];
      let mergedList = [...dbList];
      let needsUpdate = false;
      
      for (const def of DEFAULT_COA) {
        if (!mergedList.find((c: COAItem) => c.id === def.id)) {
          mergedList.push(def);
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        mergedList.sort((a, b) => a.id.localeCompare(b.id));
        await setDoc(doc(db, 'shops', shopId, 'meta', 'coa'), { list: mergedList });
      } else {
        setCoa(dbList);
      }
    });

    return unsub;
  }, [shopId]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (re) => {
        try {
            const imported = JSON.parse(re.target?.result as string);
            if (Array.isArray(imported)) {
                // Note: window.confirm is blocked in iframe previews
                for (const entry of imported) {
                    if (entry.id && entry.date) {
                        await setDoc(doc(db, 'shops', shopId, 'entries', entry.id), entry, { merge: true });
                    }
                }
                alert('匯入成功！');
            } else {
                alert('檔案格式錯誤，請確認上傳了正確的 JSON 備份檔。');
            }
        } catch (err) {
            alert('檔案格式錯誤');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const subTabs = [
    { id: 'journal', label: '日記簿', icon: ClipboardList },
    { id: 'reports', label: '財務報表', icon: BarChart3 },
    { id: 'ledger', label: '分類帳', icon: BookOpen },
    { id: 'coa', label: '會計科目', icon: Layers },
    { id: 'assets', label: '資產總表', icon: Gem },
  ];

  return (
    <div className="space-y-6 md:space-y-8 h-full flex flex-col items-center">
      <div className="flex flex-col md:flex-row justify-between w-full max-w-6xl md:items-center gap-4">
        
        <div className="w-full md:w-auto relative">
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileSubTabOpen(v => !v)}
              className="w-full bg-white/80 border border-coffee-100 rounded-xl px-4 py-2.5 font-bold text-coffee-700 flex items-center justify-between"
            >
              <span>{subTabs.find(t => t.id === activeSubTab)?.label}</span>
              {isMobileSubTabOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {isMobileSubTabOpen && (
              <div className="absolute z-20 mt-2 w-full bg-white border border-coffee-100 rounded-xl shadow-lg overflow-hidden">
                {subTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveSubTab(tab.id as SubTab); setIsMobileSubTabOpen(false); }}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm font-bold border-b border-coffee-50 last:border-b-0 flex items-center gap-2",
                      activeSubTab === tab.id ? "bg-coffee-50 text-coffee-700" : "text-coffee-500"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="hidden md:flex bg-white/50 backdrop-blur-sm p-1.5 rounded-[24px] border border-coffee-50 shadow-inner overflow-x-auto no-scrollbar">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as SubTab)}
                className={cn(
                  "px-4 md:px-6 py-2.5 md:py-3 rounded-2xl transition-all duration-500 font-bold flex items-center gap-2 text-sm whitespace-nowrap shrink-0",
                  activeSubTab === tab.id 
                    ? "bg-coffee-600 text-white shadow-xl scale-105 active:scale-100" 
                    : "text-coffee-400 hover:text-coffee-600 hover:bg-white/40"
                )}
              >
                <tab.icon className={cn("w-4 h-4", activeSubTab === tab.id ? "text-white" : "text-coffee-300")} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Action Buttons (Export / Import) */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <label className="p-2.5 bg-white text-gray-500 rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm cursor-pointer flex items-center gap-2 font-bold text-sm transition-all hover:scale-105" title="匯入備份">
              <Upload className="w-4 h-4" /> 匯入
              <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
          <button 
              onClick={() => setIsExportModalOpen(true)}
              className="p-2.5 bg-coffee-600 text-white rounded-xl border border-coffee-700 hover:bg-coffee-700 shadow-lg font-bold text-sm flex items-center gap-2 transition-all hover:scale-105"
              title="匯出報表與資料"
          >
              <Download className="w-4 h-4" /> 匯出
          </button>
        </div>

      </div>

      <div className="flex-1 w-full max-w-6xl glass-panel p-3 md:p-10 bg-white/40 border-0 shadow-none">
        <AnimatePresence mode="wait">
          <motion.div key={activeSubTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="h-full">
            {activeSubTab === 'journal' && <JournalTable entries={entries} coa={coa} selectedYear={selectedYear} shopId={shopId} />}
            {activeSubTab === 'reports' && <ReportsView entries={entries} coa={coa} selectedYear={selectedYear} />}
            {activeSubTab === 'ledger' && <LedgerView entries={entries} coa={coa} />}
            {activeSubTab === 'coa' && <CoaView coa={coa} shopId={shopId} />}
            {activeSubTab === 'assets' && <AssetsView shopId={shopId} selectedYear={selectedYear} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {isExportModalOpen && <ExportModal onClose={() => setIsExportModalOpen(false)} entries={entries} coa={coa} selectedYear={selectedYear} />}
    </div>
  );
}
