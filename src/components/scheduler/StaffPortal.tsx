import React, { useState } from 'react';
import { CheckCircle, Circle, BookOpen, Clock, Award, ChevronDown, ChevronUp, Check, Truck, AlertCircle } from 'lucide-react';
import { Employee, ProductionTask, Recipe, PurchaseRecord, Material } from './SchedulerApp';

interface StaffPortalProps {
  employees: Employee[];
  tasks: ProductionTask[];
  recipes: Recipe[];
  purchases: PurchaseRecord[];
  materials: Material[];
  onCompleteTask: (taskId: string) => void;
  onReceivePurchase: (purchaseId: string) => void;
  onUpdateProgress: (empId: string, recipeId: string, newProgress: number) => void;
}

export default function StaffPortal({
  employees,
  tasks,
  recipes,
  purchases,
  materials,
  onCompleteTask,
  onReceivePurchase,
  onUpdateProgress
}: StaffPortalProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'tasks' | 'training' | 'receiving'>('tasks');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  const currentEmployee = employees.find(e => e.id === selectedEmpId);
  const employeeTasks = tasks.filter(t => t.assignedTo === currentEmployee?.name);
  const pendingPurchases = purchases.filter(p => p.status === 'pending');

  const handleProgressSliderChange = (recipeId: string, val: number) => {
    onUpdateProgress(selectedEmpId, recipeId, val);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Employee Picker */}
      <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest">當前登入員工</h3>
          <p className="text-xs text-stone-500 mt-1">切換員工帳號以查看專屬排程與學習進度</p>
        </div>

        <div className="flex flex-col gap-2.5">
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
                className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                  isActive
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                    : 'bg-stone-50/50 border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 text-sm">{emp.name}</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 tracking-wider">
                    {emp.role}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-500">
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
            <h4 className="text-xs font-bold text-stone-600">快捷小技巧</h4>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              當您在前台勾選完成一項「經典法式草莓塔」的生產任務時，系統會自動在後台庫存中扣減麵粉、奶油與草莓。
            </p>
          </div>
        </div>
      </div>

      {/* Main Employee Workspace */}
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
            當日生產排程
          </button>
          <button
            onClick={() => setActiveTab('training')}
            className={`px-6 py-3 font-bold text-xs tracking-wider uppercase border-b-2 transition-all -mb-[2px] ${
              activeTab === 'training'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            教學進度與食譜
          </button>
          <button
            onClick={() => setActiveTab('receiving')}
            className={`px-6 py-3 font-bold text-xs tracking-wider uppercase border-b-2 transition-all -mb-[2px] flex items-center gap-2 ${
              activeTab === 'receiving'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            物料進貨簽收
            {pendingPurchases.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block" />
            )}
          </button>
        </div>

        {/* Tab Content Rendering */}
        <div className="min-h-[500px]">
          {/* 1. TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="font-bold text-stone-800 text-lg">今日生產清單 ({currentEmployee?.name})</h3>
                  <p className="text-xs text-stone-500">勾選完成任務後，後台會自動核銷相對應的物料與半成品庫存</p>
                </div>
              </div>

              {employeeTasks.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                  <p className="font-bold text-stone-700 text-sm">今日無分派任務，或所有任務均已完成！</p>
                  <p className="text-xs text-stone-400">您可以切換至其他員工，或前往「教學進度與食譜」自主學習。</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {employeeTasks.map(task => {
                    const isCompleted = task.status === 'completed';
                    return (
                      <div
                        key={task.id}
                        className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                          isCompleted
                            ? 'bg-emerald-50/30 border-emerald-200/70 opacity-70'
                            : 'bg-stone-50/30 border-stone-200/60 hover:bg-stone-50 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => onCompleteTask(task.id)}
                            disabled={isCompleted}
                            className={`p-1 rounded-full transition-colors flex items-center justify-center ${
                              isCompleted ? 'text-emerald-500 cursor-default' : 'text-stone-400 hover:text-amber-500'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-6 h-6" />
                            ) : (
                              <Circle className="w-6 h-6" />
                            )}
                          </button>

                          <div>
                            <span className={`font-bold text-sm text-stone-800 ${isCompleted ? 'line-through text-stone-400' : ''}`}>
                              {task.name}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-lg">
                                生產數量: {task.qty} {task.unit}
                              </span>
                              <span className="text-[11px] font-medium text-stone-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                預估工時: {task.requiredTimeHours} 小時
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {isCompleted ? (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-100/50 px-3 py-1 rounded-full flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> 已完成，庫存已扣除
                            </span>
                          ) : (
                            <button
                              onClick={() => onCompleteTask(task.id)}
                              className="px-4 py-2 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 shadow-sm transition active:scale-95"
                            >
                              標記完成
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. TRAINING TAB */}
          {activeTab === 'training' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">技能教學與食譜解鎖</h3>
                <p className="text-xs text-stone-500">拉動進度條以模擬您的學習成就。技能達標後將自動解鎖該食譜與標準 SOP 步驟。</p>
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
                              解鎖門檻: 技能值 {recipe.unlockThreshold}% (目前: {userProgress}%)
                            </p>
                          </div>
                        </div>

                        {/* Drag Progress slider to simulate learning progress */}
                        <div className="flex items-center gap-4 flex-1 max-w-xs sm:justify-end">
                          <div className="flex-1">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={userProgress}
                              onChange={(e) => handleProgressSliderChange(recipe.id, Number(e.target.value))}
                              className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                          </div>

                          {isUnlocked ? (
                            <button
                              onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.id)}
                              className="text-stone-500 hover:text-stone-800 transition flex items-center gap-1 text-xs font-bold"
                            >
                              {isExpanded ? (
                                <>收合食譜 <ChevronUp className="w-4 h-4" /></>
                              ) : (
                                <>展開食譜 <ChevronDown className="w-4 h-4" /></>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-stone-400 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-stone-300" /> 未解鎖
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
                                        需要: {bomItem.qty} {bomItem.unit}
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

          {/* 3. RECEIVING TAB */}
          {activeTab === 'receiving' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">物料到貨簽收</h3>
                <p className="text-xs text-stone-500">原料商送貨達店面時，請點選簽收。簽收後，系統將自動累計對應原物料的實體庫存量。</p>
              </div>

              {pendingPurchases.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-stone-400">
                  <Truck className="w-12 h-12 text-stone-300" />
                  <p className="font-bold text-stone-600 text-sm">目前無任何待簽收的物料</p>
                  <p className="text-xs text-stone-400">當後台發起智能庫存採購叫貨時，採購單會即時出現在此處供前台簽收。</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {pendingPurchases.map(purchase => (
                    <div
                      key={purchase.id}
                      className="p-5 bg-stone-50/50 hover:bg-stone-50/80 border border-stone-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-100/50 text-amber-600 rounded-xl">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-800 text-sm">{purchase.materialName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-bold text-stone-500 bg-stone-200/50 px-2 py-0.5 rounded">
                              進貨數量: {purchase.qty}
                            </span>
                            <span className="text-[11px] font-medium text-stone-400">
                              廠商: {purchase.supplier}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <button
                          onClick={() => onReceivePurchase(purchase.id)}
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition active:scale-95 flex items-center gap-1"
                        >
                          <Check className="w-4 h-4" /> 確認簽收進庫
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
    </div>
  );
}
