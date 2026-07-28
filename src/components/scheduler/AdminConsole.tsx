import React, { useState } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, TrendingUp, DollarSign, Truck, ClipboardList, Check, UserCheck, HelpCircle, UserPlus, Database } from 'lucide-react';
import { Employee, Material, Recipe, ProductionTask, PurchaseRecord, HistoricalOrder, BOMItem } from './SchedulerApp';

interface AdminConsoleProps {
  employees: Employee[];
  materials: Material[];
  recipes: Recipe[];
  tasks: ProductionTask[];
  purchases: PurchaseRecord[];
  orderHistory: HistoricalOrder[];
  supplierDeliveryDays: Record<string, number[]>;
  currentDayOfWeek: number;
  onUpdateEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  onUpdateMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
  onUpdateRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  onUpdateTasks: React.Dispatch<React.SetStateAction<ProductionTask[]>>;
  onUpdatePurchases: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>;
  onUpdateHistory: React.Dispatch<React.SetStateAction<HistoricalOrder[]>>;
  onImportHR: () => void;
  hrSchedules: any[];
}

export default function AdminConsole({
  employees,
  materials,
  recipes,
  tasks,
  purchases,
  orderHistory,
  supplierDeliveryDays,
  currentDayOfWeek,
  onUpdateEmployees,
  onUpdateMaterials,
  onUpdateRecipes,
  onUpdateTasks,
  onUpdatePurchases,
  onUpdateHistory,
  onImportHR,
  hrSchedules
}: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<'scheduling' | 'bom' | 'inventory' | 'accounts' | 'history' | 'finance'>('scheduling');

  // Input states for adding new elements in mockup
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpHours, setNewEmpHours] = useState(8);
  const [newEmpRole, setNewEmpRole] = useState('烘焙助手');
  const [newEmpCanAdmin, setNewEmpCanAdmin] = useState(false);
  const [newEmpCanOrder, setNewEmpCanOrder] = useState(false);

  const [newMatName, setNewMatName] = useState('');
  const [newMatQty, setNewMatQty] = useState(10);
  const [newMatUnit, setNewMatUnit] = useState('kg');
  const [newMatCost, setNewMatCost] = useState(100);
  const [newMatSupplier, setNewMatSupplier] = useState('');

  // Editing state for weekly safety stocks
  const [editingMatId, setEditingMatId] = useState<string | null>(null);

  // Recipe editing states
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editRecipeThreshold, setEditRecipeThreshold] = useState(50);
  const [editRecipeSop, setEditRecipeSop] = useState<string[]>([]);
  const [editRecipeBom, setEditRecipeBom] = useState<BOMItem[]>([]);

  // Selected employee in back-end card to grade/mentor
  const [selectedGradingEmpId, setSelectedGradingEmpId] = useState<string>(employees[0]?.id || '');

  const today = new Date();
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth() + 1);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month - 1, 1);
    const startDayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
    const totalDays = new Date(year, month, 0).getDate();
    
    const cells: { dateStr: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ dateStr, dayNum: day });
    }
    return cells;
  };
  const daysName = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  // Calculate totals for scheduling
  const totalAvailableHours = employees.reduce((acc, curr) => acc + curr.hours, 0);
  const totalTaskHours = tasks.reduce((acc, curr) => acc + curr.requiredTimeHours, 0);

  // Financial calculations
  const totalExpenses = purchases.reduce((acc, curr) => acc + curr.cost, 0);
  const cashPayments = purchases.filter(p => p.paymentMethod === 'cash').reduce((acc, curr) => acc + curr.cost, 0);
  const monthlyPayments = purchases.filter(p => p.paymentMethod === 'monthly').reduce((acc, curr) => acc + curr.cost, 0);
  
  const pendingExpenses = purchases.filter(p => p.status === 'pending').reduce((acc, curr) => acc + curr.cost, 0);
  const accountsPayable = purchases.filter(p => p.status === 'received').reduce((acc, curr) => acc + curr.cost, 0);

  const gradingEmployee = employees.find(e => e.id === selectedGradingEmpId);

  // Automatic Scheduling logic based on priority:
  // Priority 1: urgent orders (simulate orders)
  // Priority 2: materials lowest in stock relative to today's safety threshold
  // Constraints: check employee unlock levels, enforce available work hours
  const handleAutoSchedule = () => {
    // 1) Define tasks to produce (simulated demands)
    const productionPool = [
      { name: '經典法式草莓塔', qty: 15, unit: '個', time: 3.0, recipeId: 'rec-1', isUrgent: true },
      { name: '法式塔皮(半成品)', qty: 30, unit: '個', time: 4.5, recipeId: 'rec-2', isUrgent: false },
      { name: '香草卡士達醬(半成品)', qty: 2000, unit: 'g', time: 2.5, recipeId: 'rec-3', isUrgent: false },
      { name: '經典法式草莓塔', qty: 6, unit: '個', time: 1.5, recipeId: 'rec-1', isUrgent: false }
    ];

    // Sort: Urgent first, then check which materials have the lowest stock relative to today's safety stock
    const sortedPool = [...productionPool].sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;

      // Find stock levels relative to today's threshold
      const matA = materials.find(m => m.name === a.name || m.name === (a.name + '(半成品)'));
      const matB = materials.find(m => m.name === b.name || m.name === (b.name + '(半成品)'));
      
      const thresholdA = matA ? (matA.weeklyMinQty[currentDayOfWeek] || 0) : 0;
      const thresholdB = matB ? (matB.weeklyMinQty[currentDayOfWeek] || 0) : 0;

      const deficitA = matA ? Math.max(0, thresholdA - matA.qty) : 0;
      const deficitB = matB ? Math.max(0, thresholdB - matB.qty) : 0;

      return deficitB - deficitA; // Highest deficit first
    });

    const generatedTasks: ProductionTask[] = [];
    let allocatedHours: Record<string, number> = {};
    employees.forEach(emp => { allocatedHours[emp.id] = 0; });

    // 2) Allocate tasks to qualified employees
    sortedPool.forEach((poolItem, idx) => {
      // Find employees qualified (unlocked this recipe)
      const qualifiedEmployees = employees.filter(emp => {
        const progress = emp.progress[poolItem.recipeId] || 0;
        const recipe = recipes.find(r => r.id === poolItem.recipeId);
        return recipe ? progress >= recipe.unlockThreshold : false;
      });

      // Find one employee who has remaining hours
      let assignedEmp = qualifiedEmployees.find(emp => {
        const currentUsed = allocatedHours[emp.id] || 0;
        return (currentUsed + poolItem.time) <= emp.hours;
      });

      if (assignedEmp) {
        allocatedHours[assignedEmp.id] += poolItem.time;
        generatedTasks.push({
          id: `tsk-auto-${idx}-${Date.now()}`,
          name: poolItem.name,
          qty: poolItem.qty,
          unit: poolItem.unit,
          assignedTo: assignedEmp.name,
          status: 'pending',
          requiredTimeHours: poolItem.time,
          startTime: null,
          actualTimeHours: null,
          operator: null
        });
      } else {
        // Flag warning if no qualified workers have capacity
        console.warn(`No qualified personnel with available hours to assign task: ${poolItem.name}`);
      }
    });

    // 3) Append general cleanups/openings that don't require specific training
    employees.forEach(emp => {
      const currentUsed = allocatedHours[emp.id] || 0;
      if (emp.hours - currentUsed >= 1.5) {
        generatedTasks.push({
          id: `tsk-cleanup-${emp.id}-${Date.now()}`,
          name: '庫存整理與器具清潔',
          qty: 1,
          unit: '次',
          assignedTo: emp.name,
          status: 'pending',
          requiredTimeHours: 1.5,
          startTime: null,
          actualTimeHours: null,
          operator: null
        });
        allocatedHours[emp.id] += 1.5;
      }
    });

    onUpdateTasks(generatedTasks);
    alert(`自動排班成功！已考量員工技能解鎖門檻與今日工時上限，共生成 ${generatedTasks.length} 項生產任務。`);
  };

  // Smart Reorder logic based on dynamic safety thresholds for today
  const handleSmartOrder = () => {
    const lowStockMaterials = materials.filter(m => {
      const safetyThreshold = m.weeklyMinQty[currentDayOfWeek] || 0;
      return m.qty < safetyThreshold;
    });

    if (lowStockMaterials.length === 0) {
      alert('所有原物料與半成品均高於今日安全水位，目前不需要叫貨！');
      return;
    }

    const newPurchases: PurchaseRecord[] = [];
    lowStockMaterials.forEach(mat => {
      const todaySafety = mat.weeklyMinQty[currentDayOfWeek] || 0;
      const reorderQty = parseFloat((todaySafety * 2 - mat.qty).toFixed(1));
      
      if (reorderQty > 0) {
        newPurchases.push({
          id: `pur-auto-${Date.now()}-${mat.id}`,
          materialName: mat.name,
          qty: reorderQty,
          cost: Math.round(reorderQty * mat.cost),
          supplier: mat.supplier === '自家生產' ? '原料庫房' : mat.supplier,
          status: 'pending',
          date: today.toISOString().split('T')[0],
          expectedDate: today.toISOString().split('T')[0], // Expected today
          paymentMethod: mat.cost > 1000 ? 'monthly' : 'cash', // High costs as monthly, low as cash
          signedBy: null
        });
      }
    });

    if (newPurchases.length > 0) {
      onUpdatePurchases(prev => [...newPurchases, ...prev]);
      alert(`已成功發起智能一鍵叫貨！根據今日(${daysName[currentDayOfWeek]})安全庫存水位生成 ${newPurchases.length} 筆叫貨單。`);
    }
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: newEmpName,
      role: newEmpRole,
      hours: newEmpHours,
      progress: { 'rec-1': 10, 'rec-2': 10, 'rec-3': 10 },
      mentorName: undefined,
      apprentices: [],
      canAccessAdmin: newEmpCanAdmin,
      canOrder: newEmpCanOrder
    };

    onUpdateEmployees(prev => [...prev, newEmp]);
    setNewEmpName('');
    setNewEmpCanAdmin(false);
    setNewEmpCanOrder(false);
  };

  const handleDeleteEmployee = (id: string) => {
    onUpdateEmployees(prev => prev.filter(e => e.id !== id));
  };

  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;

    const newMat: Material = {
      id: `mat-${Date.now()}`,
      name: newMatName,
      qty: newMatQty,
      unit: newMatUnit,
      // Default safety stock templates
      weeklyMinQty: { 0: 10, 1: 5, 2: 5, 3: 5, 4: 5, 5: 8, 6: 10 },
      cost: newMatCost,
      supplier: newMatSupplier || '德麥食品',
      type: 'raw'
    };

    onUpdateMaterials(prev => [...prev, newMat]);
    setNewMatName('');
    setNewMatSupplier('');
  };

  // Update employee skill rating manually in the back-end
  const handleUpdateEmpProgress = (recipeId: string, value: number) => {
    if (!selectedGradingEmpId) return;
    onUpdateEmployees(prev => prev.map(emp => {
      if (emp.id === selectedGradingEmpId) {
        return {
          ...emp,
          progress: {
            ...emp.progress,
            [recipeId]: value
          }
        };
      }
      return emp;
    }));
  };

  // Update weekly safety stock template
  const handleUpdateWeeklyThreshold = (materialId: string, day: number, value: number) => {
    onUpdateMaterials(prev => prev.map(mat => {
      if (mat.id === materialId) {
        return {
          ...mat,
          weeklyMinQty: {
            ...mat.weeklyMinQty,
            [day]: value
          }
        };
      }
      return mat;
    }));
  };

  // Assign Mentor to student
  const handleAssignMentor = (studentId: string, mentorNameStr: string) => {
    onUpdateEmployees(prev => prev.map(emp => {
      if (emp.id === studentId) {
        return { ...emp, mentorName: mentorNameStr || undefined };
      }
      // If mentor was assigned, append student name to mentor's apprentices list
      if (emp.name === mentorNameStr) {
        const student = prev.find(e => e.id === studentId);
        const currentApprentices = emp.apprentices || [];
        if (student && !currentApprentices.includes(student.name)) {
          return { ...emp, apprentices: [...currentApprentices, student.name] };
        }
      }
      return emp;
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Navigation tabs */}
      <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest">後台管理控制台</h3>
          <p className="text-xs text-stone-500 mt-1">管理排班、食譜BOM、物料預警與財務分析</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setActiveTab('scheduling')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'scheduling'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            排班與師徒考核
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'bom'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            BOM 與食譜設定
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'inventory'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            週安全水位範本
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'accounts'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            帳號與權限設定
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'history'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            歷史叫貨單
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'finance'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            財務與應付帳款
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="min-h-[550px]">
          
          {/* TAB 1: SCHEDULING & MENTOR GRADING */}
          {activeTab === 'scheduling' && (
            <div className="flex flex-col gap-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">今日總可用人力</span>
                  <span className="text-2xl font-bold text-stone-800">{employees.length} 人</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">排班總可用工時</span>
                  <span className="text-2xl font-bold text-blue-600">{totalAvailableHours} 小時</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">已分派任務總工時</span>
                  <span className="text-2xl font-bold text-stone-700">{totalTaskHours} 小時</span>
                </div>
              </div>

              {/* Calendar Grid Shift View (日曆型班表) */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-3">
                  <div>
                    <h4 className="font-bold text-stone-800 text-sm">🗓️ 已匯入之月曆型班表 (Calendar Shift Schedule)</h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">顯示本月份從 taidu-HR 資料庫中同步進來的排班網格。點擊特定日期可於下方展開明細。</p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => {
                        setViewMonth(m => {
                          if (m === 1) {
                            setViewYear(y => y - 1);
                            return 12;
                          }
                          return m - 1;
                        });
                      }}
                      className="p-1.5 px-3 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 transition"
                    >
                      ◀ 上個月
                    </button>
                    <span className="text-xs font-bold text-stone-800 font-mono bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200/50">
                      {viewYear} 年 {viewMonth} 月
                    </span>
                    <button
                      onClick={() => {
                        setViewMonth(m => {
                          if (m === 12) {
                            setViewYear(y => y + 1);
                            return 1;
                          }
                          return m + 1;
                        });
                      }}
                      className="p-1.5 px-3 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 transition"
                    >
                      下個月 ▶
                    </button>
                  </div>
                </div>

                {hrSchedules.length === 0 ? (
                  <p className="text-xs text-stone-400 italic py-6 text-center">尚未匯入月份班表，請點擊下方「匯入 taidu-HR 班表」按鈕進行同步。</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-stone-400 text-[10px] uppercase tracking-wider mb-1">
                      <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
                    </div>

                    {/* Day Cells Grid */}
                    <div className="grid grid-cols-7 gap-2">
                      {getDaysInMonth(viewYear, viewMonth).map((cell, idx) => {
                        if (!cell.dayNum) {
                          return <div key={`empty-${idx}`} className="bg-stone-50/20 rounded-xl min-h-[85px] border border-transparent" />;
                        }

                        const isSelected = selectedCalendarDate === cell.dateStr;
                        const isTodayStr = cell.dateStr === today.toISOString().split('T')[0];
                        const dayScheds = hrSchedules.filter(hs => hs.date === cell.dateStr);

                        return (
                          <div
                            key={cell.dateStr}
                            onClick={() => setSelectedCalendarDate(cell.dateStr)}
                            className={`bg-stone-50/50 p-2 rounded-xl min-h-[90px] border transition-all cursor-pointer relative flex flex-col justify-between ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50/20 shadow-sm shadow-blue-100/50'
                                : isTodayStr
                                  ? 'border-amber-400 bg-amber-50/20 shadow-sm shadow-amber-100/30'
                                  : 'border-stone-200/60 hover:bg-stone-100/50'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`font-mono text-[11px] font-bold ${
                                isTodayStr ? 'text-amber-700 bg-amber-100 px-1 rounded' : isSelected ? 'text-blue-700' : 'text-stone-400'
                              }`}>
                                {cell.dayNum}
                              </span>
                              {dayScheds.length > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              )}
                            </div>

                            <div className="mt-1.5 flex flex-col gap-0.5 max-h-[50px] overflow-hidden">
                              {dayScheds.slice(0, 2).map((hs, sIdx) => (
                                <div
                                  key={hs.id || sIdx}
                                  className="bg-blue-100/60 text-blue-700 rounded px-1.5 py-0.5 text-[9px] font-extrabold truncate"
                                  title={`${hs.empName}: ${hs.shift}`}
                                >
                                  {hs.empName}
                                </div>
                              ))}
                              {dayScheds.length > 2 && (
                                <span className="text-[8px] text-stone-400 font-extrabold self-end">
                                  +{dayScheds.length - 2}人
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Day Schedule Detail panel */}
                    {selectedCalendarDate && (
                      <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-100 text-xs flex flex-col gap-2 mt-2">
                        <div className="flex justify-between items-center border-b border-blue-200/50 pb-1.5">
                          <strong className="text-blue-800 text-[12px]">📅 {selectedCalendarDate} 排班詳情：</strong>
                          <button
                            onClick={() => setSelectedCalendarDate(null)}
                            className="text-stone-400 hover:text-stone-600 font-bold"
                          >
                            關閉詳情 ✕
                          </button>
                        </div>

                        {hrSchedules.filter(hs => hs.date === selectedCalendarDate).length === 0 ? (
                          <p className="text-stone-400 italic">當日尚無排班紀錄。</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-1">
                            {hrSchedules.filter(hs => hs.date === selectedCalendarDate).map(hs => (
                              <div key={hs.id} className="p-2.5 bg-white border border-blue-100 rounded-xl flex justify-between items-center shadow-sm">
                                <span className="font-bold text-stone-850">{hs.empName}</span>
                                <span className="font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  {hs.shift}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Employees Work Hours List */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="font-bold text-stone-800 text-lg">今日排班人名單</h3>
                    <p className="text-xs text-stone-500">
                      在此設定今日上班的員工工時。您可以使用智能按鈕一鍵導入 HR 系統中已排好的今日班表。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onImportHR}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Database className="w-4 h-4" /> 匯入 taidu-HR 班表
                    </button>
                    <button
                      onClick={handleAutoSchedule}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-md shadow-blue-200/50"
                    >
                      ⚙️ 自動分派生產排程
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {employees.map(emp => (
                    <div key={emp.id} className="p-3.5 bg-stone-50/50 border border-stone-200/60 rounded-xl flex items-center justify-between gap-4">
                      <span className="font-bold text-stone-800 text-sm">{emp.name} ({emp.role})</span>
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-stone-500">
                          排班時間: <strong>{emp.hours}</strong> 小時
                        </div>
                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="p-2 text-stone-400 hover:text-rose-500 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOM & RECIPES LIST */}
          {activeTab === 'bom' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">食譜 BOM 與 SOP 配置管理</h3>
                <p className="text-xs text-stone-500">設定甜點成品的材料清單、SOP步驟與合格技能門檻</p>
              </div>

              <div className="flex flex-col gap-4">
                {recipes.map(recipe => {
                  const isEditing = editingRecipeId === recipe.id;

                  if (isEditing) {
                    return (
                      <div key={recipe.id} className="p-6 border border-blue-200 rounded-3xl bg-blue-50/10 flex flex-col gap-4 shadow-sm">
                        <div className="flex justify-between items-center border-b border-stone-200/50 pb-2">
                          <strong className="text-stone-800 text-sm">📝 編輯配方與 SOP：{recipe.name}</strong>
                          <button
                            onClick={() => setEditingRecipeId(null)}
                            className="text-stone-400 hover:text-stone-605 font-bold text-xs"
                          >
                            取消 ✕
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold text-stone-400">配方名稱</label>
                            <input
                              type="text"
                              value={editRecipeName}
                              onChange={(e) => setEditRecipeName(e.target.value)}
                              className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-850 outline-none focus:border-blue-500 w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold text-stone-400">最低解鎖技能值 (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editRecipeThreshold}
                              onChange={(e) => setEditRecipeThreshold(Number(e.target.value))}
                              className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-850 outline-none focus:border-blue-500 w-full"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-stone-400">SOP 步驟設定</label>
                            <button
                              type="button"
                              onClick={() => setEditRecipeSop(prev => [...prev, ''])}
                              className="px-2.5 py-1 bg-stone-200 text-stone-700 hover:bg-stone-300 rounded-lg text-[10px] font-bold transition"
                            >
                              ➕ 新增步驟
                            </button>
                          </div>
                          
                          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                            {editRecipeSop.map((step, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-2">
                                <span className="font-mono text-xs text-stone-400 font-bold shrink-0">{sIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={step}
                                  onChange={(e) => {
                                    const newSop = [...editRecipeSop];
                                    newSop[sIdx] = e.target.value;
                                    setEditRecipeSop(newSop);
                                  }}
                                  className="flex-1 bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs text-stone-850 outline-none focus:border-blue-500"
                                  placeholder={`輸入步驟 ${sIdx + 1} 的說明...`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditRecipeSop(prev => prev.filter((_, idx) => idx !== sIdx));
                                  }}
                                  className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
 
                        <div className="flex flex-col gap-2">
                          <label className="text-[11px] font-bold text-stone-400">配方 BOM 清單設定</label>
                          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1 bg-stone-50/50 p-3 rounded-2xl border border-stone-200/40">
                            {editRecipeBom.map((bomItem, bIdx) => {
                              const resolvedName = bomItem.name || materials.find(m => m.id === bomItem.materialId)?.name || recipes.find(r => r.id === bomItem.materialId)?.name || bomItem.materialId;
                              const resolvedUnit = bomItem.unit || materials.find(m => m.id === bomItem.materialId)?.unit || '';
                              return (
                                <div key={bIdx} className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-stone-200/50">
                                  <span className="text-xs text-stone-700 font-bold flex-1">{resolvedName}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-stone-400 font-bold">用量:</span>
                                    <input
                                      type="number"
                                      step="any"
                                      value={bomItem.qty}
                                      onChange={(e) => {
                                        const newBom = [...editRecipeBom];
                                        newBom[bIdx] = { ...bomItem, qty: Number(e.target.value) };
                                        setEditRecipeBom(newBom);
                                      }}
                                      className="w-16 bg-stone-50 border border-stone-200 rounded-lg px-1.5 py-1 text-xs text-stone-850 outline-none focus:border-blue-500 text-center font-mono font-semibold"
                                    />
                                    <span className="text-xs text-stone-500 font-medium w-8 shrink-0">{resolvedUnit}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditRecipeBom(prev => prev.filter((_, idx) => idx !== bIdx));
                                      }}
                                      className="p-1 text-stone-400 hover:text-rose-500 rounded transition"
                                      title="刪除此用量品項"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {editRecipeBom.length === 0 && (
                              <span className="text-stone-400 italic text-xs text-center py-2">目前無設定任何材料</span>
                            )}
                          </div>

                          {/* Add New BOM Item Section */}
                          <div className="flex flex-col sm:flex-row gap-2 bg-stone-50/30 p-2.5 rounded-xl border border-dashed border-stone-200">
                            <select
                              id="add-bom-material-select"
                              className="flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-blue-500"
                              defaultValue=""
                            >
                              <option value="">選擇原料或半成品...</option>
                              <optgroup label="原料 (Materials)">
                                {materials.map(m => (
                                  <option key={m.id} value={`mat:${m.id}`}>
                                    {m.name} ({m.unit})
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="半成品 (Semi-finished Recipes)">
                                {recipes
                                  .filter(r => r.id !== recipe.id && r.type === 'semi')
                                  .map(r => (
                                    <option key={r.id} value={`rec:${r.id}`}>
                                      {r.name} (個)
                                    </option>
                                  ))}
                              </optgroup>
                            </select>

                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="any"
                                placeholder="用量"
                                id="add-bom-qty-input"
                                className="w-20 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-850 outline-none focus:border-blue-500 text-center font-mono"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  const selectEl = document.getElementById('add-bom-material-select') as HTMLSelectElement;
                                  const qtyEl = document.getElementById('add-bom-qty-input') as HTMLInputElement;
                                  if (!selectEl || !qtyEl) return;
                                  
                                  const val = selectEl.value;
                                  const qty = Number(qtyEl.value);
                                  if (!val) {
                                    alert("請先選擇原料或半成品！");
                                    return;
                                  }
                                  if (isNaN(qty) || qty <= 0) {
                                    alert("請輸入有效的用量數值！");
                                    return;
                                  }

                                  const [type, id] = val.split(':');
                                  let name = '';
                                  let unit = '';
                                  if (type === 'mat') {
                                    const mat = materials.find(m => m.id === id);
                                    if (mat) {
                                      name = mat.name;
                                      unit = mat.unit;
                                    }
                                  } else if (type === 'rec') {
                                    const rec = recipes.find(r => r.id === id);
                                    if (rec) {
                                      name = rec.name;
                                      unit = '個';
                                    }
                                  }

                                  // Check if already exists
                                  if (editRecipeBom.some(b => b.materialId === id)) {
                                    alert("該材料已存在於配方中！");
                                    return;
                                  }

                                  setEditRecipeBom(prev => [...prev, {
                                    materialId: id,
                                    name: name,
                                    qty: qty,
                                    unit: unit
                                  }]);

                                  // Clear inputs
                                  selectEl.value = "";
                                  qtyEl.value = "";
                                }}
                                className="flex-1 sm:flex-initial px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-bold transition whitespace-nowrap"
                              >
                                ➕ 加入材料
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                          <button
                            type="button"
                            onClick={() => setEditingRecipeId(null)}
                            className="px-4 py-2 bg-stone-200 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-300 transition"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const updatedRecipes = recipes.map(r => r.id === recipe.id ? {
                                  ...r,
                                  name: editRecipeName,
                                  unlockThreshold: editRecipeThreshold,
                                  sop: editRecipeSop.filter(step => step.trim() !== ''),
                                  bom: editRecipeBom
                                } : r);
                                
                                await onUpdateRecipes(updatedRecipes);
                                setEditingRecipeId(null);
                                alert("🎉 成功更新配方名稱、SOP 與 BOM 用量清單！");
                              } catch (err: any) {
                                alert("更新失敗: " + err.message);
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
                          >
                            儲存配方
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={recipe.id} className="p-5 border border-stone-200 rounded-2xl bg-white shadow-sm flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-stone-850 text-md">{recipe.name}</h4>
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 tracking-wider">
                            {recipe.type === 'finished' ? '成品' : '半成品'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-stone-500">
                            最低解鎖技能值: <strong>{recipe.unlockThreshold}%</strong>
                          </span>
                          <button
                            onClick={() => {
                              setEditingRecipeId(recipe.id);
                              setEditRecipeName(recipe.name);
                              setEditRecipeThreshold(recipe.unlockThreshold);
                              setEditRecipeSop(recipe.sop || []);
                              setEditRecipeBom(recipe.bom || []);
                            }}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          >
                            📝 編輯配方 & SOP
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`⚠️ 確定要刪除配方「${recipe.name}」嗎？此操作將會從生產管理系統中徹底移除該配方與 SOP，且無法還原！`)) {
                                try {
                                  await onUpdateRecipes(prev => prev.filter(r => r.id !== recipe.id));
                                  alert(`🎉 配方「${recipe.name}」已成功刪除！`);
                                } catch (err: any) {
                                  alert(`刪除失敗: ${err.message}`);
                                }
                              }
                            }}
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          >
                            ❌ 刪除配方
                          </button>
                        </div>
                      </div>

                      <div>
                        <h5 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">配方用量 (單個/單份)</h5>
                        <div className="flex flex-wrap gap-2">
                          {recipe.bom.map((b, i) => {
                            const resolvedName = (b.name && b.name.length <= 15 && !/^[a-zA-Z0-9]+$/.test(b.name)) 
                              ? b.name 
                              : (materials.find(m => m.id === b.materialId)?.name || recipes.find(r => r.id === b.materialId)?.name || b.name || b.materialId);
                            const resolvedUnit = b.unit && b.unit.length <= 8 ? b.unit : (materials.find(m => m.id === b.materialId)?.unit || '');
                            return (
                              <span key={i} className="text-xs bg-stone-50 text-stone-700 px-3 py-1.5 rounded-xl border border-stone-200/60 font-semibold">
                                {resolvedName}: {b.qty} {resolvedUnit}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h5 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">SOP 製作步驟</h5>
                        <ol className="list-decimal pl-5 text-xs text-stone-600 space-y-1">
                          {(recipe.sop || []).map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                          {(!recipe.sop || recipe.sop.length === 0) && (
                            <span className="text-stone-400 italic">尚無設定製作步驟</span>
                          )}
                        </ol>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: WEEKLY SAFETY STOCK TEMPLATE */}
          {activeTab === 'inventory' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-stone-800 text-lg">週安全水位範本 (Weekly Safety Stocks)</h3>
                  <p className="text-xs text-stone-500">
                    可自訂「週一至週日」每日最低庫存水位（如假日提高以備料）。智能叫貨與任務分派將自動根據「今天星期幾」進行判定。
                  </p>
                </div>
                <button
                  onClick={handleSmartOrder}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-md shadow-blue-200/50 shrink-0"
                >
                  ⚡️ 智能一鍵叫貨
                </button>
              </div>

              {/* Weekly Minimum Safety Stocks Grid table */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                    今日水位依循模式: {daysName[currentDayOfWeek]}
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 font-bold">
                        <th className="pb-3 pr-2">物料名稱</th>
                        <th className="pb-3">目前庫存</th>
                        {daysName.map((dayName, idx) => (
                          <th key={idx} className={`pb-3 text-center ${idx === currentDayOfWeek ? 'text-blue-600 bg-blue-50/50 rounded-t-xl px-1' : ''}`}>
                            {dayName.slice(-2)}
                          </th>
                        ))}
                        <th className="pb-3 text-right">設定</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {materials.map(mat => {
                        const isEditing = editingMatId === mat.id;
                        const isLowToday = mat.qty < (mat.weeklyMinQty[currentDayOfWeek] || 0);

                        return (
                          <tr key={mat.id} className="text-stone-700 hover:bg-stone-50/30">
                            <td className="py-4 font-bold pr-2">{mat.name}</td>
                            <td className="py-4 font-mono font-bold">
                              <span className={isLowToday ? 'text-rose-600' : 'text-emerald-600'}>
                                {mat.qty} {mat.unit}
                              </span>
                            </td>
                            
                            {/* Days rendering */}
                            {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                              const val = mat.weeklyMinQty[dayIdx] || 0;
                              return (
                                <td key={dayIdx} className={`py-4 text-center font-mono ${dayIdx === currentDayOfWeek ? 'bg-blue-50/20 font-bold' : ''}`}>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      value={val}
                                      onChange={(e) => handleUpdateWeeklyThreshold(mat.id, dayIdx, Number(e.target.value))}
                                      className="w-12 text-center border border-stone-200 rounded py-0.5 bg-white font-mono text-xs"
                                    />
                                  ) : (
                                    <span>{val} {mat.unit}</span>
                                  )}
                                </td>
                              );
                            })}

                            <td className="py-4 text-right">
                              <button
                                onClick={() => setEditingMatId(isEditing ? null : mat.id)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-bold underline"
                              >
                                {isEditing ? '儲存' : '修改範本'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Material mock form */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <h4 className="text-xs font-bold text-stone-600">➕ 建立新原料品項</h4>
                <form onSubmit={handleAddMaterial} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-400">原料名稱</label>
                    <input
                      type="text"
                      placeholder="如: 法國吉利丁片"
                      value={newMatName}
                      onChange={(e) => setNewMatName(e.target.value)}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-400">初始庫存</label>
                    <input
                      type="number"
                      value={newMatQty}
                      onChange={(e) => setNewMatQty(Number(e.target.value))}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-400">單位 (如 kg, 盒, 支)</label>
                    <input
                      type="text"
                      value={newMatUnit}
                      onChange={(e) => setNewMatUnit(e.target.value)}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-400">預估進價成本 ($)</label>
                    <input
                      type="number"
                      value={newMatCost}
                      onChange={(e) => setNewMatCost(Number(e.target.value))}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-[11px] font-bold text-stone-400">指定廠商</label>
                    <input
                      type="text"
                      placeholder="如: 德麥食品"
                      value={newMatSupplier}
                      onChange={(e) => setNewMatSupplier(e.target.value)}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end items-end">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 transition shadow-sm active:scale-95 w-full sm:w-auto"
                    >
                      建立原料品項
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: ACCOUNTS & CREDENTIALS MANAGEMENT */}
          {activeTab === 'accounts' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">系統帳號與權限設定</h3>
                <p className="text-xs text-stone-500">管理甜點工坊所有員工之系統登入帳號、角色、前後台權限及叫貨權限。</p>
              </div>

              <div className="flex flex-col gap-3">
                {employees.map(emp => (
                  <div key={emp.id} className="p-4 bg-stone-50/50 border border-stone-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                        {emp.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-800 text-sm">{emp.name}</h4>
                        <p className="text-xs text-stone-400">{emp.role}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                      {/* Assign Mentor Dropdown */}
                      <div className="flex items-center gap-1.5 bg-stone-100/50 px-2 py-1.5 rounded-xl border border-stone-200/40">
                        <span className="text-[11px] text-stone-500 font-bold shrink-0">指派師父:</span>
                        <select
                          value={emp.mentorName || ''}
                          onChange={(e) => handleAssignMentor(emp.id, e.target.value)}
                          className="bg-white border border-stone-200 rounded px-2 py-0.5 text-xs text-stone-700 outline-none focus:border-blue-500 font-medium"
                        >
                          <option value="">無指定師父</option>
                          {employees.filter(e => e.id !== emp.id).map(e => (
                            <option key={e.id} value={e.name}>{e.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Permission Toggles */}
                      <div className="flex items-center gap-4 border-l border-stone-200 pl-4 py-1">
                        <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer font-semibold">
                          <input
                            type="checkbox"
                            checked={emp.canAccessAdmin || false}
                            onChange={(e) => {
                              onUpdateEmployees(prev => prev.map(x => x.id === emp.id ? { ...x, canAccessAdmin: e.target.checked } : x));
                            }}
                            className="rounded accent-blue-500"
                          />
                          <span>管理後台</span>
                        </label>
                        
                        <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer font-semibold">
                          <input
                            type="checkbox"
                            checked={emp.canOrder || false}
                            onChange={(e) => {
                              onUpdateEmployees(prev => prev.map(x => x.id === emp.id ? { ...x, canOrder: e.target.checked } : x));
                            }}
                            className="rounded accent-blue-500"
                          />
                          <span>原料叫貨</span>
                        </label>
                      </div>

                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        className="p-2 text-stone-400 hover:text-rose-500 rounded-lg transition shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Account form */}
              <form onSubmit={handleAddEmployee} className="p-5 bg-stone-50 border border-stone-200/60 rounded-2xl flex flex-col gap-4">
                <h4 className="text-xs font-bold text-stone-600">➕ 新增員工系統帳號</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-400">員工姓名</label>
                    <input
                      type="text"
                      placeholder="例如: 小陳"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-400">系統角色</label>
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value)}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    >
                      <option value="正職主廚">正職主廚</option>
                      <option value="烘焙助手">烘焙助手</option>
                      <option value="兼職實習生">兼職實習生</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-400">每日基礎工時 (小時)</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={newEmpHours}
                      onChange={(e) => setNewEmpHours(Number(e.target.value))}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 bg-white p-3.5 rounded-xl border border-stone-200/50">
                  <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEmpCanAdmin}
                      onChange={(e) => setNewEmpCanAdmin(e.target.checked)}
                      className="rounded accent-blue-500"
                    />
                    開啟後台管理權限
                  </label>
                  
                  <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEmpCanOrder}
                      onChange={(e) => setNewEmpCanOrder(e.target.checked)}
                      className="rounded accent-blue-500"
                    />
                    開啟採購叫貨權限
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 shadow-sm transition flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" /> 建立帳號
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 5: HISTORICAL PURCHASE ORDERS HISTORY LOG */}
          {activeTab === 'history' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
              <h3 className="font-bold text-stone-800 text-lg">歷史叫貨單記錄簿</h3>
              <p className="text-xs text-stone-500">此處妥善保存每次由員工發起或後台自動生成的原物料採購清單，可隨時追溯核對</p>

              <div className="flex flex-col gap-4 mt-2">
                {orderHistory.map(hist => {
                  const histTotal = hist.items.reduce((acc, curr) => acc + curr.cost, 0);
                  return (
                    <div key={hist.id} className="p-4 bg-stone-50/50 border border-stone-200 rounded-2xl flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs border-b border-stone-200/50 pb-2">
                        <span className="font-bold text-stone-500">時間: {hist.date}</span>
                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          叫貨人: {hist.orderedBy}
                        </span>
                      </div>
                      <div className="text-xs flex flex-col gap-1">
                        <div className="flex justify-between text-stone-700 font-bold mb-1">
                          <span>供應商: {hist.supplier}</span>
                          <span>總計: ${histTotal}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {hist.items.map((item, idx) => (
                            <span key={idx} className="bg-white border border-stone-200 px-2.5 py-1 rounded text-[11px] text-stone-600">
                              {item.name}: {item.qty} (${item.cost})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: FINANCIAL AP LEDGER */}
          {activeTab === 'finance' && (
            <div className="flex flex-col gap-6">
              {/* Financial stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">本週累計進貨總額</span>
                  <span className="text-2xl font-bold text-stone-800 flex items-center font-mono">
                    <DollarSign className="w-5 h-5 text-stone-400" />
                    {totalExpenses}
                  </span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">在途叫貨未決款</span>
                  <span className="text-2xl font-bold text-blue-600 flex items-center font-mono">
                    <DollarSign className="w-5 h-5 text-blue-400" />
                    {pendingExpenses}
                  </span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">廠商未結應付帳款 (AP)</span>
                  <span className="text-2xl font-bold text-rose-600 flex items-center font-mono">
                    <DollarSign className="w-5 h-5 text-rose-400" />
                    {accountsPayable}
                  </span>
                </div>
              </div>

              {/* Extra stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-emerald-50/20 p-4 rounded-xl border border-emerald-100 flex justify-between items-center text-xs">
                  <span className="font-bold text-emerald-800">現金結算累積金額 (現結):</span>
                  <strong className="font-mono text-emerald-800 text-sm">${cashPayments}</strong>
                </div>
                <div className="bg-blue-50/20 p-4 rounded-xl border border-blue-100 flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-800">月結帳款累計金額 (月結):</span>
                  <strong className="font-mono text-blue-800 text-sm">${monthlyPayments}</strong>
                </div>
              </div>

              {/* Purchases list */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <h3 className="font-bold text-stone-800 text-lg">採購單明細與結算對帳單</h3>
                <p className="text-xs text-stone-500">展示所有已發起之採購記錄，已簽收帳目直接納入未結算應付帳款</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 font-bold">
                        <th className="pb-3">採購原物料</th>
                        <th className="pb-3">採購數量</th>
                        <th className="pb-3">單項總價</th>
                        <th className="pb-3">付款方式</th>
                        <th className="pb-3">廠商名稱</th>
                        <th className="pb-3">簽收狀態</th>
                        <th className="pb-3">簽收核對人</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {purchases.map(p => (
                        <tr key={p.id} className="text-stone-700">
                          <td className="py-4 font-bold">{p.materialName}</td>
                          <td className="py-4 font-mono font-bold text-stone-800">{p.qty}</td>
                          <td className="py-4 font-mono text-stone-600">${p.cost}</td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              p.paymentMethod === 'monthly' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {p.paymentMethod === 'monthly' ? '月結' : '現結'}
                            </span>
                          </td>
                          <td className="py-4 text-stone-500">{p.supplier}</td>
                          <td className="py-4">
                            {p.status === 'received' ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-bold rounded-full">
                                已簽收進庫
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-bold rounded-full">
                                待簽收在途
                              </span>
                            )}
                          </td>
                          <td className="py-4 text-stone-400 font-bold">{p.signedBy || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
