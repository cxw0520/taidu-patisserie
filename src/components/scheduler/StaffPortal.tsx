import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, BookOpen, Clock, Award, ChevronDown, ChevronUp, Check, Truck, AlertTriangle, Play, HelpCircle, ShieldAlert, UserCheck } from 'lucide-react';
import { Employee, ProductionTask, Recipe, PurchaseRecord, Material } from './SchedulerApp';

interface StaffPortalProps {
  employees: Employee[];
  tasks: ProductionTask[];
  recipes: Recipe[];
  purchases: PurchaseRecord[];
  materials: Material[];
  onStartTask: (taskId: string, operatorName: string) => void;
  onCompleteTask: (taskId: string, actualHours?: number, shortageOption?: 'deconstruct' | 'negative') => void;
  onReceivePurchase: (purchaseId: string, signedByName: string) => void;
  onUpdateProgress: (empId: string, recipeId: string, newProgress: number) => void;
}

export default function StaffPortal({
  employees,
  tasks,
  recipes,
  purchases,
  materials,
  onStartTask,
  onCompleteTask,
  onReceivePurchase
}: StaffPortalProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'tasks' | 'training' | 'receiving'>('tasks');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  // Stopwatch ticking state
  const [, setTick] = useState(0);
  
  // Dialog modal states for semi-finished inventory shortage
  const [showShortageModal, setShowShortageModal] = useState(false);
  const [shortageTaskId, setShortageTaskId] = useState<string | null>(null);
  const [shortageDetails, setShortageDetails] = useState<{ name: string; needed: number; stock: number } | null>(null);

  // Deliveries states
  const [receiverName, setReceiverName] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentEmployee = employees.find(e => e.id === selectedEmpId);
  const employeeTasks = tasks.filter(t => t.assignedTo === currentEmployee?.name);
  
  // Filter today's purchases
  const todayISOStr = new Date().toISOString().split('T')[0];
  const todayPurchases = purchases.filter(p => p.expectedDate === todayISOStr);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Employee Picker & Mentorship */}
      <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest">當前登入員工</h3>
          <p className="text-xs text-stone-500 mt-1">選擇您的名字以查看專屬任務與師徒配對</p>
        </div>

        <div className="flex flex-col gap-3">
          {employees.map(emp => {
            const isActive = emp.id === selectedEmpId;
            const empTasks = tasks.filter(t => t.assignedTo === emp.name);
            const completedCount = empTasks.filter(t => t.status === 'completed').length;
            const totalCount = empTasks.length;

            return (
              <button
                key={emp.id}
                onClick={() => {
                  setSelectedEmpId(emp.id);
                  setExpandedRecipeId(null);
                }}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-2 ${
                  isActive
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                    : 'bg-stone-50/50 border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 text-sm">{emp.name}</span>
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 tracking-wider">
                    {emp.role}
                  </span>
                </div>
                
                {/* Apprenticeship display */}
                <div className="text-[10px] text-stone-500 font-medium">
                  {emp.mentorName && (
                    <div className="flex items-center gap-1 text-amber-700">
                      <span className="bg-amber-100 px-1.5 py-0.2 rounded font-extrabold text-[9px]">師父</span>
                      <span>{emp.mentorName} 師傅</span>
                    </div>
                  )}
                  {emp.apprentices && emp.apprentices.length > 0 && (
                    <div className="flex items-center gap-1 text-blue-700 mt-0.5">
                      <span className="bg-blue-100 px-1.5 py-0.2 rounded font-extrabold text-[9px]">徒弟</span>
                      <span>{emp.apprentices.join(', ')}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-stone-500 mt-1 border-t border-stone-200/40 pt-1.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    今日工時: {emp.hours}h
                  </span>
                  <span className="font-bold text-stone-700">
                    任務: {completedCount}/{totalCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-6 border-t border-stone-100 flex flex-col gap-4">
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/50 flex flex-col gap-2">
            <h4 className="text-xs font-bold text-stone-600">系統小提示</h4>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              計時器啟動後將在背景持續運算，即便您暫時切換分頁，計時也不會中斷！
            </p>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        {/* Workspace Navigation */}
        <div className="flex border-b border-stone-200/80">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-6 py-3 font-bold text-xs tracking-wider uppercase border-b-2 transition-all -mb-[2px] ${
              activeTab === 'tasks'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            當日生產任務 ({employeeTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('training')}
            className={`px-6 py-3 font-bold text-xs tracking-wider uppercase border-b-2 transition-all -mb-[2px] ${
              activeTab === 'training'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            我的學習進度 & 食譜
          </button>
          <button
            onClick={() => setActiveTab('receiving')}
            className={`px-6 py-3 font-bold text-xs tracking-wider uppercase border-b-2 transition-all -mb-[2px] flex items-center gap-2 ${
              activeTab === 'receiving'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            今日應收貨
            {todayPurchases.filter(p => p.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold text-[8px] animate-pulse">
                {todayPurchases.filter(p => p.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Rendering */}
        <div className="min-h-[500px]">
          
          {/* 1. TASKS TAB WITH TIMER */}
          {activeTab === 'tasks' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="font-bold text-stone-800 text-lg">今日生產排程看板 ({currentEmployee?.name})</h3>
                  <p className="text-xs text-stone-500">點擊「開始製作」來記錄工時，製作完成後將自動扣除對應的物料與半成品庫存</p>
                </div>
              </div>

              {employeeTasks.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                  <CheckCircle className="w-12 h-12 text-emerald-500 animate-bounce" />
                  <p className="font-bold text-stone-700 text-sm">今日無分派任務，或所有任務均已完成！</p>
                  <p className="text-xs text-stone-400">您可以切換至其他員工，或前往自主學習。</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {employeeTasks.map(task => {
                    const isPending = task.status === 'pending';
                    const isInProgress = task.status === 'inprogress';
                    const isCompleted = task.status === 'completed';

                    return (
                      <div
                        key={task.id}
                        className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isCompleted
                            ? 'bg-emerald-50/20 border-emerald-200/50 opacity-70'
                            : isInProgress
                            ? 'bg-amber-50/20 border-amber-300/80 shadow-md shadow-amber-50'
                            : 'bg-stone-50/30 border-stone-200/60 hover:bg-stone-50 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${
                            isCompleted ? 'bg-emerald-100 text-emerald-600' : isInProgress ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-400'
                          }`}>
                            <Clock className="w-5 h-5" />
                          </div>

                          <div>
                            <span className={`font-bold text-sm text-stone-800 ${isCompleted ? 'line-through text-stone-400' : ''}`}>
                              {task.name}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                              <span className="font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                                數量: {task.qty} {task.unit}
                              </span>
                              <span className="font-medium text-stone-400">
                                預估工時: {task.requiredTimeHours}h
                              </span>
                              {isCompleted && task.actualTimeHours && (
                                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                  實際花費: {task.actualTimeHours}h
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Stopwatch and Operations */}
                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          {isPending && (
                            <button
                              onClick={() => currentEmployee && onStartTask(task.id, currentEmployee.name)}
                              className="px-4 py-2 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 shadow-sm transition active:scale-95 flex items-center gap-1.5"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> 開始製作
                            </button>
                          )}

                          {isInProgress && task.startTime && (
                            <div className="flex items-center gap-3">
                              {/* Running stopwatch */}
                              <div className="bg-amber-100/60 text-amber-700 px-3 py-1.5 rounded-xl font-mono text-xs font-bold animate-pulse border border-amber-200">
                                已計時: {getElapsedTimeString(task.startTime)}
                              </div>
                              <button
                                onClick={() => triggerCompleteTask(task)}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition active:scale-95"
                              >
                                結束並勾選完成
                              </button>
                            </div>
                          )}

                          {isCompleted && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                onClick={() => onCompleteTask(task.id)}
                                className="text-xs text-stone-400 hover:text-stone-600 underline font-medium"
                              >
                                撤回完成 (還原庫存)
                              </button>
                              
                              {task.overtimeTriggered && (
                                <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100 flex items-center gap-1 mt-1">
                                  ⚠️ 製作超時，下次請留意效率
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. TRAINING TAB (READ-ONLY PROGRESS & RECIPES) */}
          {activeTab === 'training' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">我的學習進度 & 食譜解鎖庫</h3>
                <p className="text-xs text-stone-500">技能分數由您的師傅評估。技能點數達到解鎖門檻時，即可查閱完整的 SOP 設計與 BOM 清單。</p>
              </div>

              <div className="flex flex-col gap-5">
                {recipes.map(recipe => {
                  const userProgress = currentEmployee?.progress[recipe.id] || 0;
                  const isUnlocked = userProgress >= recipe.unlockThreshold;
                  const isExpanded = expandedRecipeId === recipe.id;

                  return (
                    <div
                      key={recipe.id}
                      className={`rounded-2xl border transition-all ${
                        isUnlocked
                          ? 'border-stone-200 bg-stone-50/20'
                          : 'border-stone-100 bg-stone-50/10 opacity-75'
                      }`}
                    >
                      {/* Recipe Title Bar */}
                      <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100">
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
                              解鎖門檻: {recipe.unlockThreshold}% 
                            </p>
                          </div>
                        </div>

                        {/* Drag Progress read-only display with slider disabled */}
                        <div className="flex items-center gap-4 flex-1 max-w-xs sm:justify-end">
                          <div className="flex-grow flex flex-col gap-1">
                            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${isUnlocked ? 'bg-amber-500' : 'bg-stone-400'}`}
                                style={{ width: `${userProgress}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-stone-500 text-right">
                              師父核定: {userProgress}%
                            </span>
                          </div>

                          {isUnlocked ? (
                            <button
                              onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.id)}
                              className="text-stone-500 hover:text-stone-800 transition flex items-center gap-1 text-xs font-bold shrink-0"
                            >
                              {isExpanded ? (
                                <>收合食譜 <ChevronUp className="w-4 h-4" /></>
                              ) : (
                                <>食譜與SOP <ChevronDown className="w-4 h-4" /></>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-stone-400 flex items-center gap-1 shrink-0">
                              <ShieldAlert className="w-3.5 h-3.5 text-stone-300" /> 尚未解鎖
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Recipe SOP Details */}
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

                          {/* SOP Images Preview */}
                          {recipe.images && recipe.images.length > 0 && (
                            <div>
                              <h5 className="text-xs font-bold text-stone-600 mb-2.5">📸 SOP 圖文對照</h5>
                              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                                {recipe.images.map((imgUrl, i) => (
                                  <div key={i} className="flex-shrink-0 w-36 h-24 rounded-xl overflow-hidden border border-stone-200 shadow-sm bg-stone-50 relative group">
                                    <img src={imgUrl} alt={`Step image ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    <div className="absolute top-1 left-1 bg-black/60 text-white font-mono text-[9px] px-1.5 py-0.2 rounded font-extrabold">步驟對照</div>
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
            </div>
          )}

          {/* 3. RECEIVING TAB (TODAY'S DELIVERIES) */}
          {activeTab === 'receiving' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">今日應進貨簽收</h3>
                <p className="text-xs text-stone-500">此清單會自動列出預計今日（{todayISOStr}）到貨的物料採購。請進行實物數量清點，核對無誤後完成簽收。</p>
              </div>

              {/* Receive operator select picker */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200/50">
                <div className="flex items-center gap-2 text-xs text-stone-600 font-bold shrink-0">
                  <UserCheck className="w-4 h-4 text-stone-400" />
                  <span>指定簽收核對人:</span>
                </div>
                <div className="flex gap-2">
                  {employees.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => setReceiverName(emp.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        receiverName === emp.name
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {emp.name}
                    </button>
                  ))}
                </div>
              </div>

              {todayPurchases.filter(p => p.status === 'pending').length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-stone-400">
                  <Truck className="w-12 h-12 text-stone-300" />
                  <p className="font-bold text-stone-600 text-sm">今日沒有待簽收的進貨</p>
                  <p className="text-xs text-stone-400">如需採購叫貨，可前往後台「庫存預警與智能叫貨」發起。</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {todayPurchases.filter(p => p.status === 'pending').map(purchase => (
                    <div
                      key={purchase.id}
                      className="p-5 bg-stone-50/50 border border-stone-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-100/50 text-amber-600 rounded-xl">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-stone-800 text-sm">{purchase.materialName}</h4>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                              purchase.paymentMethod === 'monthly' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {purchase.paymentMethod === 'monthly' ? '月結' : '現結'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-bold text-stone-500 bg-stone-200/50 px-2 py-0.5 rounded">
                              進貨量: {purchase.qty}
                            </span>
                            <span className="text-[11px] font-medium text-stone-400">
                              廠商: {purchase.supplier}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <button
                          onClick={() => {
                            if (!receiverName) {
                              alert('請先在上方選擇指定簽收核對人！');
                              return;
                            }
                            onReceivePurchase(purchase.id, receiverName);
                          }}
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition active:scale-95 flex items-center gap-1"
                        >
                          <Check className="w-4 h-4" /> 確認清點無誤並簽收
                        </button>
                      </div>
                    </div>
                  ))}
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
