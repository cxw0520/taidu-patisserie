import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Delete, Mail } from 'lucide-react';
import { Operator } from '../../types';

interface Props {
  operators: Operator[];
  onUnlock: (operator: Operator) => void;
  onForceGoogleUnlock: () => void;
}

export default function OperatorLockScreen({ operators, onUnlock, onForceGoogleUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [errorShake, setErrorShake] = useState(false);

  useEffect(() => {
    // Check if PIN matches any operator
    if (pin.length >= 4) {
      const match = operators.find(op => op.pinCode === pin);
      if (match) {
        onUnlock(match);
        setPin(''); // Reset for next time
      } else if (pin.length >= 6 || operators.every(op => op.pinCode.length <= pin.length)) {
        // If max possible length reached and no match, error
        setErrorShake(true);
        setTimeout(() => {
          setErrorShake(false);
          setPin('');
        }, 500);
      }
    }
  }, [pin, operators, onUnlock]);

  const handleNumpad = (num: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 bg-coffee-900/95 backdrop-blur-md flex flex-col items-center justify-center z-[100]">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, x: errorShake ? [-10, 10, -10, 10, 0] : 0 }}
        transition={{ duration: errorShake ? 0.4 : 0.3 }}
        className="flex flex-col items-center max-w-sm w-full px-6"
      >
        <div className="w-20 h-20 bg-coffee-800 rounded-full flex items-center justify-center mb-8 shadow-inner border border-coffee-700">
          <Lock className="w-8 h-8 text-coffee-300" />
        </div>

        <h2 className="text-2xl font-light text-coffee-100 tracking-widest mb-10">請輸入密碼解鎖</h2>

        <div className="flex gap-4 mb-10 h-6">
          {/* Show dots for current pin length */}
          {[...Array(6)].map((_, i) => (
             <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-rose-brand scale-110 shadow-[0_0_10px_rgba(173,104,35,0.8)]' : 'bg-coffee-800'}`} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num}
              onClick={() => handleNumpad(num.toString())}
              className="w-20 h-20 bg-coffee-800/50 hover:bg-coffee-700 border border-coffee-700/50 rounded-full text-3xl font-light text-coffee-50 flex items-center justify-center active:scale-90 transition-all shadow-lg"
            >
              {num}
            </button>
          ))}
          <div className="w-20 h-20"></div>
          <button 
            onClick={() => handleNumpad('0')}
            className="w-20 h-20 bg-coffee-800/50 hover:bg-coffee-700 border border-coffee-700/50 rounded-full text-3xl font-light text-coffee-50 flex items-center justify-center active:scale-90 transition-all shadow-lg"
          >
            0
          </button>
          <button 
            onClick={handleDelete}
            className="w-20 h-20 hover:bg-coffee-800/30 rounded-full flex items-center justify-center text-coffee-400 hover:text-coffee-200 active:scale-90 transition-all"
          >
            <Delete className="w-8 h-8" />
          </button>
        </div>

        <div className="mt-16">
          <button 
            onClick={onForceGoogleUnlock}
            className="flex items-center gap-2 text-coffee-500 hover:text-coffee-300 text-sm transition-colors opacity-60 hover:opacity-100"
          >
            <Mail className="w-4 h-4" /> 忘記密碼？使用 Google 帳號強制重置
          </button>
        </div>
      </motion.div>
    </div>
  );
}
