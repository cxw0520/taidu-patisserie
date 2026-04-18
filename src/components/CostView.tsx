import React, { useState, useEffect, useMemo, KeyboardEvent } from 'react';
import { db } from '../lib/firebase';
import { collection, query, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Settings, Material } from '../types';
import { Plus, Edit2, ChevronDown, ChevronRight, Save, Trash2, PieChart, Tag, Filter, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uid, fmt } from '../lib/utils';
import { cn } from '../lib/utils';

interface RecipeItem {
  id: string;
  type: 'material' | 'half';
  itemId: string;
  quantity: number;
}

interface Recipe {
  id: string;
  name: string;
  type: 'finished' | 'half';
  yield: number;
  unit: string;
  items: RecipeItem[];
  tags: string[];
}

const emptyRecipe = (): Recipe => ({
  id: '',
  name: '',
  type: 'finished',
  yield: 1,
  unit: '',
  items: [],
  tags: []
});

export default function CostView({ settings, shopId }: { settings: Settings, shopId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Recipe>(emptyRecipe());
  const [isEditing, setIsEditing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');

  useEffect(() => {
    const qMat = query(collection(db, 'shops', shopId, 'materials'));
    const unsubMat = onSnapshot(qMat, (snap) => {
      setMaterials(snap.docs.map(d => d.data() as Material));
    });

    const qRec = query(collection(db, 'shops', shopId, 'recipes'));
    const unsubRec = onSnapshot(qRec, (snap) => {
      setRecipes(snap.docs.map(d => ({...emptyRecipe(), ...d.data()} as Recipe)));
    });

    return () => {
      unsubMat();
      unsubRec();
    };
  }, [shopId]);

  const costs = useMemo(() => {
    const memo: Record<string, number> = {};
    const getCost = (recipeId: string, visited = new Set<string>()): number => {
      if (memo[recipeId] !== undefined) return memo[recipeId];
      if (visited.has(recipeId)) return 0;
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe || recipe.yield <= 0) return 0;
      
      let total = 0;
      for (const item of recipe.items) {
        if (item.type === 'material') {
          const mat = materials.find(m => m.id === item.itemId);
          total += (mat?.avgCost || 0) * item.quantity;
        } else {
          total += getCost(item.itemId, new Set([...visited, recipeId])) * item.quantity;
        }
      }
      const unitCost = total / recipe.yield;
      memo[recipeId] = unitCost;
      return unitCost;
    };

    const costMap: Record<string, number> = {};
    recipes.forEach(r => {
      costMap[r.id] = getCost(r.id);
    });
    return costMap;
  }, [recipes, materials]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    recipes.forEach(r => r.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      if (filterTag && (!r.tags || !r.tags.includes(filterTag))) return false;
      if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [recipes, filterTag, searchQuery]);

  const finished = filteredRecipes.filter(r => r.type === 'finished');
  const halfway = filteredRecipes.filter(r => r.type === 'half');

  const handleEdit = (r: Recipe) => {
    setFormData(JSON.parse(JSON.stringify({...emptyRecipe(), ...r})));
    setIsEditing(true);
    setTagInput('');
  };

  const handleCreateNew = () => {
    setFormData(emptyRecipe());
    setIsEditing(true);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!formData.name) return alert('請填寫名稱');
    if (formData.yield <= 0 || !Number.isInteger(formData.yield)) return alert('產出數量必須為大於0的整數');
    
    const id = formData.id || uid();
    await setDoc(doc(db, 'shops', shopId, 'recipes', id), { ...formData, id });
    setIsEditing(false);
    setFormData(emptyRecipe());
  };

  const handleDelete = async (id: string) => {
    // Note: window.confirm is blocked in iframe previews
    await deleteDoc(doc(db, 'shops', shopId, 'recipes', id));
  };

  const addItem = (type: 'material' | 'half') => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: uid(), type, itemId: '', quantity: 0 }]
    }));
  };

  const updateItem = (id: string, field: string, val: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, [field]: val } : i)
    }));
  };

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id)
    }));
  };
  
  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/,/g, '');
      if (newTag && !formData.tags.includes(newTag)) {
        setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      setTagInput('');
    }
  };
  
  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  };

  const renderRecipeItem = (r: Recipe) => {
    const isExp = expandedId === r.id;
    return (
      <div key={r.id} className="border border-coffee-100 rounded-xl mb-3 overflow-hidden bg-white shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between p-4 cursor-pointer bg-coffee-50/30" onClick={() => setExpandedId(isExp ? null : r.id)}>
          <div className="flex items-center gap-3">
            {isExp ? <ChevronDown className="w-5 h-5 text-coffee-400" /> : <ChevronRight className="w-5 h-5 text-coffee-400" />}
            <div>
              <div className="font-bold text-coffee-800 text-lg flex items-center gap-2">
                {r.name}
                {r.tags && r.tags.map(t => (
                  <span key={t} className="text-[10px] bg-coffee-100 text-coffee-600 px-1.5 py-0.5 rounded font-bold">{t}</span>
                ))}
              </div>
              <div className="text-xs text-coffee-400 font-mono mt-0.5">1單位成本: ${costs[r.id]?.toFixed(2)} / {r.unit || '單位'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => handleEdit(r)} className="px-3 py-1.5 bg-coffee-100 text-coffee-600 rounded-lg hover:bg-coffee-200 text-xs font-bold font-serif-brand transition flex items-center gap-1 group">
              <Edit2 className="w-3 h-3 group-hover:rotate-12 transition-transform" /> EDIT
            </button>
            <button onClick={() => handleDelete(r.id)} className="px-2 py-1.5 bg-danger-brand/10 text-danger-brand rounded-lg hover:bg-danger-brand hover:text-white text-xs font-bold transition">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {isExp && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-coffee-50 bg-[#faf7f2] p-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="font-bold text-coffee-600 border-b border-coffee-200 pb-1 mb-2">配方內容</h5>
                  {r.items.length === 0 && <span className="text-gray-400 italic">無設定配方</span>}
                  <ul className="space-y-1">
                    {r.items.map(item => {
                      const name = item.type === 'material' ? materials.find(m => m.id === item.itemId)?.name : recipes.find(x => x.id === item.itemId)?.name;
                      const unit = item.type === 'material' ? materials.find(m => m.id === item.itemId)?.unit : recipes.find(x => x.id === item.itemId)?.unit;
                      return (
                        <li key={item.id} className="flex justify-between text-coffee-700">
                          <span>• {name || <span className="text-red-400">未知項目</span>}</span>
                          <span className="font-mono">{item.quantity} {unit}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <h5 className="font-bold text-coffee-600 border-b border-coffee-200 pb-1 mb-2">產出</h5>
                  <div className="text-coffee-700 font-mono">{r.yield} {r.unit}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in duration-500 h-full font-sans">
      <div className="glass-panel p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-10 bg-white/40 border-0 shadow-none">
        
        {/* Left Pane - Lists */}
        <div>
          <div className="mb-6 pb-4 border-b-2 border-coffee-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h2 className="text-2xl font-bold text-coffee-800 tracking-wider">成本分析</h2>
              <p className="text-coffee-400 text-sm mt-1 uppercase tracking-widest font-bold">Cost Calculation</p>
            </div>
            
            {/* Filter Bar */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-40">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜尋配方..." 
                  className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-coffee-100 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-400"
                />
              </div>
              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select 
                  value={filterTag} 
                  onChange={e => setFilterTag(e.target.value)}
                  className="pl-9 pr-6 py-2 bg-white rounded-xl border border-coffee-100 text-sm font-bold text-coffee-700 outline-none focus:border-coffee-400 appearance-none max-w-[150px]"
                >
                  <option value="">所有標籤</option>
                  {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
          
          <div className="space-y-8">
            <section>
              <h3 className="text-lg font-bold text-coffee-700 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5" /> 成品
              </h3>
              {finished.map(renderRecipeItem)}
              {finished.length === 0 && <div className="text-center p-6 bg-coffee-50/50 rounded-xl text-coffee-400 text-sm border border-dashed border-coffee-200">無符合條件的成品配方</div>}
            </section>
            
            <section>
              <h3 className="text-lg font-bold text-coffee-700 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5" /> 半成品
              </h3>
              {halfway.map(renderRecipeItem)}
              {halfway.length === 0 && <div className="text-center p-6 bg-coffee-50/50 rounded-xl text-coffee-400 text-sm border border-dashed border-coffee-200">無符合條件的半成品配方</div>}
            </section>
          </div>
        </div>

        {/* Right Pane - Form */}
        <div>
          <div className="glass-panel p-6 bg-[#faf7f2]/80 border shadow-lg border-coffee-100 rounded-3xl sticky top-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-coffee-800">{isEditing ? '編輯配方' : '新增配方'}</h3>
              {!isEditing && (
                <button onClick={handleCreateNew} className="bg-coffee-600 text-white px-4 py-2 rounded-xl font-bold shadow-md hover:bg-coffee-700 transition active:scale-95 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> 建立新配方
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-coffee-500 mb-1">名稱 (item_name)</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-b-2 border-coffee-200 bg-transparent py-2 outline-none focus:border-coffee-600 font-bold text-lg text-coffee-800" placeholder="例如: 經典可麗露" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-coffee-500 mb-1 flex items-center gap-1"><Tag className="w-3 h-3"/> 標籤 (Tags)</label>
                    <div className="flex flex-col gap-2">
                        <select 
                            onChange={(e) => {
                                const newTag = e.target.value;
                                if (newTag && !formData.tags.includes(newTag)) {
                                    setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
                                }
                                e.target.value = ''; // Reset select
                            }}
                            className="p-2 border border-coffee-200 bg-white rounded-xl text-sm font-bold text-coffee-700 outline-none focus:border-coffee-500"
                            defaultValue=""
                        >
                            <option value="" disabled>-- 選擇現有標籤 --</option>
                            {allTags.filter(t => !formData.tags.includes(t)).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>

                        <div className="flex flex-wrap gap-2 p-3 bg-white/50 border border-coffee-100 rounded-xl min-h-[42px] items-center">
                          {formData.tags.map(t => (
                            <span key={t} className="bg-coffee-100 text-coffee-700 px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 group">
                              {t} <button onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100 text-rose-brand"><Trash2 className="w-3 h-3"/></button>
                            </span>
                          ))}
                          <input 
                            type="text" 
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder={formData.tags.length === 0 ? "輸入自訂新標籤，按下 Enter..." : "輸入新標籤..."}
                            className="bg-transparent border-none outline-none text-sm font-bold text-coffee-600 flex-1 min-w-[100px] placeholder-coffee-200"
                          />
                        </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-coffee-500 mb-1">產出數量 (number)</label>
                    <input type="number" min="1" step="1" value={formData.yield || ''} onChange={e => setFormData({...formData, yield: parseInt(e.target.value, 10) || 0})} className="w-full border-b-2 border-coffee-200 bg-transparent py-2 outline-none focus:border-coffee-600 font-mono text-coffee-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-coffee-500 mb-1">單位 (unit)</label>
                    <input type="text" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full border-b-2 border-coffee-200 bg-transparent py-2 outline-none focus:border-coffee-600 font-mono text-coffee-800" placeholder="例如: 顆" />
                  </div>
                </div>

                <div className="flex gap-6 mt-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", formData.type === 'finished' ? "border-coffee-600" : "border-gray-300 group-hover:border-coffee-400")}>
                      {formData.type === 'finished' && <div className="w-2.5 h-2.5 rounded-full bg-coffee-600" />}
                    </div>
                    <input type="radio" checked={formData.type === 'finished'} onChange={() => setFormData({...formData, type: 'finished'})} className="hidden" />
                    <span className="font-bold text-coffee-700">成品</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", formData.type === 'half' ? "border-rose-brand" : "border-gray-300 group-hover:border-rose-brand")}>
                      {formData.type === 'half' && <div className="w-2.5 h-2.5 rounded-full bg-rose-brand" />}
                    </div>
                    <input type="radio" checked={formData.type === 'half'} onChange={() => setFormData({...formData, type: 'half'})} className="hidden" />
                    <span className="font-bold text-coffee-700">半成品</span>
                  </label>
                </div>

                <div className="h-[1px] bg-coffee-100 my-6"></div>

                {/* 食材區塊 */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-coffee-800">所需食材</h4>
                    <button onClick={() => addItem('material')} className="px-3 py-1 bg-coffee-100 text-coffee-700 font-bold text-xs rounded-lg hover:bg-coffee-200 flex items-center gap-1 transition">
                      <Plus className="w-3 h-3"/> new
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formData.items.filter(i => i.type === 'material').map(item => (
                      <div key={item.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-coffee-50">
                        <select value={item.itemId} onChange={e => updateItem(item.id, 'itemId', e.target.value)} className="flex-1 bg-transparent border-none outline-none font-bold text-coffee-700 text-sm w-32">
                          <option value="">-- 選擇食材 --</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>{m.name} (${m.avgCost}/{m.unit})</option>
                          ))}
                        </select>
                        <input type="number" step="0.01" value={item.quantity || ''} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none text-center font-mono text-sm" placeholder="用量" />
                        <span className="text-gray-400 text-xs w-6">{materials.find(m => m.id === item.itemId)?.unit || ''}</span>
                        <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 hover:text-danger-brand transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 半成品區塊 */}
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-coffee-800">所需半成品</h4>
                    <button onClick={() => addItem('half')} className="px-3 py-1 bg-rose-50 text-rose-brand font-bold text-xs rounded-lg hover:bg-rose-100 flex items-center gap-1 transition">
                      <Plus className="w-3 h-3"/> new
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formData.items.filter(i => i.type === 'half').map(item => (
                      <div key={item.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-coffee-50">
                        <select value={item.itemId} onChange={e => updateItem(item.id, 'itemId', e.target.value)} className="flex-1 bg-transparent border-none outline-none font-bold text-coffee-700 text-sm w-32">
                          <option value="">-- 選擇半成品 --</option>
                          {halfway.map(m => (
                            <option key={m.id} value={m.id}>{m.name} (${costs[m.id]?.toFixed(2)}/{m.unit})</option>
                          ))}
                        </select>
                        <input type="number" step="0.01" value={item.quantity || ''} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none text-center font-mono text-sm" placeholder="用量" />
                        <span className="text-gray-400 text-xs w-6">{halfway.find(h => h.id === item.itemId)?.unit || ''}</span>
                        <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 hover:text-danger-brand transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-coffee-100">
                  {formData.id && (
                    <button onClick={() => setIsEditing(false)} className="px-6 py-2 rounded-xl font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
                      取消
                    </button>
                  )}
                  <button onClick={handleSave} className="px-6 py-2 rounded-xl font-bold bg-coffee-800 text-white shadow-md hover:bg-coffee-900 focus:ring-4 focus:ring-coffee-200 transition active:scale-95 flex items-center gap-2">
                    <Save className="w-4 h-4" /> 儲存配方
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-coffee-300 border-2 border-dashed border-coffee-200 rounded-2xl bg-white/50">
                <PieChart className="w-12 h-12 mb-4 text-coffee-200" />
                <p className="font-bold">從左側選擇配方編輯，或點擊建立新配方</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
