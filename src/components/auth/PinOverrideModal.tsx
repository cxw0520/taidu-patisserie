import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Delete, X } from 'lucide-react';
import { Operator, Role, Permissions } from '../../types';

interface Props {
  operators: Operator[];
  roles: Role[];
  requiredPermission: keyof Permissions;
  actionName: string;
  onSuccess: (operator: Operator) => void;
  onCancel: () => void;
}

export default function PinOverrideModal({ operators, roles, requiredPermission, actionName, onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [errorShake, setErrorShake] = useState(false);

  useEffect(() => {
    let active = true;
    if (pin.length >= 4) {
      const match = operators.find(op => op.pinCode === pin);
      if (match) {
        const role = roles.find(r => r.id === match.roleId);
        if (role && role.permissions[requiredPermission]) {
          onSuccess(match);
          return;
        } else {
          // Found operator, but no permission
          setErrorShake(true);
        }
      } else if (pin.length >= 6 || operators.every(op => op.pinCode.length <= pin.length)) {
        setErrorShake(true);
      }
      
      if (errorShake && active) {
        setTimeout(() => {
          if(active) {
            setErrorShake(false);
            setPin('');
          }
        }, 500);
      }
    }
    return () => { active = false; };
  }, [pin, operators, roles, requiredPermission, onSuccess, errorShake]);

  const handleNumpad = (num: string) => {
    if (pin.length < 6) setPin(prev => prev + num);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, x: errorShake ? [-10, 10, -10, 10, 0] : 0 }}
        transition={{ duration: errorShake ? 0.4 : 0.2 }}
        className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-full max-w-sm relative"
      >
        <button onClick={onCancel} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"><X className="w-5 h-5"/></button>
        
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">需要權限授權</h2>
          <p className="text-sm text-gray-500 mb-6 text-center">欲執行「{actionName}」<br/>請輸入有權限之人員密碼</p>

          <div className="flex gap-3 mb-8 h-4">
            {[...Array(6)].map((_, i) => (
               <div key={i} className={`w-3 h-3 rounded-full transition-all duration-200 ${i < pin.length ? 'bg-coffee-600 scale-125' : 'bg-gray-200'}`} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 w-full max-w-[240px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpad(num.toString())} className="w-16 h-16 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-full text-2xl font-medium text-gray-700 flex items-center justify-center active:scale-95 transition-all">
                {num}
              </button>
            ))}
            <div className="w-16 h-16"></div>
            <button onClick={() => handleNumpad('0')} className="w-16 h-16 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-full text-2xl font-medium text-gray-700 flex items-center justify-center active:scale-95 transition-all">
              0
            </button>
            <button onClick={() => setPin(prev => prev.slice(0, -1))} className="w-16 h-16 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-400 active:scale-95 transition-all">
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
