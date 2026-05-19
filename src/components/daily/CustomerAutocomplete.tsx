import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, AlertTriangle, User } from 'lucide-react';
import { Customer } from '../../types';

export default function CustomerAutocomplete({
  customers,
  phoneInput,
  setPhoneInput,
  onSelectCustomer
}: {
  customers: Customer[];
  phoneInput: string;
  setPhoneInput: (v: string) => void;
  onSelectCustomer: (c: Customer) => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    const rawQ = phoneInput.trim();
    if (!rawQ) return [];
    const qDigits = rawQ.replace(/\D/g, '');
    const qLower = rawQ.toLowerCase();

    return customers.filter(c => {
      const phoneMatch = qDigits && (c.phone || '').replace(/\D/g, '').includes(qDigits);
      const nameMatch = c.name.toLowerCase().includes(qLower);
      return phoneMatch || nameMatch;
    }).slice(0, 6);
  }, [phoneInput, customers]);

  return (
    <div className="relative">
      <label className="text-xs font-bold text-coffee-400 mb-1 block">電話或姓名（輸入以自動搜尋顧客）</label>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-coffee-300 pointer-events-none" />
        <input
          type="text"
          value={phoneInput}
          onChange={e => {
            setPhoneInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => phoneInput && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
          placeholder="輸入電話號碼或顧客姓名"
          className="w-full bg-coffee-50 border border-coffee-100 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-coffee-700 outline-none focus:border-rose-brand transition-colors"
        />
      </div>
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white border border-coffee-100 rounded-2xl shadow-xl z-50 overflow-hidden"
          >
            {suggestions.map(c => (
              <button
                key={c.id}
                onMouseDown={() => onSelectCustomer(c)}
                className="w-full px-4 py-3 text-left hover:bg-rose-brand/5 transition-colors border-b border-coffee-50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-coffee-800 text-sm flex items-center gap-1">
                      {c.name} {c.gender && c.gender !== '不選擇' ? c.gender : ''}
                      {c.tags?.includes('奧客') && <AlertTriangle className="w-3.5 h-3.5 text-danger-brand" />}
                    </span>
                    <span className="ml-2 text-xs text-coffee-400 font-mono">{c.phone}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] bg-coffee-50 text-coffee-400 font-bold px-2 py-0.5 rounded-full">購買 {c.totalPurchaseCount} 次</span>
                  </div>
                </div>
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 mb-0.5">
                    {c.tags.filter(t => t !== '奧客').map(t => <span key={t} className="text-[9px] bg-coffee-100 text-coffee-600 px-1.5 py-0.5 rounded-md font-bold">{t}</span>)}
                  </div>
                )}
                {c.email && <div className="text-[10px] text-coffee-400 mt-0.5">{c.email}</div>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
