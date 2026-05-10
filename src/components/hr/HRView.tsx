import React, { useState } from 'react';
import { Operator, Settings } from '../../types';
import { cn } from '../../lib/utils';
import { Calendar, Clock, DollarSign, Users } from 'lucide-react';
import RosterTab from './RosterTab';
import AttendanceTab from './AttendanceTab';
import PayrollTab from './PayrollTab';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  shopId: string;
  operators: Operator[];
  settings: Settings;
  forcedSubTab?: string;
}

const TABS = [
  { id: 'roster',     label: '排班管理',     icon: Calendar   },
  { id: 'attendance', label: '出勤打卡紀錄', icon: Clock      },
  { id: 'payroll',    label: '薪資結算總表', icon: DollarSign },
];

export default function HRView({ shopId, operators, settings, forcedSubTab }: Props) {
  const [activeTab, setActiveTab] = useState<string>(forcedSubTab || 'roster');
  
  // Lifted state to maintain context across tabs
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [selectedOpId, setSelectedOpId] = useState<string>(operators[0]?.id || '');

  const handleUpdateSettings = async (patch: Partial<Settings>) => {
    const ref = doc(db, 'shops', shopId, 'meta', 'settings');
    await setDoc(ref, patch, { merge: true });
  };

  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-2xl border border-coffee-100 shadow-sm w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all',
                isActive
                  ? 'bg-coffee-800 text-white shadow-md'
                  : 'text-coffee-500 hover:text-coffee-700 hover:bg-coffee-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'roster' && (
            <RosterTab
              shopId={shopId}
              operators={operators}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              viewYear={viewYear}
              setViewYear={setViewYear}
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
            />
          )}
          {activeTab === 'attendance' && (
            <AttendanceTab
              shopId={shopId}
              operators={operators}
              settings={settings}
              viewYear={viewYear}
              setViewYear={setViewYear}
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
              selectedOpId={selectedOpId}
              setSelectedOpId={setSelectedOpId}
            />
          )}
          {activeTab === 'payroll' && (
            <PayrollTab
              shopId={shopId}
              operators={operators}
              settings={settings}
              viewYear={viewYear}
              setViewYear={setViewYear}
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
