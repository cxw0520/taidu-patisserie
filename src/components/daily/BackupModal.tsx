import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, setDoc } from 'firebase/firestore';
import { History } from 'lucide-react';
import { fmt } from '../../lib/utils';

export default function BackupModal({ shopId, dateKey, onClose, onRestore }: any) {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const fetchBackups = async () => {
      try {
        const q = query(collection(db, 'shops', shopId, 'daily', dateKey, 'backups'), orderBy('_backupTimestamp', 'desc'), limit(15));
        const snap = await getDocs(q);
        setBackups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBackups();
  }, [shopId, dateKey]);

  const handleRestore = async (backup: any) => {
    if (!confirm(`確定要將資料還原至 ${new Date(backup._backupTimestamp).toLocaleString()} 的狀態嗎？\n⚠️ 此動作將會覆寫目前的訂單與所有盤點紀錄！`)) return;
    setRestoring(true);
    try {
      const dataToRestore = { ...backup };
      delete dataToRestore.id;
      delete dataToRestore._backupTimestamp;
      await setDoc(doc(db, 'shops', shopId, 'daily', dateKey), dataToRestore);
      alert('還原成功！');
      onRestore();
      onClose();
    } catch(e) {
      alert('還原失敗');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-coffee-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4 border-b pb-4 border-coffee-100">
          <h3 className="text-xl font-bold text-coffee-800 flex items-center gap-2"><History className="w-5 h-5 text-rose-500" /> 時光機 (備份與還原)</h3>
          <button onClick={onClose} className="p-2 hover:bg-coffee-50 rounded-full text-gray-400">✕</button>
        </div>
        <p className="text-sm text-coffee-500 mb-4 bg-rose-50 p-3 rounded-lg text-rose-700">系統每 30 分鐘會自動把當時的狀態存檔一次。您可以選擇下方的時間點，將今天的資料時光倒流回那時候的樣子。</p>
        
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {loading ? <div className="text-center py-8 text-coffee-400 font-bold">歷史紀錄載入中...</div> : backups.length === 0 ? <div className="text-center py-8 text-coffee-400 font-bold">目前尚無備份紀錄</div> : backups.map(b => (
            <div key={b.id} className="flex justify-between items-center p-4 border border-coffee-100 bg-coffee-50/50 rounded-xl hover:border-mint-brand transition-colors group">
              <div>
                <div className="font-bold text-coffee-800 text-lg">{new Date(b._backupTimestamp).toLocaleTimeString()}</div>
                <div className="text-xs text-coffee-400 mt-1 flex gap-3">
                  <span>🛍️ 訂單: <span className="font-mono text-coffee-600">{b.orders?.length || 0}</span> 筆</span>
                  <span>💰 營收: <span className="font-mono text-coffee-600">${fmt(b.orders?.reduce((s:number,o:any)=>s+(o.actualAmt||0),0) || 0)}</span></span>
                </div>
              </div>
              <button 
                disabled={restoring}
                onClick={() => handleRestore(b)} 
                className="px-4 py-2 bg-white border border-coffee-200 text-coffee-600 font-bold text-sm rounded-lg shadow-sm hover:bg-rose-500 hover:border-rose-500 hover:text-white transition disabled:opacity-50"
              >
                還原此紀錄
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
