import React, { useState, useEffect, useMemo } from 'react';
import { Operator, Settings, AttendanceRecord, RosterEntry, ShiftTemplate, PayrollResult, PayrollLineItem } from '../../types';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
}

function fmtYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function fmt(n: number) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function calcPayroll(
  op: Operator,
  records: Record<string, AttendanceRecord>,
  settings: Settings
): PayrollResult {
  const payrollType = op.payrollType || 'hourly';
  const baseRate = op.baseRate || 0;

  const ot1H = settings.overtimeTier1Hours || 8;
  const ot2H = settings.overtimeTier2Hours || 10;
  const ot1Rate = settings.overtimeTier1Rate || 1.34;
  const ot2Rate = settings.overtimeTier2Rate || 1.67;
  const holidayRate = settings.holidayPayRate || 2.0;
  const lateGrace = settings.lateGracePeriod || 0;

  let totalRegularMinutes = 0;
  let totalOt1Minutes = 0;
  let totalOt2Minutes = 0;
  let holidayMinutes = 0;
  let lateDeductMinutes = 0;
  let lineItems: PayrollLineItem[] = [];

  Object.values(records).forEach(rec => {
    const effMin = rec.effectiveMinutes || 0;
    if (effMin <= 0) return;

    if (rec.isHoliday) {
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

    if (rec.isLate && (rec.lateMinutes || 0) > lateGrace) {
      lateDeductMinutes += rec.lateMinutes || 0;
    }
  });

  let basePay = 0;
  let ot1Pay = 0;
  let ot2Pay = 0;
  let hPay = 0;
  let lateDeduction = 0;

  if (payrollType === 'hourly') {
    const hourlyRate = baseRate;
    basePay = (totalRegularMinutes / 60) * hourlyRate;
    ot1Pay = (totalOt1Minutes / 60) * hourlyRate * ot1Rate;
    ot2Pay = (totalOt2Minutes / 60) * hourlyRate * ot2Rate;
    hPay = (holidayMinutes / 60) * hourlyRate * holidayRate;
    lateDeduction = (lateDeductMinutes / 60) * hourlyRate;

    if (basePay > 0) lineItems.push({ label: `基本薪資 (${(totalRegularMinutes/60).toFixed(1)}h × $${hourlyRate})`, amount: Math.round(basePay), type: 'add' });
    if (ot1Pay > 0) lineItems.push({ label: `加班費 T1 (${(totalOt1Minutes/60).toFixed(1)}h × ${ot1Rate}倍)`, amount: Math.round(ot1Pay), type: 'add' });
    if (ot2Pay > 0) lineItems.push({ label: `加班費 T2 (${(totalOt2Minutes/60).toFixed(1)}h × ${ot2Rate}倍)`, amount: Math.round(ot2Pay), type: 'add' });
    if (hPay > 0) lineItems.push({ label: `假日出勤加給 (${(holidayMinutes/60).toFixed(1)}h × ${holidayRate}倍)`, amount: Math.round(hPay), type: 'add' });
    if (lateDeduction > 0) lineItems.push({ label: `遲到扣款 (${lateDeductMinutes}分)`, amount: Math.round(lateDeduction), type: 'deduct' });

  } else {
    // Monthly salary
    basePay = baseRate;
    const dailyRate = baseRate / 30;
    const minuteRate = dailyRate / 8 / 60;
    hPay = holidayMinutes * minuteRate * holidayRate;
    lateDeduction = lateDeductMinutes * minuteRate;
    ot1Pay = totalOt1Minutes * minuteRate * ot1Rate;
    ot2Pay = totalOt2Minutes * minuteRate * ot2Rate;

    lineItems.push({ label: `月薪本薪`, amount: Math.round(basePay), type: 'add' });
    if (ot1Pay > 0) lineItems.push({ label: `加班費 T1 (${(totalOt1Minutes/60).toFixed(1)}h)`, amount: Math.round(ot1Pay), type: 'add' });
    if (ot2Pay > 0) lineItems.push({ label: `加班費 T2 (${(totalOt2Minutes/60).toFixed(1)}h)`, amount: Math.round(ot2Pay), type: 'add' });
    if (hPay > 0) lineItems.push({ label: `假日出勤加給 (${(holidayMinutes/60).toFixed(1)}h)`, amount: Math.round(hPay), type: 'add' });
    if (lateDeduction > 0) lineItems.push({ label: `遲到扣款 (${lateDeductMinutes}分)`, amount: Math.round(lateDeduction), type: 'deduct' });
  }

  const grossPay = Math.round(basePay + ot1Pay + ot2Pay + hPay - lateDeduction);

  // Insurance (when enabled)
  let laborInsEmp = 0, healthInsEmp = 0, pensionEmp = 0;
  if (settings.enableInsurance) {
    laborInsEmp = Math.round(grossPay * 0.021);
    healthInsEmp = Math.round(grossPay * 0.0252 * 0.3);
    pensionEmp = 0; // pension is employer-only
    lineItems.push({ label: `勞保自付額 (2.1%)`, amount: laborInsEmp, type: 'deduct' });
    lineItems.push({ label: `健保自付額 (2.52%×30%)`, amount: healthInsEmp, type: 'deduct' });
  }

  const netPay = Math.max(0, grossPay - laborInsEmp - healthInsEmp - pensionEmp);

  let laborInsComp = 0, healthInsComp = 0, pensionComp = 0;
  if (settings.enableInsurance) {
    laborInsComp = Math.round(grossPay * 0.1);
    healthInsComp = Math.round(grossPay * 0.0252 * 0.7);
    pensionComp = Math.round(grossPay * 0.06);
  }

  return {
    operatorId: op.id,
    yearMonth: '',
    payrollType,
    baseRate,
    totalRegularMinutes,
    totalOt1Minutes,
    totalOt2Minutes,
    holidayMinutes,
    basePay: Math.round(basePay),
    ot1Pay: Math.round(ot1Pay),
    ot2Pay: Math.round(ot2Pay),
    holidayPay: Math.round(hPay),
    lateDeduction: Math.round(lateDeduction),
    laborInsuranceEmployee: laborInsEmp,
    healthInsuranceEmployee: healthInsEmp,
    pensionEmployee: pensionEmp,
    laborInsuranceCompany: laborInsComp,
    healthInsuranceCompany: healthInsComp,
    pensionCompany: pensionComp,
    netPay,
    companyCost: settings.enableInsurance ? netPay + laborInsComp + healthInsComp + pensionComp : undefined,
    lineItems,
  };
}

export default function PayrollTab({ shopId, operators, settings }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [allAttendance, setAllAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>({});
  const [expandedOp, setExpandedOp] = useState<string | null>(null);

  const ymKey = fmtYM(viewYear, viewMonth);

  useEffect(() => {
    if (!shopId || operators.length === 0) return;
    const unsubs = operators.map(op => {
      const ref = doc(db, 'shops', shopId, 'hr', `attendance_${op.id}_${ymKey}`);
      return onSnapshot(ref, snap => {
        setAllAttendance(prev => ({
          ...prev,
          [op.id]: snap.exists() ? snap.data() as Record<string, AttendanceRecord> : {}
        }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [shopId, operators, ymKey]);

  const payrollResults = useMemo(() => {
    return operators.map(op => ({
      op,
      result: calcPayroll(op, allAttendance[op.id] || {}, settings)
    }));
  }, [operators, allAttendance, settings]);

  const totalNetPay = payrollResults.reduce((s, r) => s + r.result.netPay, 0);
  const totalCompanyCost = payrollResults.reduce((s, r) => s + (r.result.companyCost || r.result.netPay), 0);

  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(v => v - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(v => v + 1); } else setViewMonth(m => m + 1); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold text-coffee-800 min-w-[120px] text-center">{viewYear}年 {viewMonth}月</h2>
          <button onClick={nextMonth} className="p-2 bg-white border border-coffee-100 rounded-xl hover:bg-coffee-50 transition"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 bg-coffee-800 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-coffee-900 transition">
          <Download className="w-4 h-4" /> 匯出薪資單
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-5 text-center">
          <div className="text-xs font-bold text-coffee-400 uppercase tracking-widest mb-1">本月員工實領薪資總計</div>
          <div className="text-3xl font-bold text-rose-brand font-mono">${fmt(totalNetPay)}</div>
        </div>
        <div className={cn("glass-panel p-5 text-center", !settings.enableInsurance && "opacity-40")}>
          <div className="text-xs font-bold text-coffee-400 uppercase tracking-widest mb-1">公司真實薪資成本{!settings.enableInsurance && ' (未啟用勞健保)'}</div>
          <div className="text-3xl font-bold text-coffee-700 font-mono">${fmt(totalCompanyCost)}</div>
        </div>
      </div>

      {/* Insurance note */}
      {!settings.enableInsurance && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700 font-bold">
          ℹ️ 勞健保扣繳計算目前為「關閉」狀態。如需啟用，請前往【系統設定 → 人事薪資規則】開啟。
        </div>
      )}

      {/* Payroll Cards */}
      <div className="space-y-4">
        {payrollResults.map(({ op, result }) => (
          <motion.div
            key={op.id}
            layout
            className="glass-panel overflow-hidden"
          >
            {/* Summary Row */}
            <button
              onClick={() => setExpandedOp(expandedOp === op.id ? null : op.id)}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-coffee-50/30 transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-coffee-100 rounded-full flex items-center justify-center font-bold text-coffee-600 text-sm">
                  {op.name.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-coffee-800">{op.name}</div>
                  <div className="text-xs text-coffee-400">
                    {op.payrollType === 'hourly' ? `時薪 $${op.baseRate}` : `月薪 $${(op.baseRate||0).toLocaleString()}`}
                    {' · '}
                    {op.payrollType === 'hourly' ? `本月有效工時 ${((result.totalRegularMinutes || 0) + (result.totalOt1Minutes || 0) + (result.totalOt2Minutes || 0) + (result.holidayMinutes || 0)).toFixed(0) === '0' ? '—' : `${(((result.totalRegularMinutes || 0) + (result.totalOt1Minutes || 0) + (result.totalOt2Minutes || 0) + (result.holidayMinutes || 0)) / 60).toFixed(1)}h`}` : `月薪制`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-coffee-800 font-mono">${fmt(result.netPay)}</div>
                {settings.enableInsurance && result.companyCost && (
                  <div className="text-xs text-coffee-400">公司成本 ${fmt(result.companyCost)}</div>
                )}
              </div>
            </button>

            {/* Expanded Detail */}
            {expandedOp === op.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-coffee-100 px-6 pb-6 pt-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Line Items */}
                  <div>
                    <h4 className="text-xs font-bold text-coffee-400 uppercase tracking-widest mb-3">薪資明細</h4>
                    <div className="space-y-2">
                      {result.lineItems.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-coffee-600">{item.label}</span>
                          <span className={cn("font-bold font-mono", item.type === 'add' ? 'text-mint-brand' : 'text-rose-brand')}>
                            {item.type === 'add' ? '+' : '-'}${fmt(item.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-coffee-100 flex justify-between font-bold text-coffee-800">
                        <span>員工實領薪資</span>
                        <span className="font-mono text-rose-brand">${fmt(result.netPay)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Company Cost (when insurance enabled) */}
                  {settings.enableInsurance && (
                    <div>
                      <h4 className="text-xs font-bold text-coffee-400 uppercase tracking-widest mb-3">公司負擔成本</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-coffee-600">員工實領</span>
                          <span className="font-mono font-bold">${fmt(result.netPay)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-coffee-600">勞保（公司負擔）</span>
                          <span className="font-mono font-bold">${fmt(result.laborInsuranceCompany || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-coffee-600">健保（公司負擔）</span>
                          <span className="font-mono font-bold">${fmt(result.healthInsuranceCompany || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-coffee-600">勞退提撥 6%</span>
                          <span className="font-mono font-bold">${fmt(result.pensionCompany || 0)}</span>
                        </div>
                        <div className="pt-2 border-t border-coffee-100 flex justify-between font-bold text-coffee-800">
                          <span>公司總成本</span>
                          <span className="font-mono text-amber-600">${fmt(result.companyCost || 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}

        {operators.length === 0 && (
          <div className="text-center py-16 text-coffee-300 font-bold">尚未建立任何員工，請先至系統設定新增員工。</div>
        )}
      </div>
    </div>
  );
}
