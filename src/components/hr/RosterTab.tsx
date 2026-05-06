import React, { useState, useMemo, useEffect } from 'react';
import { Operator, Settings, ShiftTemplate, RosterEntry } from '../../types';
import { db } from '../../lib/firebase';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { uid, cn } from '../../lib/utils';
import { Plus, Trash2, Save, Calendar, ChevronLeft, ChevronRight, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEFAULT_COLORS = ['#ff6b9d', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
}

function fmtYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function RosterTab({ shopId, operators, settings, onUpdateSettings }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [roster, setRoster] = useState<Record<string, RosterEntry>>({});
  const [editTemplateModal, setEditTemplateModal] = useState<ShiftTemplate | null | 'new'>(null);
  const [cellModal, setCellModal] = useState<{ operatorId: string; dateKey: string } | null>(null);
  const [templateForm, setTemplateForm] = useState<Partial<ShiftTemplate>>({});

  const shiftTemplates: ShiftTemplate[] = settings.shiftTemplates || [];
  const ymKey = fmtYM(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Load roster from Firestore
  useEffect(() => {
    if (!shopId) return;
    const ref = doc(db, 'shops', shopId, 'hr', `roster_${ymKey}`);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setRoster(snap.data() as Record<string, RosterEntry>);
      else setRoster({});
    });
    return unsub;
  }, [shopId, ymKey]);

  const saveRoster = async (newRoster: Record<string, RosterEntry>) => {
    setRoster(newRoster);
    const ref = doc(db, 'shops', shopId, 'hr', `roster_${ymKey}`);
    await setDoc(ref, newRoster, { merge: true });
  };

  const getRosterKey = (operatorId: string, dateKey: string) => `${operatorId}_${dateKey}`;

  const getCellEntry = (operatorId: string, day: number) => {
    const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
    return roster[getRosterKey(operatorId, dateKey)];
  };

  const getDayOfWeek = (day: number) => {
    const d = new Date(viewYear, viewMonth - 1, day);
    return d.getDay(); // 0=Sun, 6=Sat
  };

  // Estimated payroll cost
  const estimatedCost = useMemo(() => {
    let total = 0;
    operators.forEach(op => {
      if (op.payrollType === 'monthly') {
        total += op.baseRate || 0;
      } else if (op.payrollType === 'hourly') {
        let totalMinutes = 0;
        days.forEach(day => {
          const entry = getCellEntry(op.id, day);
          if (!entry || entry.isOff) return;
          const tpl = shiftTemplates.find(t => t.id === entry.shiftTemplateId);
          if (tpl) {
            const start = tpl.startTime.split(':').map(Number);
            const end = tpl.endTime.split(':').map(Number);
            const mins = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]) - tpl.breakMinutes;
            totalMinutes += Math.max(0, mins);
          }
        });
        total += ((op.baseRate || 0) * totalMinutes) / 60;
      }
    });
    return Math.round(total);
  }, [roster, operators, shiftTemplates, days]);

  const handleSaveTemplate = () => {
    if (!templateForm.name || !templateForm.startTime || !templateForm.endTime) return;
    const templates = [...shiftTemplates];
    if (editTemplateModal === 'new') {
      templates.push({ id: uid(), breakMinutes: 0, color: DEFAULT_COLORS[templates.length % DEFAULT_COLORS.length], ...templateForm } as ShiftTemplate);
    } else if (editTemplateModal) {
      const idx = templates.findIndex(t => t.id === (editTemplateModal as ShiftTemplate).id);
      if (idx >= 0) templates[idx] = { ...templates[idx], ...templateForm } as ShiftTemplate;
    }
    onUpdateSettings({ shiftTemplates: templates });
    setEditTemplateModal(null);
    setTemplateForm({});
  };

  const handleDeleteTemplate = (id: string) => {
    onUpdateSettings({ shiftTemplates: shiftTemplates.filter(t => t.id !== id) });
  };

  const handleCellClick = (operatorId: string, day: number) => {
    const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
    setCellModal({ operatorId, dateKey });
  };

  const handleSetShift = async (operatorId: string, dateKey: string, templateId: string | null, isOff = false) => {
    const key = getRosterKey(operatorId, dateKey);
    const isHolidayDay = settings.exceptionCalendar?.[dateKey] === 'holiday';
    const newEntry: RosterEntry = {
      operatorId,
      dateKey,
      shiftTemplateId: templateId || undefined,
      isOff,
      isHoliday: isHolidayDay,
    };
    const newRoster = { ...roster, [key]: newEntry };
    await saveRoster(newRoster);
    setCellModal(null);
  };

  const handleClearCell = async (operatorId: string, dateKey: string) => {
    const key = getRosterKey(operatorId, dateKey);
    const newRoster = { ...roster };
    delete newRoster[key];
    await saveRoster(newRoster);
    setCellModal(null);
  };

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(v => v - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(v => v + 1); }
    else setViewMonth(m => m + 1);
  };

  const currentCellEntry = cellModal ? roster[getRosterKey(cellModal.operatorId, cellModal.dateKey)] : null;
  const currentOp = cellModal ? operators.find(o => o.id === cellModal.operatorId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold text-coffee-800 min-w-[120px] text-center">{viewYear}年 {viewMonth}月</h2>
          <button onClick={nextMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-coffee-50 px-4 py-2 rounded-xl border border-coffee-100 text-sm font-bold text-coffee-700">
            💰 本月預估薪資成本：<span className="text-rose-brand font-mono">${estimatedCost.toLocaleString()}</span>
          </div>
          <button
            onClick={() => { setEditTemplateModal('new'); setTemplateForm({ breakMinutes: 60, color: DEFAULT_COLORS[shiftTemplates.length % DEFAULT_COLORS.length] }); }}
            className="px-4 py-2 bg-coffee-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-coffee-700 transition"
          >
            <Plus className="w-4 h-4" /> 班別管理
          </button>
        </div>
      </div>

      {/* Shift Templates Legend */}
      {shiftTemplates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shiftTemplates.map(tpl => (
            <div key={tpl.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-coffee-100 rounded-lg text-xs font-bold">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tpl.color || '#ccc' }} />
              <span>{tpl.name}</span>
              <span className="text-coffee-400">{tpl.startTime}-{tpl.endTime}</span>
              <button onClick={() => { setEditTemplateModal(tpl); setTemplateForm({ ...tpl }); }} className="text-coffee-300 hover:text-coffee-600">
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {operators.length === 0 ? (
        <div className="text-center py-16 text-coffee-300 font-bold">尚未建立任何員工，請先至系統設定新增員工。</div>
      ) : (
        /* Roster Grid */
        <div className="glass-panel p-4 overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: `${60 + daysInMonth * 44}px` }}>
            <thead>
              <tr>
                <th className="w-20 sticky left-0 z-10 bg-[#faf7f2] px-3 py-2 text-left text-xs font-bold text-coffee-400 uppercase">員工</th>
                {days.map(d => {
                  const dow = getDayOfWeek(d);
                  const dateKey = `${ymKey}-${String(d).padStart(2, '0')}`;
                  const isWeekend = dow === 0 || dow === 6;
                  const isHoliday = settings.exceptionCalendar?.[dateKey] === 'holiday';
                  const isToday = dateKey === `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                  return (
                    <th key={d} className={cn("w-10 text-center py-1 text-[11px] font-bold",
                      isToday ? 'text-rose-brand' : isHoliday ? 'text-amber-500' : isWeekend ? 'text-blue-400' : 'text-coffee-400'
                    )}>
                      <div>{d}</div>
                      <div className="text-[9px]">{['日','一','二','三','四','五','六'][dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-50">
              {operators.map(op => (
                <tr key={op.id} className="group">
                  <td className="sticky left-0 z-10 bg-white/90 backdrop-blur-sm px-3 py-2 font-bold text-coffee-700 text-sm whitespace-nowrap border-r border-coffee-50">
                    <div>{op.name}</div>
                    <div className="text-[10px] text-coffee-400 font-normal">{op.payrollType === 'hourly' ? `時薪 $${op.baseRate}` : `月薪 $${(op.baseRate||0).toLocaleString()}`}</div>
                  </td>
                  {days.map(d => {
                    const entry = getCellEntry(op.id, d);
                    const tpl = entry?.shiftTemplateId ? shiftTemplates.find(t => t.id === entry.shiftTemplateId) : null;
                    const dow = getDayOfWeek(d);
                    const isFixedClosed = settings.fixedClosedDays?.includes(dow);
                    const dateKey = `${ymKey}-${String(d).padStart(2, '0')}`;
                    const isHoliday = settings.exceptionCalendar?.[dateKey] === 'holiday';
                    return (
                      <td key={d} className="p-0.5">
                        <button
                          onClick={() => handleCellClick(op.id, d)}
                          className={cn("w-full h-9 rounded-lg text-[9px] font-bold transition-all flex items-center justify-center",
                            entry?.isOff ? 'bg-gray-100 text-gray-400' :
                            tpl ? 'text-white' : 'bg-coffee-50/50 text-coffee-200 hover:bg-coffee-100 hover:text-coffee-400'
                          )}
                          style={tpl ? { background: tpl.color || '#ccc' } : {}}
                        >
                          {entry?.isOff ? '休' : tpl ? tpl.name : isHoliday ? '🎌' : isFixedClosed ? '－' : '+'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cell Modal */}
      <AnimatePresence>
        {cellModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" onClick={() => setCellModal(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel bg-white w-full max-w-sm rounded-3xl p-6 relative z-10 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-coffee-800">{currentOp?.name} — {cellModal.dateKey}</h3>
                <button onClick={() => setCellModal(null)} className="p-1 hover:bg-coffee-50 rounded-full"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-coffee-400 uppercase tracking-widest">選擇班別</p>
                {shiftTemplates.length === 0 && <p className="text-sm text-coffee-400">尚未建立班別模板，請先至右上角新增。</p>}
                {shiftTemplates.map(tpl => (
                  <button key={tpl.id}
                    onClick={() => handleSetShift(cellModal.operatorId, cellModal.dateKey, tpl.id)}
                    className={cn("w-full flex items-center gap-3 p-3 rounded-2xl border font-bold text-sm transition-all",
                      currentCellEntry?.shiftTemplateId === tpl.id ? 'border-rose-brand bg-rose-brand/5 text-rose-brand' : 'border-coffee-100 hover:border-coffee-300'
                    )}
                  >
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: tpl.color || '#ccc' }} />
                    <span>{tpl.name}</span>
                    <span className="text-coffee-400 ml-auto font-normal">{tpl.startTime}–{tpl.endTime}</span>
                  </button>
                ))}
                <button
                  onClick={() => handleSetShift(cellModal.operatorId, cellModal.dateKey, null, true)}
                  className={cn("w-full flex items-center gap-3 p-3 rounded-2xl border font-bold text-sm transition-all",
                    currentCellEntry?.isOff ? 'border-gray-400 bg-gray-50 text-gray-600' : 'border-coffee-100 hover:border-gray-300'
                  )}
                >
                  📴 排休 / 公休
                </button>
                {currentCellEntry && (
                  <button
                    onClick={() => handleClearCell(cellModal.operatorId, cellModal.dateKey)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border border-danger-brand/30 text-danger-brand font-bold text-sm hover:bg-danger-brand/5 transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> 清除此排班
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Template Edit Modal */}
      <AnimatePresence>
        {editTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" onClick={() => setEditTemplateModal(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel bg-white w-full max-w-lg rounded-3xl p-8 relative z-10 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl text-coffee-800">班別模板管理</h3>
                <button onClick={() => setEditTemplateModal(null)} className="p-1 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5" /></button>
              </div>

              {/* Existing templates list */}
              {editTemplateModal !== 'new' && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {shiftTemplates.map(tpl => (
                    <div key={tpl.id} className="flex items-center gap-3 p-3 bg-coffee-50 rounded-2xl">
                      <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: tpl.color || '#ccc' }} />
                      <div className="flex-1">
                        <div className="font-bold text-coffee-800 text-sm">{tpl.name}</div>
                        <div className="text-xs text-coffee-400">{tpl.startTime}–{tpl.endTime}（休 {tpl.breakMinutes}分）</div>
                      </div>
                      <button onClick={() => { setTemplateForm({ ...tpl }); }} className="p-1.5 hover:bg-white rounded-lg transition"><Edit2 className="w-3.5 h-3.5 text-coffee-400" /></button>
                      <button onClick={() => handleDeleteTemplate(tpl.id)} className="p-1.5 hover:bg-danger-brand/10 rounded-lg transition"><Trash2 className="w-3.5 h-3.5 text-danger-brand" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form */}
              <div className="space-y-4 border-t border-coffee-100 pt-4">
                <p className="text-xs font-bold text-coffee-400 uppercase">新增 / 編輯班別</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-coffee-500 block mb-1">班別名稱</label>
                    <input value={templateForm.name || ''} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand"
                      placeholder="例：早班" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-coffee-500 block mb-1">顏色</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DEFAULT_COLORS.map(c => (
                        <button key={c} onClick={() => setTemplateForm(p => ({ ...p, color: c }))}
                          className={cn("w-6 h-6 rounded-full border-2 transition-transform", templateForm.color === c ? 'border-coffee-800 scale-125' : 'border-transparent')}
                          style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-coffee-500 block mb-1">上班時間</label>
                    <input type="time" value={templateForm.startTime || ''} onChange={e => setTemplateForm(p => ({ ...p, startTime: e.target.value }))}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-coffee-500 block mb-1">下班時間</label>
                    <input type="time" value={templateForm.endTime || ''} onChange={e => setTemplateForm(p => ({ ...p, endTime: e.target.value }))}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-coffee-500 block mb-1">休息（分鐘）</label>
                    <input type="number" value={templateForm.breakMinutes ?? ''} onChange={e => setTemplateForm(p => ({ ...p, breakMinutes: Number(e.target.value) }))}
                      className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-3 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand" />
                  </div>
                </div>
                <button onClick={handleSaveTemplate}
                  disabled={!templateForm.name || !templateForm.startTime || !templateForm.endTime}
                  className="w-full py-3 bg-coffee-800 text-white rounded-2xl font-bold hover:bg-coffee-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> 儲存班別
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
