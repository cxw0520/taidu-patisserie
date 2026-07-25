import React, { useState } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, TrendingUp, DollarSign, Truck, ClipboardList, Check, HelpCircle } from 'lucide-react';
import { Employee, Material, Recipe, ProductionTask, PurchaseRecord } from './SchedulerApp';

interface AdminConsoleProps {
  employees: Employee[];
  materials: Material[];
  recipes: Recipe[];
  tasks: ProductionTask[];
  purchases: PurchaseRecord[];
  onUpdateEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  onUpdateMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
  onUpdateRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  onUpdateTasks: React.Dispatch<React.SetStateAction<ProductionTask[]>>;
  onUpdatePurchases: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>;
}

export default function AdminConsole({
  employees,
  materials,
  recipes,
  tasks,
  purchases,
  onUpdateEmployees,
  onUpdateMaterials,
  onUpdateRecipes,
  onUpdateTasks,
  onUpdatePurchases
}: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<'scheduling' | 'bom' | 'inventory' | 'finance'>('scheduling');

  // Input states for adding new elements in mockup
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpHours, setNewEmpHours] = useState(8);
  const [newEmpRole, setNewEmpRole] = useState('烘焙助手');

  const [newMatName, setNewMatName] = useState('');
  const [newMatQty, setNewMatQty] = useState(10);
  const [newMatMin, setNewMatMin] = useState(5);
  const [newMatUnit, setNewMatUnit] = useState('kg');
  const [newMatCost, setNewMatCost] = useState(100);
  const [newMatSupplier, setNewMatSupplier] = useState('');

  // Calculate totals for scheduling
  const totalAvailableHours = employees.reduce((acc, curr) => acc + curr.hours, 0);
  const totalTaskHours = tasks.reduce((acc, curr) => acc + curr.requiredTimeHours, 0);

  // Financial Dashboard calculation
  const totalExpenses = purchases.reduce((acc, curr) => acc + curr.cost, 0);
  const pendingExpenses = purchases.filter(p => p.status === 'pending').reduce((acc, curr) => acc + curr.cost, 0);
  const accountsPayable = purchases.filter(p => p.status === 'received').reduce((acc, curr) => acc + curr.cost, 0);

  // Auto-scheduling simulation logic
  const handleAutoSchedule = () => {
    // Generate simulated tasks to fit available work hours
    const baseTasks = [
      { name: '經典法式草莓塔', qty: 15, unit: '個', time: 3.0 },
      { name: '法式塔皮(半成品)', qty: 30, unit: '個', time: 4.5 },
      { name: '香草卡士達醬(半成品)', qty: 2000, unit: 'g', time: 2.5 },
      { name: '法式千層蛋糕(半成品)', qty: 2, unit: '個', time: 3.5 },
      { name: '檸檬糖霜蛋糕', qty: 8, unit: '個', time: 2.0 },
      { name: '原物料簽收備料', qty: 1, unit: '次', time: 1.0 },
      { name: '庫存盤點與環境清潔', qty: 1, unit: '次', time: 1.5 }
    ];

    const generatedTasks: ProductionTask[] = [];
    let currentHourCount = 0;

    // Distribute among employees
    employees.forEach((emp, empIdx) => {
      let empAllocatedHours = 0;
      // Assign 2-3 tasks to this employee
      const seed = empIdx * 2;
      const t1 = baseTasks[seed % baseTasks.length];
      const t2 = baseTasks[(seed + 1) % baseTasks.length];

      if (empAllocatedHours + t1.time <= emp.hours) {
        generatedTasks.push({
          id: `tsk-gen-${emp.id}-1`,
          name: t1.name,
          qty: t1.qty,
          unit: t1.unit,
          assignedTo: emp.name,
          status: 'pending',
          requiredTimeHours: t1.time
        });
        empAllocatedHours += t1.time;
      }

      if (empAllocatedHours + t2.time <= emp.hours) {
        generatedTasks.push({
          id: `tsk-gen-${emp.id}-2`,
          name: t2.name,
          qty: t2.qty,
          unit: t2.unit,
          assignedTo: emp.name,
          status: 'pending',
          requiredTimeHours: t2.time
        });
      }
    });

    onUpdateTasks(generatedTasks);
    alert('自動排程模擬完成！已根據員工人數與總可用工時，自動分配任務。可切換至前台查看。');
  };

  // Auto-ordering logic based on safety levels
  const handleSmartOrder = () => {
    const lowStockMaterials = materials.filter(m => m.qty < m.minQty);
    if (lowStockMaterials.length === 0) {
      alert('所有原物料與半成品均高於安全庫存水位，目前不需要叫貨！');
      return;
    }

    const newPurchases: PurchaseRecord[] = [];
    lowStockMaterials.forEach(mat => {
      // Calculate replenish amount to double the minQty
      const reorderQty = parseFloat((mat.minQty * 2 - mat.qty).toFixed(1));
      if (reorderQty > 0) {
        newPurchases.push({
          id: `pur-auto-${Date.now()}-${mat.id}`,
          materialName: mat.name,
          qty: reorderQty,
          cost: Math.round(reorderQty * mat.cost),
          supplier: mat.supplier === '自家生產' ? '原料庫房' : mat.supplier,
          status: 'pending',
          date: new Date().toISOString().split('T')[0]
        });
      }
    });

    if (newPurchases.length > 0) {
      onUpdatePurchases(prev => [...newPurchases, ...prev]);
      alert(`已成功發起智能一鍵叫貨！生成了 ${newPurchases.length} 筆採購叫貨單（可至前台「物料進貨簽收」頁面處理簽收）。`);
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
      progress: { 'rec-1': 10, 'rec-2': 10, 'rec-3': 10 }
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
      minQty: newMatMin,
      cost: newMatCost,
      supplier: newMatSupplier || '無指定廠商',
      type: 'raw'
    };

    onUpdateMaterials(prev => [...prev, newMat]);
    setNewMatName('');
    setNewMatSupplier('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar: Navigation Accordion */}
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
            排班與工時設定
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
            庫存預警與智能叫貨
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'finance'
                ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            消耗統計與廠商帳款
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-stone-100">
          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 flex flex-col gap-2">
            <h4 className="text-xs font-bold text-blue-700">自動排程核心</h4>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              系統會根據本日排班的**總工時**，合理分派草莓塔、卡士達等生產量，避免員工過勞並確保產能最大化。
            </p>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="min-h-[550px]">
          
          {/* TAB 1: SCHEDULING & MANPOWER */}
          {activeTab === 'scheduling' && (
            <div className="flex flex-col gap-6">
              {/* Metric Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">今日總可用人力</span>
                  <span className="text-2xl font-bold text-stone-800">{employees.length} 人</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">總排班可用工時</span>
                  <span className="text-2xl font-bold text-blue-600">{totalAvailableHours} 小時</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">已分配生產工時</span>
                  <span className="text-2xl font-bold text-stone-700">{totalTaskHours} 小時</span>
                </div>
              </div>

              {/* Employees List */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="font-bold text-stone-800 text-lg">員工排班工時管理</h3>
                    <p className="text-xs text-stone-500">在此設定今日上班的員工及其工時，供自動排班分配任务使用</p>
                  </div>
                  <button
                    onClick={handleAutoSchedule}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-md shadow-blue-200/50"
                  >
                    ⚙️ 自動計算並排程
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {employees.map(emp => (
                    <div key={emp.id} className="p-4 bg-stone-50/50 border border-stone-200 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                          {emp.name[0]}
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-800 text-sm">{emp.name}</h4>
                          <p className="text-xs text-stone-400">{emp.role}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs text-stone-600">
                          <Clock className="w-4 h-4 text-stone-400" />
                          <span>今日排班: <strong>{emp.hours}</strong> 小時</span>
                        </div>
                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new employee mock form */}
                <form onSubmit={handleAddEmployee} className="p-5 bg-stone-50 border border-stone-200/60 rounded-2xl flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-500">員工姓名</label>
                    <input
                      type="text"
                      placeholder="例如: 阿偉"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="w-full sm:w-32 flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-500">角色定位</label>
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
                    <Plus className="w-4 h-4" /> 新增員工
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: BOM & RECIPES */}
          {activeTab === 'bom' && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="font-bold text-stone-800 text-lg">食譜 BOM 與 SOP 配置管理</h3>
                <p className="text-xs text-stone-500">建立店內產品所消耗的原物料比例、製程 SOP，以及對應的員工學習進度解鎖門檻</p>
              </div>

              <div className="flex flex-col gap-4">
                {recipes.map(recipe => (
                  <div key={recipe.id} className="p-5 border border-stone-200 rounded-2xl bg-stone-50/30 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-stone-800 text-sm">{recipe.name}</h4>
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-stone-200 text-stone-600 tracking-wider">
                          {recipe.type === 'finished' ? '成品' : '半成品'}
                        </span>
                      </div>
                      <span className="text-xs text-stone-500">
                        最低技能解鎖門檻: <strong>{recipe.unlockThreshold}%</strong>
                      </span>
                    </div>

                    <div>
                      <h5 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">配方消耗清單 (BOM)</h5>
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

          {/* TAB 3: INVENTORY SAFETY & AUTO-ORDER */}
          {activeTab === 'inventory' && (
            <div className="flex flex-col gap-6">
              {/* Auto ordering button header */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-stone-800 text-lg">物料安全水位預警與採購</h3>
                  <p className="text-xs text-stone-500">系統自動比對實體庫存。當庫存低於預設安全水位時，自動提示並建立採購叫貨單。</p>
                </div>
                <button
                  onClick={handleSmartOrder}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-md shadow-blue-200/50"
                >
                  ⚡️ 智能一鍵叫貨
                </button>
              </div>

              {/* Materials stock warning list */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">物料清單明細</h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 text-stone-400 font-bold">
                        <th className="pb-3">物料名稱</th>
                        <th className="pb-3">目前庫存</th>
                        <th className="pb-3">安全水位</th>
                        <th className="pb-3">狀態標籤</th>
                        <th className="pb-3">預估成本</th>
                        <th className="pb-3">供應商</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {materials.map(mat => {
                        const isLow = mat.qty < mat.minQty;
                        return (
                          <tr key={mat.id} className="text-stone-700">
                            <td className="py-4 font-bold">{mat.name}</td>
                            <td className="py-4 font-mono font-bold text-stone-800">
                              {mat.qty} {mat.unit}
                            </td>
                            <td className="py-4 font-mono text-stone-500">
                              {mat.minQty} {mat.unit}
                            </td>
                            <td className="py-4">
                              {isLow ? (
                                <span className="px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-bold rounded-full flex items-center gap-1 w-max">
                                  <AlertTriangle className="w-3.5 h-3.5" /> 低於水位
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-bold rounded-full flex items-center gap-1 w-max">
                                  <Check className="w-3.5 h-3.5" /> 庫存充沛
                                </span>
                              )}
                            </td>
                            <td className="py-4 font-mono">${mat.cost} / {mat.unit}</td>
                            <td className="py-4 text-stone-500">{mat.supplier}</td>
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
                <form onSubmit={handleAddMaterial} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <label className="text-[11px] font-bold text-stone-400">安全水位</label>
                    <input
                      type="number"
                      value={newMatMin}
                      onChange={(e) => setNewMatMin(Number(e.target.value))}
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
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-400">指定廠商</label>
                    <input
                      type="text"
                      placeholder="如: 德麥食品"
                      value={newMatSupplier}
                      onChange={(e) => setNewMatSupplier(e.target.value)}
                      className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-stone-900 transition shadow-sm active:scale-95"
                    >
                      建立原料品項
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: FINANCIAL CONSUMPTION & AP */}
          {activeTab === 'finance' && (
            <div className="flex flex-col gap-6">
              {/* Financial KPI stats */}
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

              {/* Purchase accounts breakdown list */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200/60 shadow-sm flex flex-col gap-4">
                <h3 className="font-bold text-stone-800 text-lg">採購清單與應付帳款明細</h3>
                <p className="text-xs text-stone-500">已簽收的採購單將納入「應付帳款 (Accounts Payable)」，未簽收的列為「在途叫貨」</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 text-stone-400 font-bold">
                        <th className="pb-3">採購品項</th>
                        <th className="pb-3">採購數量</th>
                        <th className="pb-3">採購總價</th>
                        <th className="pb-3">廠商名稱</th>
                        <th className="pb-3">訂單狀態</th>
                        <th className="pb-3">叫貨日期</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {purchases.map(p => (
                        <tr key={p.id} className="text-stone-700">
                          <td className="py-4 font-bold">{p.materialName}</td>
                          <td className="py-4 font-mono font-bold text-stone-800">{p.qty}</td>
                          <td className="py-4 font-mono text-stone-600">${p.cost}</td>
                          <td className="py-4 text-stone-500">{p.supplier}</td>
                          <td className="py-4">
                            {p.status === 'received' ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-bold rounded-full w-max inline-block">
                                已簽收 (轉入應付)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-bold rounded-full w-max inline-block">
                                在途叫貨 (未決)
                              </span>
                            )}
                          </td>
                          <td className="py-4 text-stone-400 font-mono">{p.date}</td>
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
