import { AttendanceRecord, AttendancePunch, RosterEntry, ShiftTemplate, Settings } from '../types';
import { uid } from './utils';

export function applyRounding(timeStr: string, intervalMin: number): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m;
  const rounded = Math.round(total / intervalMin) * intervalMin;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

export function calcMinutesDiff(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // Cross midnight
  return diff;
}

export function buildAttendanceRecord(
  operatorId: string,
  dateKey: string,
  punches: AttendancePunch[],
  settings: Settings,
  roster: Record<string, RosterEntry>,
  shiftTemplates: ShiftTemplate[]
): AttendanceRecord {
  const interval = settings.timeRoundingInterval || 1;
  const lateGrace = settings.lateGracePeriod || 0;
  const earlyTol = settings.earlyLeaveTolerance || 0;
  const ot1H = settings.overtimeTier1Hours || 8;
  const ot2H = settings.overtimeTier2Hours || 10;

  const sortedPunches = [...punches].sort((a, b) => a.rawTime.localeCompare(b.rawTime));
  const clockInPunch = sortedPunches.find(p => p.type === 'clock_in');
  const clockOutPunch = [...sortedPunches].reverse().find(p => p.type === 'clock_out');

  const clockIn = clockInPunch ? applyRounding(clockInPunch.time, interval) : undefined;
  const clockOut = clockOutPunch ? applyRounding(clockOutPunch.time, interval) : undefined;

  let effectiveMinutes = 0;
  let isLate = false;
  let lateMinutes = 0;
  let isEarlyLeave = false;
  let earlyLeaveMinutes = 0;

  const rosterKey = `${operatorId}_${dateKey}`;
  const rosterEntry = roster[rosterKey];
  const tpl = rosterEntry?.shiftTemplateId ? shiftTemplates.find(t => t.id === rosterEntry.shiftTemplateId) : null;

  if (clockIn && clockOut) {
    const totalWorked = calcMinutesDiff(clockIn, clockOut);
    const breakMins = tpl ? (tpl.breakMinutes || 0) : 0;
    effectiveMinutes = Math.max(0, totalWorked - breakMins);

    if (tpl) {
      const scheduledStartMins = tpl.startTime.split(':').reduce((h, m, i) => i === 0 ? Number(h) * 60 : Number(h) + Number(m), 0 as any);
      const actualStartMins = clockIn.split(':').reduce((h, m, i) => i === 0 ? Number(h) * 60 : Number(h) + Number(m), 0 as any);
      
      // Handle late calculation
      lateMinutes = Math.max(0, actualStartMins - scheduledStartMins);
      // If late minutes is very large (e.g. clocked in at 23:00 for a 08:00 shift), it's probably not "late" but a different shift.
      // But we'll trust the roster link for now.
      if (lateMinutes > lateGrace && lateMinutes < 12 * 60) {
        isLate = true;
      } else {
        lateMinutes = 0;
      }

      const scheduledEndMins = tpl.endTime.split(':').reduce((h, m, i) => i === 0 ? Number(h) * 60 : Number(h) + Number(m), 0 as any);
      const actualEndMins = clockOut.split(':').reduce((h, m, i) => i === 0 ? Number(h) * 60 : Number(h) + Number(m), 0 as any);
      
      let scheduledDuration = (scheduledEndMins - scheduledStartMins);
      if (scheduledDuration < 0) scheduledDuration += 24 * 60;

      // Early leave is tricky with midnight crossover.
      // Better to check if (actualEnd < scheduledEnd) within a reasonable window.
      earlyLeaveMinutes = Math.max(0, scheduledEndMins - actualEndMins);
      // If they finished after scheduled, earlyLeaveMinutes might be negative or huge (if cross midnight).
      // Let's simplify: if they worked less than scheduled duration - tolerance.
      if (totalWorked < (scheduledDuration - earlyTol)) {
        isEarlyLeave = true;
        earlyLeaveMinutes = Math.max(0, scheduledDuration - totalWorked);
      } else {
        earlyLeaveMinutes = 0;
        isEarlyLeave = false;
      }
    }
  }

  const ot1Min = ot1H * 60;
  const ot2Min = ot2H * 60;
  const isHoliday = rosterEntry?.isHoliday || settings.exceptionCalendar?.[dateKey] === 'holiday';

  return {
    id: uid(),
    operatorId,
    dateKey,
    punches: sortedPunches,
    clockIn,
    clockOut,
    effectiveMinutes,
    isLate,
    lateMinutes,
    isEarlyLeave,
    earlyLeaveMinutes,
    isOvertier1: effectiveMinutes > ot1Min,
    isOvertier2: effectiveMinutes > ot2Min,
    isHoliday,
  };
}
