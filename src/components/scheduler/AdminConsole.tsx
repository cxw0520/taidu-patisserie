import React, { useState } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, TrendingUp, DollarSign, Truck, ClipboardList, Check, UserCheck, HelpCircle } from 'lucide-react';
import { Employee, Material, Recipe, ProductionTask, PurchaseRecord, HistoricalOrder } from './SchedulerApp';

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
  onUpdateHistory
}: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<'scheduling' | 'bom' | 'inventory' | 'history' | 'finance'>('scheduling');
  const today = new Date();

  // Input states for adding new elements in mockup
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpHours, setNewEmpHours] = useState(8);
  const [newEmpRole, setNewEmpRole] = useState('烘焙助手');

  const [newMatName, setNewMatName] = useState('');
  const [newMatQty, setNewMatQty] = useState(10);
  const [newMatUnit, setNewMatUnit] = useState('kg');
  const [newMatCost, setNewMatCost] = useState(100);
  const [newMatSupplier, setNewMatSupplier] = useState('');

  // Editing state for weekly safety stocks
  const [editingMatId, setEditingMatId] = useState<string | null>(null);

  // Selected employee in back-end card to grade/mentor
  const [selectedGradingEmpId, setSelectedGradingEmpId] = useState<string>(employees[0]?.id || '');

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
  // Priority 2: materials lowest in stock relative to dynamic today's safety threshold
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
      mentorName: '小王',
      apprentices: [],
      canAccessAdmin: false,
      canOrder: false
    };

    onUpdateEmployees(prev => [...prev, newEmp]);
    setNewEmpName('');
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

              {/* Master-Apprentice and Grading Panel */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Employee select picker */}
                <div className="md:col-span-1 border-r border-stone-100 pr-0 md:pr-6 flex flex-col gap-4">
                  <div>
                    <h4 className="font-bold text-stone-800 text-sm">選擇評分員工</h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">師傅可為選定之徒弟考核技能</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {employees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedGradingEmpId(emp.id)}
                        className={`text-left p-3 rounded-xl border text-xs transition ${
                          selectedGradingEmpId === emp.id
                            ? 'bg-blue-50/60 border-blue-300 font-bold text-blue-800'
                            : 'bg-stone-50 border-stone-200 hover:bg-stone-100 text-stone-600'
                        }`}
                      >
                        {emp.name} ({emp.role})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grading Panel details */}
                <div className="md:col-span-2 flex flex-col gap-6">
                  {gradingEmployee ? (
                    <>
                      <div className="flex justify-between items-start border-b border-stone-100 pb-3">
                        <div>
                          <h4 className="font-bold text-stone-800 text-md">{gradingEmployee.name} • 技能考核與師徒設定</h4>
                          <p className="text-xs text-stone-400 mt-1">
                            師徒配對：
                            <select
                              value={gradingEmployee.mentorName || ''}
                              onChange={(e) => handleAssignMentor(gradingEmployee.id, e.target.value)}
                              className="bg-stone-50 border border-stone-200 rounded px-2 py-0.5 ml-1 text-stone-700 outline-none text-[11px]"
                            >
                              <option value="">無指定師父</option>
                              {employees.filter(e => e.id !== gradingEmployee.id).map(e => (
                                <option key={e.id} value={e.name}>{e.name} ({e.role})</option>
                              ))}
                            </select>
                          </p>
                        </div>
                      </div>

                      {/* Recipe skill sliders */}
                      <div className="flex flex-col gap-5">
                        {recipes.map(recipe => {
                          const score = gradingEmployee.progress[recipe.id] || 0;
                          return (
                            <div key={recipe.id} className="flex flex-col gap-1 bg-stone-50/60 p-4 rounded-xl border border-stone-200/40">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-stone-700">{recipe.name}</span>
                                <span className="font-bold text-blue-600">{score}%</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={score}
                                  onChange={(e) => handleUpdateEmpProgress(recipe.id, Number(e.target.value))}
                                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <span className="text-[10px] text-stone-400 shrink-0">
                                  解鎖需: {recipe.unlockThreshold}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-stone-400 text-xs">
                      請選擇一名員工進行考核設定
                    </div>
                  )}
                </div>
              </div>

              {/* Employees Work Hours List */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="font-bold text-stone-800 text-lg">今日排班人名單</h3>
                    <p className="text-xs text-stone-500">在此設定今日上班的員工工時。確認後可點擊自動排程按鈕進行自動分派。</p>
                  </div>
                  <button
                    onClick={handleAutoSchedule}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-md shadow-blue-200/50"
                  >
                    ⚙️ 自動分派生產排程
                  </button>
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

                {/* Add new employee mock form */}
                <form onSubmit={handleAddEmployee} className="p-4 bg-stone-50 border border-stone-200/60 rounded-2xl flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-grow flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-500">員工姓名</label>
                    <input
                      type="text"
                      placeholder="例如: 阿偉"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="w-full sm:w-36 flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-500">角色分配</label>
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
                  <div className="w-full sm:w-24 flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-500">排班工時</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={newEmpHours}
                      onChange={(e) => setNewEmpHours(Number(e.target.value))}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 shadow-sm transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" /> 新增排班
                  </button>
                </form>
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
                {recipes.map(recipe => (
                  <div key={recipe.id} className="p-5 border border-stone-200 rounded-2xl bg-stone-50/30 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-stone-800 text-sm">{recipe.name}</h4>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-stone-200 text-stone-600 tracking-wider">
                          {recipe.type === 'finished' ? '成品' : '半成品'}
                        </span>
                      </div>
                      <span className="text-xs text-stone-500">
                        最低解鎖技能值: <strong>{recipe.unlockThreshold}%</strong>
                      </span>
                    </div>

                    <div>
                      <h5 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">配方用量 (單個/單份)</h5>
                      <div className="flex flex-wrap gap-2">
                        {recipe.bom.map((b, i) => (
                          <span key={i} className="text-xs bg-stone-200/60 text-stone-700 px-3 py-1 rounded-lg border border-stone-200 font-medium">
                            {b.name}: {b.qty} {b.unit}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: WEEKLY SAFETY STOCK TEMPLATE */}
          {activeTab === 'inventory' && (
            <div className="flex flex-col gap-6">
              {/* Intelligent order and template description */}
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

          {/* TAB 4: HISTORICAL PURCHASE ORDERS HISTORY LOG */}
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

          {/* TAB 5: FINANCIAL AP LEDGER */}
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
