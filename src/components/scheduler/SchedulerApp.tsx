import React, { useState } from 'react';
import { ArrowLeft, Users, Award } from 'lucide-react';
import StaffPortal from './StaffPortal.tsx';
import AdminConsole from './AdminConsole.tsx';
import { motion, AnimatePresence } from 'motion/react';

export interface Employee {
  id: string;
  name: string;
  role: string;
  hours: number;
  progress: Record<string, number>; // recipeId -> progress (0 to 100)
  mentorName?: string;             // Mentor name
  apprentices?: string[];          // Apprentices list
}

export interface BOMItem {
  materialId: string;
  name: string;
  qty: number;
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  type: 'finished' | 'semi';
  unlockThreshold: number; // required progress level to view recipe (e.g. 80)
  bom: BOMItem[];
  sop: string[];
  images?: string[];       // SOP image urls mock
}

export interface Material {
  id: string;
  name: string;
  qty: number;
  unit: string;
  weeklyMinQty: Record<number, number>; // Day of week (0-6) -> minQty
  cost: number;
  supplier: string;
  type: 'raw' | 'semi';
}

export interface ProductionTask {
  id: string;
  name: string;
  qty: number;
  unit: string;
  assignedTo: string;
  status: 'pending' | 'inprogress' | 'completed';
  requiredTimeHours: number;
  startTime?: string | null;         // ISO string
  actualTimeHours?: number | null;
  operator?: string | null;
  overtimeTriggered?: boolean;
}

export interface PurchaseRecord {
  id: string;
  materialName: string;
  qty: number;
  cost: number;
  supplier: string;
  status: 'pending' | 'received';
  date: string;
  expectedDate: string;             // Expected Delivery Date
  paymentMethod: 'monthly' | 'cash'; // Payment methods: monthly bill or COD cash
  signedBy?: string | null;
}

export default function SchedulerApp({ onBack, shopId }: { onBack: () => void, shopId: string }) {
  const [currentView, setCurrentView] = useState<'staff' | 'admin'>('staff');

  // Simulated Global State for Pastry Scheduling & Training Portal
  const [employees, setEmployees] = useState<Employee[]>([
    { id: 'emp-1', name: '小王', role: '正職主廚', hours: 8, progress: { 'rec-1': 95, 'rec-2': 40, 'rec-3': 10 }, mentorName: undefined, apprentices: ['阿明', '小芳'] },
    { id: 'emp-2', name: '阿明', role: '烘焙助手', hours: 8, progress: { 'rec-1': 85, 'rec-2': 90, 'rec-3': 20 }, mentorName: '小王', apprentices: [] },
    { id: 'emp-3', name: '小芳', role: '兼職實習生', hours: 6, progress: { 'rec-1': 30, 'rec-2': 10, 'rec-3': 0 }, mentorName: '小王', apprentices: [] },
  ]);

  const [materials, setMaterials] = useState<Material[]>([
    { id: 'mat-1', name: '日本麵粉', qty: 25, unit: 'kg', weeklyMinQty: { 0: 20, 1: 10, 2: 10, 3: 10, 4: 10, 5: 15, 6: 20 }, cost: 180, supplier: '豐盟麵粉', type: 'raw' },
    { id: 'mat-2', name: '法國發酵奶油', qty: 15, unit: 'kg', weeklyMinQty: { 0: 15, 1: 8, 2: 8, 3: 8, 4: 8, 5: 12, 6: 15 }, cost: 420, supplier: '德麥食品', type: 'raw' },
    { id: 'mat-3', name: '新鮮草莓', qty: 4, unit: '盒', weeklyMinQty: { 0: 8, 1: 4, 2: 4, 3: 4, 4: 5, 5: 6, 6: 8 }, cost: 250, supplier: '大湖草莓農場', type: 'raw' },
    { id: 'mat-4', name: '馬達加斯加香草莢', qty: 30, unit: '支', weeklyMinQty: { 0: 20, 1: 15, 2: 15, 3: 15, 4: 15, 5: 18, 6: 20 }, cost: 120, supplier: '德麥食品', type: 'raw' },
    { id: 'mat-5', name: '法式塔皮(半成品)', qty: 8, unit: '個', weeklyMinQty: { 0: 25, 1: 10, 2: 10, 3: 10, 4: 12, 5: 20, 6: 25 }, cost: 25, supplier: '自家生產', type: 'semi' },
    { id: 'mat-6', name: '卡士達醬(半成品)', qty: 800, unit: 'g', weeklyMinQty: { 0: 2500, 1: 1000, 2: 1000, 3: 1000, 4: 1200, 5: 2000, 6: 2500 }, cost: 0.1, supplier: '自家生產', type: 'semi' },
  ]);

  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: 'rec-1',
      name: '經典法式草莓塔',
      type: 'finished',
      unlockThreshold: 80,
      bom: [
        { materialId: 'mat-5', name: '法式塔皮(半成品)', qty: 1, unit: '個' },
        { materialId: 'mat-6', name: '卡士達醬(半成品)', qty: 80, unit: 'g' },
        { materialId: 'mat-3', name: '新鮮草莓', qty: 6, unit: '顆' }
      ],
      sop: [
        '將法式塔皮取出，刷上少許融化巧克力防潮。',
        '使用擠花袋將香草卡士達醬均勻擠入塔皮中。',
        '將新鮮草莓洗淨去蒂、切半，螺旋狀鋪滿表面。',
        '表面刷上微溫的鏡面果膠，放上薄荷葉點綴。'
      ],
      images: [
        'https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&q=80&w=200', // Mock Image 1
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&q=80&w=200'  // Mock Image 2
      ]
    },
    {
      id: 'rec-2',
      name: '法式塔皮',
      type: 'semi',
      unlockThreshold: 50,
      bom: [
        { materialId: 'mat-1', name: '日本麵粉', qty: 0.05, unit: 'kg' },
        { materialId: 'mat-2', name: '法國發酵奶油', qty: 0.03, unit: 'kg' }
      ],
      sop: [
        '奶油室溫軟化後與糖粉、鹽攪拌均勻。',
        '加入蛋液充分乳化，分次篩入日本麵粉拌勻。',
        '成團後冷藏靜置2小時，取出擀平捏入塔模。',
        '170度烘烤15-18分鐘至金黃色。'
      ],
      images: ['https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&q=80&w=200']
    },
    {
      id: 'rec-3',
      name: '香草卡士達醬',
      type: 'semi',
      unlockThreshold: 60,
      bom: [
        { materialId: 'mat-4', name: '馬達加斯加香草莢', qty: 0.1, unit: '支' },
        { materialId: 'mat-2', name: '法國發酵奶油', qty: 0.01, unit: 'kg' }
      ],
      sop: [
        '剖開香草莢取出香草籽，與鮮奶共同加熱至微滾。',
        '蛋黃與細砂糖攪拌至發白，加入低筋麵粉拌勻。',
        '將熱牛奶緩緩倒入蛋黃糊中，過濾回鍋中。',
        '中火加熱持續攪拌至濃稠離火，拌入冰奶油冷卻。'
      ],
      images: ['https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=200']
    }
  ]);

  const [tasks, setTasks] = useState<ProductionTask[]>([
    { id: 'tsk-1', name: '經典法式草莓塔', qty: 12, unit: '個', assignedTo: '小王', status: 'pending', requiredTimeHours: 2.5, startTime: null, actualTimeHours: null, operator: null },
    { id: 'tsk-2', name: '法式塔皮(半成品)', qty: 24, unit: '個', assignedTo: '阿明', status: 'pending', requiredTimeHours: 3.5, startTime: null, actualTimeHours: null, operator: null },
    { id: 'tsk-3', name: '香草卡士達醬(半成品)', qty: 1500, unit: 'g', assignedTo: '阿明', status: 'pending', requiredTimeHours: 2.0, startTime: null, actualTimeHours: null, operator: null },
    { id: 'tsk-4', name: '當日開店備料', qty: 1, unit: '次', assignedTo: '小芳', status: 'pending', requiredTimeHours: 1.5, startTime: null, actualTimeHours: null, operator: null }
  ]);

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([
    { id: 'pur-1', materialName: '新鮮草莓', qty: 10, cost: 2500, supplier: '大湖草莓農場', status: 'pending', date: '2026-07-25', expectedDate: '2026-07-25', paymentMethod: 'cash', signedBy: null },
    { id: 'pur-2', materialName: '法國發酵奶油', qty: 20, cost: 8400, supplier: '德麥食品', status: 'received', date: '2026-07-24', expectedDate: '2026-07-24', paymentMethod: 'monthly', signedBy: '小王' }
  ]);

  // Start production timer for task
  const handleStartTask = (taskId: string, operatorName: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'inprogress',
          startTime: new Date().toISOString(),
          operator: operatorName
        };
      }
      return t;
    }));
  };

  // Complete/Rollback task with inventory management
  const handleCompleteTask = (
    taskId: string, 
    actualHours?: number, 
    shortageOption: 'deconstruct' | 'negative' = 'negative'
  ) => {
    setTasks(prevTasks => {
      const idx = prevTasks.findIndex(t => t.id === taskId);
      if (idx === -1) return prevTasks;
      
      const targetTask = prevTasks[idx];
      const updated = [...prevTasks];

      // CASE 1: Rolling back from Completed -> Pending
      if (targetTask.status === 'completed') {
        const rollbackTask = { ...targetTask, status: 'pending' as const, startTime: null, actualTimeHours: null, operator: null, overtimeTriggered: false };
        updated[idx] = rollbackTask;

        // Restore inventory (add deducted ingredients back)
        const recipe = recipes.find(r => r.name === targetTask.name || (r.name + '(半成品)') === targetTask.name);
        setMaterials(prevMats => {
          return prevMats.map(mat => {
            if (recipe) {
              const bomMatch = recipe.bom.find(b => b.materialId === mat.id);
              if (bomMatch) {
                const deduction = bomMatch.qty * targetTask.qty;
                return { ...mat, qty: parseFloat((mat.qty + deduction).toFixed(2)) };
              }
            }
            // Deduct the finished product quantity that was simulated as produced
            const isProducedSemi = mat.name === targetTask.name || mat.name === (targetTask.name + '(半成品)') || (mat.name + '(半成品)') === targetTask.name;
            if (isProducedSemi) {
              return { ...mat, qty: Math.max(0, parseFloat((mat.qty - targetTask.qty).toFixed(2))) };
            }
            return mat;
          });
        });

        return updated;
      }

      // CASE 2: Completing the task (InProgress -> Completed)
      const finalHours = actualHours !== undefined ? actualHours : targetTask.requiredTimeHours;
      const isOvertime = finalHours > targetTask.requiredTimeHours;

      const completedTask = {
        ...targetTask,
        status: 'completed' as const,
        actualTimeHours: finalHours,
        overtimeTriggered: isOvertime
      };
      updated[idx] = completedTask;

      const recipe = recipes.find(r => r.name === targetTask.name || (r.name + '(半成品)') === targetTask.name);

      setMaterials(prevMats => {
        // Evaluate stock availability of semi-finished items
        let requiresShortageHandling = false;
        let shortageMaterialId = '';
        let shortageAmount = 0;

        if (recipe && shortageOption === 'deconstruct') {
          recipe.bom.forEach(bom => {
            const mat = prevMats.find(m => m.id === bom.materialId);
            if (mat && mat.type === 'semi' && mat.qty < (bom.qty * targetTask.qty)) {
              requiresShortageHandling = true;
              shortageMaterialId = mat.id;
              shortageAmount = (bom.qty * targetTask.qty) - mat.qty;
            }
          });
        }

        return prevMats.map(mat => {
          if (recipe) {
            const bomMatch = recipe.bom.find(b => b.materialId === mat.id);
            if (bomMatch) {
              // Option A (deconstruct): If the shortage item is a semi-finished product, 
              // instead of deducting semi-finished item below zero, we deduct its constituent raw materials.
              if (requiresShortageHandling && mat.id === shortageMaterialId) {
                // Deduct only available stock for this semi-finished item
                return { ...mat, qty: 0 };
              }

              // Also, check if we need to deduct raw materials for the deconstructed portion
              if (requiresShortageHandling) {
                // Find the recipe of the semi-finished product to get its BOM
                const semiRecipe = recipes.find(r => r.name === bomMatch.name || (r.name + '(半成品)') === bomMatch.name);
                if (semiRecipe) {
                  const semiBomMatch = semiRecipe.bom.find(sb => sb.materialId === mat.id);
                  if (semiBomMatch) {
                    // Deduct: standard recipe raw materials + deconstructed portion * raw material ratios
                    const normalDeduction = (recipe.bom.find(b => b.materialId === mat.id)?.qty || 0) * targetTask.qty;
                    const deconstructedDeduction = semiBomMatch.qty * shortageAmount;
                    return { ...mat, qty: Math.max(0, parseFloat((mat.qty - (normalDeduction + deconstructedDeduction)).toFixed(2))) };
                  }
                }
              }

              // Normal deduction (Option B - allow negative, or stock is sufficient)
              const deduction = bomMatch.qty * targetTask.qty;
              const newQty = mat.qty - deduction;
              // If it's a raw material, clamp at 0. If semi-finished, Option B allows negative.
              const finalQty = mat.type === 'raw' ? Math.max(0, newQty) : newQty;
              return { ...mat, qty: parseFloat(finalQty.toFixed(2)) };
            }
          }

          // Increase stock for the produced product
          const isProducedSemi = mat.name === targetTask.name || mat.name === (targetTask.name + '(半成品)') || (mat.name + '(半成品)') === targetTask.name;
          if (isProducedSemi) {
            return { ...mat, qty: parseFloat((mat.qty + targetTask.qty).toFixed(2)) };
          }
          return mat;
        });
      });

      return updated;
    });
  };

  // Sign off purchase order
  const handleReceivePurchase = (purchaseId: string, signedByName: string) => {
    setPurchases(prevPurchases => {
      const idx = prevPurchases.findIndex(p => p.id === purchaseId);
      if (idx === -1 || prevPurchases[idx].status === 'received') return prevPurchases;

      const updated = [...prevPurchases];
      const purchase = { ...updated[idx] };
      purchase.status = 'received';
      purchase.signedBy = signedByName;
      updated[idx] = purchase;

      // Increase stock
      setMaterials(prevMats => {
        return prevMats.map(mat => {
          if (mat.name === purchase.materialName) {
            return { ...mat, qty: parseFloat((mat.qty + purchase.qty).toFixed(2)) };
          }
          return mat;
        });
      });

      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#fbf9f4] via-[#f7f3e9] to-[#ffffff] text-stone-800 font-sans antialiased">
      {/* Top Banner Control */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-30 border-b border-stone-200/60 shadow-sm px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl hover:bg-stone-100/80 border border-stone-200 text-stone-600 transition flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-stone-800 tracking-wide">生產與排班管理系統</h2>
            <p className="text-xs text-stone-500 font-medium">麵包房與烘焙工坊營運模組 • 專業版</p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-stone-200">
          <button
            onClick={() => setCurrentView('staff')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              currentView === 'staff'
                ? 'bg-white text-stone-800 shadow-md shadow-stone-200/50'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Award className="w-4 h-4 text-amber-500" />
            前台員工工作區
          </button>
          <button
            onClick={() => setCurrentView('admin')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              currentView === 'admin'
                ? 'bg-white text-stone-800 shadow-md shadow-stone-200/50'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Users className="w-4 h-4 text-blue-500" />
            後台管理控制台
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {currentView === 'staff' ? (
            <motion.div
              key="staff"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <StaffPortal
                employees={employees}
                tasks={tasks}
                recipes={recipes}
                purchases={purchases}
                materials={materials}
                onStartTask={handleStartTask}
                onCompleteTask={handleCompleteTask}
                onReceivePurchase={handleReceivePurchase}
                onUpdateProgress={(empId, recId, score) => {
                  setEmployees(prev => prev.map(emp => {
                    if (emp.id === empId) {
                      return { ...emp, progress: { ...emp.progress, [recId]: score } };
                    }
                    return emp;
                  }));
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <AdminConsole
                employees={employees}
                materials={materials}
                recipes={recipes}
                tasks={tasks}
                purchases={purchases}
                onUpdateEmployees={setEmployees}
                onUpdateMaterials={setMaterials}
                onUpdateRecipes={setRecipes}
                onUpdateTasks={setTasks}
                onUpdatePurchases={setPurchases}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
