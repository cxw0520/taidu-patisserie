import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, BookOpen, Clock, Award, ChevronDown, ChevronUp, Check, Truck, AlertTriangle, Play, ShieldAlert, ShoppingBag, Plus, Trash2, UserCheck, Users, BookMarked } from 'lucide-react';
import { Employee, ProductionTask, Recipe, PurchaseRecord, Material, HistoricalOrder } from './SchedulerApp';

interface StaffPortalProps {
  employees: Employee[];
  tasks: ProductionTask[];
  recipes: Recipe[];
  purchases: PurchaseRecord[];
  materials: Material[];
  onStartTask: (taskId: string, operatorName: string) => void;
  onCompleteTask: (taskId: string, actualHours?: number, shortageOption?: 'deconstruct' | 'negative') => void;
  onReceivePurchase: (purchaseId: string, signedByName: string) => void;
  currentLoggedInEmpId: string;
  onAddPurchaseOrders: (newPOs: PurchaseRecord[]) => void;
  onAddHistoricalOrder: (newHist: HistoricalOrder) => void;
  onUpdateProgress: (empId: string, recipeId: string, newProgress: number) => void;
}

interface SuggestedOrderItem {
  materialId: string;
  name: string;
  suggestedQty: number;
  unit: string;
  cost: number;
  supplier: string;
}

export default function StaffPortal({
  employees,
  tasks,
  recipes,
  purchases,
  materials,
  onStartTask,
  onCompleteTask,
  onReceivePurchase,
  currentLoggedInEmpId,
  onAddPurchaseOrders,
  onAddHistoricalOrder,
  onUpdateProgress
}: StaffPortalProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'training' | 'receiving' | 'ordering' | 'mentorship'>('tasks');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  // Suggested orders states
  const [orderItems, setOrderItems] = useState<SuggestedOrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'monthly' | 'cash'>('cash');
  const [isOrderInitiated, setIsOrderInitiated] = useState(false);

  // Mentor Tab states
  const [selectedApprenticeId, setSelectedApprenticeId] = useState<string>('');

  // Stopwatch ticking state
  const [, setTick] = useState(0);
  
  // Dialog modal states for semi-finished inventory shortage
  const [showShortageModal, setShowShortageModal] = useState(false);
  const [shortageTaskId, setShortageTaskId] = useState<string | null>(null);
  const [shortageDetails, setShortageDetails] = useState<{ name: string; needed: number; stock: number } | null>(null);

  const today = new Date();
  const currentDayOfWeek = today.getDay();
  const todayISOStr = today.toISOString().split('T')[0];
  const daysName = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentEmployee = employees.find(e => e.id === currentLoggedInEmpId) || employees[0];
  const pendingPurchases = purchases.filter(p => p.status === 'pending');
  const todayPurchases = purchases.filter(p => p.expectedDate === todayISOStr);

  // Apprentices of current logged-in employee
  const apprenticeNames = currentEmployee.apprentices || [];
  const apprenticeList = employees.filter(e => apprenticeNames.includes(e.name));

  // Initialize selected apprentice
  useEffect(() => {
    if (apprenticeList.length > 0 && !selectedApprenticeId) {
      setSelectedApprenticeId(apprenticeList[0].id);
    }
  }, [apprenticeList, selectedApprenticeId]);

  // Initialize dynamic reorder list based on safety stocks for today
  useEffect(() => {
    if (activeTab === 'ordering' && !isOrderInitiated) {
      const suggested: SuggestedOrderItem[] = [];
      materials.forEach(mat => {
        if (mat.type === 'raw') {
          const safetyStock = mat.weeklyMinQty[currentDayOfWeek] || 0;
          if (mat.qty < safetyStock) {
            const gap = safetyStock * 2 - mat.qty;
            suggested.push({
              materialId: mat.id,
              name: mat.name,
              suggestedQty: parseFloat(Math.max(1, gap).toFixed(1)),
              unit: mat.unit,
              cost: mat.cost,
              supplier: mat.supplier
            });
          }
        }
      });
      setOrderItems(suggested);
      setIsOrderInitiated(true);
    }
  }, [activeTab, materials, currentDayOfWeek, isOrderInitiated]);

  // Clean ordering state when leaving the tab
  useEffect(() => {
    if (activeTab !== 'ordering') {
      setIsOrderInitiated(false);
    }
  }, [activeTab]);

  // Helper to format elapsed time for the stopwatch running
  const getElapsedTimeString = (startTimeStr: string) => {
    const start = new Date(startTimeStr).getTime();
    const now = Date.now();
    const diffMs = now - start;
    if (diffMs < 0) return '00:00:00';
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to get elapsed hours to pass back when completing task
  const getElapsedHours = (startTimeStr: string): number => {
    const start = new Date(startTimeStr).getTime();
    const now = Date.now();
    const diffMs = now - start;
    return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
  };

  // Trigger task completion with checks
  const triggerCompleteTask = (task: ProductionTask) => {
    if (!task.startTime) {
      onCompleteTask(task.id);
      return;
    }

    // Check if BOM includes semi-finished product that has insufficient stock
    const recipe = recipes.find(r => r.name === task.name || (r.name + '(半成品)') === task.name);
    let hasShortage = false;
    let shortageMatName = '';
    let shortageMatNeeded = 0;
    let shortageMatStock = 0;

    if (recipe) {
      recipe.bom.forEach(bom => {
        const mat = materials.find(m => m.id === bom.materialId);
        const requiredQty = bom.qty * task.qty;
        if (mat && mat.type === 'semi' && mat.qty < requiredQty) {
          hasShortage = true;
          shortageMatName = mat.name;
          shortageMatNeeded = requiredQty;
          shortageMatStock = mat.qty;
        }
      });
    }

    if (hasShortage) {
      setShortageTaskId(task.id);
      setShortageDetails({ name: shortageMatName, needed: shortageMatNeeded, stock: shortageMatStock });
      setShowShortageModal(true);
    } else {
      const actualHrs = getElapsedHours(task.startTime);
      onCompleteTask(task.id, actualHrs);
    }
  };

  // Handle modal choice
  const handleResolveShortage = (option: 'deconstruct' | 'negative') => {
    if (shortageTaskId) {
      const task = tasks.find(t => t.id === shortageTaskId);
      const actualHrs = task?.startTime ? getElapsedHours(task.startTime) : undefined;
      onCompleteTask(shortageTaskId, actualHrs, option);
    }
    setShowShortageModal(false);
    setShortageTaskId(null);
    setShortageDetails(null);
  };

  // Calculate Overall Progress (Average of all recipes for current employee)
  const totalRecipeCount = recipes.length;
  const progressSum = recipes.reduce((sum, r) => sum + (currentEmployee.progress[r.id] || 0), 0);
  const overallProgress = totalRecipeCount > 0 ? Math.round(progressSum / totalRecipeCount) : 0;

  // Submit generated purchase orders (Grouped by supplier!)
  const handleSubmitOrders = () => {
    if (orderItems.length === 0) {
      alert('請先填載欲叫貨的物料項目！');
      return;
    }

    const newPOs: PurchaseRecord[] = [];
    const groupedBySupplier: Record<string, typeof orderItems> = {};

    orderItems.forEach(item => {
      if (!groupedBySupplier[item.supplier]) {
        groupedBySupplier[item.supplier] = [];
      }
      groupedBySupplier[item.supplier].push(item);
    });

    const currentOrderDate = new Date().toISOString().replace('T', ' ').slice(0, 16);

    Object.keys(groupedBySupplier).forEach(supplier => {
      const supplierItems = groupedBySupplier[supplier];
      
      // Save individual purchase records
      supplierItems.forEach((item, idx) => {
        newPOs.push({
          id: `pur-staff-${Date.now()}-${idx}-${supplier}`,
          materialName: item.name,
          qty: item.suggestedQty,
          cost: Math.round(item.suggestedQty * item.cost),
          supplier: item.supplier,
          status: 'pending',
          date: todayISOStr,
          expectedDate: todayISOStr, // Standard Mock: Delivered today
          paymentMethod: paymentMethod,
          signedBy: null
        });
      });

      // Save to history log
      onAddHistoricalOrder({
        id: `hist-staff-${Date.now()}-${supplier}`,
        date: currentOrderDate,
        supplier: supplier,
        items: supplierItems.map(item => ({
          name: item.name,
          qty: item.suggestedQty,
          cost: Math.round(item.suggestedQty * item.cost)
        })),
        orderedBy: currentEmployee.name
      });
    });

    onAddPurchaseOrders(newPOs);
    alert(`已為您成功生成並保存叫貨單！已依廠商分類拆分生成採購單，並妥善記錄到後台歷史叫貨單中。`);
    setOrderItems([]);
    setActiveTab('tasks');
  };

  const handleUpdateOrderItemQty = (materialId: string, val: number) => {
    setOrderItems(prev => prev.map(item => {
      if (item.materialId === materialId) {
        return { ...item, suggestedQty: Math.max(0.1, val) };
      }
      return item;
    }));
  };

  const handleDeleteOrderItem = (materialId: string) => {
    setOrderItems(prev => prev.filter(item => item.materialId !== materialId));
  };

  const handleAddCustomOrderItem = (matId: string) => {
    const mat = materials.find(m => m.id === matId);
    if (!mat) return;
    if (orderItems.some(i => i.materialId === matId)) {
      alert('該原物料已在採購單中！');
      return;
    }
    setOrderItems(prev => [...prev, {
      materialId: mat.id,
      name: mat.name,
      suggestedQty: 5, // Default amount
      unit: mat.unit,
      cost: mat.cost,
      supplier: mat.supplier
    }]);
  };

  // Mentorship Tab helper
  const selectedApprentice = employees.find(e => e.id === selectedApprenticeId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Logged In Employee Info & Mentorship */}
      <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-amber-200">
              {currentEmployee.name[0]}
            </div>
            <div>
              <h3 className="font-extrabold text-stone-800 text-sm">{currentEmployee.name}</h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-500 tracking-wider">
                {currentEmployee.role}
              </span>
            </div>
          </div>

          {/* Mentorship relationship detail */}
          <div className="text-[11px] text-stone-500 font-medium flex flex-col gap-1">
            {currentEmployee.mentorName && (
              <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50/50 px-2.5 py-1 rounded-lg">
                <span className="font-extrabold text-[9px] uppercase tracking-wider">師父</span>
                <span>{currentEmployee.mentorName} 師傅</span>
              </div>
            )}
            {apprenticeList.length > 0 && (
              <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50/50 px-2.5 py-1 rounded-lg">
                <span className="font-extrabold text-[9px] uppercase tracking-wider">帶領徒弟</span>
                <span>{apprenticeNames.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Workspace navigation tabs */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'tasks'
                ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            📋 今日工作總覽
          </button>
          
          <button
            onClick={() => setActiveTab('training')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'training'
                ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            🎓 學習進度 & 食譜
          </button>

          <button
            onClick={() => setActiveTab('receiving')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-between ${
              activeTab === 'receiving'
                ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <span>🚚 今日應收貨</span>
            {todayPurchases.filter(p => p.status === 'pending').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
            )}
          </button>

          {currentEmployee.canOrder && (
            <button
              onClick={() => setActiveTab('ordering')}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-between ${
                activeTab === 'ordering'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                  : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <span>⚡️ 今日叫貨區</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 tracking-wider">
                權限
              </span>
            </button>
          )}

          {apprenticeList.length > 0 && (
            <button
              onClick={() => setActiveTab('mentorship')}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-between ${
                activeTab === 'mentorship'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                  : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <span>👩‍🍳 師徒教學區</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 tracking-wider">
                教學
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace display */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        
        {/* Workspace header title */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm">
          {activeTab === 'tasks' && (
            <div>
              <h3 className="font-extrabold text-stone-800 text-lg">今日生產工作清單 (總覽)</h3>
              <p className="text-xs text-stone-500 mt-1">選定要製作的品項點擊「領取並開始」，系統會自動計算排程與記錄實際工時。</p>
            </div>
          )}
          {activeTab === 'training' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-stone-800 text-lg">技能教學進度總覽</h3>
                <p className="text-xs text-stone-500 mt-1">配方解鎖由師傅定期考核。已解鎖的品項可點閱，未解鎖的半成品與成品皆呈反白灰色。</p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-xs">
                <span className="font-bold text-amber-800">全產品解鎖進度:</span>
                <strong className="font-mono text-amber-800 text-sm">{overallProgress}%</strong>
              </div>
            </div>
          )}
          {activeTab === 'receiving' && (
            <div>
              <h3 className="font-extrabold text-stone-800 text-lg">今日應簽收物料清單</h3>
              <p className="text-xs text-stone-500 mt-1">實體清點到店物料，點選確認簽收後會自動匯入後台庫存中。</p>
            </div>
          )}
          {activeTab === 'ordering' && (
            <div>
              <h3 className="font-extrabold text-stone-800 text-lg">本日智能採購叫貨區</h3>
              <p className="text-xs text-stone-500 mt-1">採購單將依供應商（廠商）分區排列，方便核對與送出。</p>
            </div>
          )}
          {activeTab === 'mentorship' && (
            <div>
              <h3 className="font-extrabold text-stone-800 text-lg">師徒專屬教學評分區</h3>
              <p className="text-xs text-stone-500 mt-1">師傅可在前台直接勾選確認徒弟是否「已完成學習」。勾選完成後，徒弟即解鎖該項食譜SOP。</p>
            </div>
          )}
        </div>

        {/* WORKSPACE DETAIL SECTION */}
        <div className="min-h-[480px]">
          
          {/* TAB 1: DAILY TASKS */}
          {activeTab === 'tasks' && (
            <div className="flex flex-col gap-4">
              {tasks.length === 0 ? (
                <div className="bg-white py-16 text-center rounded-3xl border border-stone-200/60 shadow-sm flex flex-col items-center justify-center gap-3">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                  <p className="font-bold text-stone-700 text-sm">今日沒有任何生產排程</p>
                  <p className="text-xs text-stone-400">請前往後台管理介面生成今日生產排程。</p>
                </div>
              ) : (
                tasks.map(task => {
                  const isPending = task.status === 'pending';
                  const isInProgress = task.status === 'inprogress';
                  const isCompleted = task.status === 'completed';

                  return (
                    <div
                      key={task.id}
                      className={`p-5 bg-white rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isCompleted
                          ? 'border-emerald-200 opacity-60'
                          : isInProgress
                          ? 'border-amber-300 shadow-md shadow-amber-50 bg-amber-50/5'
                          : 'border-stone-200/70 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl shrink-0 ${
                          isCompleted ? 'bg-emerald-100 text-emerald-600' : isInProgress ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-400'
                        }`}>
                          <Clock className="w-5 h-5" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm text-stone-800 ${isCompleted ? 'line-through text-stone-400' : ''}`}>
                              {task.name}
                            </span>
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-stone-100 text-stone-600">
                              派工人: {task.assignedTo}
                            </span>
                            {isInProgress && task.operator && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-700">
                                製作中: {task.operator}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-stone-400">
                            <span className="font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                              產量: {task.qty} {task.unit}
                            </span>
                            <span>預估工時: {task.requiredTimeHours}h</span>
                            {isCompleted && task.actualTimeHours && (
                              <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                實際工時: {task.actualTimeHours}h
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Claims & Timer actions */}
                      <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        {isPending && (
                          <button
                            onClick={() => onStartTask(task.id, currentEmployee.name)}
                            className="px-4 py-2 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 shadow-sm transition active:scale-95 flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" /> 領取並開始
                          </button>
                        )}

                        {isInProgress && (
                          <div className="flex items-center gap-3">
                            {task.startTime && (
                              <div className="bg-amber-100/60 text-amber-700 px-3 py-1.5 rounded-xl font-mono text-xs font-bold animate-pulse border border-amber-200">
                                ⏱. {getElapsedTimeString(task.startTime)}
                              </div>
                            )}
                            
                            <button
                              onClick={() => triggerCompleteTask(task)}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition active:scale-95"
                            >
                              結束製作並勾選
                            </button>
                          </div>
                        )}

                        {isCompleted && (
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={() => onCompleteTask(task.id)}
                              className="text-xs text-stone-400 hover:text-stone-600 underline font-medium"
                            >
                              撤回勾選 (還原庫存)
                            </button>
                            
                            {task.overtimeTriggered && (
                              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100 flex items-center gap-1 mt-1">
                                ⚠️ 超時, 下次請留意效率
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: LEARNING & GREYED OUT RECIPES */}
          {activeTab === 'training' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
              {recipes.map(recipe => {
                const userProgress = currentEmployee.progress[recipe.id] || 0;
                const isUnlocked = userProgress >= recipe.unlockThreshold;
                const isExpanded = expandedRecipeId === recipe.id;

                return (
                  <div
                    key={recipe.id}
                    className={`rounded-2xl border transition-all ${
                      isUnlocked
                        ? 'border-stone-200 bg-stone-50/20'
                        : 'border-stone-100 bg-stone-50/5 opacity-55 grayscale cursor-not-allowed select-none'
                    }`}
                  >
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${isUnlocked ? 'bg-amber-100/50 text-amber-600' : 'bg-stone-100 text-stone-400'}`}>
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-stone-800 text-sm">{recipe.name}</h4>
                            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-stone-200 text-stone-600 tracking-wider">
                              {recipe.type === 'finished' ? '成品' : '半成品'}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            解鎖限制: {recipe.unlockThreshold}% 
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-1 max-w-xs sm:justify-end">
                        <div className="flex-grow flex flex-col gap-1">
                          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${isUnlocked ? 'bg-amber-500' : 'bg-stone-400'}`}
                              style={{ width: `${userProgress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-stone-500 text-right">
                            我的進度: {userProgress}%
                          </span>
                        </div>

                        {isUnlocked ? (
                          <button
                            onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.id)}
                            className="text-stone-500 hover:text-stone-800 transition flex items-center gap-1 text-xs font-bold shrink-0"
                          >
                            {isExpanded ? '收合食譜' : '檢視食譜與SOP'}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-stone-400 flex items-center gap-1 shrink-0">
                            <ShieldAlert className="w-3.5 h-3.5 text-stone-300" /> 未解鎖
                          </span>
                        )}
                      </div>
                    </div>

                    {isUnlocked && isExpanded && (
                      <div className="p-5 bg-white rounded-b-2xl border-t border-stone-100 flex flex-col gap-6">
                        <div>
                          <h5 className="text-xs font-bold text-stone-600 mb-2.5">📋 配方清單 (BOM)</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {recipe.bom.map(bomItem => {
                              const currentStock = materials.find(m => m.id === bomItem.materialId)?.qty || 0;
                              return (
                                <div key={bomItem.materialId} className="flex justify-between items-center p-3 bg-stone-50 rounded-xl border border-stone-200/40 text-xs">
                                  <span className="font-medium text-stone-600">{bomItem.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-stone-700 bg-stone-200/50 px-2 py-0.5 rounded font-bold">
                                      單個用量: {bomItem.qty} {bomItem.unit}
                                    </span>
                                    <span className="text-[10px] text-stone-400">
                                      (庫存: {currentStock} {bomItem.unit})
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {recipe.images && recipe.images.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold text-stone-600 mb-2.5">📸 SOP 圖文對照</h5>
                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                              {recipe.images.map((imgUrl, i) => (
                                <div key={i} className="flex-shrink-0 w-36 h-24 rounded-xl overflow-hidden border border-stone-200 bg-stone-50 relative">
                                  <img src={imgUrl} alt={`Step image ${i + 1}`} className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <h5 className="text-xs font-bold text-stone-600 mb-3">🥖 製作 SOP 步驟</h5>
                          <ol className="flex flex-col gap-3">
                            {recipe.sop.map((step, idx) => (
                              <li key={idx} className="flex gap-3 text-xs leading-relaxed text-stone-600">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold font-mono text-[10px]">
                                  {idx + 1}
                                </span>
                                <span className="pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: RECEIVING DELIVERIES */}
          {activeTab === 'receiving' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
              {todayPurchases.filter(p => p.status === 'pending').length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-stone-400">
                  <Truck className="w-12 h-12 text-stone-300 animate-bounce" />
                  <p className="font-bold text-stone-600 text-sm">今日沒有待簽收的物料</p>
                </div>
              ) : (
                todayPurchases.filter(p => p.status === 'pending').map(purchase => (
                  <div
                    key={purchase.id}
                    className="p-5 bg-stone-50/50 border border-stone-200/85 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-amber-100/50 text-amber-600 rounded-xl">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-stone-800 text-sm">{purchase.materialName}</h4>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                            purchase.paymentMethod === 'monthly' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-amber-700'
                          }`}>
                            {purchase.paymentMethod === 'monthly' ? '月結' : '現結'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-bold text-stone-500 bg-stone-200/50 px-2 py-0.5 rounded">
                            應收數量: {purchase.qty}
                          </span>
                          <span className="text-[11px] font-medium text-stone-400">
                            廠牌: {purchase.supplier}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => onReceivePurchase(purchase.id, currentEmployee.name)}
                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition active:scale-95 flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" /> 確認無誤並簽收
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: ORDERING SYSTEM (GROUPED BY SUPPLIER!) */}
          {activeTab === 'ordering' && currentEmployee.canOrder && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-800 text-sm">今日原物料採購清單 (廠商分組)</h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      系統已自動按廠商分組列表。安全水位對應今日 {daysName[currentDayOfWeek]} 範本。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-stone-500">付款設定:</span>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="bg-stone-50 border border-stone-200 rounded px-2.5 py-1 text-xs outline-none font-bold text-stone-700"
                  >
                    <option value="cash">現結 (貨到付現)</option>
                    <option value="monthly">月結 (定期請款)</option>
                  </select>
                </div>
              </div>

              {orderItems.length === 0 ? (
                <div className="py-12 text-center text-stone-400 text-xs flex flex-col items-center justify-center gap-2">
                  <Check className="w-8 h-8 text-emerald-500" />
                  <span>目前沒有低於水位之原物料需要採購！</span>
                  <button
                    onClick={() => {
                      setOrderItems(materials.filter(m => m.type === 'raw').map(mat => ({
                        materialId: mat.id,
                        name: mat.name,
                        suggestedQty: 5,
                        unit: mat.unit,
                        cost: mat.cost,
                        supplier: mat.supplier
                      })));
                    }}
                    className="text-blue-500 underline font-bold mt-2 hover:text-blue-700"
                  >
                    模擬載入原物料進行測試
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Group items by supplier */}
                  {Array.from(new Set(orderItems.map(item => item.supplier))).map(supplier => {
                    const supplierItems = orderItems.filter(item => item.supplier === supplier);
                    return (
                      <div key={supplier} className="border border-stone-200/80 rounded-2xl overflow-hidden shadow-sm">
                        <div className="bg-stone-100 px-4 py-2.5 border-b border-stone-200 text-xs font-bold text-stone-700 flex justify-between items-center">
                          <span>🏢 供應商：{supplier}</span>
                          <span className="bg-stone-200 px-2 py-0.5 rounded text-[10px]">
                            {supplierItems.length} 項物料
                          </span>
                        </div>
                        <div className="p-4 flex flex-col gap-3.5 bg-white">
                          {supplierItems.map(item => (
                            <div key={item.materialId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 last:border-b-0 pb-3 last:pb-0">
                              <div>
                                <h5 className="font-bold text-stone-800 text-xs">{item.name}</h5>
                                <p className="text-[10px] text-stone-400 mt-0.5">
                                  預估小計: ${Math.round(item.suggestedQty * item.cost)} (${item.cost}/{item.unit})
                                </p>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-auto">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-stone-500">數量:</span>
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={item.suggestedQty}
                                    onChange={(e) => handleUpdateOrderItemQty(item.materialId, Number(e.target.value))}
                                    className="w-16 border border-stone-200 rounded px-2 py-1 text-center text-xs font-mono bg-white"
                                  />
                                  <span className="text-xs text-stone-400 font-bold ml-1">{item.unit}</span>
                                </div>
                                <button
                                  onClick={() => handleDeleteOrderItem(item.materialId)}
                                  className="p-2 text-stone-400 hover:text-rose-500 rounded-lg transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add manual custom order item */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200/40">
                    <span className="text-xs text-stone-600 font-bold shrink-0">➕ 手動新增物料項目:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddCustomOrderItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800 outline-none w-full sm:w-auto"
                    >
                      <option value="">選擇原物料...</option>
                      {materials.filter(m => m.type === 'raw').map(mat => (
                        <option key={mat.id} value={mat.id}>{mat.name} ({mat.supplier})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-stone-100">
                    <button
                      onClick={handleSubmitOrders}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-200/50 transition active:scale-95"
                    >
                      送出叫貨並生成採購單
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: MENTORSHIP VIEW (師徒教學區) */}
          {activeTab === 'mentorship' && apprenticeList.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              {/* Apprentice selector panel */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200/50">
                <div className="flex items-center gap-2 text-xs text-stone-600 font-bold shrink-0">
                  <UserCheck className="w-4 h-4 text-stone-400" />
                  <span>選擇評分徒弟:</span>
                </div>
                <div className="flex gap-2">
                  {apprenticeList.map(app => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedApprenticeId(app.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        selectedApprenticeId === app.id
                          ? 'bg-amber-800 text-white border-amber-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {app.name} ({app.role})
                    </button>
                  ))}
                </div>
              </div>

              {selectedApprentice ? (
                <div className="flex flex-col gap-5">
                  <div className="border-b border-stone-100 pb-2">
                    <h4 className="font-extrabold text-stone-800 text-sm">{selectedApprentice.name} 的教學技能清單</h4>
                    <p className="text-[11px] text-stone-400 mt-1">勾選「已完成學習」後，徒弟端便能看見配方與製作 SOP。</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {recipes.map(recipe => {
                      const currentProgress = selectedApprentice.progress[recipe.id] || 0;
                      const isCompleted = currentProgress >= recipe.unlockThreshold;

                      return (
                        <div
                          key={recipe.id}
                          className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                            isCompleted ? 'bg-emerald-50/20 border-emerald-200' : 'bg-stone-50/50 border-stone-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <BookMarked className={`w-4 h-4 ${isCompleted ? 'text-emerald-600' : 'text-stone-400'}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-stone-800">{recipe.name}</span>
                                <span className="text-[9px] font-extrabold bg-stone-200 px-1.5 py-0.2 rounded text-stone-600">
                                  需 {recipe.unlockThreshold}%
                                </span>
                              </div>
                              <span className="text-[10px] text-stone-400">目前技能進度: {currentProgress}%</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                // Toggle apprentice learning progress between 10% (unlearnt) and 100% (learnt)
                                onUpdateProgress(selectedApprentice.id, recipe.id, isCompleted ? 10 : 100);
                              }}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-stone-800 text-white hover:bg-stone-900'
                              }`}
                            >
                              {isCompleted ? (
                                <><Check className="w-3.5 h-3.5" /> 勾選已完成學習</>
                              ) : (
                                <>確認完成學習</>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-stone-400">
                  請選擇一名徒弟進行教學進度調整
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ⚠️ SHORTAGE MODAL DIALOG */}
      {showShortageModal && shortageDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-stone-200 flex flex-col gap-6">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h4 className="font-extrabold text-stone-800 text-md">半成品庫存短缺提示</h4>
                <p className="text-xs text-stone-500">系統檢測到配方中所需之半成品不足</p>
              </div>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/50 text-xs text-stone-700 flex flex-col gap-2">
              <div className="flex justify-between">
                <span>短缺半成品名稱:</span>
                <strong className="text-stone-800">{shortageDetails.name}</strong>
              </div>
              <div className="flex justify-between">
                <span>本次任務所需:</span>
                <strong className="text-stone-800">{shortageDetails.needed} 個</strong>
              </div>
              <div className="flex justify-between">
                <span>目前現有庫存:</span>
                <strong className="text-rose-600">{shortageDetails.stock} 個</strong>
              </div>
            </div>

            <div className="text-xs text-stone-500 leading-relaxed">
              請選擇如何處置這次的短缺：
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleResolveShortage('deconstruct')}
                className="w-full text-left p-3.5 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200/80 transition-all flex flex-col gap-1"
              >
                <div className="font-bold text-xs text-stone-800 flex items-center gap-1">
                  💡 方案 A：自動拆解 (Deconstruct)
                </div>
                <div className="text-[10px] text-stone-500">
                  略過半成品庫存，直接從底下扣除製作此半成品所需的麵粉、奶油等底層原材料。
                </div>
              </button>

              <button
                onClick={() => handleResolveShortage('negative')}
                className="w-full text-left p-3.5 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200/80 transition-all flex flex-col gap-1"
              >
                <div className="font-bold text-xs text-stone-800 flex items-center gap-1">
                  ➖ 方案 B：允許負數庫存 (Allow Negative)
                </div>
                <div className="text-[10px] text-stone-500">
                  維持正常核銷，讓該半成品的庫存數量暫時變為負數，等待稍後排程生產補回。
                </div>
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowShortageModal(false);
                setShortageTaskId(null);
                setShortageDetails(null);
              }}
              className="text-stone-400 hover:text-stone-600 text-xs font-bold self-center mt-2 underline"
            >
              取消，暫不完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
