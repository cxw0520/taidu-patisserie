import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Award, ShieldAlert, LogIn, Loader2 } from 'lucide-react';
import StaffPortal from './StaffPortal.tsx';
import AdminConsole from './AdminConsole.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { db, getTaiduApp } from '../../lib/firebase';
import { 
  getFirestore, collection, doc, query, where, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch 
} from 'firebase/firestore';

export interface Employee {
  id: string;
  name: string;
  role: string;
  hours: number;
  progress: Record<string, number>; // recipeId -> progress (0 to 100)
  mentorName?: string;             // Mentor name
  apprentices?: string[];          // Apprentices list
  canAccessAdmin?: boolean;        // Permission: Can access back-end Admin Console
  canOrder?: boolean;              // Permission: Can place material orders
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

export interface HistoricalOrder {
  id: string;
  date: string;
  supplier: string;
  items: Array<{
    name: string;
    qty: number;
    cost: number;
  }>;
  orderedBy: string;
}

// Access the default database for taidu-HR cross-project schedule imports
const hrDb = getFirestore(getTaiduApp(), '(default)');

export default function SchedulerApp({ onBack, shopId }: { onBack: () => void, shopId: string }) {
  const [currentView, setCurrentView] = useState<'staff' | 'admin'>('staff');
  const [loading, setLoading] = useState(true);

  // Global State pointing to Firestore collections
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [orderHistory, setOrderHistory] = useState<HistoricalOrder[]>([]);
  const [hrSchedules, setHrSchedules] = useState<any[]>([]);

  const [currentEmpId, setCurrentEmpId] = useState<string>('');
  const currentDayOfWeek = new Date().getDay();

  const supplierDeliveryDays: Record<string, number[]> = {
    '德麥食品': [2, 5],
    '豐盟麵粉': [1, 4],
    '大湖草莓農場': [0, 3, 5],
    '自家生產': [0, 1, 2, 3, 4, 5, 6]
  };

  // --- 1. FIRESTORE REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    setLoading(true);

    const unsubMats = onSnapshot(collection(db, 'shops', shopId, 'materials'), (snap) => {
      const matsList: Material[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || '',
          qty: data.stock || 0,
          unit: data.unit || '',
          weeklyMinQty: data.weeklyMinQty || { 0: data.minAlert || 10, 1: data.minAlert || 5, 2: data.minAlert || 5, 3: data.minAlert || 5, 4: data.minAlert || 5, 5: data.minAlert || 8, 6: data.minAlert || 10 },
          cost: data.avgCost || 100,
          supplier: data.vendor || data.vendors?.[0] || '德麥食品',
          type: data.category === '包材' ? 'raw' : 'raw' // Default all to raw materials for simplicity
        };
      });

      // Include semi-finished materials default mapping if they aren't created in the system yet
      const defaultSemis: Material[] = [
        { id: 'mat-semi-1', name: '法式塔皮(半成品)', qty: 8, unit: '個', weeklyMinQty: { 0: 25, 1: 10, 2: 10, 3: 10, 4: 12, 5: 20, 6: 25 }, cost: 25, supplier: '自家生產', type: 'semi' },
        { id: 'mat-semi-2', name: '卡士達醬(半成品)', qty: 800, unit: 'g', weeklyMinQty: { 0: 2500, 1: 1000, 2: 1000, 3: 1000, 4: 1200, 5: 2000, 6: 2500 }, cost: 0.1, supplier: '自家生產', type: 'semi' }
      ];

      // Add default semis if missing in loaded materials
      const finalMats = [...matsList];
      defaultSemis.forEach(ds => {
        if (!finalMats.some(m => m.name === ds.name)) {
          finalMats.push(ds);
        }
      });

      setMaterials(finalMats);
    });

    const unsubRecipes = onSnapshot(collection(db, 'shops', shopId, 'recipes'), (snap) => {
      const recipesList: Recipe[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        const items = data.items || [];
        const bomList: BOMItem[] = items.map((item: any) => ({
          materialId: item.itemId || '',
          name: item.name || '',
          qty: item.quantity || 0,
          unit: item.unit || ''
        }));

        return {
          id: docSnap.id,
          name: data.name || '',
          type: data.type === 'half' ? 'semi' : 'finished',
          unlockThreshold: data.unlockThreshold || 50,
          sop: data.sop || ['步驟一', '步驟二', '步驟三'],
          bom: bomList,
          images: data.images || []
        };
      });

      // Default recipes fallback if none created in the main recipes DB
      if (recipesList.length === 0) {
        recipesList.push(
          {
            id: 'rec-1',
            name: '經典法式草莓塔',
            type: 'finished',
            unlockThreshold: 80,
            bom: [],
            sop: [
              '將法式塔皮取出，刷上少許融化巧克力防潮。',
              '使用擠花袋將香草卡士達醬均勻擠入塔皮中。',
              '將新鮮草莓洗淨去蒂、切半，螺旋狀鋪滿表面。',
              '表面刷上微溫的鏡面果膠，放上薄荷葉點綴。'
            ],
            images: ['https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&q=80&w=200']
          },
          {
            id: 'rec-2',
            name: '法式塔皮',
            type: 'semi',
            unlockThreshold: 50,
            bom: [],
            sop: [
              '奶油室溫軟化後與糖粉、鹽攪拌均勻。',
              '加入蛋液充分乳化，分次篩入日本麵粉拌勻。',
              '成團後冷藏靜置2小時，取出擀平捏入塔模。',
              '170度烘烤15-18分鐘至金黃色。'
            ],
            images: ['https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&q=80&w=200']
          }
        );
      }

      setRecipes(recipesList);
    });

    const unsubEmployees = onSnapshot(collection(db, 'shops', shopId, 'scheduler_employees'), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      if (records.length === 0) {
        // Initialize default mock employees list on first launch
        const defaults: Employee[] = [
          { id: 'emp-1', name: '小王', role: '正職主廚', hours: 8, progress: { 'rec-1': 95, 'rec-2': 40 }, mentorName: undefined, apprentices: ['阿明', '小芳'], canAccessAdmin: true, canOrder: true },
          { id: 'emp-2', name: '阿明', role: '烘焙助手', hours: 8, progress: { 'rec-1': 85, 'rec-2': 90 }, mentorName: '小王', apprentices: [], canAccessAdmin: false, canOrder: true },
          { id: 'emp-3', name: '小芳', role: '兼職實習生', hours: 6, progress: { 'rec-1': 30, 'rec-2': 10 }, mentorName: '小王', apprentices: [], canAccessAdmin: false, canOrder: false },
        ];
        defaults.forEach(async (e) => {
          await setDoc(doc(db, 'shops', shopId, 'scheduler_employees', e.id), e);
        });
        setEmployees(defaults);
        setCurrentEmpId('emp-1');
      } else {
        setEmployees(records);
        if (!currentEmpId) {
          setCurrentEmpId(records[0].id);
        }
        // Self-healing: Ensure there is always at least one administrator account in the workspace
        if (!records.some(e => e.canAccessAdmin)) {
          const targetId = records[0].id;
          updateDoc(doc(db, 'shops', shopId, 'scheduler_employees', targetId), { canAccessAdmin: true });
        }
      }
    });

    const unsubTasks = onSnapshot(collection(db, 'shops', shopId, 'scheduler_tasks'), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionTask));
      if (records.length === 0) {
        const defaults: ProductionTask[] = [
          { id: 'tsk-1', name: '經典法式草莓塔', qty: 12, unit: '個', assignedTo: '小王', status: 'pending', requiredTimeHours: 2.5, startTime: null, actualTimeHours: null, operator: null },
          { id: 'tsk-2', name: '法式塔皮(半成品)', qty: 24, unit: '個', assignedTo: '阿明', status: 'pending', requiredTimeHours: 3.5, startTime: null, actualTimeHours: null, operator: null }
        ];
        defaults.forEach(async (t) => {
          await setDoc(doc(db, 'shops', shopId, 'scheduler_tasks', t.id), t);
        });
        setTasks(defaults);
      } else {
        setTasks(records);
      }
    });

    const unsubPurchases = onSnapshot(collection(db, 'shops', shopId, 'scheduler_purchases'), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRecord));
      setPurchases(records);
    });

    const unsubHistory = onSnapshot(collection(db, 'shops', shopId, 'scheduler_history'), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as HistoricalOrder));
      setOrderHistory(records);
      setLoading(false);
    });

    const unsubHrSchedules = onSnapshot(collection(db, 'shops', shopId, 'scheduler_hr_schedules'), (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHrSchedules(records);
    });

    return () => {
      unsubMats();
      unsubRecipes();
      unsubEmployees();
      unsubTasks();
      unsubPurchases();
      unsubHistory();
      unsubHrSchedules();
    };
  }, [shopId]);

  // Dynamic BOM Item mapping based on materials and recipes loaded
  useEffect(() => {
    if (recipes.length > 0 && materials.length > 0) {
      setRecipes(prevRecipes => {
        let changed = false;
        const mapped = prevRecipes.map(r => {
          let currentBom = r.bom || [];
          
          if (currentBom.length === 0) {
            if (r.name === '經典法式草莓塔') {
              currentBom = [
                { materialId: 'mat-semi-1', name: '法式塔皮(半成品)', qty: 1, unit: '個' },
                { materialId: 'mat-semi-2', name: '卡士達醬(半成品)', qty: 80, unit: 'g' },
                { materialId: 'mat-3', name: '新鮮草莓', qty: 6, unit: '顆' }
              ];
            } else if (r.name === '法式塔皮') {
              currentBom = [
                { materialId: 'mat-1', name: '日本麵粉', qty: 0.05, unit: 'kg' },
                { materialId: 'mat-2', name: '法國發酵奶油', qty: 0.03, unit: 'kg' }
              ];
            }
          }

          const resolvedBom = currentBom.map(b => {
            const matchedMat = materials.find(m => m.id === b.materialId || m.name === b.name);
            return {
              materialId: matchedMat ? matchedMat.id : b.materialId,
              name: matchedMat ? matchedMat.name : (prevRecipes.find(rec => rec.id === b.materialId)?.name || b.name),
              qty: b.qty,
              unit: matchedMat ? matchedMat.unit : b.unit
            };
          });

          const isDifferent = JSON.stringify(r.bom) !== JSON.stringify(resolvedBom);
          if (isDifferent) {
            changed = true;
            return { ...r, bom: resolvedBom };
          }
          return r;
        });

        return changed ? mapped : prevRecipes;
      });
    }
  }, [materials]);

  // --- 2. STATE CALLBACK WRITE TO FIRESTORE ---

  // Start production timer for task
  const handleStartTask = async (taskId: string, operatorName: string) => {
    try {
      await updateDoc(doc(db, 'shops', shopId, 'scheduler_tasks', taskId), {
        status: 'inprogress',
        startTime: new Date().toISOString(),
        operator: operatorName
      });
    } catch (err) {
      console.error("Start task error:", err);
    }
  };

  // Complete/Rollback task with ERP inventory synchronization
  const handleCompleteTask = async (
    taskId: string, 
    actualHours?: number, 
    shortageOption: 'deconstruct' | 'negative' = 'negative'
  ) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    try {
      const batch = writeBatch(db);

      // CASE 1: Rolling back from Completed -> Pending
      if (targetTask.status === 'completed') {
        batch.update(doc(db, 'shops', shopId, 'scheduler_tasks', taskId), {
          status: 'pending',
          startTime: null,
          actualTimeHours: null,
          operator: null,
          overtimeTriggered: false
        });

        // Add deducted ingredients back in materials collection
        const recipe = recipes.find(r => r.name === targetTask.name || (r.name + '(半成品)') === targetTask.name);
        if (recipe) {
          recipe.bom.forEach(bom => {
            const mat = materials.find(m => m.id === bom.materialId);
            if (mat) {
              const deduction = bom.qty * targetTask.qty;
              batch.update(doc(db, 'shops', shopId, 'materials', mat.id), {
                stock: parseFloat((mat.qty + deduction).toFixed(2))
              });
            }
          });
        }

        // Deduct the finished product quantity that was simulated as produced
        const matchProd = materials.find(m => m.name === targetTask.name || m.name === (targetTask.name + '(半成品)') || (m.name + '(半成品)') === targetTask.name);
        if (matchProd) {
          batch.update(doc(db, 'shops', shopId, 'materials', matchProd.id), {
            stock: Math.max(0, parseFloat((matchProd.qty - targetTask.qty).toFixed(2)))
          });
        }

        await batch.commit();
        return;
      }

      // CASE 2: Completing the task (InProgress -> Completed)
      const finalHours = actualHours !== undefined ? actualHours : targetTask.requiredTimeHours;
      const isOvertime = finalHours > targetTask.requiredTimeHours;

      batch.update(doc(db, 'shops', shopId, 'scheduler_tasks', taskId), {
        status: 'completed',
        actualTimeHours: finalHours,
        overtimeTriggered: isOvertime
      });

      const recipe = recipes.find(r => r.name === targetTask.name || (r.name + '(半成品)') === targetTask.name);

      // Determine stock deconstruct options
      let requiresShortageHandling = false;
      let shortageMaterialId = '';
      let shortageAmount = 0;

      if (recipe && shortageOption === 'deconstruct') {
        recipe.bom.forEach(bom => {
          const mat = materials.find(m => m.id === bom.materialId);
          if (mat && mat.type === 'semi' && mat.qty < (bom.qty * targetTask.qty)) {
            requiresShortageHandling = true;
            shortageMaterialId = mat.id;
            shortageAmount = (bom.qty * targetTask.qty) - mat.qty;
          }
        });
      }

      materials.forEach(mat => {
        if (recipe) {
          const bomMatch = recipe.bom.find(b => b.materialId === mat.id);
          if (bomMatch) {
            // Option A (deconstruct)
            if (requiresShortageHandling && mat.id === shortageMaterialId) {
              batch.update(doc(db, 'shops', shopId, 'materials', mat.id), { stock: 0 });
              return;
            }

            if (requiresShortageHandling) {
              const semiRecipe = recipes.find(r => r.name === bomMatch.name || (r.name + '(半成品)') === bomMatch.name);
              if (semiRecipe) {
                const semiBomMatch = semiRecipe.bom.find(sb => sb.materialId === mat.id);
                if (semiBomMatch) {
                  const normalDeduction = (recipe.bom.find(b => b.materialId === mat.id)?.qty || 0) * targetTask.qty;
                  const deconstructedDeduction = semiBomMatch.qty * shortageAmount;
                  batch.update(doc(db, 'shops', shopId, 'materials', mat.id), {
                    stock: Math.max(0, parseFloat((mat.qty - (normalDeduction + deconstructedDeduction)).toFixed(2)))
                  });
                  return;
                }
              }
            }

            // Normal deduction
            const deduction = bomMatch.qty * targetTask.qty;
            const newQty = mat.qty - deduction;
            const finalQty = mat.type === 'raw' ? Math.max(0, newQty) : newQty;
            batch.update(doc(db, 'shops', shopId, 'materials', mat.id), {
              stock: parseFloat(finalQty.toFixed(2))
            });
          }
        }

        // Increase stock for the produced product
        const isProducedSemi = mat.name === targetTask.name || mat.name === (targetTask.name + '(半成品)') || (mat.name + '(半成品)') === targetTask.name;
        if (isProducedSemi) {
          batch.update(doc(db, 'shops', shopId, 'materials', mat.id), {
            stock: parseFloat((mat.qty + targetTask.qty).toFixed(2))
          });
        }
      });

      await batch.commit();
    } catch (err) {
      console.error("Complete task error:", err);
    }
  };

  // Sign off purchase order and increment stock in the materials collection
  const handleReceivePurchase = async (purchaseId: string, signedByName: string) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase || purchase.status === 'received') return;

    try {
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'shops', shopId, 'scheduler_purchases', purchaseId), {
        status: 'received',
        signedBy: signedByName
      });

      const matchedMat = materials.find(m => m.name === purchase.materialName);
      if (matchedMat) {
        batch.update(doc(db, 'shops', shopId, 'materials', matchedMat.id), {
          stock: parseFloat((matchedMat.qty + purchase.qty).toFixed(2))
        });
      }

      await batch.commit();
    } catch (err) {
      console.error("Receive purchase error:", err);
    }
  };

  // Real-time integration: Import actual schedule from taidu-HR (default database)
  const handleImportHRSchedules = async () => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const monthPrefix = `${year}-${month}`; // e.g. "2026-07"
      
      const q = query(
        collection(hrDb, 'schedules'),
        where('date', '>=', `${monthPrefix}-01`),
        where('date', '<=', `${monthPrefix}-31`),
        where('status', '==', '已確認')
      );

      const snap = await getDocs(q);
      const importedRecords = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

      if (importedRecords.length === 0) {
        alert(`ℹ️ taidu-HR 資料庫中，${monthPrefix} 月份尚未排定已確認之班表。系統將自動導入模擬月份班表進行展示！`);
        // Fallback simulated updates
        const batch = writeBatch(db);
        const mockSchedules = [
          { id: 'hr-mock-1', empName: '小王', date: `${monthPrefix}-28`, shift: '早班 (09:00 - 18:00)' },
          { id: 'hr-mock-2', empName: '阿明', date: `${monthPrefix}-28`, shift: '早班 (09:00 - 18:00)' },
          { id: 'hr-mock-3', empName: '小芳', date: `${monthPrefix}-28`, shift: '兼職 (12:00 - 18:00)' },
          { id: 'hr-mock-4', empName: '小王', date: `${monthPrefix}-29`, shift: '早班 (09:00 - 18:00)' },
          { id: 'hr-mock-5', empName: '阿明', date: `${monthPrefix}-29`, shift: '早班 (09:00 - 18:00)' }
        ];
        mockSchedules.forEach(ms => {
          batch.set(doc(db, 'shops', shopId, 'scheduler_hr_schedules', ms.id), ms);
        });
        // Set today's hours defaults
        employees.forEach(emp => {
          batch.update(doc(db, 'shops', shopId, 'scheduler_employees', emp.id), { hours: emp.name === '小芳' ? 6 : 8 });
        });
        await batch.commit();
        return;
      }

      const batch = writeBatch(db);
      
      // Update the scheduler_hr_schedules cache in Firestore
      importedRecords.forEach(rec => {
        batch.set(doc(db, 'shops', shopId, 'scheduler_hr_schedules', rec.id), {
          id: rec.id,
          empName: (rec as any).empName || '',
          date: (rec as any).date || '',
          shift: (rec as any).shift || ''
        });
      });

      // Update today's employee working hours based on imported month's records matching today's date
      const todayStr = today.toISOString().split('T')[0];
      employees.forEach(emp => {
        const todaySched = importedRecords.find(r => ((r as any).empName === emp.name || (r as any).employeeId === emp.id) && (r as any).date === todayStr);
        if (todaySched) {
          const shiftStr = (todaySched as any).shift || '';
          const match = shiftStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
          let hours = 8;
          if (match) {
            const startH = parseInt(match[1]);
            const startM = parseInt(match[2]);
            const endH = parseInt(match[3]);
            const endM = parseInt(match[4]);
            let diffMins = (endH * 60 + endM) - (startH * 60 + startM);
            if (diffMins < 0) diffMins += 24 * 60;
            let calculatedHours = diffMins / 60;
            if (calculatedHours >= 8) calculatedHours -= 1; // 1h break
            hours = parseFloat(calculatedHours.toFixed(1));
          }
          batch.update(doc(db, 'shops', shopId, 'scheduler_employees', emp.id), { hours });
        }
      });

      await batch.commit();
      alert(`🎉 成功！已從 taidu-HR 資料庫讀取並儲存整個月份的排班，共匯入 ${importedRecords.length} 筆月班表資料。今日工時產能已同步完成。`);
    } catch (err: any) {
      console.error("HR schedules monthly import error:", err);
      alert(`⚠️ 班表載入失敗，錯誤原因: ${err.message || err}`);
    }
  };

  const handleResetAdmin = async () => {
    try {
      const chef: Employee = {
        id: 'emp-1',
        name: '小王',
        role: '正職主廚',
        hours: 8,
        progress: { 'rec-1': 95, 'rec-2': 40 },
        apprentices: ['阿明', '小芳'],
        canAccessAdmin: true,
        canOrder: true
      };
      await setDoc(doc(db, 'shops', shopId, 'scheduler_employees', chef.id), chef);
      setCurrentEmpId('emp-1');
      alert("🎉 已成功復原「小王 (正職主廚)」為系統管理員帳號！您現在可以模擬切換至小王，並順利切換至後台進行管理。");
    } catch (err: any) {
      alert("復原失敗: " + err.message);
    }
  };

  const currentEmployee = employees.find(e => e.id === currentEmpId) || employees[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-600 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-wider text-stone-400">正在加載生產與排程數據...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#fbf9f4] via-[#f7f3e9] to-[#ffffff] text-stone-800 font-sans antialiased">
      {/* Top Banner Control */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-30 border-b border-stone-200/60 shadow-sm px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl hover:bg-stone-100/80 border border-stone-200 text-stone-600 transition flex items-center justify-center animate-pulse"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-stone-800 tracking-wide">生產與排班管理系統</h2>
            <p className="text-xs text-stone-500 font-medium">麵包房與烘焙工坊營運模組 • 專業權限版</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-4">
          {/* Mock Authentication Switcher */}
          {employees.length > 0 && (
            <div className="flex items-center gap-2 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200 text-xs">
              <LogIn className="w-3.5 h-3.5 text-stone-400" />
              <span className="font-bold text-stone-600">模擬登入身分:</span>
              <select
                value={currentEmpId}
                onChange={(e) => {
                  setCurrentEmpId(e.target.value);
                  const newEmp = employees.find(emp => emp.id === e.target.value);
                  if (newEmp && !newEmp.canAccessAdmin) {
                    setCurrentView('staff');
                  }
                }}
                className="bg-transparent font-bold text-stone-800 outline-none cursor-pointer"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
              <button
                onClick={handleResetAdmin}
                className="ml-1 px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-stone-200 rounded-lg font-bold transition flex items-center gap-1 shrink-0"
                title="復原管理員帳號"
              >
                🔑 復原管理員
              </button>
            </div>
          )}

          {/* Tab switchers */}
          <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-stone-200">
            <button
              onClick={() => setCurrentView('staff')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentView === 'staff'
                  ? 'bg-white text-stone-800 shadow-md shadow-stone-200/50'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Award className="w-4 h-4 text-amber-500" />
              前台員工工作區
            </button>
            
            {currentEmployee?.canAccessAdmin ? (
              <button
                onClick={() => setCurrentView('admin')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  currentView === 'admin'
                    ? 'bg-white text-stone-800 shadow-md shadow-stone-200/50'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Users className="w-4 h-4 text-blue-500" />
                後台管理控制台
              </button>
            ) : (
              <div className="px-4 py-2 text-xs text-stone-400 font-medium flex items-center gap-1 cursor-not-allowed">
                <ShieldAlert className="w-4 h-4" /> 權限受限
              </div>
            )}
          </div>
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
                currentLoggedInEmpId={currentEmpId}
                onAddPurchaseOrders={async (newPOs) => {
                  newPOs.forEach(async (po) => {
                    await setDoc(doc(db, 'shops', shopId, 'scheduler_purchases', po.id), po);
                  });
                }}
                onAddHistoricalOrder={async (newHist) => {
                  await setDoc(doc(db, 'shops', shopId, 'scheduler_history', newHist.id), newHist);
                }}
                onUpdateProgress={async (empId, recId, score) => {
                  await updateDoc(doc(db, 'shops', shopId, 'scheduler_employees', empId), {
                    [`progress.${recId}`]: score
                  });
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
                orderHistory={orderHistory}
                supplierDeliveryDays={supplierDeliveryDays}
                currentDayOfWeek={currentDayOfWeek}
                onUpdateEmployees={async (val) => {
                  try {
                    const list = typeof val === 'function' ? val(employees) : val;
                    const idsInNewList = new Set(list.map(e => e.id));
                    
                    // Call deleteDoc for any employee document that was removed in state
                    for (const emp of employees) {
                      if (!idsInNewList.has(emp.id)) {
                        await deleteDoc(doc(db, 'shops', shopId, 'scheduler_employees', emp.id));
                      }
                    }

                    // Save / update rest of the documents
                    for (const e of list) {
                      const cleanE = JSON.parse(JSON.stringify(e));
                      await setDoc(doc(db, 'shops', shopId, 'scheduler_employees', e.id), cleanE);
                    }
                  } catch (err: any) {
                    console.error("onUpdateEmployees failed:", err);
                    alert("⚠️ 帳號操作失敗！請確認您已登入 Google 帳號，且擁有該店鋪的管理或寫入權限。\n錯誤原因: " + (err.message || err));
                  }
                }}
                onUpdateMaterials={async (val) => {
                  const list = typeof val === 'function' ? val(materials) : val;
                  list.forEach(async (m) => {
                    // Update main ERP material collections (vendors, minAlert, stock)
                    await updateDoc(doc(db, 'shops', shopId, 'materials', m.id), {
                      stock: m.qty,
                      weeklyMinQty: m.weeklyMinQty,
                      vendor: m.supplier
                    });
                  });
                }}
                onUpdateRecipes={async (val) => {
                  try {
                    const list = typeof val === 'function' ? val(recipes) : val;
                    const idsInNewList = new Set(list.map(r => r.id));
                    
                    // Call deleteDoc for any recipe document that was removed in state
                    for (const r of recipes) {
                      if (!idsInNewList.has(r.id)) {
                        await deleteDoc(doc(db, 'shops', shopId, 'recipes', r.id));
                      }
                    }

                    // Save / update rest of the documents
                    for (const r of list) {
                      const cleanR = {
                        name: r.name || '',
                        type: r.type === 'semi' ? 'half' : 'finished',
                        unlockThreshold: r.unlockThreshold || 50,
                        sop: r.sop || [],
                        images: r.images || [],
                        items: (r.bom || []).map(b => ({
                          itemId: b.materialId,
                          name: b.name,
                          quantity: b.qty,
                          unit: b.unit
                        }))
                      };
                      await setDoc(doc(db, 'shops', shopId, 'recipes', r.id), cleanR, { merge: true });
                    }
                  } catch (err: any) {
                    console.error("onUpdateRecipes failed:", err);
                    alert("⚠️ 儲存配方或刪除失敗！\n錯誤原因: " + (err.message || err));
                  }
                }}
                onUpdateTasks={async (val) => {
                  const list = typeof val === 'function' ? val(tasks) : val;
                  list.forEach(async (t) => {
                    await setDoc(doc(db, 'shops', shopId, 'scheduler_tasks', t.id), t);
                  });
                }}
                onUpdatePurchases={async (val) => {
                  const list = typeof val === 'function' ? val(purchases) : val;
                  list.forEach(async (po) => {
                    await setDoc(doc(db, 'shops', shopId, 'scheduler_purchases', po.id), po);
                  });
                }}
                onUpdateHistory={async (val) => {
                  const list = typeof val === 'function' ? val(orderHistory) : val;
                  list.forEach(async (h) => {
                    await setDoc(doc(db, 'shops', shopId, 'scheduler_history', h.id), h);
                  });
                }}
                onImportHR={handleImportHRSchedules}
                hrSchedules={hrSchedules}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
