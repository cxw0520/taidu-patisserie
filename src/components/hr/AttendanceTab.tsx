import React, { useState, useEffect, useMemo } from 'react';
import { Operator, Settings, AttendanceRecord, AttendancePunch, RosterEntry, ShiftTemplate } from '../../types';
import { db } from '../../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { uid, cn, fmtYM, getDaysInMonth } from '../../lib/utils';
import { Plus, Edit2, Trash2, Save, X, Clock, AlertTriangle, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
  viewYear: number;
  setViewYear: React.Dispatch<React.SetStateAction<number>>;
  viewMonth: number;
  setViewMonth: React.Dispatch<React.SetStateAction<number>>;
  selectedOpId: string;
  setSelectedOpId: React.Dispatch<React.SetStateAction<string>>;
}

import { applyRounding, calcMinutesDiff, buildAttendanceRecord } from '../../lib/hrUtils';

export default function AttendanceTab({ 
  shopId, 
  operators, 
  settings,
  viewYear,
  setViewYear,
  viewMonth,
  setViewMonth,
  selectedOpId,
  setSelectedOpId
}: Props) {
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord>>({});
  const [roster, setRoster] = useState<Record<string, RosterEntry>>({});
  const [loading, setLoading] = useState(true);
  const [punchModal, setPunchModal] = useState<{ dateKey: string } | null>(null);
  const [punchForm, setPunchForm] = useState<{ type: 'clock_in' | 'clock_out'; time: string; note: string }>({ type: 'clock_in', time: '', note: '' });
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);

  const ymKey = fmtYM(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const shiftTemplates: ShiftTemplate[] = settings.shiftTemplates || [];

  useEffect(() => {
    if (!shopId || !selectedOpId) return;
    setLoading(true);
    setAttendanceData({}); // Clear stale data immediately
    const ref = doc(db, 'shops', shopId, 'hr', `attendance_${selectedOpId}_${ymKey}`);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setAttendanceData(snap.data() as Record<string, AttendanceRecord>);
      else setAttendanceData({});
      setLoading(false);
    }, (err) => {
      console.error('HR data sync error:', err);
      setLoading(false);
    });
    return unsub;
  }, [shopId, selectedOpId, ymKey]);

  useEffect(() => {
    if (!shopId) return;
    const ref = doc(db, 'shops', shopId, 'hr', `roster_${ymKey}`);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setRoster(snap.data() as Record<string, RosterEntry>);
      else setRoster({});
    });
    return unsub;
  }, [shopId, ymKey]);

  const saveAttendance = async (newData: Record<string, AttendanceRecord>) => {
    const ref = doc(db, 'shops', shopId, 'hr', `attendance_${selectedOpId}_${ymKey}`);
    try {
      await setDoc(ref, newData);
      // Local state will be updated by onSnapshot automatically
    } catch (err) {
      console.error('Save HR error:', err);
      alert('儲存失敗，請檢查網路連線');
    }
  };

  const handleAddPunch = async () => {
    if (!punchModal || !punchForm.time) return;
    const { dateKey } = punchModal;
    const existing = attendanceData[dateKey];
    const [y, m, d] = dateKey.split('-').map(Number);
    const [hr, min] = punchForm.time.split(':').map(Number);
    const localDate = new Date(y, m - 1, d, hr, min);
    if (isNaN(localDate.getTime())) {
      alert('打卡時間格式錯誤');
      return;
    }
    const rawTime = localDate.toISOString();

    const newPunch: AttendancePunch = {
      id: uid(),
      type: punchForm.type,
      time: punchForm.time,
      rawTime,
      method: 'manual_admin',
      adminNote: punchForm.note || undefined,
    };
    const existingPunches = existing?.punches || [];
    const newPunches = [...existingPunches, newPunch];
    const newRecord = buildAttendanceRecord(selectedOpId, dateKey, newPunches, settings, roster, shiftTemplates);
    const newData = { ...attendanceData, [dateKey]: newRecord };
    await saveAttendance(newData);
    setPunchModal(null);
    setPunchForm({ type: 'clock_in', time: '', note: '' });
  };

  const handleDeletePunch = async (dateKey: string, punchId: string) => {
    const existing = attendanceData[dateKey];
    if (!existing) return;
    const newPunches = existing.punches.filter(p => p.id !== punchId);
    if (newPunches.length === 0) {
      const newData = { ...attendanceData };
      delete newData[dateKey];
      await saveAttendance(newData);
    } else {
      const newRecord = buildAttendanceRecord(selectedOpId, dateKey, newPunches, settings, roster, shiftTemplates);
      const newData = { ...attendanceData, [dateKey]: newRecord };
      await saveAttendance(newData);
    }
    setEditRecord(null);
  };

  const monthSummary = useMemo(() => {
    let totalMinutes = 0;
    let lateDays = 0;
    let workedDays = 0;
    (Object.values(attendanceData) as AttendanceRecord[]).forEach(rec => {
      if ((rec.effectiveMinutes || 0) > 0) workedDays++;
      totalMinutes += rec.effectiveMinutes || 0;
      if (rec.isLate) lateDays++;
    });
    return { totalMinutes, lateDays, workedDays };
  }, [attendanceData]);

  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(v => v - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(v => v + 1); } else setViewMonth(m => m + 1); };

  const selectedOp = operators.find(o => o.id === selectedOpId);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold text-coffee-800 min-w-[120px] text-center">{viewYear}年 {viewMonth}月</h2>
          <button onClick={nextMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <select value={selectedOpId} onChange={e => setSelectedOpId(e.target.value)}
          className="bg-white border border-coffee-200 rounded-xl px-4 py-2 font-bold text-coffee-700 outline-none focus:border-rose-brand">
          {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel p-4 text-center">
          <div className="text-2xl font-bold text-coffee-800 font-mono">{monthSummary.workedDays}</div>
          <div className="text-xs font-bold text-coffee-400 mt-1">出勤天數</div>
        </div>
        <div className="glass-panel p-4 text-center">
          <div className="text-2xl font-bold text-coffee-800 font-mono">{(monthSummary.totalMinutes / 60).toFixed(1)}h</div>
          <div className="text-xs font-bold text-coffee-400 mt-1">有效工時</div>
        </div>
        <div className="glass-panel p-4 text-center">
          <div className={cn("text-2xl font-bold font-mono", monthSummary.lateDays > 0 ? 'text-rose-brand' : 'text-mint-brand')}>{monthSummary.lateDays}</div>
          <div className="text-xs font-bold text-coffee-400 mt-1">遲到天數</div>
        </div>
      </div>

      {/* Attendance Records */}
      <div className="glass-panel overflow-hidden relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-coffee-200 border-t-coffee-800 rounded-full animate-spin" />
              <p className="text-xs font-bold text-coffee-500">載入打卡資料中...</p>
            </div>
          </div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-coffee-400 font-bold uppercase text-xs tracking-wider">
              <th className="p-3 text-left">日期</th>
              <th className="p-3 text-center">排班</th>
              <th className="p-3 text-center">上班</th>
              <th className="p-3 text-center">下班</th>
              <th className="p-3 text-center">有效工時</th>
              <th className="p-3 text-center">狀態</th>
              <th className="p-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-50">
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
              const rec = attendanceData[dateKey];
              const rosterEntry = roster[`${selectedOpId}_${dateKey}`];
              const tpl = rosterEntry?.shiftTemplateId ? shiftTemplates.find(t => t.id === rosterEntry.shiftTemplateId) : null;
              const dow = new Date(viewYear, viewMonth - 1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isHoliday = settings.exceptionCalendar?.[dateKey] === 'holiday';
              const dayNames = ['日','一','二','三','四','五','六'];

              return (
                <tr key={day} className={cn("group hover:bg-coffee-50/30 transition-colors", isWeekend && !tpl && "opacity-50")}>
                  <td className="p-3 font-bold text-coffee-700">
                    <span className={cn(isHoliday ? 'text-amber-500' : isWeekend ? 'text-blue-400' : '')}>
                      {viewMonth}/{day} ({dayNames[dow]})
                    </span>
                    {isHoliday && <span className="ml-1 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">假</span>}
                  </td>
                  <td className="p-3 text-center">
                    {rosterEntry?.isOff ? (
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">排休</span>
                    ) : tpl ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: tpl.color || '#ccc' }}>
                        {tpl.name} {tpl.startTime}
                      </span>
                    ) : (
                      <span className="text-coffee-200 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-coffee-700">
                    {rec?.clockIn || '—'}
                    {rec?.isLate && <span className="ml-1 text-[9px] text-rose-brand">⚠️</span>}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-coffee-700">
                    {rec?.clockOut || '—'}
                    {rec?.isEarlyLeave && <span className="ml-1 text-[9px] text-amber-500">⬇️</span>}
                  </td>
                  <td className="p-3 text-center font-mono font-bold">
                    {rec?.effectiveMinutes ? `${(rec.effectiveMinutes / 60).toFixed(1)}h` : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {rec?.isHoliday && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">假日</span>}
                      {rec?.isLate && <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-bold">遲到 {rec.lateMinutes}分</span>}
                      {rec?.isEarlyLeave && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">早退</span>}
                      {rec?.isOvertier2 && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">加班T2</span>}
                      {rec?.isOvertier1 && !rec.isOvertier2 && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">加班T1</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rec && (
                        <button onClick={() => setEditRecord(rec)} className="p-1.5 hover:bg-coffee-100 rounded-lg transition text-coffee-400 hover:text-coffee-700">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => { setPunchModal({ dateKey }); setPunchForm({ type: rec?.clockIn ? 'clock_out' : 'clock_in', time: '', note: '' }); }}
                        className="p-1.5 hover:bg-mint-brand/10 rounded-lg transition text-mint-brand">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Punch Modal */}
      <AnimatePresence>
        {punchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" onClick={() => setPunchModal(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel bg-white w-full max-w-sm rounded-3xl p-6 relative z-10 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-coffee-800">手動補登打卡 — {punchModal.dateKey}</h3>
                <button onClick={() => setPunchModal(null)} className="p-1 hover:bg-coffee-50 rounded-full"><X className="w-4 h-4" /></button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-700 font-bold">
                ⚠️ 此紀錄將標記為「管理員手動補登」
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['clock_in', 'clock_out'] as const).map(t => (
                    <button key={t} onClick={() => setPunchForm(p => ({ ...p, type: t }))}
                      className={cn("flex-1 py-2 rounded-xl font-bold text-sm transition-all border",
                        punchForm.type === t ? 'bg-coffee-800 text-white border-coffee-800' : 'bg-white text-coffee-600 border-coffee-200 hover:border-coffee-400'
                      )}>
                      {t === 'clock_in' ? '⬆️ 上班' : '⬇️ 下班'}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs font-bold text-coffee-500 block mb-1">打卡時間</label>
                  <input type="time" value={punchForm.time} onChange={e => setPunchForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 font-bold text-coffee-700 outline-none focus:border-rose-brand" />
                </div>
                <div>
                  <label className="text-xs font-bold text-coffee-500 block mb-1">補登原因</label>
                  <input value={punchForm.note} onChange={e => setPunchForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="例：忘記打卡、設備故障"
                    className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 text-sm text-coffee-700 outline-none focus:border-rose-brand" />
                </div>
              </div>
              <button onClick={handleAddPunch} disabled={!punchForm.time}
                className="w-full py-3 bg-coffee-800 text-white rounded-2xl font-bold hover:bg-coffee-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> 確認補登
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Record Modal */}
      <AnimatePresence>
        {editRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" onClick={() => setEditRecord(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel bg-white w-full max-w-md rounded-3xl p-6 relative z-10 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-coffee-800">打卡紀錄 — {editRecord.dateKey}</h3>
                <button onClick={() => setEditRecord(null)} className="p-1 hover:bg-coffee-50 rounded-full"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {editRecord.punches.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-coffee-50 rounded-2xl">
                    <span className={cn("text-lg", p.type === 'clock_in' ? '⬆️' : '⬇️')} />
                    <div className="flex-1">
                      <div className="font-bold text-coffee-800 text-sm">{p.type === 'clock_in' ? '上班' : '下班'} {p.time}</div>
                      {p.roundedTime && p.roundedTime !== p.time && <div className="text-xs text-coffee-400">計薪時間：{p.roundedTime}</div>}
                      <div className="text-[10px] text-coffee-300">{p.method === 'manual_admin' ? `👤 管理員補登：${p.adminNote || ''}` : '🔐 PIN 打卡'}</div>
                    </div>
                    <button onClick={() => handleDeletePunch(editRecord.dateKey, p.id)} className="p-1.5 hover:bg-danger-brand/10 rounded-lg transition text-danger-brand">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setPunchModal({ dateKey: editRecord.dateKey }); setPunchForm({ type: 'clock_in', time: '', note: '' }); setEditRecord(null); }}
                className="w-full py-2.5 bg-coffee-50 border border-coffee-200 text-coffee-700 rounded-2xl font-bold hover:bg-coffee-100 transition flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> 新增補登
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
