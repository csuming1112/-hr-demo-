
// ... imports ...
// (Retain all existing imports)
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { db, OvertimeReview } from '../services/mockDb';
import { User, RequestStatus, LeaveType, LeaveRequest, OvertimeSettlementRecord, AuthSignature, ApprovalLog, OvertimeCheck } from '../types';
import { Search, DollarSign, Save, AlertTriangle, CheckCircle, Edit3, Calendar, Clock, Filter, History, HelpCircle, Activity, ArrowRight, Zap, Shield, Lock, X, Check, FileText, ArrowLeft, SaveAll, AlertOctagon, Calculator, Download, Upload, Bell, ClipboardList, UserCheck, Plus, Trash2, MoreVertical, Loader2, ChevronUp, ChevronDown, FileDown, FileUp, Sparkles } from 'lucide-react';
import { AuthContext } from '../App';
import { ROLE_LABELS } from '../constants';
// @ts-ignore
import * as XLSX from 'xlsx';

// 確保生成標準 UUID 格式
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

type AuthActionType = 'BATCH' | 'SINGLE_BASE' | 'SINGLE_PAY' | 'BATCH_BASE';
interface PendingAuthAction { type: AuthActionType; userId?: string; }

const calculateHours = (req: LeaveRequest) => {
    if (!req.isPartialDay) {
        const start = new Date(req.startDate), end = new Date(req.endDate);
        return (Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) * 8;
    } else {
        if (req.startTime && req.endTime) {
            const [sh, sm] = String(req.startTime).split(':').map(Number);
            const [eh, em] = String(req.endTime).split(':').map(Number);
            return parseFloat((Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60).toFixed(2));
        }
        return 4;
    }
};

const calculateDiffHours = (sTime: string, eTime: string) => {
    const [sh, sm] = sTime.split(':').map(Number);
    const [eh, em] = eTime.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff = 0;
    return parseFloat((diff / 60).toFixed(2));
};

type SortKey = 'userName' | 'employeeId' | 'startDate' | 'endDate' | 'appliedHours' | 'actualDuration' | 'isVerified';

export default function AdminOvertimeReview() {
  const { user: currentUser } = useContext(AuthContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [records, setRecords] = useState<OvertimeSettlementRecord[]>([]);
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchTerm, setSearchTerm] = useState('');

  const [payInputs, setPayInputs] = useState<Record<string, number>>({}); 
  const [balanceInputs, setBalanceInputs] = useState<Record<string, number>>({}); 
  const [modifiedUsers, setModifiedUsers] = useState<Set<string>>(new Set());
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  // --- Overtime Check Data (from overtime_check table) ---
  const [overtimeChecks, setOvertimeChecks] = useState<OvertimeCheck[]>([]);

  // --- Monthly Review State (Supabase Connected) ---
  const [currentMonthReviews, setCurrentMonthReviews] = useState<OvertimeReview[]>([]);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null); 
  const [reviewNote, setReviewNote] = useState('');
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  // Note Delete Modal
  const [isDeleteNoteModalOpen, setIsDeleteNoteModalOpen] = useState(false);
  const [noteToDeleteId, setNoteToDeleteId] = useState<string | null>(null);

  // Auth & Detail Modal
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authCreds, setAuthCreds] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);
  
  // Detail View State
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  const [detailEdits, setDetailEdits] = useState<Record<string, any>>({});
  const [detailRequests, setDetailRequests] = useState<LeaveRequest[]>([]);
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set());
  const [isDetailSaving, setIsDetailSaving] = useState(false);
  const [detailSort, setDetailSort] = useState<{key: SortKey, direction: 'asc' | 'desc'}>({ key: 'startDate', direction: 'desc' });

  useEffect(() => { loadData(); }, [selectedYear, selectedMonth]);
  useEffect(() => { if (recentlyUpdated.size > 0) { const t = setTimeout(() => setRecentlyUpdated(new Set()), 3000); return () => clearTimeout(t); } }, [recentlyUpdated]);

  const loadData = async () => {
    setIsReviewLoading(true);
    try {
        const [allUsers, allReqs, allRecords, allReviews, allChecks] = await Promise.all([
            db.getUsers(), db.getRequests(), db.getOvertimeRecords(),
            db.getOvertimeReviews(selectedYear, selectedMonth),
            db.getOvertimeChecks(selectedYear, selectedMonth)
        ]);
        allUsers.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
        setUsers(allUsers); 
        setRequests(allReqs); 
        setRecords(allRecords);
        setCurrentMonthReviews(allReviews || []);
        setOvertimeChecks(allChecks || []);
        
        // 預先計算並填入 Snapshot 欄位 (從 overtime_check 匯總)
        const initialBalances: Record<string, number> = {};
        allUsers.forEach(u => {
            const userChecks = allChecks.filter(c => c.userId === u.id && c.isVerified);
            const sum = parseFloat(userChecks.reduce((acc, c) => acc + (c.actualDuration || 0), 0).toFixed(2));
            if (userChecks.length > 0) {
                initialBalances[u.id] = sum;
            }
        });
        setBalanceInputs(initialBalances);

        // 重設輸入與編輯狀態
        setIsEditingReview(false); 
        setEditingReviewId(null); 
        setReviewNote(''); 
        setPayInputs({}); 
        setModifiedUsers(new Set());
    } catch (err) { 
        console.error("Failed to load admin overtime data", err); 
    } finally { 
        setIsReviewLoading(false); 
    }
  };

  // --- 審查註記操作 ---
  // (Retain existing review note logic)
  const handleStartAdd = () => { setEditingReviewId(null); setReviewNote(''); setIsEditingReview(true); };
  const handleStartEdit = (review: OvertimeReview) => { setEditingReviewId(review.id); setReviewNote(review.note); setIsEditingReview(true); };
  const handleCancelEdit = () => { setIsEditingReview(false); setEditingReviewId(null); setReviewNote(''); };

  const saveMonthlyReviewNote = async () => {
      if (!currentUser || !reviewNote.trim()) return;
      setIsReviewLoading(true);
      const review: OvertimeReview = {
          id: editingReviewId || generateUUID(),
          year: selectedYear, month: selectedMonth, note: reviewNote,
          updatedAt: new Date().toISOString(), updatedBy: currentUser.name, updatedById: currentUser.id
      };
      try {
          await db.saveOvertimeReview(review);
          await loadData();
          alert('審查註記已儲存至雲端。');
      } catch (err: any) { 
          console.error("Save Review Error:", err);
          alert(`儲存失敗: ${err.message || '請檢查網路與資料庫設定'}`); 
      } finally { setIsReviewLoading(false); }
  };

  const confirmDeleteNote = async () => {
      if (!noteToDeleteId) return;
      setIsReviewLoading(true);
      try {
          await db.deleteOvertimeReview(noteToDeleteId);
          await loadData();
          setIsDeleteNoteModalOpen(false);
          setNoteToDeleteId(null);
          alert('註記已刪除。');
      } catch (err) { alert('刪除失敗。'); } finally { setIsReviewLoading(false); }
  };

  // --- 結算與核對邏輯 ---
  const calculateMonthlyAppliedHours = (userId: string) => {
      const userReqs = requests.filter(r => r.userId === userId && r.status === RequestStatus.APPROVED && r.type === LeaveType.OVERTIME && new Date(r.startDate).getFullYear() === selectedYear && (new Date(r.startDate).getMonth() + 1) === selectedMonth);
      return parseFloat(userReqs.reduce((acc, r) => acc + calculateHours(r), 0).toFixed(2));
  };

  const calculateMonthlyCompensatoryHours = (userId: string) => {
      const userReqs = requests.filter(r => r.userId === userId && r.status === RequestStatus.APPROVED && r.type === LeaveType.COMPENSATORY && new Date(r.startDate).getFullYear() === selectedYear && (new Date(r.startDate).getMonth() + 1) === selectedMonth);
      return parseFloat(userReqs.reduce((acc, r) => acc + calculateHours(r), 0).toFixed(2));
  };

  const calculateLiveBalance = (userId: string) => {
      let py = selectedYear, pm = selectedMonth - 1; if (pm === 0) { pm = 12; py -= 1; }
      const prev = records.find(r => r.userId === userId && r.year === py && r.month === pm);
      return prev ? prev.remainingHours : 0;
  };

  const initiateBatchSettlement = () => { setPendingAuthAction({ type: 'BATCH' }); setAuthCreds({ username: currentUser?.username || '', password: '' }); setIsAuthModalOpen(true); };
  const initiateBatchBaseSettlement = () => { setPendingAuthAction({ type: 'BATCH_BASE' }); setAuthCreds({ username: currentUser?.username || '', password: '' }); setIsAuthModalOpen(true); };

  const executeSettlement = async () => {
      if (!currentUser || !pendingAuthAction) return;
      if (authCreds.password !== currentUser.password) { setAuthError('密碼錯誤'); return; }
      
      setIsAuthModalOpen(false);
      setIsReviewLoading(true);
      try {
        const allUsers = await db.getUsers(); 
        const allRecs = await db.getOvertimeRecords();
        const updated: OvertimeSettlementRecord[] = []; 
        const touched = new Set<string>();
        let targets: string[] = [];
        if (pendingAuthAction.type === 'BATCH') targets = Array.from(modifiedUsers);
        else if (pendingAuthAction.type === 'BATCH_BASE') targets = users.map(u => u.id); 

        targets.forEach(userId => {
            const u = allUsers.find(user => user.id === userId);
            if (!u) return;
            const ex = allRecs.find(r => r.userId === u.id && r.year === selectedYear && r.month === selectedMonth);
            const applied = calculateMonthlyAppliedHours(u.id);
            const comp = calculateMonthlyCompensatoryHours(u.id);
            const live = calculateLiveBalance(u.id);
            const nb = balanceInputs[u.id] !== undefined ? balanceInputs[u.id] : (ex ? ex.actualHours : 0);
            const np = payInputs[u.id] !== undefined ? payInputs[u.id] : (ex ? ex.paidHours : 0);
            const sig: AuthSignature = { name: currentUser.name, role: currentUser.role, timestamp: new Date().toISOString() };
            
            updated.push({
                id: ex ? ex.id : generateUUID(), 
                userId: u.id, year: selectedYear, month: selectedMonth, 
                appliedHours: applied, actualHours: nb, paidHours: np, 
                remainingHours: parseFloat((live + nb - np - comp).toFixed(2)), 
                settledAt: new Date().toISOString(), settledBy: currentUser.name,
                baseAuth: pendingAuthAction.type === 'BATCH_BASE' ? sig : ex?.baseAuth, 
                payAuth: pendingAuthAction.type === 'BATCH' ? sig : ex?.payAuth
            });
            touched.add(u.id);
        });
        await db.saveOvertimeRecords([...allRecs.filter(r => !updated.some(u => u.id === r.id)), ...updated]);
        setRecentlyUpdated(touched); 
        await loadData();
        alert('作業成功！');
      } catch (err) { console.error(err); alert('作業失敗'); } finally { setIsReviewLoading(false); }
  };

  const handleOpenDetailView = async () => {
      // 1. 重新抓取資料庫狀態，避免 ID 衝突
      const checks = await db.getOvertimeChecks(selectedYear, selectedMonth);
      setOvertimeChecks(checks);
      
      const all = await db.getRequests();
      const rel = all.filter(r => r.type === LeaveType.OVERTIME && r.status === RequestStatus.APPROVED && new Date(r.startDate).getFullYear() === selectedYear && (new Date(r.startDate).getMonth() + 1) === selectedMonth);
      
      const edits: any = {}; 
      const selectedIds = new Set<string>();
      rel.forEach(r => {
          const check = checks.find(c => c.requestId === r.id);
          const isFullDay = !r.isPartialDay;
          if (check) {
              edits[r.id] = {
                  startDate: check.actualStartDate, endDate: check.actualEndDate,
                  startTime: check.actualStartTime, endTime: check.actualEndTime,
                  duration: check.actualDuration || 0
              };
              if (check.isVerified) selectedIds.add(r.id);
          } else {
              edits[r.id] = { 
                  startDate: r.startDate, endDate: r.endDate, 
                  startTime: isFullDay ? '00:00' : (r.startTime || '18:00'),
                  endTime: isFullDay ? '00:00' : (r.endTime || '20:00'),
                  duration: isFullDay ? 8 : calculateHours(r)
              };
          }
      });
      setDetailRequests(rel); setDetailEdits(edits); setSelectedDetailIds(selectedIds); setIsDetailViewOpen(true);
  };

  const handleBatchVerifyHours = () => {
      const nextEdits = { ...detailEdits };
      const nextSelection = new Set(selectedDetailIds);
      detailRequests.forEach(r => {
          const edit = nextEdits[r.id];
          if (!r.isPartialDay) edit.duration = 8.0;
          else edit.duration = calculateDiffHours(edit.startTime, edit.endTime);
          nextSelection.add(r.id);
      });
      setDetailEdits(nextEdits); setSelectedDetailIds(nextSelection);
  };

  const saveDetailVerification = async () => {
      if (isDetailSaving) return;
      setIsDetailSaving(true);
      try {
          // 關鍵步驟：重新抓取資料庫中的最新 check 紀錄，確保有正確的 id
          const latestChecks = await db.getOvertimeChecks(selectedYear, selectedMonth);

          // 1. 將勾選明細紀錄存檔至資料庫 (overtime_check table)
          const checksToSave: OvertimeCheck[] = detailRequests.map(r => {
              const edit = detailEdits[r.id] || { 
                  startDate: r.startDate, endDate: r.endDate, 
                  startTime: '00:00', endTime: '00:00', duration: 0 
              }; // Defensive fallback
              
              const isVerified = selectedDetailIds.has(r.id);
              // 透過 requestId 對應到 DB 已存在的紀錄
              const existingCheck = latestChecks.find(c => c.requestId === r.id);
              
              return {
                  // 如果 DB 已有該筆資料，使用舊的 ID，否則產生新 UUID
                  // 使用 PK id 來進行 Upsert，確保不會因為 missing unique constraint (request_id) 而報錯
                  id: existingCheck ? existingCheck.id : generateUUID(), 
                  requestId: r.id,
                  userId: r.userId,
                  year: selectedYear,
                  month: selectedMonth,
                  actualStartDate: edit.startDate,
                  actualEndDate: edit.endDate,
                  actualStartTime: edit.startTime,
                  actualEndTime: edit.endTime,
                  // 邏輯要求：若未勾選，強制存為 0；若勾選，存輸入值 (需防呆 NaN)
                  actualDuration: isVerified ? (Number(edit.duration) || 0) : 0,
                  isVerified: isVerified,
                  updatedAt: new Date().toISOString()
              };
          });

          // 執行 Upsert
          await db.saveOvertimeChecks(checksToSave);

          // 2. 數據回傳邏輯：計算每個員工「已核定勾選」的實際時數總和
          const newBalanceInputs = { ...balanceInputs };
          const newModifiedUsers = new Set(modifiedUsers);
          const userTotals: Record<string, number> = {};

          // 初始化為 0
          checksToSave.forEach(c => {
              if (userTotals[c.userId] === undefined) userTotals[c.userId] = 0;
          });

          // 加總 (未勾選者 actualDuration 已在上方設為 0)
          checksToSave.forEach(c => {
              userTotals[c.userId] += Number(c.actualDuration || 0);
          });

          // 3. 更新 Snapshot 欄位
          Object.entries(userTotals).forEach(([uid, total]) => {
              newBalanceInputs[uid] = parseFloat(total.toFixed(2));
              newModifiedUsers.add(uid); 
          });

          setBalanceInputs(newBalanceInputs);
          setModifiedUsers(newModifiedUsers);

          setIsDetailViewOpen(false);
          
          // 重新載入數據，確保介面同步
          await loadData();
          alert('明細核對已儲存！');
      } catch (err: any) { 
          console.error("Save failed", err);
          alert('儲存失敗：' + (err.message || err)); 
      } finally { 
          setIsDetailSaving(false); 
      }
  };

  const handleExportDetails = () => {
      const exportData = sortedDetailRequests.map(r => {
          const edit = detailEdits[r.id];
          const emp = users.find(u => u.id === r.userId);
          return {
              '姓名': r.userName,
              '工號': emp?.employeeId || '',
              '申請日期': r.startDate,
              '申請時段': r.isPartialDay ? `${r.startTime}~${r.endTime}` : '整天',
              '申請時數': calculateHours(r),
              '核定開始日期': edit.startDate,
              '核定結束日期': edit.endDate,
              '核定開始時間': edit.startTime,
              '核定結束時間': edit.endTime,
              '核定時數': edit.duration,
              '系統單號(請勿修改)': r.id
          };
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "OvertimeVerification");
      XLSX.writeFile(wb, `加班核定表_${selectedYear}_${selectedMonth}.xlsx`);
  };

  const handleImportDetails = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const data = XLSX.utils.sheet_to_json(ws);
              const nextEdits = { ...detailEdits };
              const nextSelection = new Set(selectedDetailIds);
              data.forEach((row: any) => {
                  const reqId = row['系統單號(請勿修改)'];
                  if (nextEdits[reqId]) {
                      nextEdits[reqId] = {
                          ...nextEdits[reqId],
                          startDate: row['核定開始日期'] || nextEdits[reqId].startDate,
                          endDate: row['核定結束日期'] || nextEdits[reqId].endDate,
                          startTime: row['核定開始時間'] || nextEdits[reqId].startTime,
                          endTime: row['核定結束時間'] || nextEdits[reqId].endTime,
                          duration: Number(row['核定時數']) || 0
                      };
                      nextSelection.add(reqId);
                  }
              });
              setDetailEdits(nextEdits);
              setSelectedDetailIds(nextSelection);
              alert('Excel 匯入完成！');
          } catch (err) { alert('匯入格式錯誤'); }
      };
      reader.readAsBinaryString(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sortedDetailRequests = useMemo(() => {
    return [...detailRequests].sort((a, b) => {
        let valA: any, valB: any;
        const editA = detailEdits[a.id], editB = detailEdits[b.id];
        switch(detailSort.key) {
            case 'userName': valA = a.userName; valB = b.userName; break;
            case 'employeeId': valA = users.find(u=>u.id===a.userId)?.employeeId || ''; valB = users.find(u=>u.id===b.userId)?.employeeId || ''; break;
            case 'startDate': valA = a.startDate; valB = b.startDate; break;
            case 'endDate': valA = a.endDate; valB = b.endDate; break;
            case 'appliedHours': valA = calculateHours(a); valB = calculateHours(b); break;
            case 'actualDuration': valA = editA?.duration || 0; valB = editB?.duration || 0; break;
            case 'isVerified': valA = selectedDetailIds.has(a.id); valB = selectedDetailIds.has(b.id); break;
            default: return 0;
        }
        if (valA < valB) return detailSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return detailSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [detailRequests, detailSort, detailEdits, selectedDetailIds, users]);

  const handleSort = (key: SortKey) => { setDetailSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })); };
  const filteredUsers = users.filter(u => u.name.includes(searchTerm) || u.employeeId.includes(searchTerm));
  const SortHeader = ({ label, sortKey, className = "" }: { label: string, sortKey: SortKey, className?: string }) => (
    <th className={`px-4 py-5 font-black text-[10px] uppercase tracking-tighter cursor-pointer hover:bg-slate-200 transition-colors group ${className}`} onClick={() => handleSort(sortKey)}>
        <div className="flex items-center gap-1 justify-center">{label}{detailSort.key === sortKey ? (detailSort.direction === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />) : <div className="w-3.5 opacity-0 group-hover:opacity-30"><ChevronDown size={14}/></div>}</div>
    </th>
  );

  if (isDetailViewOpen) {
      return (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto flex flex-col animate-in fade-in">
              <div className="sticky top-0 bg-white border-b px-8 py-4 flex justify-between items-center shadow-md z-10">
                  <div className="flex items-center gap-6">
                      <button onClick={() => setIsDetailViewOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={28}/></button>
                      <div>
                          <h2 className="text-2xl font-black flex items-center gap-2"><FileText className="text-blue-600"/> 明細核對與實際時數校正</h2>
                          <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">{selectedYear}年{selectedMonth}月 · 存檔後自動同步已勾選時數至 Snapshot 欄位</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-3">
                      <input type="file" ref={fileInputRef} onChange={handleImportDetails} className="hidden" accept=".xlsx,.xls" />
                      <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><FileUp size={16}/> 匯入 Excel</button>
                      <button onClick={handleExportDetails} className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><FileDown size={16}/> 匯出 Excel</button>
                      <button onClick={handleBatchVerifyHours} className="px-5 py-2.5 bg-indigo-50 text-indigo-600 border-2 border-indigo-100 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-100 transition-all shadow-sm"><Sparkles size={16}/> 批次時數計算</button>
                      <div className="w-px h-8 bg-slate-200 mx-2"></div>
                      <button disabled={isDetailSaving} onClick={saveDetailVerification} className="px-8 py-3 bg-blue-600 text-white font-black rounded-xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2">{isDetailSaving ? <Loader2 size={20} className="animate-spin" /> : <SaveAll size={20}/>} 確認核對並存檔</button>
                  </div>
              </div>
              <div className="p-6 bg-slate-50 flex-1">
                  <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden mx-auto max-w-[98%]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left table-fixed">
                            <thead className="bg-slate-100/80 text-slate-600 border-b">
                                <tr>
                                    <SortHeader label="姓名" sortKey="userName" className="w-24"/>
                                    <SortHeader label="工號" sortKey="employeeId" className="w-20"/>
                                    <SortHeader label="申請日期開始" sortKey="startDate" className="w-32"/>
                                    <SortHeader label="申請日期結束" sortKey="endDate" className="w-32"/>
                                    <th className="px-4 py-5 font-black text-[10px] text-center w-28">申請時段</th>
                                    <SortHeader label="申請時數" sortKey="appliedHours" className="w-20"/>
                                    <th className="px-4 py-5 font-black text-[10px] text-center bg-blue-50/50 w-32 border-l border-blue-100">實際日期開始</th>
                                    <th className="px-4 py-5 font-black text-[10px] text-center bg-blue-50/50 w-32">實際日期結束</th>
                                    <th className="px-4 py-5 font-black text-[10px] text-center bg-indigo-50/50 w-64">實際加班時段 (開始~結束)</th>
                                    <SortHeader label="核定時數" sortKey="actualDuration" className="bg-green-50/50 w-28 border-l border-green-100"/>
                                    <SortHeader label="核定勾選" sortKey="isVerified" className="w-24"/>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedDetailRequests.map(r => {
                                    const edit = detailEdits[r.id];
                                    const isSelected = selectedDetailIds.has(r.id);
                                    const isFullDay = !r.isPartialDay;
                                    return (
                                        <tr key={r.id} className={`hover:bg-slate-50/80 transition-colors text-xs ${isSelected ? 'bg-green-50/20' : ''}`}>
                                            <td className="px-4 py-6 font-black text-slate-800">{r.userName}</td>
                                            <td className="px-4 py-6 font-mono text-slate-400">{users.find(u=>u.id===r.userId)?.employeeId}</td>
                                            <td className="px-4 py-6 text-center font-bold">{r.startDate}</td>
                                            <td className="px-4 py-6 text-center font-bold">{r.endDate}</td>
                                            <td className="px-4 py-6 text-center text-slate-500 font-medium italic">{r.isPartialDay ? `${r.startTime}~${r.endTime}` : '整天加班'}</td>
                                            <td className="px-4 py-6 text-center font-black text-slate-400 italic bg-slate-50/50">{calculateHours(r)}h</td>
                                            <td className="px-2 py-6 bg-blue-50/10 border-l border-blue-50"><input type="date" value={edit?.startDate} onChange={e => setDetailEdits({...detailEdits, [r.id]: {...edit, startDate: e.target.value}})} className="w-full border-2 border-slate-100 rounded-lg p-1.5 font-bold focus:border-blue-500 outline-none text-[10px] bg-white shadow-inner"/></td>
                                            <td className="px-2 py-6 bg-blue-50/10"><input type="date" value={edit?.endDate} onChange={e => setDetailEdits({...detailEdits, [r.id]: {...edit, endDate: e.target.value}})} className="w-full border-2 border-slate-100 rounded-lg p-1.5 font-bold focus:border-blue-500 outline-none text-[10px] bg-white shadow-inner"/></td>
                                            <td className="px-4 py-6 bg-indigo-50/10">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex items-center gap-2 w-full"><input type="time" value={edit?.startTime} onChange={e => setDetailEdits({...detailEdits, [r.id]: {...edit, startTime: e.target.value}})} className="flex-1 border-2 border-indigo-100 rounded-lg p-2 font-black text-[11px] outline-none bg-white focus:border-indigo-500 shadow-inner"/><span className="text-indigo-300 font-black text-lg">~</span><input type="time" value={edit?.endTime} onChange={e => setDetailEdits({...detailEdits, [r.id]: {...edit, endTime: e.target.value}})} className="flex-1 border-2 border-indigo-100 rounded-lg p-2 font-black text-[11px] outline-none bg-white focus:border-indigo-500 shadow-inner"/></div>
                                                    {isFullDay && <div className="text-[9px] font-black text-indigo-500 bg-white px-2 py-0.5 rounded-full border border-indigo-100 shadow-sm uppercase tracking-tighter">整天加班</div>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-6 bg-green-50/10 text-center border-l border-green-50">
                                                <div className="flex items-center justify-center gap-1.5"><input type="number" step="0.5" min="0" value={edit?.duration} onChange={e => setDetailEdits({...detailEdits, [r.id]: {...edit, duration: e.target.value}})} className="w-16 border-2 border-green-200 rounded-xl text-center font-black text-green-700 p-2 focus:border-green-500 outline-none shadow-lg bg-white"/><span className="text-[10px] font-black text-green-400">h</span></div>
                                            </td>
                                            <td className="px-4 py-6 text-center">
                                                <button onClick={()=>setSelectedDetailIds(prev => {const n=new Set(prev); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className={`w-10 h-10 rounded-2xl transition-all flex items-center justify-center ${isSelected ? 'bg-green-600 text-white shadow-xl scale-110' : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-400 shadow-inner'}`}><Check size={20} strokeWidth={4} /></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                      </div>
                      {detailRequests.length === 0 && <div className="p-32 text-center text-slate-300 flex flex-col items-center gap-4"><FileText size={64} className="opacity-10"/><p className="text-xl font-black">本月份目前無任何待核對的加班單</p></div>}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 relative pb-12">
      {/* ... (Keep existing JSX for the main view) ... */}
      <div className="bg-white p-5 rounded-[2rem] border shadow-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
            <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3"><DollarSign className="text-green-600" size={36} /> 加班每月結算作業中心</h2>
            <div className="flex items-center gap-3 mt-1.5 ml-1">
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black border border-indigo-100 tracking-widest uppercase shadow-sm">Verified Data Sync: ON</span>
                <p className="text-xs text-slate-400 font-bold">當前期間：{selectedYear}年 {selectedMonth}月</p>
            </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
             <div className="flex border-2 border-slate-100 rounded-2xl overflow-hidden bg-slate-50 shadow-inner">
                 <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="px-5 py-2.5 text-sm font-black bg-transparent border-r-2 border-slate-100 outline-none cursor-pointer hover:bg-white transition-colors">{[currentYear-1,currentYear,currentYear+1].map(y=><option key={y} value={y}>{y}年</option>)}</select>
                 <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="px-5 py-2.5 text-sm font-black bg-transparent outline-none cursor-pointer hover:bg-white transition-colors">{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}月</option>)}</select>
             </div>
             <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                 <input type="text" placeholder="搜尋人員姓名/工號..." className="pl-11 pr-5 py-2.5 border-2 border-slate-100 rounded-2xl text-sm outline-none focus:border-blue-500 bg-slate-50 transition-all font-bold shadow-inner" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
             </div>
             <button onClick={handleOpenDetailView} className="px-6 py-3 bg-indigo-50 text-indigo-700 rounded-2xl font-black text-sm border-2 border-indigo-100 flex items-center gap-2 hover:bg-indigo-100 shadow-sm transition-all active:scale-95"><FileText size={18}/> 明細核對與時數校正</button>
             <button onClick={initiateBatchBaseSettlement} className="px-6 py-3 bg-blue-50 text-blue-700 rounded-2xl font-black text-sm border-2 border-blue-100 flex items-center gap-2 hover:bg-blue-100 shadow-sm transition-all active:scale-95"><CheckCircle size={18}/> 確認基準</button>
             <button onClick={initiateBatchSettlement} disabled={modifiedUsers.size === 0} className="px-8 py-3 bg-green-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-green-100 flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"><Save size={20}/> 批次結算加班費 ({modifiedUsers.size})</button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-10 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-3"><ClipboardList size={24} className="text-blue-600" /> 本月結算總體審查與特別註記</h3>
              {!isEditingReview && <button onClick={handleStartAdd} className="text-xs text-blue-600 font-black hover:underline flex items-center gap-2 bg-white px-5 py-2.5 rounded-xl border shadow-sm hover:bg-blue-50 transition-colors"><Plus size={16} /> 新增審查註記</button>}
          </div>
          <div className="p-10">
              {isReviewLoading && currentMonthReviews.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-slate-400 font-bold animate-pulse"><Loader2 className="animate-spin mr-3"/> 資料同步中...</div>
              ) : isEditingReview ? (
                  <div className="animate-in fade-in slide-in-from-top-2">
                      <textarea rows={4} className="w-full border-2 border-slate-100 rounded-2xl p-6 text-sm focus:ring-4 focus:ring-blue-50 shadow-inner outline-none mb-4 transition-all" placeholder="請在此記錄本月份結算查核發現的異常情況或需特別說明的事項..." value={reviewNote} onChange={e=>setReviewNote(e.target.value)}></textarea>
                      <div className="flex justify-end gap-3">
                          <button onClick={handleCancelEdit} className="px-8 py-3 bg-white border-2 rounded-2xl text-sm font-black text-slate-500 hover:bg-slate-50 transition-colors">取消</button>
                          <button onClick={saveMonthlyReviewNote} className="px-10 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-100 hover:bg-blue-700 flex items-center gap-2 transition-all"><Save size={18}/> 儲存至資料庫</button>
                      </div>
                  </div>
              ) : currentMonthReviews.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6">
                      {currentMonthReviews.map(r => (
                          <div key={r.id} className="group bg-slate-50/50 rounded-[2.5rem] p-8 border-2 border-transparent hover:border-blue-100 transition-all hover:bg-white hover:shadow-2xl">
                              <div className="flex justify-between items-start mb-5">
                                  <div className="flex items-center gap-5 text-[11px] text-slate-500">
                                      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border shadow-sm"><UserCheck size={16} className="text-green-600"/><span className="font-black text-slate-700 uppercase tracking-wider">{r.updatedBy}</span></div>
                                      <div className="flex items-center gap-2 font-bold"><Clock size={16} className="text-slate-300"/><span>最後修改於：{new Date(r.updatedAt).toLocaleString('zh-TW')}</span></div>
                                  </div>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={()=> handleStartEdit(r)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="編輯註記內容"><Edit3 size={20}/></button>
                                      <button onClick={()=> {setNoteToDeleteId(r.id); setIsDeleteNoteModalOpen(true);}} className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="移除此筆紀錄"><Trash2 size={20}/></button>
                                  </div>
                              </div>
                              <p className="text-slate-800 text-sm leading-loose border-l-4 border-blue-500 pl-8 font-medium whitespace-pre-wrap">{r.note}</p>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="text-center py-20 text-slate-300 border-4 border-dashed border-slate-50 rounded-[3rem] bg-slate-50/30">
                      <ClipboardList size={80} className="mx-auto mb-5 opacity-10"/>
                      <p className="text-xl font-black">本月份目前尚無任何審查註記</p>
                      <button onClick={handleStartAdd} className="mt-6 px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-sm hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm">立即點擊新增第一筆</button>
                  </div>
              )}
          </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-[10px] font-black text-slate-400 border-b uppercase tracking-widest">
                      <tr>
                        <th className="px-10 py-6">人員詳細資訊</th>
                        <th className="px-8 py-6 text-center bg-yellow-50/30 border-r-2 border-yellow-100/50">期初餘額 (Live)</th>
                        <th className="px-8 py-6 text-center">本月申請加班時數</th>
                        <th className="px-8 py-6 text-center bg-blue-50/20 border-x border-blue-100">結算時數 (Snapshot)</th>
                        <th className="px-8 py-6 text-center bg-green-50/20">本次轉換加班費</th>
                        <th className="px-8 py-6 text-center border-l-2 border-slate-100 font-black text-slate-500">結算後新餘額</th>
                        <th className="px-10 py-6 text-center">簽章與授權</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map(u => { 
                          const appTotal=calculateMonthlyAppliedHours(u.id);
                          const comp=calculateMonthlyCompensatoryHours(u.id);
                          const rec=records.find(r=>r.userId===u.id && r.year===selectedYear && r.month===selectedMonth);
                          const live=calculateLiveBalance(u.id);
                          
                          const dbHours = balanceInputs[u.id] !== undefined ? balanceInputs[u.id] : (rec ? rec.actualHours : 0);
                          const dpHours = payInputs[u.id] !== undefined ? payInputs[u.id] : (rec ? rec.paidHours : 0);
                          const newBalance = parseFloat((live + dbHours - dpHours - comp).toFixed(2));
                          
                          return (
                              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="px-10 py-8">
                                      <div className="font-black text-slate-800 text-base">{u.name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono tracking-wider mt-0.5">ID: {u.employeeId} · {u.department}</div>
                                  </td>
                                  <td className={`px-8 py-8 text-center border-r-2 border-yellow-50 font-black text-lg ${recentlyUpdated.has(u.id) ? 'text-green-600 animate-pulse' : 'text-slate-400'}`}>{live.toFixed(2)}<span className="text-[10px] ml-1">h</span></td>
                                  <td className="px-8 py-8 text-center">
                                    <div className="font-black text-slate-700 text-lg">{appTotal}<span className="text-[10px] ml-1">h</span></div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">已通過總和</div>
                                  </td>
                                  <td className="px-8 py-8 text-center bg-blue-50/5">
                                      <div className="relative inline-block">
                                        <input type="number" step="0.5" className="w-24 text-center border-2 border-blue-100 rounded-2xl py-2 font-black text-blue-700 outline-none focus:border-blue-500 shadow-inner bg-white text-lg transition-all" value={dbHours} onChange={e=>{setBalanceInputs({...balanceInputs, [u.id]:Number(e.target.value)}); setModifiedUsers(prev=>new Set(prev).add(u.id));}}/>
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-black text-blue-300 bg-white px-1 uppercase whitespace-nowrap">Auto-Sync</span>
                                      </div>
                                  </td>
                                  <td className="px-8 py-8 text-center bg-green-50/5">
                                      <div className="relative inline-block">
                                        <input type="number" step="0.5" className="w-24 text-center border-2 border-green-100 rounded-2xl py-2 font-black text-green-700 outline-none focus:border-green-500 shadow-inner bg-white text-lg transition-all" value={dpHours} onChange={e=>{setPayInputs({...payInputs, [u.id]:Number(e.target.value)}); setModifiedUsers(prev=>new Set(prev).add(u.id));}}/>
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-black text-green-300 bg-white px-1 uppercase">To Pay</span>
                                      </div>
                                  </td>
                                  <td className="px-8 py-8 text-center border-l-2 border-slate-50 font-black text-2xl text-slate-900 tracking-tighter">{newBalance}<span className="text-xs ml-1 opacity-20 font-bold">h</span></td>
                                  <td className="px-10 py-8 text-center space-y-1.5">
                                      {rec?.baseAuth ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="text-[10px] text-blue-600 font-black flex items-center gap-1.5 px-3 py-1 bg-blue-50 rounded-lg border border-blue-100"><Shield size={12} strokeWidth={3}/> 基準認證完畢</div>
                                            <div className="text-[8px] text-slate-400 font-bold">BY {rec.baseAuth.name}</div>
                                          </div>
                                      ) : <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest italic opacity-50">Pending Base</div>}
                                      
                                      {rec?.payAuth ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="text-[10px] text-green-600 font-black flex items-center gap-1.5 px-3 py-1 bg-green-50 rounded-lg border border-green-100"><CheckCircle size={12} strokeWidth={3}/> 加班費發放確認</div>
                                            <div className="text-[8px] text-slate-400 font-bold">BY {rec.payAuth.name}</div>
                                          </div>
                                      ) : modifiedUsers.has(u.id) ? (
                                          <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-[9px] font-black uppercase border border-orange-200 animate-pulse shadow-sm">Waiting Settle</span>
                                      ) : <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest italic opacity-50">Pending Payout</div>}
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>

      {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-12 space-y-8 text-center">
                  <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><Lock size={48} strokeWidth={3}/></div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-800">身分安全性驗證</h3>
                    <p className="text-sm text-slate-400 font-bold mt-2 leading-relaxed">您正在執行大規模資料寫入作業，<br/>請輸入您的登入密碼以獲取管理授權。</p>
                  </div>
                  <input autoFocus type="password" placeholder="••••••••" className="w-full border-4 border-slate-50 p-5 rounded-[1.5rem] outline-none focus:border-blue-500 text-center font-black text-3xl tracking-[0.5em] shadow-inner transition-all" value={authCreds.password} onChange={e=>setAuthCreds({...authCreds, password:e.target.value})}/>
                  <div className="flex gap-4 pt-4">
                      <button onClick={()=>setIsAuthModalOpen(false)} className="flex-1 py-5 border-2 border-slate-100 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-all text-sm uppercase tracking-widest">取消</button>
                      <button onClick={executeSettlement} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all text-sm uppercase tracking-widest">確認結算作業</button>
                  </div>
              </div>
          </div>
      )}

      {isDeleteNoteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-[3rem] p-12 max-w-sm w-full text-center shadow-2xl">
                  <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner animate-pulse"><Trash2 size={48} /></div>
                  <h3 className="font-black text-2xl mb-4 text-slate-800">確定要移除此註記？</h3>
                  <p className="text-sm text-slate-400 font-medium mb-10 leading-relaxed">這將從雲端資料庫永久刪除審查記錄，<br/>該操作無法復原。</p>
                  <div className="flex gap-4">
                      <button onClick={()=>setIsDeleteNoteModalOpen(false)} className="flex-1 py-5 border-2 border-slate-100 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-all">取消</button>
                      <button onClick={confirmDeleteNote} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all">確定刪除</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
