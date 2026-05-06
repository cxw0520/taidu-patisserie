import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, Mail, Clock, LogIn, LogOut, CheckCircle2, X } from 'lucide-react';
import { Operator, Settings, AttendanceRecord, AttendancePunch, ShiftTemplate } from '../../types';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { uid } from '../../lib/utils';

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
  onUnlock: (operator: Operator) => void;
  onForceGoogleUnlock: () => void;
}

type ScreenMode = 'idle' | 'pin_unlock' | 'pin_clock' | 'confirm_clock' | 'clock_success';

interface ClockConfirm {
  operator: Operator;
  punchType: 'clock_in' | 'clock_out';
  time: string;
  dateKey: string;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function applyRounding(timeStr: string, intervalMin: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m;
  const rounded = Math.round(total / intervalMin) * intervalMin;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

export default function OperatorLockScreen({ shopId, operators, settings, onUnlock, onForceGoogleUnlock }: Props) {
  const [mode, setMode] = useState<ScreenMode>('idle');
  const [pin, setPin] = useState('');
  const [errorShake, setErrorShake] = useState(false);
  const [clockConfirm, setClockConfirm] = useState<ClockConfirm | null>(null);
  const [clockSuccess, setClockSuccess] = useState<ClockConfirm | null>(null);
  const [currentTime, setCurrentTime] = useState(nowHHMM());
  const pendingPunchType = useRef<'clock_in' | 'clock_out' | null>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(nowHHMM()), 10000);
    return () => clearInterval(id);
  }, []);

  // PIN matching logic
  useEffect(() => {
    if (pin.length < 4) return;
    const match = operators.find(op => op.pinCode === pin);

    if (match) {
      if (mode === 'pin_unlock') {
        onUnlock(match);
        setPin('');
        setMode('idle');
      } else if (mode === 'pin_clock') {
        const punchType = pendingPunchType.current || 'clock_in';
        const timeNow = nowHHMM();
        setClockConfirm({ operator: match, punchType, time: timeNow, dateKey: todayKey() });
        setMode('confirm_clock');
        setPin('');
      }
    } else if (pin.length >= 6 || operators.every(op => op.pinCode.length <= pin.length)) {
      setErrorShake(true);
      setTimeout(() => { setErrorShake(false); setPin(''); }, 500);
    }
  }, [pin, operators, onUnlock, mode]);

  const handleNumpad = (num: string) => {
    if (pin.length < 6) setPin(prev => prev + num);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  const handleClockAction = (punchType: 'clock_in' | 'clock_out') => {
    pendingPunchType.current = punchType;
    setMode('pin_clock');
    setPin('');
  };

  const handleConfirmClock = async () => {
    if (!clockConfirm) return;
    const { operator, punchType, time, dateKey } = clockConfirm;

    const interval = settings.timeRoundingInterval || 1;
    const ymKey = dateKey.slice(0, 7);

    const newPunch: AttendancePunch = {
      id: uid(),
      type: punchType,
      time,
      rawTime: new Date().toISOString(),
      roundedTime: applyRounding(time, interval),
      method: 'pin',
    };

    try {
      const ref = doc(db, 'shops', shopId, 'hr', `attendance_${operator.id}_${ymKey}`);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() as Record<string, AttendanceRecord> : {};
      const dayRecord = existing[dateKey];
      const existingPunches: AttendancePunch[] = dayRecord?.punches || [];

      const newRecord: AttendanceRecord = {
        id: dayRecord?.id || uid(),
        operatorId: operator.id,
        dateKey,
        punches: [...existingPunches, newPunch],
        clockIn: punchType === 'clock_in' ? applyRounding(time, interval) : dayRecord?.clockIn,
        clockOut: punchType === 'clock_out' ? applyRounding(time, interval) : dayRecord?.clockOut,
        effectiveMinutes: dayRecord?.effectiveMinutes,
        isLate: dayRecord?.isLate,
        lateMinutes: dayRecord?.lateMinutes,
        isEarlyLeave: dayRecord?.isEarlyLeave,
        earlyLeaveMinutes: dayRecord?.earlyLeaveMinutes,
      };

      await setDoc(ref, { ...existing, [dateKey]: newRecord });
      setClockSuccess(clockConfirm);
      setMode('clock_success');
      setClockConfirm(null);
      setTimeout(() => { setMode('idle'); setClockSuccess(null); }, 3000);
    } catch (err) {
      console.error('打卡失敗:', err);
      alert('打卡記錄失敗，請重試');
      setMode('idle');
      setClockConfirm(null);
    }
  };

  const handleCancel = () => {
    setMode('idle');
    setPin('');
    setClockConfirm(null);
    pendingPunchType.current = null;
  };

  const todayDate = new Date();
  const dateDisplay = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`;
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const dayDisplay = `週${dayNames[todayDate.getDay()]}`;

  return (
    <div className="fixed inset-0 bg-coffee-900/95 backdrop-blur-md flex flex-col items-center justify-center z-[100]">
      <AnimatePresence mode="wait">

        {/* ── IDLE: Main clock screen ── */}
        {mode === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-8 w-full max-w-sm px-6"
          >
            {/* Time Display */}
            <div className="text-center">
              <div className="text-7xl font-light text-white tracking-widest font-mono mb-2">
                {currentTime}
              </div>
              <div className="text-coffee-300 text-lg font-light tracking-wider">
                {dateDisplay} {dayDisplay}
              </div>
            </div>

            {/* Clock in / Clock out buttons */}
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => handleClockAction('clock_in')}
                className="flex flex-col items-center gap-2 py-6 bg-mint-brand/20 hover:bg-mint-brand/30 border-2 border-mint-brand/50 rounded-3xl transition-all active:scale-95 group"
              >
                <LogIn className="w-8 h-8 text-mint-brand group-hover:scale-110 transition-transform" />
                <span className="text-mint-brand font-bold text-lg">上班打卡</span>
              </button>
              <button
                onClick={() => handleClockAction('clock_out')}
                className="flex flex-col items-center gap-2 py-6 bg-rose-brand/20 hover:bg-rose-brand/30 border-2 border-rose-brand/50 rounded-3xl transition-all active:scale-95 group"
              >
                <LogOut className="w-8 h-8 text-rose-brand group-hover:scale-110 transition-transform" />
                <span className="text-rose-brand font-bold text-lg">下班打卡</span>
              </button>
            </div>

            {/* Unlock System */}
            <button
              onClick={() => { setMode('pin_unlock'); setPin(''); }}
              className="flex items-center gap-2 text-coffee-400 hover:text-coffee-200 text-sm transition-colors border border-coffee-700 px-5 py-2.5 rounded-full hover:border-coffee-500"
            >
              <Lock className="w-4 h-4" /> 解鎖進入系統
            </button>
          </motion.div>
        )}

        {/* ── PIN INPUT (unlock or clock) ── */}
        {(mode === 'pin_unlock' || mode === 'pin_clock') && (
          <motion.div
            key="pin"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, x: errorShake ? [-10, 10, -10, 10, 0] : 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: errorShake ? 0.4 : 0.3 }}
            className="flex flex-col items-center max-w-sm w-full px-6"
          >
            {/* Header */}
            <div className="mb-6 text-center">
              {mode === 'pin_clock' ? (
                <>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto ${pendingPunchType.current === 'clock_in' ? 'bg-mint-brand/20 border-2 border-mint-brand/50' : 'bg-rose-brand/20 border-2 border-rose-brand/50'}`}>
                    {pendingPunchType.current === 'clock_in'
                      ? <LogIn className="w-7 h-7 text-mint-brand" />
                      : <LogOut className="w-7 h-7 text-rose-brand" />
                    }
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    {pendingPunchType.current === 'clock_in' ? '上班打卡' : '下班打卡'}
                  </h2>
                  <p className="text-coffee-400 text-sm">請輸入您的員工 PIN 碼</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-coffee-800 rounded-full flex items-center justify-center mb-4 mx-auto border border-coffee-700">
                    <Lock className="w-7 h-7 text-coffee-300" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">解鎖系統</h2>
                  <p className="text-coffee-400 text-sm">請輸入管理員 PIN 碼</p>
                </>
              )}
            </div>

            {/* PIN dots */}
            <div className="flex gap-4 mb-10 h-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-rose-brand scale-110 shadow-[0_0_10px_rgba(255,107,157,0.6)]' : 'bg-coffee-800'}`} />
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-[260px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => handleNumpad(num.toString())}
                  className="w-18 h-18 aspect-square bg-coffee-800/50 hover:bg-coffee-700 border border-coffee-700/50 rounded-full text-2xl font-light text-coffee-50 flex items-center justify-center active:scale-90 transition-all shadow-lg"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleCancel}
                className="w-18 h-18 aspect-square hover:bg-coffee-800/30 rounded-full flex items-center justify-center text-coffee-500 hover:text-coffee-300 active:scale-90 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
              <button
                onClick={() => handleNumpad('0')}
                className="w-18 h-18 aspect-square bg-coffee-800/50 hover:bg-coffee-700 border border-coffee-700/50 rounded-full text-2xl font-light text-coffee-50 flex items-center justify-center active:scale-90 transition-all shadow-lg"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className="w-18 h-18 aspect-square hover:bg-coffee-800/30 rounded-full flex items-center justify-center text-coffee-400 hover:text-coffee-200 active:scale-90 transition-all"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            {mode === 'pin_unlock' && (
              <div className="mt-10">
                <button
                  onClick={onForceGoogleUnlock}
                  className="flex items-center gap-2 text-coffee-500 hover:text-coffee-300 text-sm transition-colors opacity-60 hover:opacity-100"
                >
                  <Mail className="w-4 h-4" /> 忘記密碼？使用 Google 帳號
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── CONFIRM CLOCK ── */}
        {mode === 'confirm_clock' && clockConfirm && (
          <motion.div
            key="confirm"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6 max-w-sm w-full px-6"
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${clockConfirm.punchType === 'clock_in' ? 'bg-mint-brand/20 border-2 border-mint-brand' : 'bg-rose-brand/20 border-2 border-rose-brand'}`}>
              {clockConfirm.punchType === 'clock_in'
                ? <LogIn className="w-9 h-9 text-mint-brand" />
                : <LogOut className="w-9 h-9 text-rose-brand" />
              }
            </div>
            <div className="text-center">
              <div className="text-coffee-300 text-sm mb-1">
                {clockConfirm.punchType === 'clock_in' ? '上班打卡確認' : '下班打卡確認'}
              </div>
              <div className="text-white text-4xl font-bold font-mono mb-1">{clockConfirm.time}</div>
              <div className="text-coffee-200 text-xl font-bold">{clockConfirm.operator.name}</div>
              {settings.timeRoundingInterval && settings.timeRoundingInterval > 1 && (
                <div className="text-coffee-400 text-sm mt-2">
                  計薪時間：{applyRounding(clockConfirm.time, settings.timeRoundingInterval)}
                  （以 {settings.timeRoundingInterval} 分鐘為計薪單位）
                </div>
              )}
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={handleCancel}
                className="flex-1 py-4 bg-coffee-800/50 border border-coffee-700 text-coffee-300 rounded-2xl font-bold hover:bg-coffee-800 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleConfirmClock}
                className={`flex-1 py-4 rounded-2xl font-bold text-white transition-all active:scale-95 ${clockConfirm.punchType === 'clock_in' ? 'bg-mint-brand hover:bg-mint-brand/90' : 'bg-rose-brand hover:bg-rose-brand/90'}`}
              >
                確認打卡
              </button>
            </div>
          </motion.div>
        )}

        {/* ── CLOCK SUCCESS ── */}
        {mode === 'clock_success' && clockSuccess && (
          <motion.div
            key="success"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              <CheckCircle2 className="w-24 h-24 text-mint-brand" />
            </motion.div>
            <div className="text-center">
              <div className="text-white text-3xl font-bold mb-1">{clockSuccess.operator.name}</div>
              <div className="text-coffee-300 text-lg">
                {clockSuccess.punchType === 'clock_in' ? '✅ 上班打卡成功' : '✅ 下班打卡成功'}
              </div>
              <div className="text-4xl font-mono font-bold text-white mt-3">{clockSuccess.time}</div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
