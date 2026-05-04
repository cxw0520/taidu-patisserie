import React, { useState } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Role, Operator, Permissions } from '../../types';
import { uid, cn } from '../../lib/utils';
import { Shield, Users, Key, Save, Plus, Trash2, Edit2, AlertCircle, Store, Image as ImageIcon, X } from 'lucide-react';

interface Props {
  shopId: string;
  roles: Role[];
  operators: Operator[];
  settings: any;
}

const DEFAULT_PERMISSIONS: Permissions = {
  manage_system: false,
  pos: true,
  daily: false,
  monthly: false,
  finance: false,
  inventory: false,
  cost: false,
  customers: false,
  can_void: false,
};

const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  pos: 'POS 收銀機',
  daily: '日報表 (戰情室, 匯入)',
  monthly: '月報表',
  finance: '財務會計 (日記簿, 資產)',
  inventory: '進貨與庫存',
  cost: '成本分析',
  customers: '顧客資料',
  can_void: '特權: 作廢訂單',
  manage_system: '⚙️ 系統設定與權限管理',
};

export default function SettingsView({ shopId, roles, operators, settings }: Props) {
  const [activeTab, setActiveTab] = useState<'shop' | 'roles' | 'operators'>('operators');
  
  // Shop Settings State
  const [shopName, setShopName] = useState(settings?.shopName || '態度貳貳甜點工作室');
  const [legalName, setLegalName] = useState(settings?.legalName || '');
  const [logoBase64, setLogoBase64] = useState(settings?.logo || '');

  // Role State
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  
  // Operator State
  const [editingOp, setEditingOp] = useState<Operator | null>(null);

  const handleSaveShopSettings = async () => {
    await setDoc(doc(db, 'shops', shopId), { shopName, logo: logoBase64 }, { merge: true });
    await setDoc(doc(db, 'shops', shopId, 'meta', 'settings'), { shopName, legalName, logo: logoBase64 }, { merge: true });
    alert('店鋪設定已儲存！');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveRole = async () => {
    if (!editingRole || !editingRole.name.trim()) return;
    const isNew = !editingRole.id;
    const roleId = isNew ? uid() : editingRole.id;
    const newRole = { ...editingRole, id: roleId };
    
    await setDoc(doc(db, 'shops', shopId, 'roles', roleId), newRole);
    setEditingRole(null);
  };

  const handleDeleteRole = async (id: string) => {
    const role = roles.find(r => r.id === id);
    if (role?.isOwner) {
      alert('無法刪除系統管理員層級！');
      return;
    }
    if (operators.some(op => op.roleId === id)) {
      alert('此層級尚有員工正在使用，請先更改員工層級後再刪除！');
      return;
    }
    if (confirm('確定要刪除此層級嗎？')) {
      await deleteDoc(doc(db, 'shops', shopId, 'roles', id));
    }
  };

  const handleSaveOperator = async () => {
    if (!editingOp || !editingOp.name.trim() || !editingOp.pinCode || !editingOp.roleId) return;
    
    // Check PIN uniqueness
    const exists = operators.find(op => op.pinCode === editingOp.pinCode && op.id !== editingOp.id);
    if (exists) {
      alert('此密碼已被其他人使用，請更換密碼！');
      return;
    }

    const isNew = !editingOp.id;
    const opId = isNew ? uid() : editingOp.id;
    const newOp = { ...editingOp, id: opId };
    
    await setDoc(doc(db, 'shops', shopId, 'operators', opId), newOp);
    setEditingOp(null);
  };

  const handleDeleteOperator = async (id: string) => {
    const op = operators.find(o => o.id === id);
    const opRole = roles.find(r => r.id === op?.roleId);
    
    if (opRole?.isOwner) {
      const ownerCount = operators.filter(o => roles.find(r => r.id === o.roleId)?.isOwner).length;
      if (ownerCount <= 1) {
        alert('操作失敗：系統中必須至少保留一位擁有「系統管理員」層級的員工！');
        return;
      }
    }
    
    if (confirm('確定要刪除此員工嗎？')) {
      await deleteDoc(doc(db, 'shops', shopId, 'operators', id));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-coffee-800 rounded-2xl flex items-center justify-center text-white shadow-lg">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-coffee-900">系統與權限設定</h1>
          <p className="text-coffee-400 text-sm mt-1">管理店鋪基本資料與所有員工的操作權限</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        <button onClick={() => setActiveTab('operators')} className={cn("px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap", activeTab === 'operators' ? "bg-coffee-600 text-white shadow-md" : "bg-white text-coffee-600 hover:bg-coffee-50 border border-coffee-100")}>
          <Users className="w-5 h-5" /> 員工與密碼管理
        </button>
        <button onClick={() => setActiveTab('roles')} className={cn("px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap", activeTab === 'roles' ? "bg-coffee-600 text-white shadow-md" : "bg-white text-coffee-600 hover:bg-coffee-50 border border-coffee-100")}>
          <Key className="w-5 h-5" /> 層級權限設定
        </button>
        <button onClick={() => setActiveTab('shop')} className={cn("px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap", activeTab === 'shop' ? "bg-coffee-600 text-white shadow-md" : "bg-white text-coffee-600 hover:bg-coffee-50 border border-coffee-100")}>
          <Store className="w-5 h-5" /> 店鋪基本設定
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'shop' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-coffee-100">
            <h2 className="text-xl font-bold text-coffee-800 mb-6">店鋪基本設定</h2>
            <div className="space-y-6 max-w-xl">
              <div>
                <label className="block text-sm font-bold text-coffee-700 mb-2">營業名稱 (網頁顯示用)</label>
                <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} className="w-full border border-coffee-200 rounded-xl p-3 focus:ring-2 focus:ring-coffee-500 outline-none" placeholder="如：態度貳貳甜點工作室" />
                <p className="text-[10px] text-coffee-400 mt-1">顯示於網頁左上角與系統主選單。</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-coffee-700 mb-2">公司抬頭 / 登記名稱 (報表列印用)</label>
                <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)} className="w-full border border-coffee-200 rounded-xl p-3 focus:ring-2 focus:ring-coffee-500 outline-none" placeholder="如：態度貳貳有限公司" />
                <p className="text-[10px] text-coffee-400 mt-1">未來匯出正式財務報表或收據時使用的正式名稱。</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-coffee-700 mb-2">系統 Logo (可留白)</label>
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-coffee-50 rounded-2xl border-2 border-dashed border-coffee-200 flex items-center justify-center overflow-hidden">
                    {logoBase64 ? <img src={logoBase64} alt="logo" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-coffee-300" />}
                  </div>
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-coffee-50 file:text-coffee-700 hover:file:bg-coffee-100" />
                    {logoBase64 && <button onClick={() => setLogoBase64('')} className="text-xs text-red-500 hover:text-red-700 font-bold mt-3">移除 Logo</button>}
                  </div>
                </div>
              </div>
              <button onClick={handleSaveShopSettings} className="px-6 py-3 bg-coffee-600 text-white font-bold rounded-xl shadow-md hover:bg-coffee-700 transition flex items-center gap-2">
                <Save className="w-5 h-5" /> 儲存店鋪設定
              </button>
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-coffee-100">
              <div>
                <h2 className="text-xl font-bold text-coffee-800">層級權限設定</h2>
                <p className="text-sm text-coffee-400 mt-1">自定義各職位的操作權限範圍</p>
              </div>
              <button 
                onClick={() => setEditingRole({ id: '', name: '', permissions: { ...DEFAULT_PERMISSIONS } })}
                className="px-4 py-2 bg-rose-brand text-white font-bold rounded-xl shadow-md hover:bg-rose-brand/90 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" /> 新增層級
              </button>
            </div>

            {editingRole && (
              <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-200 shadow-inner mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-amber-900">{editingRole.id ? '編輯層級' : '新增層級'}</h3>
                  <button onClick={() => setEditingRole(null)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
                </div>
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-bold text-amber-900 mb-2">層級名稱 (如：外場主管、內場烘焙師)</label>
                    <input type="text" value={editingRole.name} onChange={e => setEditingRole({...editingRole, name: e.target.value})} disabled={editingRole.isOwner} className="w-full border border-amber-200 bg-white rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50" placeholder="輸入層級名稱..." />
                    {editingRole.isOwner && <p className="text-xs text-amber-600 mt-2 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> 創世神層級名稱不可修改</p>}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-amber-900 mb-4">功能權限開關</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                        const k = key as keyof Permissions;
                        const isSystemManage = k === 'manage_system';
                        const disabled = editingRole.isOwner && isSystemManage;
                        
                        return (
                          <label key={k} className={cn("flex items-center gap-3 p-3 rounded-xl border bg-white cursor-pointer transition-colors", editingRole.permissions[k] ? "border-amber-400 bg-amber-50/50" : "border-gray-200 hover:bg-gray-50", disabled && "opacity-60 cursor-not-allowed")}>
                            <input 
                              type="checkbox" 
                              checked={editingRole.permissions[k]}
                              disabled={disabled}
                              onChange={e => setEditingRole({...editingRole, permissions: {...editingRole.permissions, [k]: e.target.checked}})}
                              className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500 disabled:opacity-50"
                            />
                            <span className={cn("font-bold text-sm", isSystemManage ? "text-danger-brand" : "text-gray-700")}>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <button onClick={handleSaveRole} className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl shadow-md hover:bg-amber-700 transition">儲存層級設定</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map(role => (
                <div key={role.id} className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-100 flex flex-col h-full relative group">
                  {role.isOwner && <div className="absolute top-0 right-6 -translate-y-1/2 bg-danger-brand text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">系統保護</div>}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-coffee-800 flex items-center gap-2">{role.isOwner && <Shield className="w-4 h-4 text-rose-brand"/>} {role.name}</h3>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingRole(role)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4"/></button>
                      {!role.isOwner && <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(role.permissions).filter(([_, v]) => v).map(([k, _]) => (
                        <span key={k} className={cn("text-[10px] font-bold px-2 py-1 rounded border", k==='manage_system' ? "bg-red-50 text-red-700 border-red-200" : "bg-coffee-50 text-coffee-600 border-coffee-100")}>
                          {PERMISSION_LABELS[k as keyof Permissions]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-50 text-xs font-bold text-gray-400">
                    已有 {operators.filter(o => o.roleId === role.id).length} 位員工套用此層級
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'operators' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-coffee-100">
              <div>
                <h2 className="text-xl font-bold text-coffee-800">員工密碼與職位設定</h2>
                <p className="text-sm text-coffee-400 mt-1">設定員工的專屬 PIN 碼登入</p>
              </div>
              <button 
                onClick={() => setEditingOp({ id: '', name: '', pinCode: '', roleId: roles[0]?.id || '' })}
                className="px-4 py-2 bg-coffee-600 text-white font-bold rounded-xl shadow-md hover:bg-coffee-700 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" /> 新增員工
              </button>
            </div>

            {editingOp && (
              <div className="bg-mint-brand/10 p-6 rounded-3xl border border-mint-brand/20 shadow-inner mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-coffee-900">{editingOp.id ? '編輯員工資料' : '新增員工'}</h3>
                  <button onClick={() => setEditingOp(null)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
                  <div>
                    <label className="block text-sm font-bold text-coffee-800 mb-2">員工姓名/暱稱</label>
                    <input type="text" value={editingOp.name} onChange={e => setEditingOp({...editingOp, name: e.target.value})} className="w-full border border-coffee-200 bg-white rounded-xl p-3 focus:ring-2 focus:ring-mint-brand outline-none" placeholder="如：店長阿明" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-coffee-800 mb-2">登入密碼 (PIN 碼)</label>
                    <input type="text" value={editingOp.pinCode} onChange={e => setEditingOp({...editingOp, pinCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 6)})} className="w-full border border-coffee-200 bg-white rounded-xl p-3 focus:ring-2 focus:ring-mint-brand outline-none font-mono text-xl tracking-widest font-bold text-center" placeholder="4~6位數字" />
                    <p className="text-[10px] text-coffee-400 mt-1 text-center font-bold">解鎖畫面盲打此密碼即可登入</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-coffee-800 mb-2">職位層級</label>
                    <select value={editingOp.roleId} onChange={e => setEditingOp({...editingOp, roleId: e.target.value})} className="w-full border border-coffee-200 bg-white rounded-xl p-3 focus:ring-2 focus:ring-mint-brand outline-none font-bold text-coffee-700">
                      <option value="" disabled>請選擇層級...</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-6">
                  <button onClick={handleSaveOperator} className="px-8 py-3 bg-coffee-800 text-white font-bold rounded-xl shadow-md hover:bg-coffee-900 transition w-full md:w-auto">儲存員工資料</button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-coffee-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-coffee-50/50 text-coffee-700 text-sm">
                  <tr>
                    <th className="p-4 border-b font-bold">員工姓名</th>
                    <th className="p-4 border-b font-bold">職位層級</th>
                    <th className="p-4 border-b font-bold">密碼 (PIN)</th>
                    <th className="p-4 border-b font-bold text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-400 font-bold">尚未建立任何員工，請先新增</td></tr>
                  ) : (
                    operators.map(op => {
                      const role = roles.find(r => r.id === op.roleId);
                      return (
                        <tr key={op.id} className="border-b border-gray-50 hover:bg-gray-50/50 group">
                          <td className="p-4 font-bold text-gray-800 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-coffee-100 text-coffee-600 flex items-center justify-center text-xs">{op.name.charAt(0)}</div>
                            {op.name}
                          </td>
                          <td className="p-4">
                            <span className={cn("text-xs font-bold px-3 py-1 rounded-full", role?.isOwner ? "bg-red-50 text-red-700 border border-red-200" : "bg-coffee-50 text-coffee-700 border border-coffee-200")}>
                              {role?.name || '未知層級'}
                            </span>
                          </td>
                          <td className="p-4 font-mono font-bold tracking-[0.3em] text-gray-400 group-hover:text-gray-800 transition-colors">
                            {op.pinCode}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingOp(op)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>
                              <button onClick={() => handleDeleteOperator(op.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
