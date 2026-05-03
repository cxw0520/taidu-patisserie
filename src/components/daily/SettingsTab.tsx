import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, DailyReport, Order, Customer } from '../../types';
import { uid, fmt, cn, parseNum, normalizeFlavorName } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, writeBatch, collection, query, onSnapshot } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Check, X, GripVertical, Settings as SettingsIcon, RefreshCw, Gift, Cookie, Box, Package } from 'lucide-react';


export default function SettingsTab({
  settings,
  shopId,
  dailyActive,
  updateDaily,
}: {
  settings: Settings;
  shopId: string;
  dailyActive?: DailyReport['dailyActive'];
  updateDaily: (patch: Partial<DailyReport>) => void;
}) {
  const updateSettings = async (newSettings: Settings) => {
    try {
      await setDoc(doc(db, 'shops', shopId, 'meta', 'settings'), newSettings);
    } catch (e: any) {
      alert('設定儲存失敗: ' + e.message);
      console.error(e);
    }
  };

  const handleToggle = (type: 'giftItems' | 'singleItems' | 'packagingItems', itemId: string, active: boolean) => {
    updateDaily({
      dailyActive: {
        ...(dailyActive || {}),
        [type]: {
          ...((dailyActive && dailyActive[type]) || {}),
          [itemId]: active,
        },
      },
    });
  };

  const handleChange = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number, field: string, val: any) => {
    const newItems = [...settings[type]];
    newItems[idx] = { ...newItems[idx], [field]: val };
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleDelete = (type: 'giftItems' | 'singleItems' | 'packagingItems', idx: number) => {
    // Note: window.confirm is blocked in iframe previews, directly deleting instead
    const newItems = [...settings[type]];
    newItems.splice(idx, 1);
    updateSettings({ ...settings, [type]: newItems });
  };

  const handleAdd = (type: 'giftItems' | 'singleItems' | 'packagingItems') => {
    const newItems = [...settings[type], { id: uid(), name: '新品項', price: 0, active: true }];
    updateSettings({ ...settings, [type]: newItems });
  };

  // Custom Categories handlers
  const handleAddCustomCategory = () => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.push({
        id: uid(),
        name: `自訂新類別 ${newCategories.length + 1}`,
        items: []
    });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleRenameCustomCategory = (idx: number, newName: string) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[idx].name = newName;
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleDeleteCustomCategory = (idx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories.splice(idx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomToggle = (catId: string, itemId: string, active: boolean) => {
    updateDaily({
      dailyActive: {
        ...(dailyActive || {}),
        customCategories: {
          ...((dailyActive && dailyActive.customCategories) || {}),
          [catId]: {
            ...(((dailyActive && dailyActive.customCategories && dailyActive.customCategories[catId]) || {})),
            [itemId]: active,
          },
        },
      },
    });
  };

  const handleCustomChange = (catIdx: number, itemIdx: number, field: string, val: any) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items[itemIdx] = { ...newCategories[catIdx].items[itemIdx], [field]: val };
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleCustomDelete = (catIdx: number, itemIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.splice(itemIdx, 1);
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const handleAddCustomItem = (catIdx: number) => {
    const newCategories = [...(settings.customCategories || [])];
    newCategories[catIdx].items.push({ id: uid(), name: '新品項', price: 0, active: true });
    updateSettings({ ...settings, customCategories: newCategories });
  };

  const [recipeModal, setRecipeModal] = useState<{ isOpen: boolean; gbIndex: number | null }>({ isOpen: false, gbIndex: null });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center glass-panel p-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-coffee-800">
          <SettingsIcon className="w-6 h-6 text-coffee-600" /> 品項與價格全域設定
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={handleAddCustomCategory} className="bg-coffee-600 text-white border text-sm font-bold border-coffee-600 px-4 py-2 rounded-xl hover:bg-coffee-700 transition shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> 自訂新類別
          </button>
          <button onClick={() => window.location.reload()} className="bg-white border text-sm font-bold border-coffee-200 px-4 py-2 rounded-xl text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> 重新整理
          </button>
        </div>
      </div>

      {[{ type: 'giftItems', title: '禮盒', icon: Gift }, { type: 'singleItems', title: '單顆', icon: Cookie }, { type: 'packagingItems', title: '物流包材', icon: Box }].map(t => {
        const typeTag = t.type as 'giftItems' | 'singleItems' | 'packagingItems';
        return (
          <div key={t.type} className="glass-panel p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
              <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
                <t.icon className="w-5 h-5 text-mint-brand" /> {t.title}品項設定
              </h2>
              <button 
                onClick={() => handleAdd(typeTag)}
                className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> 新增
              </button>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-coffee-100">
              <table className="w-full text-sm text-center border-collapse bg-white">
                <thead className="bg-[#faf7f2] text-coffee-600">
                  <tr>
                    <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (依日期保留)</th>
                    <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                    <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                    {t.type === 'giftItems' && <th className="p-3 border-b border-[#f0ede8]">內容配方</th>}
                    <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede8]">
                  {settings[typeTag]?.map((item: any, idx: number) => (
                    <tr key={item.id} className="hover:bg-coffee-50 transition">
                      <td className="p-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={dailyActive?.[typeTag]?.[item.id] ?? item.active}
                            onChange={(e) => handleToggle(typeTag, item.id, e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                        </label>
                      </td>
                      <td className="p-3">
                        <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleChange(typeTag, idx, 'name', e.target.value)} />
                      </td>
                      <td className="p-3">
                        <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleChange(typeTag, idx, 'price', parseNum(e.target.value))} />
                      </td>
                      {t.type === 'giftItems' && (
                        <td className="p-3">
                          <button 
                            onClick={() => setRecipeModal({ isOpen: true, gbIndex: idx })}
                            className="text-xs bg-coffee-100 hover:bg-coffee-200 text-coffee-700 font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            📝 配方 ({Object.values(item.recipe || {}).reduce((acc: number, val: any) => acc + parseNum(val), 0)}顆)
                          </button>
                        </td>
                      )}
                      <td className="p-3">
                        <button onClick={() => handleDelete(typeTag, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {settings[typeTag].length === 0 && <tr><td colSpan={t.type === 'giftItems' ? 5 : 4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(settings.customCategories || []).map((cat, catIdx) => (
        <div key={cat.id} className="glass-panel p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-coffee-100">
            <h2 className="text-lg font-bold flex items-center gap-2 text-coffee-800">
              <Package className="w-5 h-5 text-mint-brand" /> 
              <input 
                className="bg-transparent outline-none border-b border-transparent focus:border-coffee-300 w-32 md:w-auto" 
                value={cat.name} 
                onChange={(e) => handleRenameCustomCategory(catIdx, e.target.value)} 
              />
            </h2>
            <div className="flex gap-2">
                <button 
                  onClick={() => handleAddCustomItem(catIdx)}
                  className="bg-white border text-sm font-bold border-coffee-200 px-3 py-1.5 rounded-lg text-coffee-600 hover:bg-coffee-50 transition shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> 新增
                </button>
                <button 
                  onClick={() => handleDeleteCustomCategory(catIdx)}
                  className="bg-white border text-sm font-bold border-red-200 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition shadow-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> 刪除類別
                </button>
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-lg border border-coffee-100">
            <table className="w-full text-sm text-center border-collapse bg-white">
              <thead className="bg-[#faf7f2] text-coffee-600">
                <tr>
                  <th className="p-3 w-32 border-b border-[#f0ede8]">今日上架 (依日期保留)</th>
                  <th className="p-3 border-b border-[#f0ede8]">品項名稱</th>
                  <th className="p-3 border-b border-[#f0ede8]">預設商品單價</th>
                  <th className="p-3 w-20 border-b border-[#f0ede8]">移除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede8]">
                {(cat.items || []).map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-coffee-50 transition">
                    <td className="p-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={dailyActive?.customCategories?.[cat.id]?.[item.id] ?? item.active}
                          onChange={(e) => handleCustomToggle(cat.id, item.id, e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mint-brand"></div>
                      </label>
                    </td>
                    <td className="p-3">
                      <input className="w-full text-center bg-transparent outline-none font-bold text-coffee-700 border-b border-transparent focus:border-rose-brand" value={item.name} onChange={(e) => handleCustomChange(catIdx, idx, 'name', e.target.value)} />
                    </td>
                    <td className="p-3">
                      <input type="number" className="w-24 text-center bg-transparent outline-none font-bold text-coffee-700 border border-gray-200 rounded px-2 py-1 focus:border-rose-brand" value={item.price} onChange={(e) => handleCustomChange(catIdx, idx, 'price', parseNum(e.target.value))} />
                    </td>
                    <td className="p-3">
                      <button onClick={() => handleCustomDelete(catIdx, idx)} className="p-1.5 text-gray-400 hover:text-danger-brand hover:bg-danger-brand/10 inline-block rounded transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {(cat.items || []).length === 0 && <tr><td colSpan={4} className="p-6 text-gray-400 italic">尚無設定</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {recipeModal.isOpen && recipeModal.gbIndex !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99] flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-coffee-100 bg-[#faf7f2]">
              <h3 className="font-bold text-coffee-800">設定「{settings.giftItems?.[recipeModal.gbIndex!]?.name || '未知'}」配方</h3>
              <button onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })} className="p-1 text-gray-400 hover:text-coffee-600 rounded"><Trash2 className="w-5 h-5 hidden"/><span className="text-xl leading-none">&times;</span></button>
            </div>
            <div className="p-6 space-y-4">
              {(settings.singleItems || []).map(sg => {
                const gb = (settings.giftItems || [])[recipeModal.gbIndex!];
                if (!gb) return null;
                const count = gb.recipe?.[sg.name] || 0;
                return (
                  <div key={sg.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="font-bold text-coffee-700">{normalizeFlavorName(sg.name)}</span>
                    <input 
                      type="number" 
                      min="0"
                      className="w-16 text-center border-none shadow-sm rounded-md py-1 font-bold text-coffee-800 outline-none focus:ring-2 focus:ring-mint-brand" 
                      value={count}
                      onChange={(e) => {
                        const newGBItems = [...(settings.giftItems || [])];
                        if(!newGBItems[recipeModal.gbIndex!].recipe) newGBItems[recipeModal.gbIndex!].recipe = {};
                        newGBItems[recipeModal.gbIndex!].recipe![sg.name] = parseNum(e.target.value);
                        updateSettings({ ...settings, giftItems: newGBItems });
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setRecipeModal({ isOpen: false, gbIndex: null })}
                className="bg-brand-brown text-white font-bold bg-coffee-800 px-6 py-2 rounded-xl shadow-md hover:bg-coffee-900 transition active:scale-95"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

