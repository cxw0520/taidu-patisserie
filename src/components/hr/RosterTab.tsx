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
  viewYear: number;
  setViewYear: React.Dispatch<React.SetStateAction<number>>;
  viewMonth: number;
  setViewMonth: React.Dispatch<React.SetStateAction<number>>;
}

function fmtYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function RosterTab({ 
  shopId, 
  operators, 
  settings, 
  onUpdateSettings,
  viewYear,
  setViewYear,
  viewMonth,
  setViewMonth
}: Props) {
  const today = new Date();
  const [roster, setRoster] = useState<Record<string, RosterEntry>>({});
  const [editTemplateModal, setEditTemplateModal] = useState<ShiftTemplate | null | 'new'>(null);
  const [cellModal, setCellModal] = useState<{ operatorId: string; dateKey: string } | null>(null);
  const [templateForm, setTemplateForm] = useState<Partial<ShiftTemplate>>({});

  // Quick Roster states
  const [quickRosterModal, setQuickRosterModal] = useState(false);
  const [quickOpId, setQuickOpId] = useState<string>('');
  const [quickDays, setQuickDays] = useState<number[]>([]);
  const [quickShiftId, setQuickShiftId] = useState<string | 'off' | 'clear'>('off');

  // Auto-initialize quickOpId
  useEffect(() => {
    if (operators.length > 0 && !quickOpId) {
      setQuickOpId(operators[0].id);
    }
  }, [operators, quickOpId]);

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

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  const saveRoster = async (newRoster: Record<string, RosterEntry>) => {
    setRoster(newRoster);
    const ref = doc(db, 'shops', shopId, 'hr', `roster_${ymKey}`);
    const cleanRoster = JSON.parse(JSON.stringify(newRoster));
    await setDoc(ref, cleanRoster, { merge: true });
  };

  const handleManualSave = async () => {
    if (!shopId) return;
    setSaveStatus('saving');
    try {
      const ref = doc(db, 'shops', shopId, 'hr', `roster_${ymKey}`);
      const cleanRoster = JSON.parse(JSON.stringify(roster));
      await setDoc(ref, cleanRoster);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Manual save roster error:', err);
      alert('儲存失敗，請檢查網路連線');
      setSaveStatus('idle');
    }
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

  // Estimated payroll cost (Simulated to align with PayrollTab.tsx formulas)
  const estimatedCost = useMemo(() => {
    let totalGross = 0;
    let totalCompany = 0;
    
    const ot1H = settings.overtimeTier1Hours || 8;
    const ot2H = settings.overtimeTier2Hours || 10;
    const ot1Rate = settings.overtimeTier1Rate || 1.34;
    const ot2Rate = settings.overtimeTier2Rate || 1.67;
    const holidayRate = settings.holidayPayRate || 2.0;

    // 計算當月一般工作天數上限 (扣除週六、日及國定假日)
    let workDaysLimit = 0;
    days.forEach(day => {
      const dow = getDayOfWeek(day);
      const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = settings.exceptionCalendar?.[dateKey] === 'holiday';
      if (!isWeekend && !isHoliday) {
        workDaysLimit++;
      }
    });
    const monthlyMinutesLimit = workDaysLimit * 8 * 60;

    operators.forEach(op => {
      const baseRate = op.baseRate || 0;
      let totalRegularMinutes = 0;
      let totalOt1Minutes = 0;
      let totalOt2Minutes = 0;
      let holidayMinutes = 0;
      let scheduledWorkDays = 0;

      // 月薪制專用的累計時數
      let totalScheduledRegularMinutes = 0;
      let holidayScheduledMinutes = 0;

      days.forEach(day => {
        const entry = getCellEntry(op.id, day);
        if (!entry || entry.isOff) return;
        const tpl = shiftTemplates.find(t => t.id === entry.shiftTemplateId);
        if (!tpl) return;

        scheduledWorkDays++;

        // Parse start and end times defensively
        const startParts = (tpl.startTime || '00:00').split(':');
        const endParts = (tpl.endTime || '00:00').split(':');
        const startMin = (Number(startParts[0]) || 0) * 60 + (Number(startParts[1]) || 0);
        const endMin = (Number(endParts[0]) || 0) * 60 + (Number(endParts[1]) || 0);
        
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60; // Midnight crossover corrected!
        
        const effMin = Math.max(0, diff - (tpl.breakMinutes || 0));

        const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
        const isHoliday = entry.isHoliday || settings.exceptionCalendar?.[dateKey] === 'holiday';

        if (op.payrollType === 'monthly') {
          if (isHoliday) {
            holidayScheduledMinutes += effMin;
          } else {
            totalScheduledRegularMinutes += effMin;
          }
        } else {
          // 時薪制維持原樣
          if (isHoliday) {
            holidayMinutes += effMin;
          } else {
            const ot1MinLimit = ot1H * 60;
            const ot2MinLimit = ot2H * 60;
            if (effMin <= ot1MinLimit) {
              totalRegularMinutes += effMin;
            } else if (effMin <= ot2MinLimit) {
              totalRegularMinutes += ot1MinLimit;
              totalOt1Minutes += effMin - ot1MinLimit;
            } else {
              totalRegularMinutes += ot1MinLimit;
              totalOt1Minutes += ot2MinLimit - ot1MinLimit;
              totalOt2Minutes += effMin - ot2MinLimit;
            }
          }
        }
      });

      let basePay = 0;
      let ot1Pay = 0;
      let ot2Pay = 0;
      let hPay = 0;

      if (op.payrollType === 'monthly') {
        // 月薪直接加上去，無須 scheduledWorkDays > 0
        basePay = baseRate;
        
        // 只有排班超過當月規定時數才需要加加班費
        let ot1Minutes = 0;
        let ot2Minutes = 0;
        if (totalScheduledRegularMinutes > monthlyMinutesLimit) {
          const totalOtMinutes = totalScheduledRegularMinutes - monthlyMinutesLimit;
          if (totalOtMinutes <= 120) {
            ot1Minutes = totalOtMinutes;
          } else {
            ot1Minutes = 120;
            ot2Minutes = totalOtMinutes - 120;
          }
        }
        
        const dailyRate = baseRate / 30;
        const minuteRate = dailyRate / 8 / 60;
        ot1Pay = ot1Minutes * minuteRate * ot1Rate;
        ot2Pay = ot2Minutes * minuteRate * ot2Rate;
        hPay = holidayScheduledMinutes * minuteRate * holidayRate;
      } else {
        basePay = (totalRegularMinutes / 60) * baseRate;
        ot1Pay = (totalOt1Minutes / 60) * baseRate * ot1Rate;
        ot2Pay = (totalOt2Minutes / 60) * baseRate * ot2Rate;
        hPay = (holidayMinutes / 60) * baseRate * holidayRate;
      }

      const grossPay = Math.round(basePay + ot1Pay + ot2Pay + hPay);

      // Simulate the exact company cost logic (including labor & health insurance + pension)
      let opCost = grossPay;
      const needInsurance = settings.enableInsurance && op.enableInsurance !== false && (op.payrollType === 'monthly' || scheduledWorkDays > 0);
      if (needInsurance) {
        const laborInsComp = Math.round(grossPay * 0.1);
        const healthInsComp = Math.round(grossPay * 0.0252 * 0.7);
        const pensionComp = Math.round(grossPay * 0.06);

        opCost = grossPay + laborInsComp + healthInsComp + pensionComp;
      }

      totalGross += grossPay;
      totalCompany += opCost;
    });

    return {
      grossPay: Math.round(totalGross),
      companyCost: Math.round(totalCompany)
    };
  }, [roster, operators, shiftTemplates, days, settings, ymKey]);

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

  const handleApplyQuickRoster = async () => {
    if (!quickOpId) {
      alert('請選擇員工');
      return;
    }
    if (quickDays.length === 0) {
      alert('請選擇日期');
      return;
    }

    const targetOpIds = quickOpId === 'all' ? operators.map(o => o.id) : [quickOpId];
    const newRoster = { ...roster };

    for (const opId of targetOpIds) {
      for (const day of quickDays) {
        const dateKey = `${ymKey}-${String(day).padStart(2, '0')}`;
        const key = getRosterKey(opId, dateKey);

        if (quickShiftId === 'clear') {
          delete newRoster[key];
        } else {
          const isOff = quickShiftId === 'off';
          const isHolidayDay = settings.exceptionCalendar?.[dateKey] === 'holiday';
          newRoster[key] = {
            operatorId: opId,
            dateKey,
            shiftTemplateId: isOff ? undefined : quickShiftId,
            isOff,
            isHoliday: isHolidayDay,
          };
        }
      }
    }

    await saveRoster(newRoster);
    setQuickRosterModal(false);
    setQuickDays([]);
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
          <div className="bg-coffee-50/70 px-4 py-2 rounded-xl border border-coffee-100 flex items-center gap-3.5 text-xs font-bold text-coffee-700 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span>💰 預估應發薪資：</span>
              <span className="text-rose-brand font-mono text-sm">${estimatedCost.grossPay.toLocaleString()}</span>
            </div>
            {settings.enableInsurance && (
              <>
                <span className="text-coffee-200">|</span>
                <div className="flex items-center gap-1.5">
                  <span>🏢 預估公司總成本：</span>
                  <span className="text-coffee-800 font-mono text-sm">${estimatedCost.companyCost.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleManualSave}
            disabled={saveStatus === 'saving'}
            className={cn(
              "px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm border",
              saveStatus === 'success'
                ? "bg-mint-brand/10 border-mint-brand text-mint-brand"
                : saveStatus === 'saving'
                  ? "bg-coffee-100 border-coffee-200 text-coffee-400"
                  : "bg-coffee-800 border-coffee-800 text-white hover:bg-coffee-900 active:scale-95"
            )}
          >
            {saveStatus === 'saving' ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-coffee-400 border-t-coffee-600 rounded-full animate-spin" />
                <span>儲存中...</span>
              </>
            ) : saveStatus === 'success' ? (
              <span>✅ 儲存成功</span>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>儲存排班</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              setQuickRosterModal(true);
              setQuickDays([]);
              if (operators.length > 0) setQuickOpId(operators[0].id);
            }}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-sm"
          >
            ⚡ 快速排班
          </button>
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

      {/* Quick Roster Modal */}
      <AnimatePresence>
        {quickRosterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-coffee-950/60 backdrop-blur-sm" onClick={() => setQuickRosterModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel bg-white w-full max-w-lg rounded-3xl p-8 relative z-10 space-y-6 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl text-coffee-800">⚡ 快速批次排班</h3>
                <button onClick={() => setQuickRosterModal(false)} className="p-1 hover:bg-coffee-50 rounded-full"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {/* Operator Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-coffee-500 block font-bold">套用員工</label>
                  <select value={quickOpId} onChange={e => setQuickOpId(e.target.value)}
                    className="w-full bg-coffee-50 border border-coffee-100 rounded-xl px-4 py-3 font-bold text-coffee-700 outline-none focus:border-rose-brand">
                    <option value="all">👥 所有員工 (批次排班)</option>
                    {operators.map(op => <option key={op.id} value={op.id}>👤 {op.name}</option>)}
                  </select>
                </div>

                {/* Days Selection Grid */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-coffee-500 uppercase tracking-wider">選擇日期</label>
                    <div className="flex gap-1.5 font-bold">
                      <button
                        onClick={() => setQuickDays(Array.from({ length: daysInMonth }, (_, i) => i + 1))}
                        className="px-2 py-1 bg-coffee-50 hover:bg-coffee-100 rounded-lg text-[10px] font-bold text-coffee-600 transition"
                      >
                        全選
                      </button>
                      <button
                        onClick={() => {
                          const weekdays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => {
                            const dow = getDayOfWeek(d);
                            return dow !== 0 && dow !== 6;
                          });
                          setQuickDays(weekdays);
                        }}
                        className="px-2 py-1 bg-coffee-50 hover:bg-coffee-100 rounded-lg text-[10px] font-bold text-coffee-600 transition"
                      >
                        週一至五
                      </button>
                      <button
                        onClick={() => {
                          const weekends = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => {
                            const dow = getDayOfWeek(d);
                            return dow === 0 || dow === 6;
                          });
                          setQuickDays(weekends);
                        }}
                        className="px-2 py-1 bg-coffee-50 hover:bg-coffee-100 rounded-lg text-[10px] font-bold text-coffee-600 transition"
                      >
                        週六日
                      </button>
                      <button
                        onClick={() => setQuickDays([])}
                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg text-[10px] font-bold text-rose-600 transition"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-2 p-3 bg-coffee-50 rounded-2xl border border-coffee-100">
                    {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                      <div key={w} className="text-center text-[10px] font-bold text-coffee-400 py-1">{w}</div>
                    ))}
                    {/* Pad previous month days */}
                    {Array.from({ length: new Date(viewYear, viewMonth - 1, 1).getDay() }).map((_, idx) => (
                      <div key={`pad-${idx}`} />
                    ))}
                    {days.map(d => {
                      const isSelected = quickDays.includes(d);
                      const dow = getDayOfWeek(d);
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <button
                          key={d}
                          onClick={() => {
                            if (isSelected) {
                              setQuickDays(prev => prev.filter(x => x !== d));
                            } else {
                              setQuickDays(prev => [...prev, d].sort((a, b) => a - b));
                            }
                          }}
                          className={cn(
                            "aspect-square rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center relative",
                            isSelected
                              ? "bg-rose-brand text-white shadow-md scale-105"
                              : isWeekend
                                ? "bg-white hover:bg-coffee-100 text-blue-500 border border-coffee-100"
                                : "bg-white hover:bg-coffee-100 text-coffee-700 border border-coffee-100"
                          )}
                        >
                          <span>{d}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Shift Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-coffee-500 uppercase tracking-wider">選擇班別</label>
                  <div className="grid grid-cols-2 gap-2">
                    {shiftTemplates.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setQuickShiftId(tpl.id)}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                          quickShiftId === tpl.id
                            ? "border-coffee-800 bg-coffee-800 text-white shadow-sm"
                            : "border-coffee-100 bg-white hover:border-coffee-300 text-coffee-700"
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                          style={quickShiftId === tpl.id ? { background: '#fff' } : { background: tpl.color || '#ccc' }}
                        />
                        <div className="truncate">
                          <div>{tpl.name}</div>
                          <div className={cn("text-[9px] font-normal", quickShiftId === tpl.id ? "text-white/70" : "text-coffee-400")}>
                            {tpl.startTime}-{tpl.endTime}
                          </div>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setQuickShiftId('off')}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                        quickShiftId === 'off'
                          ? "border-gray-500 bg-gray-500 text-white shadow-sm"
                          : "border-coffee-100 bg-white hover:border-coffee-300 text-coffee-700"
                      )}
                    >
                      <span className="text-sm">📴</span>
                      <div>
                        <div>排休</div>
                        <div className={cn("text-[9px] font-normal", quickShiftId === 'off' ? "text-white/70" : "text-coffee-400")}>Off Day</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickShiftId('clear')}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left col-span-2",
                        quickShiftId === 'clear'
                          ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                          : "border-rose-100 bg-rose-50/50 hover:border-rose-300 text-rose-700"
                      )}
                    >
                      <span className="text-sm">🗑️</span>
                      <div>
                        <div>清除排班</div>
                        <div className={cn("text-[9px] font-normal", quickShiftId === 'clear' ? "text-white/70" : "text-rose-400")}>刪除排班紀錄</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-coffee-100">
                <button
                  onClick={handleApplyQuickRoster}
                  disabled={quickDays.length === 0}
                  className="w-full py-4 bg-coffee-800 text-white rounded-2xl font-bold shadow-xl hover:bg-coffee-900 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  ⚡ 套用快速排班 ({quickDays.length} 天)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
