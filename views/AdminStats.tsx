
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/mockDb';
import { LeaveRequest, RequestStatus, LeaveType, LeaveCategory, User, ApprovalLog } from '../types';
import { Search, Filter, Download, X, Save, Calendar, Clock, Upload, Plus, Trash2, AlertTriangle, User as UserIcon, CheckCircle, UserPlus, FileDiff, ArrowRight, Edit, Archive, UserCheck, Timer, ChevronDown, AlertOctagon } from 'lucide-react';
// @ts-ignore
import * as XLSX from 'xlsx';

interface StatsRow extends LeaveRequest {
  employeeId: string;
  department: string;
  durationText: string;
  lastUpdatedAt: string;
}

export default function AdminStats() {
  const [data, setData] = useState<StatsRow[]>([]);
  const [filteredData, setFilteredData] = useState<StatsRow[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [keyword, setKeyword] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('ALL');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [newReq, setNewReq] = useState<Partial<StatsRow>>({
      userId: '',
      type: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      isPartialDay: false,
      startTime: '09:00',
      endTime: '18:00',
      reason: '管理員手動補單'
  });
  
  const [availableLeaveTypes, setAvailableLeaveTypes] = useState<LeaveCategory[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StatsRow | null>(null);
  
  // Batch Delete States
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [isDoubleCheckOpen, setIsDoubleCheckOpen] = useState(false); // New state for 2nd confirmation
  const [batchDeleteStart, setBatchDeleteStart] = useState('');
  const [batchDeleteEnd, setBatchDeleteEnd] = useState('');

  useEffect(() => { loadData(); }, []);
  useEffect(() => { applyFilters(); }, [data, keyword, startDate, endDate, statusFilter, leaveTypeFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
        const [requests, users, cats] = await Promise.all([db.getRequests(), db.getUsers(), db.getLeaveCategories()]);
        setAllUsers(users);
        setAvailableLeaveTypes(cats);
        const userMap = new Map(users.map(u => [u.id, u]));

        const formatted: StatsRow[] = requests.map(r => {
          const u = userMap.get(r.userId);
          const lastLog = r.logs && r.logs.length > 0 ? r.logs[r.logs.length - 1] : null;
          return { ...r, employeeId: u?.employeeId || 'N/A', department: u?.department || 'Unknown', durationText: '-', lastUpdatedAt: lastLog?.timestamp || r.createdAt };
        });
        setData(formatted.sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const applyFilters = () => {
    let res = [...data];
    if (keyword) {
      const lower = keyword.toLowerCase();
      res = res.filter(r => r.userName.toLowerCase().includes(lower) || r.employeeId.toLowerCase().includes(lower) || r.department.toLowerCase().includes(lower));
    }
    if (startDate) res = res.filter(r => r.startDate >= startDate);
    if (endDate) res = res.filter(r => r.endDate <= endDate);
    if (statusFilter !== 'ALL') res = res.filter(r => r.status === statusFilter);
    if (leaveTypeFilter !== 'ALL') res = res.filter(r => r.type === leaveTypeFilter);
    setFilteredData(res);
  };

  // Step 1: Triggered by the first modal button
  const promptBatchDelete = () => {
      if (!batchDeleteStart || !batchDeleteEnd) {
          alert('請選擇完整的起始與結束日期');
          return;
      }
      if (batchDeleteEnd < batchDeleteStart) {
          alert('結束日期不能早於起始日期');
          return;
      }
      setIsDoubleCheckOpen(true);
  };

  // Step 2: Actually execute the deletion
  const executeFinalBatchDelete = async () => {
      setLoading(true);
      setIsDoubleCheckOpen(false); // Close confirmation
      try {
        // 使用真正的刪除方法，而非 Upsert (避免 Supabase 資料未被移除)
        await db.deleteRequestsByRange(batchDeleteStart, batchDeleteEnd);
        await loadData();
        setBatchDeleteModalOpen(false); // Close main batch modal
        alert('批量清理完成！');
      } catch (e: any) {
        console.error(e);
        alert('刪除失敗: ' + (e.message || '未知錯誤'));
      } finally {
        setLoading(false);
      }
  };

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newReq.userId || !newReq.type || !newReq.startDate) {
          alert('請填寫完整單據資料');
          return;
      }
      
      const targetUser = allUsers.find(u => u.id === newReq.userId);
      if (!targetUser) return;

      const baseReq: LeaveRequest = {
          id: crypto.randomUUID(), 
          userId: targetUser.id, 
          userName: targetUser.name, 
          type: newReq.type, 
          startDate: newReq.startDate, 
          endDate: newReq.endDate || newReq.startDate, 
          isPartialDay: newReq.isPartialDay || false, 
          startTime: newReq.isPartialDay ? newReq.startTime : undefined, 
          endTime: newReq.isPartialDay ? newReq.endTime : undefined, 
          reason: newReq.reason || '管理員手動補單', 
          deputy: '', 
          status: RequestStatus.APPROVED, 
          createdAt: new Date().toISOString(), 
          currentStep: 99, 
          stepApprovedBy: [], 
          totalSteps: 1, 
          logs: [{ 
              approverId: 'ADMIN', 
              approverName: '系統管理員', 
              action: 'APPROVE', 
              timestamp: new Date().toISOString(), 
              comment: '管理員手動直接補單(已核准)' 
          }]
      };

      try {
          await db.createRequest(baseReq);
          await loadData();
          setIsModalOpen(false);
          setNewReq({
              userId: '',
              type: '',
              startDate: new Date().toISOString().split('T')[0],
              endDate: new Date().toISOString().split('T')[0],
              isPartialDay: false,
              startTime: '09:00',
              endTime: '18:00',
              reason: '管理員手動補單'
          });
          setUserSearchTerm('');
      } catch (err) {
          alert('儲存失敗');
      }
  };

  const confirmDelete = async () => {
      if (deleteTarget) {
          await db.deleteRequest(deleteTarget.id);
          await loadData();
          setDeleteModalOpen(false);
      }
  };

  const handleExport = () => {
      const ws = XLSX.utils.json_to_sheet(filteredData.map(r => ({
          '姓名': r.userName, '工號': r.employeeId, '部門': r.department, '假別': r.type, '起始日期': r.startDate, '結束日期': r.endDate, '狀態': r.status, '事由': r.reason
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, `HR_Stats_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const filteredModalUsers = allUsers.filter(u => 
      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
      u.employeeId.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
      u.department.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  if (loading) return <div className="p-12 text-center text-slate-400 font-bold animate-pulse">載入資料中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div><h2 className="text-2xl font-bold text-slate-800">資料統計與維護</h2><p className="text-slate-500 italic">系統管理員專屬工具</p></div>
        <div className="flex gap-2">
            <button onClick={handleExport} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-slate-900 transition-colors shadow-sm"><Download size={18}/> 匯出 Excel</button>
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm shadow-blue-100"><Plus size={18}/> 新增單據</button>
            <button onClick={() => setBatchDeleteModalOpen(true)} className="px-4 py-2 bg-red-50 text-red-700 rounded-lg border border-red-100 font-bold hover:bg-red-100">批次刪除</button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-4 shadow-sm">
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="關鍵字搜尋..." className="w-full border border-slate-300 pl-9 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>
        <select className="border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">全部狀態</option>{Object.values(RequestStatus).map(s => <option key={s} value={s}>{s}</option>)}</select>
        <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <input type="date" className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <input type="date" className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500">
                <tr><th className="px-6 py-4">員工資訊</th><th className="px-6 py-4">單據類型</th><th className="px-6 py-4">請假/加班期間</th><th className="px-6 py-4">當前狀態</th><th className="px-6 py-4 text-right">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{r.userName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.employeeId} · {r.department}</div>
                    </td>
                    <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${r.type === LeaveType.OVERTIME ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{r.type}</span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="font-medium">{r.startDate} ~ {r.endDate}</div>
                        {r.isPartialDay && <div className="text-[10px] text-orange-600 flex items-center gap-1 font-bold"><Timer size={10}/> {r.startTime} - {r.endTime}</div>}
                    </td>
                    <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === RequestStatus.APPROVED ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <button onClick={() => { setDeleteTarget(r); setDeleteModalOpen(true); }} className="text-red-400 hover:text-red-600 p-2 transition-colors" title="刪除單據"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        {filteredData.length === 0 && <div className="p-20 text-center text-slate-400 font-medium">目前沒有符合條件的單據資料</div>}
      </div>

      {/* --- 新增單據視窗 --- */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><UserPlus className="text-blue-600"/> 手動新增已核准單據</h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X/></button>
                  </div>
                  
                  <form onSubmit={handleCreate} className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">
                      {/* 1. 選擇員工 (含搜尋) */}
                      <div className="space-y-2">
                          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">1. 選擇員工 (可搜尋姓名/工號/部門)</label>
                          <div className="relative mb-2">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                              <input 
                                  type="text" 
                                  placeholder="輸入人員關鍵字搜尋..." 
                                  className="w-full border border-slate-300 pl-9 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-bold"
                                  value={userSearchTerm}
                                  onChange={e => setUserSearchTerm(e.target.value)}
                              />
                          </div>
                          <div className="border border-slate-200 rounded-lg overflow-hidden h-40 bg-slate-50/50">
                              <div className="overflow-y-auto h-full p-1 space-y-1">
                                  {filteredModalUsers.map(u => (
                                      <div 
                                        key={u.id} 
                                        onClick={() => setNewReq({...newReq, userId: u.id})}
                                        className={`px-3 py-2 rounded-md cursor-pointer transition-all flex justify-between items-center ${newReq.userId === u.id ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-blue-50 text-slate-700'}`}
                                      >
                                          <div>
                                              <span className="font-black">{u.name}</span>
                                              <span className={`text-[10px] ml-2 ${newReq.userId === u.id ? 'text-blue-100' : 'text-slate-400'}`}>{u.employeeId} · {u.department}</span>
                                          </div>
                                          {newReq.userId === u.id && <CheckCircle size={14} />}
                                      </div>
                                  ))}
                                  {filteredModalUsers.length === 0 && <div className="p-8 text-center text-slate-400 text-xs italic">查無相符人員</div>}
                              </div>
                          </div>
                      </div>

                      {/* 2. 單據類型與期間 */}
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">2. 單據類型</label>
                              <select 
                                required
                                className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800" 
                                value={newReq.type} 
                                onChange={e => setNewReq({...newReq, type: e.target.value})}
                              >
                                  <option value="">選擇類型...</option>
                                  <optgroup label="加班申請">
                                      <option value={LeaveType.OVERTIME}>{LeaveType.OVERTIME}</option>
                                  </optgroup>
                                  <optgroup label="各項假別">
                                      {availableLeaveTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                  </optgroup>
                              </select>
                          </div>
                          <div className="space-y-1 flex flex-col justify-center">
                              <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                    checked={newReq.isPartialDay}
                                    onChange={e => setNewReq({...newReq, isPartialDay: e.target.checked})}
                                  />
                                  <span className="text-sm font-bold text-slate-700">此為部分時段 (非整天)</span>
                              </label>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">3. 起始日期</label>
                              <input type="date" required className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newReq.startDate} onChange={e => setNewReq({...newReq, startDate: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">結束日期</label>
                              <input type="date" required className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newReq.endDate} min={newReq.startDate} onChange={e => setNewReq({...newReq, endDate: e.target.value})} />
                          </div>
                      </div>

                      {newReq.isPartialDay && (
                          <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in slide-in-from-top-2 duration-300">
                              <div className="space-y-1">
                                  <label className="block text-[10px] font-black text-blue-600 uppercase">開始時間</label>
                                  <input type="time" className="w-full border border-blue-200 p-2 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newReq.startTime} onChange={e => setNewReq({...newReq, startTime: e.target.value})} />
                              </div>
                              <div className="space-y-1">
                                  <label className="block text-[10px] font-black text-blue-600 uppercase">結束時間</label>
                                  <input type="time" className="w-full border border-blue-200 p-2 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newReq.endTime} onChange={e => setNewReq({...newReq, endTime: e.target.value})} />
                              </div>
                          </div>
                      )}

                      <div className="space-y-1">
                          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">4. 補單備註</label>
                          <textarea 
                            className="w-full border border-slate-300 p-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium h-20" 
                            placeholder="請填寫補單說明..."
                            value={newReq.reason} 
                            onChange={e => setNewReq({...newReq, reason: e.target.value})}
                          />
                      </div>

                      <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3">
                          <CheckCircle className="text-emerald-500 shrink-0" size={20} />
                          <div className="text-[11px] text-emerald-800 font-bold leading-tight">
                              <p className="mb-0.5">系統自動核定</p>
                              <p className="opacity-70">手動新增之單據將跳過簽核流程，直接以「已核准」狀態存入系統，並標註為管理員手動補登。</p>
                          </div>
                      </div>

                      <div className="flex gap-3 pt-4 sticky bottom-0 bg-white">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-colors">取消返回</button>
                          <button type="submit" className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-[0.98] transition-all">確認建立已核准單據</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {deleteModalOpen && (
          <div className="fixed inset-0 bg-black/50 p-4 flex items-center justify-center z-[60] animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={32} />
                  </div>
                  <h3 className="font-black text-xl text-slate-800 mb-2">確定刪除此單據？</h3>
                  <p className="text-sm text-slate-500 mb-6">此動作將永久移除該筆假勤紀錄，且無法復原。這可能會影響員工的特休或加班餘額計算。</p>
                  <div className="flex gap-3">
                      <button onClick={() => setDeleteModalOpen(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-all">取消</button>
                      <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100">執行刪除</button>
                  </div>
              </div>
          </div>
      )}

      {batchDeleteModalOpen && (
          <div className="fixed inset-0 bg-black/50 p-4 flex items-center justify-center z-[60] animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full space-y-6 shadow-2xl">
                  <div className="flex items-center gap-3 text-red-600">
                      <Archive size={24} />
                      <h3 className="font-black text-xl">批次刪除區間資料</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">請選擇一個時間範圍，系統將會刪除該區間內**所有員工**的所有單據紀錄。建議在執行此動作前先匯出 Excel 備份。</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase">區間開始日期</label>
                          <input type="date" className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" value={batchDeleteStart} onChange={e => setBatchDeleteStart(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase">區間結束日期</label>
                          <input type="date" className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" value={batchDeleteEnd} onChange={e => setBatchDeleteEnd(e.target.value)} />
                      </div>
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                      <button onClick={() => setBatchDeleteModalOpen(false)} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-bold text-slate-500">取消</button>
                      <button onClick={promptBatchDelete} className="flex-[2] px-4 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-100 hover:bg-red-700 active:scale-[0.98] transition-all">執行批量清理</button>
                  </div>
              </div>
          </div>
      )}

      {/* Double Check Modal for Batch Delete */}
      {isDoubleCheckOpen && (
          <div className="fixed inset-0 bg-black/60 p-4 flex items-center justify-center z-[70] animate-in zoom-in duration-300">
              <div className="bg-white rounded-[2rem] p-10 max-w-sm w-full text-center shadow-2xl border-4 border-red-50">
                  <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
                      <AlertOctagon size={40} />
                  </div>
                  <h3 className="font-black text-2xl text-slate-800 mb-2">最後警告：無法復原</h3>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6 text-left">
                      <p className="text-xs font-bold text-red-800 uppercase mb-2">即將刪除資料範圍：</p>
                      <p className="text-sm font-black text-slate-700">{batchDeleteStart} ~ {batchDeleteEnd}</p>
                  </div>
                  <p className="text-sm text-slate-500 mb-8 font-medium">您確定要永久刪除此範圍內的所有紀錄嗎？此動作將立即生效且不可逆轉。</p>
                  <div className="flex flex-col gap-3">
                      <button onClick={executeFinalBatchDelete} className="w-full py-3.5 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95">確認並執行刪除</button>
                      <button onClick={() => setIsDoubleCheckOpen(false)} className="w-full py-3.5 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all">取消返回</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
