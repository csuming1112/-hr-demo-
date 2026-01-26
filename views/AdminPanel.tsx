
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/mockDb';
import { User, UserRole, Gender, LeaveCategory, WarningRule, WorkflowGroup, UserStatsConfig, GenderRestriction, JobTitleRule, WarningOperator, TimeWindowType, LeaveRequest, LeaveType, OvertimeSettlementRecord } from '../types';
import { Users, Search, Plus, Edit2, Trash2, X, Save, GitFork, BarChart2, FileText, AlertTriangle, Database, Download, Upload, Check, Shield, Key, AlertCircle, FileDiff, Info, CheckCircle2, UserPlus, RefreshCcw, Layers, Briefcase, ArrowRight, Settings, Sliders, Eye, Palette, BellRing, UserCheck, ShieldCheck, Filter, ChevronRight, Tags, Zap, FastForward, CalendarDays, ArrowLeft, ClipboardCheck, ArrowUpRight, BadgeAlert, Settings2, Sparkles, History, Calendar, AlertOctagon, GraduationCap, Building2, UserCog, ShieldAlert, ToggleRight, ToggleLeft, DollarSign, CalendarPlus, CalendarX, ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '../constants';
// @ts-ignore
import * as XLSX from 'xlsx';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2, 15);
};

// --- 差異分析資料結構 ---
interface UserDataDiff {
    username: string;
    name: string;
    status: 'NEW' | 'MODIFIED' | 'UNCHANGED';
    details: string[];
    newData: User;
}

const UserTab = ({ workflowGroups }: { workflowGroups: WorkflowGroup[] }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [annualQuotas, setAnnualQuotas] = useState<{year: number, days: number}[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // --- 新增：密碼重置狀態 ---
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // --- 新增：批次管理狀態 ---
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState(false);
  const [batchYearToDelete, setBatchYearToDelete] = useState<number>(new Date().getFullYear());
  const [allAvailableYears, setAllAvailableYears] = useState<number[]>([]);

  useEffect(() => { loadUsers(); }, []);
  
  const loadUsers = async () => {
    setLoading(true);
    try {
        const u = await db.getUsers();
        setUsers(u || []);
        
        // 提取所有帳號中出現過的年份，供批次刪除選擇
        const years = new Set<number>();
        (u || []).forEach(user => {
            Object.keys(user.quota?.annual || {}).forEach(y => years.add(Number(y)));
        });
        setAllAvailableYears(Array.from(years).sort((a, b) => b - a));
    } catch (e) {
        console.error("Load users failed", e);
    } finally {
        setLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setIsEditMode(true);
    setFormData(user);
    const quotas = Object.entries(user.quota?.annual || {}).map(([y, d]) => ({ year: Number(y), days: Number(d) }));
    setAnnualQuotas(quotas.length ? quotas.sort((a,b) => b.year - a.year) : [{ year: new Date().getFullYear(), days: 0 }]);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setIsEditMode(false);
    setFormData({
        id: generateId(),
        role: UserRole.EMPLOYEE,
        gender: Gender.MALE,
        isFirstLogin: true,
        password: '123456', 
        quota: { annual: {}, overtime: 0 },
        usedQuota: { annual: {}, sick: 0, personal: 0, menstrual: 0 },
        workflowGroupId: (workflowGroups || [])[0]?.id || 'default',
        canReviewOvertime: false,
        enableDeputy: true
    });
    setAnnualQuotas([{ year: new Date().getFullYear(), days: 0 }]);
    setIsModalOpen(true);
  };

  const handleResetPassword = async () => {
      if (!userToReset || !newPassword.trim()) return;
      try {
          await db.updateUser({ ...userToReset, password: newPassword, isFirstLogin: true });
          alert(`人員「${userToReset.name}」的密碼已重置成功。`);
          setIsResetPasswordModalOpen(false);
          setUserToReset(null);
          setNewPassword('');
          loadUsers();
      } catch (err) {
          alert('密碼重置失敗，請檢查系統連線。');
      }
  };

  // --- 批次操作邏輯 ---
  const handleBatchIncrement = async () => {
      if (!window.confirm('此操作將會：\n1. 根據每個帳號的「最後一年度」額度\n2. 自動新增「下一年度」額度 (+1天)\n3. 最大上限為 30 天\n\n確定要對全體人員執行嗎？')) return;
      
      setLoading(true);
      try {
          const updatedUsers = users.map(u => {
              const annual = { ...u.quota.annual };
              const existingYears = Object.keys(annual).map(Number).sort((a, b) => b - a);
              
              if (existingYears.length > 0) {
                  const lastYear = existingYears[0];
                  const nextYear = lastYear + 1;
                  const lastQuota = annual[lastYear];
                  // 新增一天，最高30天
                  annual[nextYear] = Math.min(30, lastQuota + 1);
              } else {
                  // 若完全沒設過，預設今年 7 天
                  annual[new Date().getFullYear()] = 7;
              }
              
              return { ...u, quota: { ...u.quota, annual } };
          });
          
          await db.saveUsers(updatedUsers);
          alert('批次自動增額完成！');
          loadUsers();
      } catch (err) {
          alert('操作失敗：' + err);
          setLoading(false);
      }
  };

  const handleBatchDeleteYear = async () => {
      setLoading(true);
      try {
          const updatedUsers = users.map(u => {
              const annual = { ...u.quota.annual };
              delete annual[batchYearToDelete];
              return { ...u, quota: { ...u.quota, annual } };
          });
          
          await db.saveUsers(updatedUsers);
          setIsBatchDeleteConfirmOpen(false);
          alert(`已刪除全體帳號 ${batchYearToDelete} 年度的特休額度。`);
          loadUsers();
      } catch (err) {
          alert('刪除失敗：' + err);
          setLoading(false);
      }
  };

  const addQuotaYear = () => {
      const lastYear = annualQuotas.length > 0 ? annualQuotas[0].year : new Date().getFullYear();
      setAnnualQuotas([{ year: lastYear + 1, days: 0 }, ...annualQuotas]);
  };

  const removeQuotaYear = (index: number) => {
      setAnnualQuotas(annualQuotas.filter((_, i) => i !== index));
  };

  const updateQuota = (index: number, field: 'year' | 'days', value: number) => {
      const n = [...annualQuotas];
      n[index] = { ...n[index], [field]: value };
      setAnnualQuotas(n);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const annualObj: Record<number, number> = {};
    annualQuotas.forEach(q => { annualObj[q.year] = q.days; });
    
    const finalUser = { 
        ...formData, 
        quota: { 
            ...formData.quota!, 
            annual: annualObj 
        } 
    } as User;

    try {
        if (isEditMode) await db.updateUser(finalUser);
        else await db.createUser(finalUser);
        setIsModalOpen(false);
        loadUsers();
    } catch (err: any) { alert(`儲存失敗: ${err.message}`); }
  };

  if (loading) return <div className="p-12 text-center text-slate-400 font-bold animate-pulse">載入使用者中...</div>;

  const filtered = users.filter(u => 
    (u.name || '').includes(searchTerm) || 
    (u.username || '').includes(searchTerm) || 
    (u.department || '').includes(searchTerm) ||
    (u.employeeId || '').includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      {/* 操作區塊 */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1 max-md:w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="搜尋姓名、工號、帳號或部門..." className="w-full pl-10 pr-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 transition-all font-medium text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
            {/* 批次按鍵組 */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                <button 
                    onClick={handleBatchIncrement}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white text-blue-600 rounded-lg text-xs font-black shadow-sm hover:bg-blue-50 transition-all border border-slate-200"
                    title="根據去年額度自動新增下一年+1天 (上限30天)"
                >
                    <CalendarPlus size={14} /> 批次增額
                </button>
                <button 
                    onClick={() => setIsBatchDeleteConfirmOpen(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white text-red-600 rounded-lg text-xs font-black shadow-sm hover:bg-red-50 transition-all border border-slate-200"
                >
                    <CalendarX size={14} /> 批次刪除
                </button>
            </div>

            <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block"></div>

            <button onClick={handleAdd} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 text-sm"><Plus size={18} /> 新增帳號</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 border-b">
                    <tr>
                        <th className="px-6 py-4">員工資訊</th>
                        <th className="px-6 py-4">部門 / 職稱</th>
                        <th className="px-6 py-4">流程與權限</th>
                        <th className="px-6 py-4">特休額度 (今年)</th>
                        <th className="px-6 py-4 text-right">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filtered.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">{u.name.charAt(0)}</div>
                                    <div>
                                        <div className="font-bold text-slate-900">{u.name}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">ID: {u.employeeId} / @{u.username}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-medium text-slate-700">{u.department}</div>
                                <div className="text-xs text-slate-400">{u.jobTitle}</div>
                            </td>
                            <td className="px-6 py-4 space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-black border border-blue-100 uppercase">{ROLE_LABELS[u.role]}</span>
                                    {u.canReviewOvertime && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-black border border-emerald-100 flex items-center gap-1"><Shield size={10}/> 審查權</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1 font-medium"><GitFork size={10} className="text-blue-500" /> {(workflowGroups || []).find(g => g.id === u.workflowGroupId)?.name || '未設定流程'}</div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="font-bold text-slate-700">{u.quota?.annual[new Date().getFullYear()] || 0} 天</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setUserToReset(u); setNewPassword(''); setIsResetPasswordModalOpen(true); }} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="重置密碼"><Key size={16}/></button>
                                    <button onClick={() => handleEdit(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯詳情"><Edit2 size={16}/></button>
                                    <button onClick={() => { setUserToDelete(u); setIsDeleteModalOpen(true); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="刪除帳號"><Trash2 size={16}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* --- 重置密碼確認彈窗 --- */}
      {isResetPasswordModalOpen && userToReset && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className="p-8 text-center">
                      <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-in zoom-in duration-300">
                          <Key size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 mb-2">重置帳號密碼</h3>
                      <p className="text-sm text-slate-500 mb-6">請為員工 「<span className="font-black text-slate-800">{userToReset.name}</span>」 設定新密碼：</p>
                      
                      <div className="mb-8">
                          <input 
                              type="text"
                              autoFocus
                              placeholder="輸入新密碼..."
                              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-center text-slate-800 outline-none focus:border-amber-500 transition-all shadow-inner"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                          />
                          <p className="text-[10px] text-slate-400 mt-2 font-medium">重置後該帳號下次登入將被要求再次修改密碼。</p>
                      </div>

                      <div className="flex flex-col gap-3">
                          <button 
                            disabled={!newPassword.trim()}
                            onClick={handleResetPassword} 
                            className="w-full py-3.5 bg-amber-600 text-white rounded-2xl font-black hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            確認並重置密碼
                          </button>
                          <button onClick={() => { setIsResetPasswordModalOpen(false); setUserToReset(null); }} className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">取消返回</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- 批次刪除確認彈窗 --- */}
      {isBatchDeleteConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className="p-8 text-center">
                      <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                          <CalendarX size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 mb-2">批次刪除年度額度</h3>
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">請選擇欲刪除的年份，此動作將移除**所有員工**在該年度的特休額度。</p>
                      
                      <div className="mb-8 relative">
                          <select 
                            value={batchYearToDelete} 
                            onChange={e => setBatchYearToDelete(Number(e.target.value))}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-center text-slate-800 outline-none focus:border-red-500 transition-all appearance-none"
                          >
                              {allAvailableYears.length > 0 ? (
                                  allAvailableYears.map(y => <option key={y} value={y}>{y} 年度</option>)
                              ) : (
                                  <option value={new Date().getFullYear()}>{new Date().getFullYear()} 年度</option>
                              )}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronDown size={20} />
                          </div>
                      </div>

                      <div className="flex flex-col gap-3">
                          <button onClick={handleBatchDeleteYear} className="w-full py-3.5 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95">確認批次刪除</button>
                          <button onClick={() => setIsBatchDeleteConfirmOpen(false)} className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">取消返回</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-10 py-6 border-b bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-black text-2xl text-slate-800 flex items-center gap-3">
                            {isEditMode ? <Settings2 className="text-blue-600"/> : <UserPlus className="text-blue-600"/>}
                            {isEditMode ? '帳號細節設定' : '建立新帳號'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 font-medium">請設定人員基本資料、年度特休額度及系統權限範圍。</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-10">
                    {/* 第一區塊：基本資料 */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-slate-800 font-black"><Info size={18} className="text-blue-500"/> 1. 人員基本資訊</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">姓名</label>
                                <input required className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">工號 (Employee ID)</label>
                                <input required className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.employeeId || ''} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">性別</label>
                                <select className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as Gender})}>
                                    <option value={Gender.MALE}>男性</option><option value={Gender.FEMALE}>女性</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">登入帳號</label>
                                <input required className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all bg-slate-50" value={formData.username || ''} onChange={e => setFormData({...formData, username: e.target.value})} disabled={isEditMode} />
                            </div>
                            <div className="flex items-center gap-4 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                                 <Shield size={20} className="text-amber-500 shrink-0" />
                                 <div className="text-[11px] text-amber-800 leading-tight">
                                     <p className="font-black">安全提示</p>
                                     <p className="opacity-70">{isEditMode ? '重置個別員工密碼請在列表點擊鑰匙圖示。' : '建立帳號後密碼預設為 123456，初次登入時系統將提示更改。'}</p>
                                 </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">所屬部門</label>
                                <input required className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">職稱</label>
                                <input required className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.jobTitle || ''} onChange={e => setFormData({...formData, jobTitle: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* 第二區塊：各年度特休額度 */}
                    <div className="space-y-6 pt-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-800 font-black"><Calendar size={18} className="text-blue-500"/> 2. 各年度特休額度分配 (Annual Quota)</div>
                            <button type="button" onClick={addQuotaYear} className="text-xs font-black text-blue-600 flex items-center gap-1 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"><Plus size={14}/> 新增年份</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {annualQuotas.map((q, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-in slide-in-from-left-2 duration-300">
                                    <div className="flex-1 space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">年度</label>
                                        <input type="number" className="w-full bg-transparent border-b border-slate-300 font-black text-slate-700 outline-none focus:border-blue-500" value={q.year} onChange={e => updateQuota(idx, 'year', Number(e.target.value))} />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">特休天數</label>
                                        <input type="number" step="0.5" className="w-full bg-transparent border-b border-slate-300 font-black text-blue-600 outline-none focus:border-blue-500" value={q.days} onChange={e => updateQuota(idx, 'days', Number(e.target.value))} />
                                    </div>
                                    <button type="button" onClick={() => removeQuotaYear(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors self-end mb-1"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 第三區塊：簽核與審查權限 */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center gap-2 text-slate-800 font-black"><ShieldCheck size={18} className="text-blue-500"/> 3. 系統權限與流程指派</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">系統角色層級</label>
                                    <select className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                                        {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">指定假別簽核流程組</label>
                                    <select className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-blue-500 outline-none transition-all" value={formData.workflowGroupId} onChange={e => setFormData({...formData, workflowGroupId: e.target.value})}>
                                        <option value="">請選擇適用流程...</option>
                                        {workflowGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                    <p className="text-[10px] text-slate-400 italic mt-1 px-1 flex items-center gap-1"><Info size={10}/> 此設定將決定該員工所有假單的審核路徑。</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col justify-center gap-6">
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <div className="font-black text-slate-800 text-sm flex items-center gap-2"><DollarSign size={16} className="text-emerald-500"/> 開啟加班時數審查權</div>
                                        <p className="text-[10px] text-slate-400">開啟後可核定其他人員的實際加班時數紀錄。</p>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setFormData({...formData, canReviewOvertime: !formData.canReviewOvertime})}
                                        className={`p-1 rounded-full transition-all duration-300 ${formData.canReviewOvertime ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        {formData.canReviewOvertime ? <ToggleRight size={32} className="text-white"/> : <ToggleLeft size={32} className="text-white"/>}
                                    </button>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <div className="font-black text-slate-800 text-sm flex items-center gap-2"><UserCheck size={16} className="text-blue-500"/> 強制填寫職務代理人</div>
                                        <p className="text-[10px] text-slate-400">申請假單時是否必須指定一位代理人。</p>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setFormData({...formData, enableDeputy: !formData.enableDeputy})}
                                        className={`p-1 rounded-full transition-all duration-300 ${formData.enableDeputy ? 'bg-blue-500' : 'bg-slate-300'}`}
                                    >
                                        {formData.enableDeputy ? <ToggleRight size={32} className="text-white"/> : <ToggleLeft size={32} className="text-white"/>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-8 border-t sticky bottom-0 bg-white">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-3 border-2 border-slate-200 text-slate-500 rounded-2xl font-black hover:bg-slate-50 transition-all">取消返回</button>
                        <button type="submit" className="px-12 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">確認並儲存帳號設定</button>
                    </div>
                </form>
              </div>
          </div>
      )}

      {/* 刪除確認對話框 */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-sm overflow-hidden">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
                  <AlertCircle size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">確定永久刪除？</h3>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6">
                  <span className="text-sm font-bold text-slate-600 italic">員工: 「{userToDelete.name}」</span>
              </div>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                  此動作將移除該員工所有系統權限、簽核流程及歷史統計連結，且**無法還原**。
              </p>
              <div className="flex flex-col gap-3">
                <button 
                    onClick={async () => { await db.deleteUser(userToDelete.id); setIsDeleteModalOpen(false); loadUsers(); }} 
                    className="w-full py-3.5 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95"
                >
                    確認刪除
                </button>
                <button 
                    onClick={() => setIsDeleteModalOpen(false)} 
                    className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                    取消返回
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkflowTab = () => {
    const [groups, setGroups] = useState<WorkflowGroup[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<WorkflowGroup>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [availableTitles, setAvailableTitles] = useState<string[]>([]);
    
    // --- 刪除確認狀態 ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<WorkflowGroup | null>(null);

    useEffect(() => { load(); }, []);
    
    const load = async () => {
        setLoading(true);
        try {
            const [g, u] = await Promise.all([db.getWorkflowConfig(), db.getUsers()]);
            setGroups(g || []);
            setUsers(u || []);
            const titles = Array.from(new Set((u || []).map(user => user.jobTitle).filter(Boolean)));
            setAvailableTitles(titles);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const handleSave = async () => {
        if (!editing.name) return alert('請輸入流程名稱');
        const newGroup = { id: editing.id || generateId(), name: editing.name, steps: editing.steps || [], titleRules: editing.titleRules || [] } as WorkflowGroup;
        const updated = groups.some(g => g.id === newGroup.id) ? groups.map(g => g.id === newGroup.id ? newGroup : g) : [...groups, newGroup];
        await db.saveWorkflowConfig(updated);
        setGroups(updated);
        setIsModalOpen(false);
    };

    const handleConfirmDelete = async () => {
        if (!groupToDelete) return;
        const n = groups.filter(x => x.id !== groupToDelete.id);
        await db.saveWorkflowConfig(n);
        setGroups(n);
        setIsDeleteModalOpen(false);
        setGroupToDelete(null);
    };

    if (loading) return <div className="p-12 text-center text-slate-400 font-bold animate-pulse">載入流程中...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><GitFork size={28}/></div>
                    <div><h3 className="text-xl font-black text-slate-800">簽核流程管理</h3><p className="text-xs text-slate-400">建立關卡並選擇多帳號批核，可設定職稱自動通過規則。</p></div>
                </div>
                <button onClick={() => { setEditing({ id: generateId(), name: '', steps: [], titleRules: [] }); setIsModalOpen(true); }} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-blue-700 transition-all"><Plus size={18}/> 新增流程</button>
            </div>
            
            <div className="grid gap-6 lg:grid-cols-2">
                {groups.map(g => (
                    <div key={g.id} className="bg-white rounded-2xl border p-6 shadow-sm hover:border-blue-300 transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <h4 className="font-black text-lg text-slate-800">{g.name}</h4>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditing(g); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => { setGroupToDelete(g); setIsDeleteModalOpen(true); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {(g.steps || []).map((s, idx) => (
                                <div key={s.id} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black">L{idx + 1}</div>
                                    <div className="flex-1 text-sm font-medium text-slate-700">{s.label}</div>
                                    <div className="text-[10px] text-slate-400 font-bold">{(s.approverIds || []).length} 位簽核人</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* --- 刪除確認視窗 --- */}
            {isDeleteModalOpen && groupToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                                <AlertTriangle size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-3">確定要刪除流程？</h3>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6">
                                <span className="text-sm font-bold text-slate-600 italic">「{groupToDelete.name}」</span>
                            </div>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                                刪除後將無法還原，請確認此流程已無員工在使用。
                            </p>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleConfirmDelete} className="w-full py-3 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100">確定刪除</button>
                                <button onClick={() => { setIsDeleteModalOpen(false); setGroupToDelete(null); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-4xl p-8 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center sticky top-0 bg-white pb-4 border-b z-10">
                            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Layers className="text-blue-600"/> 流程細節編輯</h3>
                            <button onClick={() => setIsModalOpen(false)}><X/></button>
                        </div>
                        <div className="space-y-6">
                            <div><label className="block text-xs font-bold text-slate-400 uppercase mb-2">流程群組名稱</label><input className="w-full border-2 rounded-xl p-3 font-bold text-lg outline-none focus:border-blue-500" value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} /></div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase">1. 關卡與批核人員 (可多帳號)</label><button onClick={() => setEditing({...editing, steps: [...(editing.steps || []), { id: generateId(), level: (editing.steps?.length || 0) + 1, label: '', approverIds: [] }]})} className="text-blue-600 text-xs font-bold hover:underline">+ 新增關卡</button></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(editing.steps || []).map((s, idx) => (
                                        <div key={s.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                            <div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-lg">L{idx + 1}</div><input className="flex-1 border-b border-transparent bg-transparent font-bold text-slate-700 focus:border-blue-500 outline-none px-1" value={s.label} onChange={e => { const n = [...editing.steps!]; n[idx].label = e.target.value; setEditing({...editing, steps: n}); }} /></div>
                                            <select multiple className="w-full border rounded-xl p-2 text-xs h-32" value={s.approverIds || []} onChange={e => { 
                                                const target = e.target as HTMLSelectElement;
                                                const n = [...editing.steps!]; 
                                                n[idx].approverIds = Array.from(target.selectedOptions).map(o => (o as HTMLOptionElement).value); 
                                                setEditing({...editing, steps: n}); 
                                            }}>{users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}</select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4 pt-4 border-t">
                                <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase">2. 職稱自動通過規則</label><button onClick={() => setEditing({...editing, titleRules: [...(editing.titleRules || []), { jobTitle: '', maxLevel: 1 }]})} className="text-amber-600 text-xs font-bold hover:underline">+ 新增職稱規則</button></div>
                                {(editing.titleRules || []).map((rule, idx) => (
                                    <div key={idx} className="flex items-center gap-4 bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                                        <span className="text-xs font-bold">職稱為:</span>
                                        <select className="border rounded p-1 text-xs" value={rule.jobTitle} onChange={e => { const n = [...editing.titleRules!]; n[idx].jobTitle = e.target.value; setEditing({...editing, titleRules: n}); }}>
                                            <option value="">選擇職稱...</option>{availableTitles.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <span className="text-xs font-bold">僅需簽至:</span>
                                        <select className="border rounded p-1 text-xs" value={rule.maxLevel} onChange={e => { const n = [...editing.titleRules!]; n[idx].maxLevel = Number(e.target.value); setEditing({...editing, titleRules: n}); }}>
                                            {(editing.steps || []).map((_, i) => <option key={i} value={i + 1}>關卡 {i + 1}</option>)}
                                        </select>
                                        <button onClick={() => setEditing({...editing, titleRules: editing.titleRules?.filter((_, i) => i !== idx)})} className="ml-auto text-red-400"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pt-6 border-t flex justify-end gap-4"><button onClick={() => setIsModalOpen(false)} className="px-8 py-3 border-2 rounded-2xl font-bold">取消</button><button onClick={handleSave} className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all">儲存流程</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

const LeaveCategoryTab = () => {
    const [categories, setCategories] = useState<LeaveCategory[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<LeaveCategory>>({});

    useEffect(() => { load(); }, []);
    const load = async () => { const c = await db.getLeaveCategories(); setCategories(c || []); };

    const handleSave = async () => {
        const newCat = { id: editing.id || generateId(), name: editing.name!, allowedGender: editing.allowedGender || GenderRestriction.ALL } as LeaveCategory;
        const updated = categories.some(c => c.id === newCat.id) ? categories.map(c => c.id === newCat.id ? newCat : c) : [...categories, newCat];
        await db.saveLeaveCategories(updated);
        setCategories(updated);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Sparkles size={28}/></div><div><h3 className="text-xl font-black text-slate-800">假別權限設定</h3><p className="text-xs text-slate-400">定義系統中可申請的假別及其性別限制。</p></div></div>
                <button onClick={() => { setEditing({ id: generateId(), name: '', allowedGender: GenderRestriction.ALL }); setIsModalOpen(true); }} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 flex items-center gap-2 hover:bg-indigo-700 transition-all"><Plus size={18}/> 新增假別</button>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {categories.map(c => (
                    <div key={c.id} className="bg-white rounded-2xl border p-6 flex flex-col gap-3 shadow-sm hover:border-indigo-300 transition-all">
                        <div className="flex justify-between items-center"><h4 className="font-black text-slate-800 text-lg">{c.name}</h4><div className="flex gap-2"><button onClick={() => { setEditing(c); setIsModalOpen(true); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={16}/></button><button onClick={async () => { if(confirm('確定刪除？')) { const n = categories.filter(x => x.id !== c.id); await db.saveLeaveCategories(n); setCategories(n); } }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button></div></div>
                        <div className="flex items-center gap-2 text-xs font-bold px-2 py-1 bg-slate-50 rounded border w-fit">{c.allowedGender === GenderRestriction.ALL ? '全體人員' : c.allowedGender === GenderRestriction.MALE_ONLY ? '僅限男性' : '僅限女性'}</div>
                    </div>
                ))}
            </div>
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-6">
                        <h3 className="text-2xl font-black">編輯假別權限</h3>
                        <div className="space-y-4">
                            <div><label className="block text-xs font-bold mb-1">假別名稱</label><input className="w-full border-2 rounded-xl p-2.5 font-bold" value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold mb-1">性別限制</label><select className="w-full border-2 rounded-xl p-2.5 font-bold" value={editing.allowedGender} onChange={e => setEditing({...editing, allowedGender: e.target.value as GenderRestriction})}><option value={GenderRestriction.ALL}>不限</option><option value={GenderRestriction.MALE_ONLY}>限男性</option><option value={GenderRestriction.FEMALE_ONLY}>限女性</option></select></div>
                        </div>
                        <button onClick={handleSave} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">儲存假別</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const WarningRuleTab = () => {
    const [rules, setRules] = useState<WarningRule[]>([]);
    const [categories, setCategories] = useState<LeaveCategory[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<WarningRule>>({});
    
    // --- 刪除確認狀態 ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<WarningRule | null>(null);

    useEffect(() => { load(); }, []);
    const load = async () => { const [r, c] = await Promise.all([db.getWarningRules(), db.getLeaveCategories()]); setRules(r || []); setCategories(c || []); };

    const handleSave = async () => {
        if (!editing.name || !editing.targetType) return alert('請填寫完整規則名稱與假別');
        const newRule = { 
            id: editing.id || generateId(), 
            name: editing.name, 
            targetType: editing.targetType, 
            operator: editing.operator || '>=', 
            threshold: editing.threshold || 1, 
            message: editing.message || '', 
            color: editing.color || 'yellow', 
            timeWindow: editing.timeWindow || 'ALL_TIME',
            daysCount: editing.daysCount,
            startDate: editing.startDate,
            endDate: editing.endDate
        } as WarningRule;
        
        const updated = rules.some(r => r.id === newRule.id) ? rules.map(r => r.id === newRule.id ? newRule : r) : [...rules, newRule];
        await db.saveWarningRules(updated);
        setRules(updated);
        setIsModalOpen(false);
    };

    const handleConfirmDelete = async () => {
        if (!ruleToDelete) return;
        await db.deleteWarningRule(ruleToDelete.id);
        await load();
        setIsDeleteModalOpen(false);
        setRuleToDelete(null);
    };

    const getTimeWindowLabel = (rule: WarningRule) => {
        switch (rule.timeWindow) {
            case 'LAST_N_DAYS': return `最近 ${rule.daysCount} 天內`;
            case 'FROM_DATE_N_DAYS': return `從 ${rule.startDate} 起 ${rule.daysCount} 天內`;
            case 'FIXED_RANGE': return `期間 ${rule.startDate} ~ ${rule.endDate}`;
            default: return '不限時間 (總累積)';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><BadgeAlert size={28}/></div>
                    <div><h3 className="text-xl font-black text-slate-800">出勤預警規則</h3><p className="text-xs text-slate-400">彈性設定時間範圍與累積天數門檻。</p></div>
                </div>
                <button onClick={() => { setEditing({ id: generateId(), name: '', color: 'yellow', operator: '>=', threshold: 3, timeWindow: 'ALL_TIME' }); setIsModalOpen(true); }} className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-bold shadow-lg shadow-amber-100 flex items-center gap-2 hover:bg-amber-700 transition-all"><Plus size={18}/> 新增預警</button>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
                {rules.map(r => (
                    <div key={r.id} className={`bg-white rounded-2xl border-l-8 p-6 flex flex-col gap-3 shadow-sm hover:scale-[1.01] transition-all group ${r.color === 'red' ? 'border-red-500' : 'border-amber-400'}`}>
                        <div className="flex justify-between items-center">
                            <h4 className="font-black text-slate-800 text-lg">{r.name}</h4>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditing(r); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => { setRuleToDelete(r); setIsDeleteModalOpen(true); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> 時間範圍: <span className="text-indigo-600">{getTimeWindowLabel(r)}</span></div>
                            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><History size={12} className="text-slate-400" /> 累積門檻: <span className="text-slate-700 font-black">{r.targetType} {r.operator} {r.threshold} 天</span></div>
                        </div>
                        <p className="text-[11px] text-slate-400 italic bg-slate-50 p-2 rounded-lg border border-dashed">警示訊息: {r.message}</p>
                    </div>
                ))}
            </div>

            {/* --- 刪除確認視窗 --- */}
            {isDeleteModalOpen && ruleToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                                <AlertOctagon size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-3">確定刪除預警規則？</h3>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6">
                                <span className="text-sm font-bold text-slate-600 italic">「{ruleToDelete.name}」</span>
                            </div>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">此動作將解除統計頁面的警示標記且無法還原。</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleConfirmDelete} className="w-full py-3 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100">確定刪除</button>
                                <button onClick={() => { setIsDeleteModalOpen(false); setRuleToDelete(null); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Settings2 className="text-amber-500"/> 編輯預警規則</h3>
                            <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-100 p-1 rounded-full"><X/></button>
                        </div>
                        
                        <div className="space-y-6">
                            {/* 基本資訊 */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">規則名稱</label>
                                    <input className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-amber-500 outline-none" placeholder="例如：頻繁病假預警" value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">目標假別</label>
                                        <select className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 outline-none" value={editing.targetType} onChange={e => setEditing({...editing, targetType: e.target.value})}>
                                            <option value="">選擇假別...</option>
                                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">門檻條件 (天數)</label>
                                        <div className="flex gap-2">
                                            <select className="w-20 border-2 rounded-xl p-3 font-bold text-slate-700" value={editing.operator} onChange={e => setEditing({...editing, operator: e.target.value as WarningOperator})}>
                                                <option value=">=">&gt;=</option>
                                                <option value=">">&gt;</option>
                                            </select>
                                            <input type="number" className="flex-1 border-2 rounded-xl p-3 font-bold text-slate-700" value={editing.threshold} onChange={e => setEditing({...editing, threshold: Number(e.target.value)})} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 時間範圍設定 - 重點強化 */}
                            <div className="bg-slate-50 p-5 rounded-2xl border space-y-4">
                                <label className="block text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><CalendarDays size={14}/> 時間範圍設定</label>
                                
                                <select className="w-full border rounded-xl p-2.5 font-bold text-sm" value={editing.timeWindow} onChange={e => setEditing({...editing, timeWindow: e.target.value as TimeWindowType})}>
                                    <option value="ALL_TIME">不限時間 (歷史總累積)</option>
                                    <option value="LAST_N_DAYS">最近 N 天內 (從今天回推)</option>
                                    <option value="FROM_DATE_N_DAYS">特定日期起 N 天內 (往後推算)</option>
                                    <option value="FIXED_RANGE">固定日期區間 (絕對時間)</option>
                                </select>

                                {/* 條件輸入 */}
                                {editing.timeWindow === 'LAST_N_DAYS' && (
                                    <div className="animate-in fade-in slide-in-from-top-1">
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">回推天數</label>
                                        <input type="number" className="w-full border rounded-xl p-2 font-bold" placeholder="輸入天數，如 30" value={editing.daysCount || ''} onChange={e => setEditing({...editing, daysCount: Number(e.target.value)})} />
                                    </div>
                                )}
                                
                                {editing.timeWindow === 'FROM_DATE_N_DAYS' && (
                                    <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">起算日期</label>
                                            <input type="date" className="w-full border rounded-xl p-2 font-bold" value={editing.startDate || ''} onChange={e => setEditing({...editing, startDate: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">向後計算天數</label>
                                            <input type="number" className="w-full border rounded-xl p-2 font-bold" placeholder="天數" value={editing.daysCount || ''} onChange={e => setEditing({...editing, daysCount: Number(e.target.value)})} />
                                        </div>
                                    </div>
                                )}

                                {editing.timeWindow === 'FIXED_RANGE' && (
                                    <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">開始日期</label>
                                            <input type="date" className="w-full border rounded-xl p-2 font-bold" value={editing.startDate || ''} onChange={e => setEditing({...editing, startDate: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">結束日期</label>
                                            <input type="date" className="w-full border rounded-xl p-2 font-bold" value={editing.endDate || ''} onChange={e => setEditing({...editing, endDate: e.target.value})} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 警示外觀與訊息 */}
                            <div className="space-y-4">
                                <div className="flex gap-6 items-center">
                                    <label className="text-xs font-bold text-slate-400 uppercase">警示等級</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="radio" className="w-4 h-4 accent-amber-500" checked={editing.color === 'yellow'} onChange={() => setEditing({...editing, color: 'yellow'})}/> 
                                            <span className="text-sm font-bold text-amber-600">黃色 (中等預警)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="radio" className="w-4 h-4 accent-red-500" checked={editing.color === 'red'} onChange={() => setEditing({...editing, color: 'red'})}/> 
                                            <span className="text-sm font-bold text-red-600">紅色 (嚴重警告)</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">警示提醒文字</label>
                                    <textarea className="w-full border-2 rounded-xl p-3 font-bold text-sm h-24 focus:border-amber-500 outline-none" placeholder="顯示給管理者的提醒訊息..." value={editing.message || ''} onChange={e => setEditing({...editing, message: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 border-t pt-6 sticky bottom-0 bg-white">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border-2 rounded-2xl font-bold text-slate-500 hover:bg-slate-50">取消</button>
                            <button onClick={handleSave} className="flex-[2] py-3 bg-amber-600 text-white rounded-2xl font-black shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all">儲存預警規則</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- 優化後的帳號專屬 Excel 備份還原 ---
const BackupRestoreTab = ({ onSwitchTab }: { onSwitchTab: (tab: string) => void }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [diffs, setDiffs] = useState<UserDataDiff[]>([]);
    const [stagedUsers, setStagedUsers] = useState<User[]>([]);

    const handleExport = async () => {
        try {
            const users = await db.getUsers();
            const exportData = users.map(u => {
                // 排除 id, password, createdAt, idcreatedAt 等技術欄位
                // @ts-ignore
                const { id, password, createdAt, idcreatedAt, quota, usedQuota, isFirstLogin, ...rest } = u;
                const flat: any = { ...rest };
                if (quota?.annual) Object.entries(quota.annual).forEach(([year, days]) => { flat[`特休額度_${year}`] = days; });
                flat['加班額度'] = quota?.overtime || 0;
                return flat;
            });
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, "Users");
            XLSX.writeFile(wb, `HR_Accounts_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (err) { alert('匯出失敗'); }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const rawData = XLSX.utils.sheet_to_json(wb.Sheets["Users"]);
                const currentUsers = await db.getUsers();
                const processed: User[] = [];
                const diffResults: UserDataDiff[] = [];

                rawData.forEach((row: any) => {
                    const existing = currentUsers.find(u => u.username === String(row.username || ''));
                    const userObj: User = {
                        id: existing ? existing.id : generateId(),
                        username: String(row.username || ''),
                        employeeId: String(row.employeeId || ''),
                        name: String(row.name || ''),
                        gender: (row.gender as Gender) || Gender.MALE,
                        role: (row.role as UserRole) || UserRole.EMPLOYEE,
                        password: existing ? (existing.password || '123456') : '123456',
                        department: String(row.department || ''),
                        jobTitle: String(row.jobTitle || ''),
                        isFirstLogin: existing ? existing.isFirstLogin : true,
                        workflowGroupId: String(row.workflowGroupId || 'default'),
                        quota: { annual: {}, overtime: Number(row['加班額度']) || 0 },
                        usedQuota: existing ? existing.usedQuota : { annual: {}, sick: 0, personal: 0, menstrual: 0 }
                    };
                    Object.keys(row).forEach(key => { if (key.startsWith('特休額度_')) { const year = parseInt(key.replace('特休額度_', '')); if (!isNaN(year)) userObj.quota.annual[year] = Number(row[key]); } });
                    processed.push(userObj);

                    if (!existing) diffResults.push({ username: userObj.username, name: userObj.name, status: 'NEW', details: ['新進員工：密碼將預設為 123456'], newData: userObj });
                    else {
                        const changes: string[] = [];
                        ['name', 'department', 'jobTitle', 'role', 'employeeId'].forEach(f => {
                            // @ts-ignore
                            if (String(userObj[f]) !== String(existing[f])) changes.push(`${f}: [${existing[f]}] → [${userObj[f]}]`);
                        });
                        if (changes.length > 0) diffResults.push({ username: userObj.username, name: userObj.name, status: 'MODIFIED', details: changes, newData: userObj });
                    }
                });
                setStagedUsers(processed); setDiffs(diffResults); setIsComparing(true);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } catch (err) { alert('匯入失敗，請檢查格式'); }
        };
        reader.readAsBinaryString(file);
    };

    const confirmRestore = async () => {
        setIsSaving(true);
        try {
            await db.saveUsers(stagedUsers);
            alert('帳號資料還原完成！'); setIsComparing(false); onSwitchTab('users');
        } catch (err) { alert('還原失敗'); setIsSaving(false); }
    };

    if (isComparing) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-300">
                <div className="bg-white px-8 py-6 flex justify-between items-center shadow-xl border-b">
                    <div className="flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><FileDiff size={32}/></div><div><h2 className="text-2xl font-black text-slate-800 tracking-tight">帳號還原差異比對</h2><p className="text-sm text-slate-400 font-bold">請核對變更內容。新帳號預設密碼皆為 123456。</p></div></div>
                    <div className="flex gap-4"><button onClick={() => setIsComparing(false)} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all">取消</button><button onClick={confirmRestore} disabled={isSaving} className="px-10 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2">{isSaving ? <RefreshCcw className="animate-spin" size={20}/> : <Check size={20}/>} 確認導入資料</button></div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-6xl mx-auto w-full">
                    {diffs.length === 0 ? (<div className="bg-white p-20 rounded-3xl text-center space-y-6 shadow-2xl"><CheckCircle2 size={80} className="mx-auto text-emerald-500"/><h3 className="text-3xl font-black text-slate-800">資料完全一致</h3><p className="text-slate-500 text-lg">無須更新。</p></div>) : (
                        diffs.map((d, idx) => (
                            <div key={idx} className={`bg-white rounded-3xl shadow-xl overflow-hidden border-2 transition-all ${d.status === 'NEW' ? 'border-emerald-100' : 'border-amber-100'}`}>
                                <div className={`px-6 py-4 flex items-center gap-3 ${d.status === 'NEW' ? 'bg-emerald-50' : 'bg-amber-50'}`}><span className={`px-3 py-1 rounded-lg text-xs font-black uppercase border ${d.status === 'NEW' ? 'bg-white text-emerald-600 border-emerald-100' : 'bg-white text-amber-600 border-amber-100'}`}>{d.status === 'NEW' ? '新增' : '修改'}</span><h4 className="font-black text-slate-800 text-xl">{d.name} <span className="text-xs text-slate-400 font-mono ml-2">@{d.username}</span></h4></div>
                                <div className="p-6 space-y-2">{d.details.map((detail, i) => (<div key={i} className="flex items-center gap-3 text-sm text-slate-600 font-medium"><div className={`w-1.5 h-1.5 rounded-full ${d.status === 'NEW' ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>{detail}</div>))}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-10 py-16">
            <div className="text-center space-y-4"><div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner"><Database size={48}/></div><h3 className="text-3xl font-black text-slate-800">帳號資料備份與還原</h3><p className="text-slate-500 font-medium text-lg">專為系統管理員設計。匯出時剔除 ID 與密碼，並展開各年度特休供 Excel 編輯。</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <button onClick={handleExport} className="flex flex-col items-center gap-6 p-10 bg-white rounded-[2rem] border-2 border-slate-100 hover:border-indigo-300 hover:shadow-2xl transition-all group"><div className="p-5 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><Download size={40}/></div><div className="text-center font-black text-slate-800 text-xl">下載帳號備份 (Excel)</div></button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-6 p-10 bg-white rounded-[2rem] border-2 border-slate-100 hover:border-emerald-300 hover:shadow-2xl transition-all group"><div className="p-5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform"><Upload size={40}/></div><div className="text-center font-black text-slate-800 text-xl">上傳還原檔案</div></button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleImport} />
            </div>
            <div className="bg-amber-50 p-8 rounded-[2rem] border-2 border-amber-100 flex gap-6"><AlertCircle className="text-amber-600 shrink-0" size={24}/><div className="text-sm text-amber-900 leading-relaxed font-bold"><p className="text-lg mb-3">⚠️ 安全還原規範：</p><ul className="list-disc pl-5 space-y-2 text-amber-800/80"><li>依據 <span className="text-indigo-700">username</span> 比對人員，排除密碼與 ID。</li><li>新進人員密碼預設為 <span className="text-blue-700">123456</span>。</li><li>特休欄位格式：<code className="bg-white px-1.5 py-0.5 rounded border">特休額度_年份</code>。</li></ul></div></div>
        </div>
    );
};

const StatsPermissionTab = () => {
    const [configs, setConfigs] = useState<UserStatsConfig[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<UserStatsConfig>>({});
    
    // 刪除確認
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [configToDelete, setConfigToDelete] = useState<UserStatsConfig | null>(null);

    // 從現有使用者中提取唯一值作為選項
    const [allDepts, setAllDepts] = useState<string[]>([]);
    const [allTitles, setAllTitles] = useState<string[]>([]);

    useEffect(() => { load(); }, []);
    const load = async () => {
        setLoading(true);
        const [c, u] = await Promise.all([db.getStatsConfigs(), db.getUsers()]);
        setConfigs(c || []); setUsers(u || []);
        
        // 提取部門與職稱選單
        setAllDepts(Array.from(new Set((u || []).map(user => user.department).filter(Boolean))));
        setAllTitles(Array.from(new Set((u || []).map(user => user.jobTitle).filter(Boolean))));
        
        setLoading(false);
    };

    const handleSave = async () => {
        if (!editing.targetValue) return alert('請選擇被授權的帳號');
        
        const newConf = { 
            id: editing.id || generateId(), 
            targetType: 'USER', // 此處以帳號授權為主
            targetValue: editing.targetValue!, 
            allowedDepts: editing.allowedDepts || [], 
            allowedRoles: editing.allowedRoles || [], 
            allowedTitles: editing.allowedTitles || [] 
        } as UserStatsConfig;
        
        const updated = configs.some(c => c.id === newConf.id) ? configs.map(c => c.id === newConf.id ? newConf : c) : [...configs, newConf];
        await db.saveStatsConfigs(updated);
        setConfigs(updated); 
        setIsModalOpen(false);
    };

    const confirmDelete = async () => {
        if (!configToDelete) return;
        const n = configs.filter(x => x.id !== configToDelete.id);
        await db.saveStatsConfigs(n);
        setConfigs(n);
        setIsDeleteModalOpen(false);
        setConfigToDelete(null);
    };

    const toggleSelection = (field: 'allowedDepts' | 'allowedRoles' | 'allowedTitles', value: any) => {
        const current = (editing[field] as any[]) || [];
        const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        setEditing({ ...editing, [field]: next });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><ShieldCheck size={28}/></div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800">統計頁面權限控管</h3>
                        <p className="text-xs text-slate-400">指定帳號可以進入統計頁面，並自定義其可查看的部門、職稱與層級範圍。</p>
                    </div>
                </div>
                <button onClick={() => { setEditing({ id: generateId(), targetType: 'USER', targetValue: '', allowedDepts: [], allowedRoles: [], allowedTitles: [] }); setIsModalOpen(true); }} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 flex items-center gap-2 hover:bg-indigo-700 transition-all"><Plus size={18}/> 新增帳號授權</button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {configs.map(c => {
                    const targetUser = users.find(u => u.id === c.targetValue);
                    return (
                        <div key={c.id} className="bg-white rounded-2xl border p-6 flex flex-col gap-4 shadow-sm hover:border-indigo-300 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button onClick={() => { setEditing(c); setIsModalOpen(true); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                                <button onClick={() => { setConfigToDelete(c); setIsDeleteModalOpen(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                                    {targetUser?.name?.charAt(0) || '?'}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800">{targetUser?.name || '未知帳號'}</h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">@{targetUser?.username}</span>
                                </div>
                            </div>

                            <div className="space-y-3 pt-3 border-t">
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="text-[10px] font-black text-slate-400 w-full mb-0.5">開放部門:</span>
                                    {c.allowedDepts.length > 0 ? c.allowedDepts.map(d => <span key={d} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100">{d}</span>) : <span className="text-[10px] text-slate-300 italic">未限定</span>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="text-[10px] font-black text-slate-400 w-full mb-0.5">開放職稱:</span>
                                    {c.allowedTitles.length > 0 ? c.allowedTitles.map(t => <span key={t} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold border border-emerald-100">{t}</span>) : <span className="text-[10px] text-slate-300 italic">未限定</span>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="text-[10px] font-black text-slate-400 w-full mb-0.5">開放層級:</span>
                                    {c.allowedRoles.length > 0 ? c.allowedRoles.map(r => <span key={r} className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-bold border border-amber-100">{ROLE_LABELS[r]}</span>) : <span className="text-[10px] text-slate-300 italic">未限定</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 刪除確認 */}
            {isDeleteModalOpen && configToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
                                <ShieldAlert size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-3">撤銷統計權限？</h3>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6">
                                <span className="text-sm font-bold text-slate-600">帳號: 「{users.find(u => u.id === configToDelete.targetValue)?.name}」</span>
                            </div>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">此動作將立即關閉該帳號的統計資料訪問權限。</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={confirmDelete} className="w-full py-3 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100">確認撤銷</button>
                                <button onClick={() => { setIsDeleteModalOpen(false); setConfigToDelete(null); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <div className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl space-y-8 overflow-y-auto max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><UserCog className="text-indigo-600"/> 統計授權編輯</h3>
                            <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-100 p-1 rounded-full"><X/></button>
                        </div>
                        
                        <div className="space-y-8">
                            {/* 1. 選擇人員 */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 text-indigo-600"><Users size={18}/><h4 className="font-black text-sm uppercase">1. 選擇要開啟權限的帳號</h4></div>
                                <select 
                                    className="w-full border-2 rounded-xl p-3 font-bold text-slate-700 focus:border-indigo-500 outline-none transition-all" 
                                    value={editing.targetValue} 
                                    onChange={e => setEditing({...editing, targetValue: e.target.value})}
                                >
                                    <option value="">請選擇人員...</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.department} - {u.jobTitle})</option>)}
                                </select>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* 2. 部門範圍 */}
                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-blue-600"><Building2 size={18}/><h4 className="font-black text-sm uppercase">2. 開放查看部門</h4></div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                                        {allDepts.map(dept => (
                                            <label key={dept} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-all">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 accent-blue-600" 
                                                    checked={(editing.allowedDepts || []).includes(dept)}
                                                    onChange={() => toggleSelection('allowedDepts', dept)}
                                                />
                                                <span className={`text-sm font-bold ${ (editing.allowedDepts || []).includes(dept) ? 'text-blue-700' : 'text-slate-500' }`}>{dept}</span>
                                            </label>
                                        ))}
                                    </div>
                                </section>

                                {/* 3. 職稱範圍 */}
                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-emerald-600"><GraduationCap size={18}/><h4 className="font-black text-sm uppercase">3. 開放查看職稱</h4></div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                                        {allTitles.map(title => (
                                            <label key={title} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-all">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 accent-emerald-600" 
                                                    checked={(editing.allowedTitles || []).includes(title)}
                                                    onChange={() => toggleSelection('allowedTitles', title)}
                                                />
                                                <span className={`text-sm font-bold ${ (editing.allowedTitles || []).includes(title) ? 'text-emerald-700' : 'text-slate-500' }`}>{title}</span>
                                            </label>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            {/* 4. 層級範圍 */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-600"><Layers size={18}/><h4 className="font-black text-sm uppercase">4. 開放查看層級</h4></div>
                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4">
                                    {Object.entries(UserRole).map(([key, role]) => (
                                        <label key={role} className="flex items-center gap-2.5 cursor-pointer group bg-white px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400 transition-all">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 accent-amber-600" 
                                                checked={(editing.allowedRoles || []).includes(role as UserRole)}
                                                onChange={() => toggleSelection('allowedRoles', role as UserRole)}
                                            />
                                            <span className="text-xs font-black text-slate-700">{ROLE_LABELS[role as UserRole]}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <div className="flex gap-3 border-t pt-6 sticky bottom-0 bg-white">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border-2 rounded-2xl font-bold text-slate-500 hover:bg-slate-50">取消</button>
                            <button onClick={handleSave} className="flex-[2] py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">儲存權限設定</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBaseData = async () => {
        setLoading(true);
        try { const g = await db.getWorkflowConfig(); setWorkflowGroups(g || []); } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchBaseData();
  }, []);

  const tabs = [
    { id: 'users', label: '帳號管理', icon: Users }, 
    { id: 'workflow', label: '簽核流程', icon: GitFork }, 
    { id: 'categories', label: '假別設定', icon: Sparkles },
    { id: 'warnings', label: '預警設定', icon: BadgeAlert },
    { id: 'stats', label: '統計權限', icon: ShieldCheck }, 
    { id: 'backup', label: '備份還原', icon: Database }
  ];

  if (loading) return <div className="p-20 text-center font-bold text-blue-600 animate-pulse">系統加載中...</div>;
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-start"><div><h2 className="text-3xl font-black text-slate-800 tracking-tight">系統管理中心</h2><p className="text-slate-500 font-medium italic">企業級人事規則控管引擎</p></div><div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 text-xs font-black flex items-center gap-2"><ShieldCheck size={14}/> 伺服器安全性同步中</div></div>
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-1">
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition-all ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}><t.icon size={18} /> {t.label}</button>)}
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
          {activeTab === 'users' && <UserTab workflowGroups={workflowGroups} />}
          {activeTab === 'workflow' && <WorkflowTab />}
          {activeTab === 'categories' && <LeaveCategoryTab />}
          {activeTab === 'warnings' && <WarningRuleTab />}
          {activeTab === 'stats' && <StatsPermissionTab />}
          {activeTab === 'backup' && <BackupRestoreTab onSwitchTab={setActiveTab} />}
      </div>
    </div>
  );
}
