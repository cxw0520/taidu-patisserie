import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, Mail } from 'lucide-react';
import { Operator, Settings } from '../../types';

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
  onUnlock: (operator: Operator) => void;
  onForceGoogleUnlock: () => void;
}

export default function OperatorLockScreen({ shopId, operators, settings, onUnlock, onForceGoogleUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [errorShake, setErrorShake] = useState(false);

  // PIN matching logic
  useEffect(() => {
    if (pin.length < 4) return;
    const match = operators.find(op => op.pinCode === pin);

    if (match) {
      onUnlock(match);
      setPin('');
    } else if (pin.length >= 6 || operators.every(op => op.pinCode.length <= pin.length)) {
      setErrorShake(true);
      setTimeout(() => { setErrorShake(false); setPin(''); }, 500);
    }
  }, [pin, operators, onUnlock]);

  const handleNumpad = (num: string) => {
    if (pin.length < 6) setPin(prev => prev + num);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  return (
    <div className="fixed inset-0 bg-coffee-900/95 backdrop-blur-md flex flex-col items-center justify-center z-[100]">
      <AnimatePresence mode="wait">
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
            <div className="w-16 h-16 bg-coffee-800 rounded-full flex items-center justify-center mb-4 mx-auto border border-coffee-700">
              <Lock className="w-7 h-7 text-coffee-300" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">解鎖系統</h2>
            <p className="text-coffee-400 text-sm">請輸入解鎖 PIN 碼</p>
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
            <div className="w-18 h-18" />
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

          <div className="mt-10 flex flex-col items-center gap-4">
            <button
              onClick={onForceGoogleUnlock}
              className="flex items-center gap-2 text-coffee-500 hover:text-coffee-300 text-sm transition-colors opacity-60 hover:opacity-100 mt-4"
            >
              <Mail className="w-4 h-4" /> 忘記密碼？使用 Google 帳號
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
