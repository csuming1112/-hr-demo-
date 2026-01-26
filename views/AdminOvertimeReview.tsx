
import React, { useState, useEffect, useContext, useRef } from 'react';
import { db } from '../services/mockDb';
import { User, RequestStatus, LeaveType, LeaveRequest, OvertimeSettlementRecord, AuthSignature, ApprovalLog } from '../types';
import { Search, DollarSign, Save, AlertTriangle, CheckCircle, Edit3, Calendar, Clock, Filter, History, HelpCircle, Activity, ArrowRight, Zap, Shield, Lock, X, Check, FileText, ArrowLeft, SaveAll, AlertOctagon, Calculator, Download, Upload, Bell, ClipboardList, UserCheck, Plus, Trash2, MoreVertical } from 'lucide-react';
import { AuthContext } from '../App';
import { ROLE_LABELS } from '../constants';
// @ts-ignore
import * as XLSX from 'xlsx';

// --- Local Definitions (To avoid modifying shared types.ts) ---
interface LocalOvertimeReview {
  id: string;
  year: number;
  month: number;
  note: string;
  updatedAt: string;
  updatedBy: string;
  updatedById: string;
}
const OT_REVIEWS_STORAGE_KEY = 'hr_ot_reviews_local_v1';

// Helper to generate ID safely
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
// -------------------------------------------------------------

type AuthActionType = 'BATCH' | 'SINGLE_BASE' | 'SINGLE_PAY' | 'BATCH_BASE';

interface PendingAuthAction {
    type: AuthActionType;
    userId?: string;
}

// Helper for Duration Calculation
const calculateHours = (req: LeaveRequest) => {
    if (!req.isPartialDay) {
        // Calculate days based on date range
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return days * 8;
    } else {
        if (req.startTime && req.endTime) {
            const s = String(req.startTime);
            const e = String(req.endTime);
            if (s.includes(':') && e.includes(':')) {
                const [sh, sm] = s.split(':').map(Number);
                const [eh, em] = e.split(':').map(Number);
                let mins = (eh * 60 + em) - (sh * 60 + sm);
                if (mins < 0) mins = 0;
                return parseFloat((mins / 60).toFixed(2));
            }
        }
        return 4; // Default half day
    }
};

export default function AdminOvertimeReview() {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [records, setRecords] = useState<OvertimeSettlementRecord[]>([]);
  
  // Filters
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchTerm, setSearchTerm] = useState('');

  // State to track inputs
  const [payInputs, setPayInputs] = useState<Record<string, number>>({}); // Hours to pay out (User Input)
  const [balanceInputs, setBalanceInputs] = useState<Record<string, number>>({}); // Actual Balance Hours (User Input or Snapshot)
  
  const [modifiedUsers, setModifiedUsers] = useState<Set<string>>(new Set());
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  // Derived state for UI control
  const hasBalanceChanges = Object.keys(balanceInputs).length > 0;

  // --- Monthly Review State (Updated for Multiple Notes) ---
  const [currentMonthReviews, setCurrentMonthReviews] = useState<LocalOvertimeReview[]>([]);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null); // If null, it's a new note
  const [reviewNote, setReviewNote] = useState('');

  // Note Deletion Modal State
  const [isDeleteNoteModalOpen, setIsDeleteNoteModalOpen] = useState(false);
  const [noteToDeleteId, setNoteToDeleteId] = useState<string | null>(null);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authCreds, setAuthCreds] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);

  // --- New Detail Review Modal State ---
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  // Temporary storage for editing details [reqId]: { startDate, endDate, startTime, endTime, duration }
  const [detailEdits, setDetailEdits] = useState<Record<string, { startDate: string, endDate: string, startTime: string, endTime: string, duration: number }>>({});
  const [detailRequests, setDetailRequests] = useState<LeaveRequest[]>([]);
  
  // Selection for Notification
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set());

  // File Inputs Refs
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [selectedYear, selectedMonth]);

  // Clear flash effect after 3 seconds
  useEffect(() => {
    if (recentlyUpdated.size > 0) {
        const timer = setTimeout(() => setRecentlyUpdated(new Set()), 3000);
        return () => clearTimeout(timer);
    }
  }, [recentlyUpdated]);

  const loadData = async () => {
    const [allUsers, allReqs, allRecords] = await Promise.all([
        db.getUsers(),
        db.getRequests(),
        db.getOvertimeRecords()
    ]);
    // Sort by name or dept
    allUsers.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    setUsers(allUsers);
    setRequests(allReqs);
    setRecords(allRecords);

    // --- Load Local Monthly Review (Multiple) ---
    const storedReviews = localStorage.getItem(OT_REVIEWS_STORAGE_KEY);
    const allReviews: LocalOvertimeReview[] = storedReviews ? JSON.parse(storedReviews) : [];
    
    // Filter for current month and sort by date descending (newest first)
    const filteredReviews = allReviews
        .filter(r => r.year === selectedYear && r.month === selectedMonth)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    setCurrentMonthReviews(filteredReviews);
    setIsEditingReview(false);
    setEditingReviewId(null);
    setReviewNote('');

    // Reset inputs when switching months to load fresh data/snapshots
    setPayInputs({});
    setBalanceInputs({});
    setModifiedUsers(new Set());
  };

  // --- Save Monthly Review Note (Updated for Multiple) ---
  const saveMonthlyReviewNote = () => {
      if (!currentUser || !reviewNote.trim()) return;
      
      const storedReviews = localStorage.getItem(OT_REVIEWS_STORAGE_KEY);
      let allReviews: LocalOvertimeReview[] = storedReviews ? JSON.parse(storedReviews) : [];
      
      if (editingReviewId) {
          // Edit existing
          const idx = allReviews.findIndex(r => r.id === editingReviewId);
          if (idx !== -1) {
              allReviews[idx] = {
                  ...allReviews[idx],
                  note: reviewNote,
                  updatedAt: new Date().toISOString(), // Update timestamp on edit
                  updatedBy: currentUser.name,
                  updatedById: currentUser.id
              };
          }
      } else {
          // Add new
          const newReview: LocalOvertimeReview = {
              id: generateId(),
              year: selectedYear,
              month: selectedMonth,
              note: reviewNote,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.name,
              updatedById: currentUser.id
          };
          allReviews.push(newReview);
      }
      
      localStorage.setItem(OT_REVIEWS_STORAGE_KEY, JSON.stringify(allReviews));
      
      // Reload local state
      const filteredReviews = allReviews
        .filter(r => r.year === selectedYear && r.month === selectedMonth)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setCurrentMonthReviews(filteredReviews);

      setIsEditingReview(false);
      setEditingReviewId(null);
      setReviewNote('');
  };

  const initiateDeleteNote = (id: string) => {
      setNoteToDeleteId(id);
      setIsDeleteNoteModalOpen(true);
  };

  const confirmDeleteNote = () => {
      if (!noteToDeleteId) return;

      const storedReviews = localStorage.getItem(OT_REVIEWS_STORAGE_KEY);
      let allReviews: LocalOvertimeReview[] = storedReviews ? JSON.parse(storedReviews) : [];
      
      const newReviews = allReviews.filter(r => r.id !== noteToDeleteId);
      localStorage.setItem(OT_REVIEWS_STORAGE_KEY, JSON.stringify(newReviews));

      // Reload local state
      const filteredReviews = newReviews
        .filter(r => r.year === selectedYear && r.month === selectedMonth)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setCurrentMonthReviews(filteredReviews);

      // If we deleted the item being edited, reset the edit state
      if (editingReviewId === noteToDeleteId) {
          handleCancelEdit();
      }

      setIsDeleteNoteModalOpen(false);
      setNoteToDeleteId(null);
  };

  const handleStartEdit = (review: LocalOvertimeReview) => {
      setEditingReviewId(review.id);
      setReviewNote(review.note);
      setIsEditingReview(true);
  };

  const handleStartAdd = () => {
      setEditingReviewId(null);
      setReviewNote('');
      setIsEditingReview(true);
  };

  const handleCancelEdit = () => {
      setIsEditingReview(false);
      setEditingReviewId(null);
      setReviewNote('');
  };

  // Helper: Calculate Total Approved Overtime Hours for the SELECTED MONTH
  const calculateMonthlyAppliedHours = (userId: string) => {
      const userReqs = requests.filter(r => {
          if (r.userId !== userId || r.status !== RequestStatus.APPROVED || r.type !== LeaveType.OVERTIME) return false;
          // Use original Start Date for grouping applied month
          const d = new Date(r.startDate);
          return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
      });

      let totalHours = 0;
      userReqs.forEach(req => {
          totalHours += calculateHours(req);
      });
      return parseFloat(totalHours.toFixed(2));
  };

  // Helper: Calculate Compensatory Leave Used in SELECTED MONTH
  const calculateMonthlyCompensatoryHours = (userId: string) => {
      const userReqs = requests.filter(r => {
          if (r.userId !== userId || r.status !== RequestStatus.APPROVED || r.type !== LeaveType.COMPENSATORY) return false;
          const d = new Date(r.startDate);
          return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
      });

      let totalHours = 0;
      userReqs.forEach(req => {
          totalHours += calculateHours(req);
      });
      return parseFloat(totalHours.toFixed(2));
  };

  // Helper: Calculate Live Balance (Based STRICTLY on Previous Month Settlement)
  const calculateLiveBalance = (userId: string, allRecords = records) => {
      // Determine Previous Month
      let prevYear = selectedYear;
      let prevMonth = selectedMonth - 1;
      if (prevMonth === 0) {
          prevMonth = 12;
          prevYear -= 1;
      }

      // Find Previous Month's Record
      const prevRecord = allRecords.find(r => r.userId === userId && r.year === prevYear && r.month === prevMonth);
      
      // If found, use its 'remainingHours' as the starting point. If not found, start at 0.
      return prevRecord ? prevRecord.remainingHours : 0;
  };

  const handleBalanceInputChange = (userId: string, val: string) => {
      const num = parseFloat(val);
      if (isNaN(num)) return; 
      setBalanceInputs(prev => ({ ...prev, [userId]: num }));
      setModifiedUsers(prev => new Set(prev).add(userId));
  };

  const handlePayInputChange = (userId: string, val: string) => {
    const num = parseFloat(val);
    if (val === '') {
        const newInputs = { ...payInputs };
        delete newInputs[userId];
        setPayInputs(newInputs);
        return;
    }
    if (isNaN(num) || num < 0) return;
    setPayInputs(prev => ({ ...prev, [userId]: num }));
    setModifiedUsers(prev => new Set(prev).add(userId));
  };

  const initiateBatchSettlement = () => {
      if (modifiedUsers.size === 0) return;
      setPendingAuthAction({ type: 'BATCH' });
      setAuthCreds({ username: '', password: '' });
      setAuthError('');
      setIsAuthModalOpen(true);
  };

  const initiateBatchBaseSettlement = () => {
      if (!hasBalanceChanges) return;
      setPendingAuthAction({ type: 'BATCH_BASE' });
      setAuthCreds({ username: '', password: '' });
      setAuthError('');
      setIsAuthModalOpen(true);
  };

  const initiateSingleSettlement = (userId: string, type: 'SINGLE_BASE' | 'SINGLE_PAY') => {
      setPendingAuthAction({ type, userId });
      setAuthCreds({ username: '', password: '' });
      setAuthError('');
      setIsAuthModalOpen(true);
  };

  const executeSettlement = async () => {
      if (!currentUser || !pendingAuthAction) return;
      
      if (authCreds.username !== currentUser.username || authCreds.password !== currentUser.password) {
          setAuthError('帳號或密碼錯誤，無法驗證身分。');
          return;
      }

      setIsAuthModalOpen(false);

      const allUsers = await db.getUsers(); 
      let allRecords = await db.getOvertimeRecords(); 
      const updatedRecords: OvertimeSettlementRecord[] = [];
      const touchedIds = new Set<string>();

      let targetUserIds: string[] = [];
      if (pendingAuthAction.type === 'BATCH') {
          targetUserIds = Array.from(modifiedUsers);
      } else if (pendingAuthAction.type === 'BATCH_BASE') {
          targetUserIds = Object.keys(balanceInputs);
      } else if (pendingAuthAction.userId) {
          targetUserIds = [pendingAuthAction.userId];
      }

      allUsers.forEach(u => {
          if (targetUserIds.includes(u.id)) {
              const existingRec = allRecords.find(r => r.userId === u.id && r.year === selectedYear && r.month === selectedMonth);
              const applied = calculateMonthlyAppliedHours(u.id);
              const compUsed = calculateMonthlyCompensatoryHours(u.id);
              
              const currentLiveHours = calculateLiveBalance(u.id, allRecords);

              const oldBase = existingRec ? existingRec.actualHours : 0;
              const oldPaid = existingRec ? existingRec.paidHours : 0;

              let newBase = oldBase;
              let isBaseChanged = false;
              
              if ((pendingAuthAction.type === 'BATCH' || pendingAuthAction.type === 'SINGLE_BASE' || pendingAuthAction.type === 'BATCH_BASE') && balanceInputs[u.id] !== undefined) {
                  newBase = balanceInputs[u.id];
                  if (newBase !== oldBase) isBaseChanged = true;
              }

              let newPaid = oldPaid;
              let isPayChanged = false;
              
              if ((pendingAuthAction.type === 'BATCH' || pendingAuthAction.type === 'SINGLE_PAY') && payInputs[u.id] !== undefined) {
                  newPaid = payInputs[u.id];
                  if (newPaid !== oldPaid) isPayChanged = true;
              }

              const recordRemaining = currentLiveHours + newBase - newPaid - compUsed;
              
              const authSignature = {
                  name: currentUser.name,
                  role: currentUser.role, 
                  timestamp: new Date().toISOString()
              };

              const newRecord: OvertimeSettlementRecord = {
                  id: existingRec ? existingRec.id : generateId(),
                  userId: u.id,
                  year: selectedYear,
                  month: selectedMonth,
                  appliedHours: applied, 
                  actualHours: newBase, 
                  paidHours: newPaid,   
                  remainingHours: recordRemaining, 
                  settledAt: new Date().toISOString(),
                  settledBy: currentUser.name,
                  
                  baseAuth: existingRec?.baseAuth,
                  payAuth: existingRec?.payAuth
              };
              
              if (isBaseChanged) {
                  newRecord.baseAuth = authSignature;
              } else if ((pendingAuthAction.type === 'SINGLE_BASE' || pendingAuthAction.type === 'BATCH_BASE') && balanceInputs[u.id] !== undefined) {
                  newRecord.baseAuth = authSignature;
              }

              if (isPayChanged) {
                  newRecord.payAuth = authSignature;
              } else if (pendingAuthAction.type === 'SINGLE_PAY' && payInputs[u.id] !== undefined) {
                  newRecord.payAuth = authSignature;
              }

              updatedRecords.push(newRecord);
              touchedIds.add(u.id);
          }
      });

      const idsToRemove = new Set(updatedRecords.map(r => r.id));
      const keptRecords = allRecords.filter(r => !idsToRemove.has(r.id));
      const finalAllRecords = [...keptRecords, ...updatedRecords];
      await db.saveOvertimeRecords(finalAllRecords);
      
      const syncedUsers = allUsers.map(u => {
          if (touchedIds.has(u.id)) {
              const userRecs = finalAllRecords.filter(r => r.userId === u.id);
              if (userRecs.length === 0) return u;
              
              userRecs.sort((a, b) => {
                  if (a.year !== b.year) return b.year - a.year;
                  return b.month - a.month;
              });
              
              const latest = userRecs[0];
              const newQuotaDays = parseFloat((latest.remainingHours / 8).toFixed(3));
              
              return {
                  ...u,
                  quota: { ...u.quota, overtime: Math.max(0, newQuotaDays) }
              };
          }
          return u;
      });
      await db.saveUsers(syncedUsers);
      
      alert('驗證成功！資料已更新。');
      
      const newBalanceInputs = { ...balanceInputs };
      const newPayInputs = { ...payInputs };
      const newModifiedUsers = new Set(modifiedUsers);

      touchedIds.forEach(id => {
          if (pendingAuthAction.type === 'BATCH' || pendingAuthAction.type === 'SINGLE_BASE' || pendingAuthAction.type === 'BATCH_BASE') delete newBalanceInputs[id];
          if (pendingAuthAction.type === 'BATCH' || pendingAuthAction.type === 'SINGLE_PAY') delete newPayInputs[id];
          
          if (!newBalanceInputs[id] && !newPayInputs[id]) {
              newModifiedUsers.delete(id);
          }
      });

      setBalanceInputs(newBalanceInputs);
      setPayInputs(newPayInputs);
      setModifiedUsers(newModifiedUsers);
      setRecentlyUpdated(touchedIds); 
      setPendingAuthAction(null);
      
      await loadData();
  };

  const filteredUsers = users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Excel Export/Import Logic ---
  
  const handleMainExport = async () => {
      const allRecords = await db.getOvertimeRecords();
      const exportData = filteredUsers.map(u => {
          const monthlyApplied = calculateMonthlyAppliedHours(u.id);
          const monthlyComp = calculateMonthlyCompensatoryHours(u.id);
          const currentRecord = allRecords.find(r => r.userId === u.id && r.year === selectedYear && r.month === selectedMonth);
          const currentLiveHours = calculateLiveBalance(u.id, allRecords);
          const oldBase = currentRecord ? currentRecord.actualHours : 0;
          const oldPaid = currentRecord ? currentRecord.paidHours : 0;
          const displayBaseHours = balanceInputs[u.id] !== undefined ? balanceInputs[u.id] : oldBase;
          const displayPaidHours = payInputs[u.id] !== undefined ? payInputs[u.id] : oldPaid;
          const recordRemaining = currentLiveHours + displayBaseHours - displayPaidHours - monthlyComp;

          return {
              '工號': u.employeeId,
              '姓名': u.name,
              '部門': u.department,
              '目前餘額_Live': currentLiveHours,
              '本月申請': monthlyApplied,
              '本月抵休': monthlyComp,
              '結算基準_快照': displayBaseHours,
              '支付時數': displayPaidHours,
              '結算後餘額': recordRemaining
          };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Overtime_Settlement");
      XLSX.writeFile(wb, `OT_Settlement_${selectedYear}_${selectedMonth}.xlsx`);
  };

  const handleMainImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws);

          const newBalances = { ...balanceInputs };
          const newPays = { ...payInputs };
          const newModified = new Set(modifiedUsers);
          let matchCount = 0;

          rawData.forEach((row: any) => {
              const empId = row['工號'];
              const targetUser = users.find(u => u.employeeId === String(empId));
              if (targetUser) {
                  let changed = false;
                  if (row['結算基準_快照'] !== undefined) {
                      newBalances[targetUser.id] = Number(row['結算基準_快照']);
                      changed = true;
                  }
                  if (row['支付時數'] !== undefined) {
                      newPays[targetUser.id] = Number(row['支付時數']);
                      changed = true;
                  }
                  if (changed) {
                      newModified.add(targetUser.id);
                      matchCount++;
                  }
              }
          });

          setBalanceInputs(newBalances);
          setPayInputs(newPays);
          setModifiedUsers(newModified);
          
          if (mainFileInputRef.current) mainFileInputRef.current.value = '';
          alert(`成功解析並載入 ${matchCount} 筆資料的變更。請檢查後點擊「批量儲存」或個別簽核。`);
      };
      reader.readAsBinaryString(file);
  };

  // --- Detail View Logic ---
  const handleOpenDetailView = async () => {
      const allReqs = await db.getRequests();
      const relevantRequests = allReqs.filter(r => {
          if (r.type !== LeaveType.OVERTIME || r.status !== RequestStatus.APPROVED) return false;
          const d = new Date(r.startDate);
          return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
      }).sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      const initialEdits: Record<string, { startDate: string, endDate: string, startTime: string, endTime: string, duration: number }> = {};
      const verifiedIds = new Set<string>();

      relevantRequests.forEach(r => {
          initialEdits[r.id] = {
              startDate: r.actualStartDate || r.startDate,
              endDate: r.actualEndDate || r.endDate,
              startTime: r.actualStartTime || (r.isPartialDay ? r.startTime : '00:00') || '00:00',
              endTime: r.actualEndTime || (r.isPartialDay ? r.endTime : '00:00') || '00:00',
              duration: r.actualDuration !== undefined ? r.actualDuration : 0
          };
          if (r.isVerified) {
              verifiedIds.add(r.id);
          }
      });

      setDetailRequests(relevantRequests);
      setDetailEdits(initialEdits);
      setSelectedDetailIds(verifiedIds); 
      setIsDetailViewOpen(true);
  };

  const handleDetailChange = (reqId: string, field: 'startDate' | 'endDate' | 'duration' | 'startTime' | 'endTime', value: string) => {
      setDetailEdits(prev => ({
          ...prev,
          [reqId]: {
              ...prev[reqId],
              [field]: field === 'duration' ? parseFloat(value) : value
          }
      }));
  };

  const calculateRowHours = (sDate: string, eDate: string, sTime: string, eTime: string) => {
      if (!sDate || !eDate) return 0;
      if (sTime === '00:00' && eTime === '00:00') {
          const start = new Date(sDate);
          const end = new Date(eDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          return days * 8;
      } else {
          const start = new Date(`${sDate}T${sTime}`);
          const end = new Date(`${eDate}T${eTime}`);
          const diffMs = end.getTime() - start.getTime();
          return diffMs / (1000 * 60 * 60);
      }
  };

  const handleAutoCalculate = (reqId: string) => {
      const edit = detailEdits[reqId];
      if (!edit) return;
      const hours = calculateRowHours(edit.startDate, edit.endDate, edit.startTime, edit.endTime);
      handleDetailChange(reqId, 'duration', Math.max(0, parseFloat(hours.toFixed(1))).toString());
  };

  const handleBatchAutoCalculate = () => {
      const newEdits = { ...detailEdits };
      let updatedCount = 0;
      detailRequests.forEach(r => {
          const edit = newEdits[r.id];
          if (!edit) return;
          const hours = calculateRowHours(edit.startDate, edit.endDate, edit.startTime, edit.endTime);
          newEdits[r.id] = {
              ...edit,
              duration: Math.max(0, parseFloat(hours.toFixed(1)))
          };
          updatedCount++;
      });
      setDetailEdits(newEdits);
      alert(`已批量重新計算 ${updatedCount} 筆資料的時數。`);
  };

  const toggleDetailSelection = (id: string) => {
      setSelectedDetailIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const toggleDetailSelectAll = () => {
      if (selectedDetailIds.size === detailRequests.length && detailRequests.length > 0) {
          setSelectedDetailIds(new Set());
      } else {
          setSelectedDetailIds(new Set(detailRequests.map(r => r.id)));
      }
  };

  const handleDetailExport = () => {
      const exportData = detailRequests.map(r => {
          const edit = detailEdits[r.id];
          const user = users.find(u => u.id === r.userId);
          const appliedHours = calculateHours(r);
          
          // Helper for export format YYYY/MM/DD
          const fmt = (d: string | undefined) => d ? d.replace(/-/g, '/') : '';

          return {
              '系統單號(勿改)': r.id, 
              '工號': user?.employeeId,
              '姓名': r.userName,
              '申請日期_起': fmt(r.startDate),
              '申請日期_迄': fmt(r.endDate),
              '申請時數': appliedHours,
              '實際日期_起': fmt(edit?.startDate),
              '實際日期_迄': fmt(edit?.endDate),
              '實際時間_起': edit?.startTime,
              '實際時間_迄': edit?.endTime,
              '實際核定時數': edit?.duration
          };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Overtime_Detail");
      XLSX.writeFile(wb, `OT_Detail_${selectedYear}_${selectedMonth}.xlsx`);
  };

  const handleDetailImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws);

          const newEdits = { ...detailEdits };
          let matchCount = 0;

          // Helper for import parsing YYYY/MM/DD -> YYYY-MM-DD
          const parseDate = (val: any) => {
              if(!val) return '';
              const str = String(val).trim();
              return str.replace(/\//g, '-');
          };

          rawData.forEach((row: any) => {
              const reqId = row['系統單號(勿改)'];
              if (reqId && detailRequests.some(r => r.id === reqId)) {
                  newEdits[reqId] = {
                      startDate: parseDate(row['實際日期_起']),
                      endDate: parseDate(row['實際日期_迄']),
                      startTime: row['實際時間_起'] || '00:00',
                      endTime: row['實際時間_迄'] || '00:00',
                      duration: Number(row['實際核定時數']) || 0
                  };
                  matchCount++;
              }
          });

          setDetailEdits(newEdits);
          if (detailFileInputRef.current) detailFileInputRef.current.value = '';
          alert(`成功匯入 ${matchCount} 筆明細資料。請確認後點擊「確認核定數字」。`);
      };
      reader.readAsBinaryString(file);
  };

  const saveDetailReview = async () => {
      if (!currentUser) return;

      let notifyCount = 0;

      const allReqs = await db.getRequests();
      const updatedReqs = allReqs.map(r => {
          if (detailEdits[r.id]) {
              const edit = detailEdits[r.id];
              const isChecked = selectedDetailIds.has(r.id);
              
              const updatedRequest: LeaveRequest = {
                  ...r,
                  actualStartDate: edit.startDate,
                  actualEndDate: edit.endDate,
                  actualStartTime: edit.startTime,
                  actualEndTime: edit.endTime,
                  actualDuration: edit.duration,
                  isVerified: isChecked 
              };

              if (isChecked) {
                  const notificationLog: ApprovalLog = {
                      approverId: currentUser.id,
                      approverName: currentUser.name,
                      action: 'UPDATE', 
                      timestamp: new Date().toISOString(),
                      comment: `【加班核定通知】實際核定時段: ${edit.startDate} ${edit.startTime}~${edit.endTime}，核定時數: ${edit.duration}小時`
                  };
                  updatedRequest.logs = [...(r.logs || []), notificationLog];
                  notifyCount++;
              }

              return updatedRequest;
          }
          return r;
      });
      await db.saveRequests(updatedReqs);
      
      const userTotals: Record<string, number> = {};
      
      detailRequests.forEach(r => {
          const edit = detailEdits[r.id];
          const uid = r.userId;
          userTotals[uid] = (userTotals[uid] || 0) + (edit?.duration || 0);
      });

      const signature: AuthSignature = {
          name: currentUser.name,
          role: ROLE_LABELS[currentUser.role] || currentUser.role,
          timestamp: new Date().toISOString()
      };

      const allRecords = await db.getOvertimeRecords();
      let recordsChanged = false;
      const updatedRecords = [...allRecords];

      Object.entries(userTotals).forEach(([uid, total]) => {
          const applied = calculateMonthlyAppliedHours(uid);
          const compUsed = calculateMonthlyCompensatoryHours(uid);
          const currentLive = calculateLiveBalance(uid, allRecords);
          
          const existingIdx = updatedRecords.findIndex(
              r => r.userId === uid && r.year === selectedYear && r.month === selectedMonth
          );

          let existingPaid = 0;
          if (existingIdx > -1) {
              existingPaid = updatedRecords[existingIdx].paidHours;
          }

          const recordRemaining = currentLive + total - existingPaid - compUsed;

          if (existingIdx > -1) {
              updatedRecords[existingIdx] = {
                  ...updatedRecords[existingIdx],
                  actualHours: total, 
                  remainingHours: recordRemaining, 
                  baseAuth: signature
              };
          } else {
              updatedRecords.push({
                  id: generateId(),
                  userId: uid,
                  year: selectedYear,
                  month: selectedMonth,
                  appliedHours: applied, 
                  actualHours: total,
                  paidHours: 0,
                  remainingHours: recordRemaining,
                  settledAt: new Date().toISOString(),
                  settledBy: currentUser.name,
                  baseAuth: signature,
                  payAuth: undefined
              });
          }
          recordsChanged = true;
      });

      if (recordsChanged) {
          await db.saveOvertimeRecords(updatedRecords);
          
          const affectedUserIds = Object.keys(userTotals);
          const allUsers = await db.getUsers();
          const syncedUsers = allUsers.map(u => {
              if (affectedUserIds.includes(u.id)) {
                   const userRecs = updatedRecords.filter(r => r.userId === u.id);
                   if (userRecs.length === 0) return u;
                   
                   userRecs.sort((a, b) => {
                      if (a.year !== b.year) return b.year - a.year;
                      return b.month - a.month;
                   });
                   const latest = userRecs[0];
                   const newQuotaDays = parseFloat((latest.remainingHours / 8).toFixed(3));
                   
                   return {
                      ...u,
                      quota: { ...u.quota, overtime: Math.max(0, newQuotaDays) }
                   };
              }
              return u;
          });
          await db.saveUsers(syncedUsers);
      }

      setRequests(updatedReqs); 
      setRecords(updatedRecords); 

      const newBalances = { ...balanceInputs };
      Object.entries(userTotals).forEach(([uid, total]) => {
          newBalances[uid] = total;
      });
      setBalanceInputs(newBalances);

      const newModified = new Set(modifiedUsers);
      Object.keys(userTotals).forEach(uid => newModified.delete(uid));
      setModifiedUsers(newModified);
      
      setIsDetailViewOpen(false);
      alert(`明細核定完成！\n已更新結算基準。\n已對 ${notifyCount} 筆勾選項目發送核定通知。`);
  };

  if (isDetailViewOpen) {
      return (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto flex flex-col">
              {/* Detail View Toolbar */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setIsDetailViewOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                          <ArrowLeft size={24} className="text-slate-600" />
                      </button>
                      <div>
                          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                              <FileText size={24} className="text-blue-600" /> 
                              {selectedYear}年{selectedMonth}月 - 加班明細核對
                          </h2>
                          <p className="text-sm text-slate-500">請逐筆核對實際加班日期與時數，確認後將同步更新至結算基準。</p>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={handleDetailExport} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-bold flex items-center gap-2 text-sm">
                          <Download size={16} /> 匯出
                      </button>
                      <button onClick={() => detailFileInputRef.current?.click()} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-bold flex items-center gap-2 text-sm">
                          <Upload size={16} /> 匯入
                      </button>
                      <input type="file" ref={detailFileInputRef} onChange={handleDetailImport} className="hidden" accept=".xlsx,.xls" />
                      
                      <div className="w-px bg-slate-300 h-8 mx-1"></div>

                      <button onClick={() => setIsDetailViewOpen(false)} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200">
                          取消
                      </button>
                      <button onClick={handleBatchAutoCalculate} className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 shadow-sm flex items-center gap-2">
                          <Calculator size={18} /> 批量計算實際時數
                      </button>
                      <button onClick={saveDetailReview} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-2">
                          <CheckCircle size={20} /> 確認核定數字
                      </button>
                  </div>
              </div>

              {/* Detail View Content */}
              <div className="flex-1 p-6 bg-slate-50">
                  <div className="max-w-[90rem] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <table className="w-full text-left">
                          <thead className="bg-slate-100 text-slate-600 font-bold text-sm border-b border-slate-200">
                              <tr>
                                  <th className="px-4 py-4 w-24">工號</th>
                                  <th className="px-6 py-4 w-48">申請人</th>
                                  <th className="px-4 py-4 w-36">申請日期<br/><span className="text-xs font-normal text-slate-400">開始</span></th>
                                  <th className="px-4 py-4 w-36">申請日期<br/><span className="text-xs font-normal text-slate-400">結束</span></th>
                                  <th className="px-6 py-4 w-48">申請時段</th>
                                  <th className="px-6 py-4 text-center w-32">申請時數</th>
                                  <th className="px-4 py-4 bg-blue-50 border-l border-blue-100 w-40">實際日期<br/><span className="text-xs font-normal text-blue-400">開始</span></th>
                                  <th className="px-4 py-4 bg-blue-50 border-l border-blue-100 w-40">實際日期<br/><span className="text-xs font-normal text-blue-400">結束</span></th>
                                  <th className="px-6 py-4 bg-blue-50 border-l border-blue-100 w-64">實際加班時段</th>
                                  <th className="px-6 py-4 bg-green-50 border-l border-green-100 w-40 text-center">實際核定時數</th>
                                  <th className="px-4 py-4 w-12 text-center bg-yellow-50 border-l border-yellow-100">
                                      <div className="flex flex-col items-center gap-1">
                                          <input 
                                              type="checkbox" 
                                              className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                              checked={detailRequests.length > 0 && selectedDetailIds.size === detailRequests.length}
                                              onChange={toggleDetailSelectAll}
                                              title="全選/取消全選 (發送核定通知)"
                                          />
                                          <span className="text-[10px] text-yellow-700 font-normal whitespace-nowrap">核定通知</span>
                                      </div>
                                  </th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {detailRequests.map(r => {
                                  const edit = detailEdits[r.id];
                                  const appliedHours = calculateHours(r);
                                  const isDurationChanged = edit && edit.duration !== appliedHours;
                                  const isDateStartChanged = edit && edit.startDate !== r.startDate;
                                  const isDateEndChanged = edit && edit.endDate !== r.endDate;
                                  const isTimeChanged = edit && (edit.startTime !== (r.startTime || '00:00') || edit.endTime !== (r.endTime || '00:00'));
                                  
                                  const isFullDayCalc = edit?.startTime === '00:00' && edit?.endTime === '00:00';
                                  const requestUser = users.find(u => u.id === r.userId);
                                  const isChecked = selectedDetailIds.has(r.id);

                                  return (
                                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                          <td className="px-4 py-4 text-sm font-mono text-slate-600">
                                              {requestUser?.employeeId || '-'}
                                          </td>
                                          <td className="px-6 py-4">
                                              <div className="font-bold text-slate-900">{r.userName}</div>
                                              <div className="text-xs text-slate-400 italic truncate max-w-[200px]">{r.reason}</div>
                                          </td>
                                          <td className="px-4 py-4 text-sm text-slate-700 font-medium">
                                              {r.startDate}
                                          </td>
                                          <td className="px-4 py-4 text-sm text-slate-700 font-medium">
                                              {r.endDate}
                                          </td>
                                          <td className="px-6 py-4">
                                              {r.isPartialDay ? (
                                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                                      <Clock size={12} /> {r.startTime} - {r.endTime}
                                                  </div>
                                              ) : (
                                                  <span className="text-xs text-slate-400 font-bold">全天</span>
                                              )}
                                          </td>
                                          <td className="px-6 py-4 text-center font-bold text-slate-600">
                                              {appliedHours} h
                                          </td>
                                          
                                          <td className={`px-4 py-4 border-l border-slate-100 ${isDateStartChanged ? 'bg-blue-50' : ''}`}>
                                              <input 
                                                  type="date"
                                                  value={edit?.startDate || ''}
                                                  onChange={(e) => handleDetailChange(r.id, 'startDate', e.target.value)}
                                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                              />
                                          </td>

                                          <td className={`px-4 py-4 border-l border-slate-100 ${isDateEndChanged ? 'bg-blue-50' : ''}`}>
                                              <input 
                                                  type="date"
                                                  value={edit?.endDate || ''}
                                                  onChange={(e) => handleDetailChange(r.id, 'endDate', e.target.value)}
                                                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                              />
                                          </td>

                                          <td className={`px-4 py-4 border-l border-slate-100 ${isTimeChanged ? 'bg-blue-50' : ''}`}>
                                              <div className="flex flex-col gap-1">
                                                  <div className="flex items-center gap-1">
                                                      <input 
                                                          type="time"
                                                          value={edit?.startTime || ''}
                                                          onChange={(e) => handleDetailChange(r.id, 'startTime', e.target.value)}
                                                          className="w-full border border-slate-300 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                      />
                                                      <span className="text-slate-400">-</span>
                                                      <input 
                                                          type="time"
                                                          value={edit?.endTime || ''}
                                                          onChange={(e) => handleDetailChange(r.id, 'endTime', e.target.value)}
                                                          className="w-full border border-slate-300 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                      />
                                                  </div>
                                                  {isFullDayCalc && (
                                                      <span className="text-[10px] text-blue-500 text-center font-medium bg-blue-50 rounded px-1">全天計算</span>
                                                  )}
                                              </div>
                                          </td>

                                          <td className={`px-6 py-4 border-l border-slate-100 text-center ${isDurationChanged ? 'bg-green-50' : ''}`}>
                                              <div className="flex items-center gap-2 justify-center">
                                                  <input 
                                                      type="number"
                                                      step="0.01"
                                                      min="0"
                                                      value={edit?.duration || 0}
                                                      onChange={(e) => handleDetailChange(r.id, 'duration', e.target.value)}
                                                      className={`w-20 border rounded px-2 py-1 text-center font-bold focus:ring-2 focus:ring-green-500 outline-none ${isDurationChanged ? 'text-green-700 border-green-300' : 'border-slate-300'}`}
                                                  />
                                                  <button 
                                                      onClick={() => handleAutoCalculate(r.id)}
                                                      className="p-1.5 bg-white border border-slate-300 text-slate-500 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                                      title="根據日期與時間推算時數"
                                                  >
                                                      <Calculator size={14} />
                                                  </button>
                                              </div>
                                          </td>

                                          <td className="px-4 py-4 text-center border-l border-yellow-100 bg-yellow-50/30">
                                              <div className="flex justify-center">
                                                  <input 
                                                      type="checkbox" 
                                                      checked={isChecked}
                                                      onChange={() => toggleDetailSelection(r.id)}
                                                      className="w-5 h-5 text-blue-600 rounded cursor-pointer border-slate-300 focus:ring-blue-500"
                                                      title="勾選以同步更新並通知員工"
                                                  />
                                              </div>
                                          </td>
                                      </tr>
                                  );
                              })}
                              {detailRequests.length === 0 && (
                                  <tr>
                                      <td colSpan={11} className="p-12 text-center text-slate-400">
                                          本月尚無已核准的加班申請。
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 relative">
      {/* Optimized Header Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <DollarSign className="text-green-600" /> 加班每月審查與結算
          </h2>
          <p className="text-xs text-slate-500 mt-1">檢視每月份的加班申請與結算。輸入數值需經審核主管身分驗證。</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
             <div className="flex gap-0 border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                 <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="px-2 py-1.5 text-sm font-bold text-slate-700 outline-none bg-transparent cursor-pointer hover:bg-slate-100 transition-colors border-r border-slate-300"
                 >
                     {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}年</option>)}
                 </select>
                 <select 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="px-2 py-1.5 text-sm font-bold text-slate-700 outline-none bg-transparent cursor-pointer hover:bg-slate-100 transition-colors"
                 >
                     {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                 </select>
             </div>

             <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="搜尋..." 
                  className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-32 focus:w-48 transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             
             <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

             <button 
                onClick={handleOpenDetailView}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition-all text-sm border border-indigo-100"
             >
                 <FileText size={16} /> 明細核對
             </button>

             <button 
                onClick={initiateBatchBaseSettlement}
                disabled={!hasBalanceChanges}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-bold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm border border-blue-100"
                title="僅確認並簽核已輸入的結算基準數值"
             >
                 <Check size={16} /> 確認基準
             </button>

             <button 
                onClick={initiateBatchSettlement}
                disabled={modifiedUsers.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all text-sm"
             >
                 <Save size={16} /> 加班費結算 ({modifiedUsers.size})
             </button>

             <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

             <div className="flex gap-1">
                 <button onClick={handleMainExport} className="flex items-center justify-center w-9 h-9 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-all" title="匯出月結報表">
                     <Download size={18} />
                 </button>
                 <button onClick={() => mainFileInputRef.current?.click()} className="flex items-center justify-center w-9 h-9 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-all" title="匯入調整">
                     <Upload size={18} />
                 </button>
                 <input type="file" ref={mainFileInputRef} onChange={handleMainImport} className="hidden" accept=".xlsx,.xls" />
             </div>
        </div>
      </div>

      {/* --- New Section: Monthly General Review Summary (Updated to support Multiple Notes) --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <ClipboardList size={20} className="text-blue-600" />
                  本月結算總體審查與註記
              </h3>
              {!isEditingReview && (
                  <button 
                      type="button"
                      onClick={handleStartAdd}
                      className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                  >
                      <Plus size={14} /> 新增審查註記
                  </button>
              )}
          </div>
          
          <div className="p-6">
              {isEditingReview ? (
                  <div className="animate-in fade-in slide-in-from-top-2">
                      <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-700">{editingReviewId ? '編輯註記' : '新增註記'}</h4>
                      </div>
                      <textarea 
                          rows={3}
                          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                          placeholder="請輸入本月結算審查的總結說明、異常備註或核准意見..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                      ></textarea>
                      <div className="flex justify-end gap-3">
                          <button 
                              onClick={handleCancelEdit}
                              className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50"
                          >
                              取消
                          </button>
                          <button 
                              onClick={saveMonthlyReviewNote}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2"
                          >
                              <Save size={16} /> {editingReviewId ? '更新' : '儲存'}
                          </button>
                      </div>
                  </div>
              ) : (
                  currentMonthReviews.length > 0 ? (
                      <div className="space-y-4">
                          {currentMonthReviews.map(review => (
                              <div key={review.id} className="group relative bg-slate-50 rounded-lg p-4 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all">
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-3 text-xs text-slate-500">
                                          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200">
                                              <UserCheck size={12} className="text-green-600" />
                                              <span className="font-bold text-slate-700">{review.updatedBy}</span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                              <Clock size={12} className="text-slate-400" />
                                              <span>{new Date(review.updatedAt).toLocaleString()}</span>
                                          </div>
                                      </div>
                                      <div className="flex gap-2">
                                          <button 
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); handleStartEdit(review); }}
                                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                              title="編輯"
                                          >
                                              <Edit3 size={14} />
                                          </button>
                                          <button 
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); initiateDeleteNote(review.id); }}
                                              className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                                              title="刪除"
                                          >
                                              <Trash2 size={14} />
                                          </button>
                                      </div>
                                  </div>
                                  <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-slate-300">
                                      {review.note}
                                  </p>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
                          <ClipboardList size={32} className="mx-auto mb-2 opacity-20" />
                          <p className="text-sm">本月份尚無審查紀錄。</p>
                          <button 
                              type="button"
                              onClick={handleStartAdd}
                              className="mt-3 text-sm text-blue-600 font-bold hover:underline"
                          >
                              立即新增第一筆註記
                          </button>
                      </div>
                  )
              )}
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 w-24">工號</th>
                  <th className="px-6 py-4 min-w-[150px]">員工資訊</th>
                  <th className="px-6 py-4 text-center bg-yellow-50/50 border-r border-slate-100">
                      <div className="flex flex-col items-center group relative cursor-help">
                          <span className="flex items-center gap-1 text-yellow-800"><Activity size={14}/> 目前餘額 (Live)</span>
                          <span className="text-[10px] text-slate-400 font-normal">累計前月</span>
                      </div>
                  </th>
                  <th className="px-6 py-4 text-center bg-gray-50/50">
                      <div className="flex flex-col items-center">
                          <span>本月申請</span>
                          <span className="text-[10px] text-slate-400 font-normal">({selectedMonth}月核准)</span>
                      </div>
                  </th>
                  <th className="px-6 py-4 text-center bg-blue-50/30 border-l border-blue-100 min-w-[160px]">
                      <div className="flex flex-col items-center">
                          <span>結算基準 (快照)</span>
                          <span className="text-[10px] text-blue-600 font-normal normal-case opacity-75">月結時餘額</span>
                      </div>
                  </th>
                  <th className="px-6 py-4 text-center bg-green-50/30 border-l border-green-100 min-w-[160px]">
                      <div className="flex flex-col items-center">
                          <span>轉加班費 (結算)</span>
                          <span className="text-[10px] text-green-600 font-normal normal-case opacity-75">本次支付</span>
                      </div>
                  </th>
                  <th className="px-6 py-4 text-center border-l border-slate-100">
                      <div className="flex flex-col items-center">
                          <span className="font-bold text-blue-700">結算後餘額 (紀錄)</span>
                          <span className="text-[10px] text-slate-400 font-normal">與員工餘額同步</span>
                      </div>
                  </th>
                  <th className="px-6 py-4 text-center">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(u => {
                    const monthlyApplied = calculateMonthlyAppliedHours(u.id);
                    const monthlyComp = calculateMonthlyCompensatoryHours(u.id);
                    const currentRecord = records.find(r => r.userId === u.id && r.year === selectedYear && r.month === selectedMonth);
                    const isRecordExist = !!currentRecord;
                    
                    const currentLiveHours = calculateLiveBalance(u.id, records);

                    const oldBase = currentRecord ? currentRecord.actualHours : 0; 
                    const oldPaid = currentRecord ? currentRecord.paidHours : 0;
                    
                    const displayBaseHours = balanceInputs[u.id] !== undefined ? balanceInputs[u.id] : oldBase;
                    const displayPaidHours = payInputs[u.id] !== undefined ? payInputs[u.id] : oldPaid;
                    
                    const recordRemaining = currentLiveHours + displayBaseHours - displayPaidHours - monthlyComp;

                    const isBaselineInvalid = displayBaseHours < 0 || displayBaseHours > monthlyApplied;

                    const isModified = modifiedUsers.has(u.id);
                    const isError = recordRemaining < 0; 
                    
                    const isBalanceChanged = balanceInputs[u.id] !== undefined && (!currentRecord || balanceInputs[u.id] !== currentRecord.actualHours);
                    const isPayChanged = payInputs[u.id] !== undefined && payInputs[u.id] !== oldPaid;
                    const isJustUpdated = recentlyUpdated.has(u.id);

                    return (
                        <tr key={u.id} className={`hover:bg-slate-50 transition-colors group ${isRecordExist ? 'bg-slate-50/30' : ''}`}>
                            <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                {u.employeeId}
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{u.name}</div>
                                <div className="text-xs text-slate-400 font-mono">{u.department}</div>
                            </td>
                            
                            <td className={`px-6 py-4 text-center border-r border-slate-100 transition-all duration-700 ${isJustUpdated ? 'bg-green-100 text-green-800' : 'bg-yellow-50/10'}`}>
                                <div className="flex items-center justify-center gap-1">
                                    {isJustUpdated && <Zap size={14} className="text-green-600 animate-pulse" />}
                                    <span className={`font-bold ${isJustUpdated ? 'text-green-700 scale-110' : 'text-slate-700'} transition-transform duration-300`}>{currentLiveHours.toFixed(2)}</span>
                                    <span className="text-xs text-slate-400">h</span>
                                </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                                <span className={`font-bold ${monthlyApplied > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{monthlyApplied}</span>
                                {monthlyComp > 0 && (
                                    <div className="text-xs text-orange-600 mt-1">
                                        (抵休: -{monthlyComp}h)
                                    </div>
                                )}
                            </td>
                            
                            {/* Base Balance Column */}
                            <td className="px-6 py-4 text-center bg-blue-50/10 border-l border-blue-50 relative group/cell">
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative flex items-center gap-2">
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                step="0.01"
                                                className={`w-20 text-center border rounded-lg py-1 px-2 outline-none focus:ring-2 transition-all font-bold 
                                                    ${isBaselineInvalid ? 'border-red-400 text-red-700 bg-red-50 ring-red-200' : 
                                                      isBalanceChanged ? 'border-blue-400 text-blue-700 bg-blue-50 ring-blue-200' : 'border-slate-300 text-slate-700 focus:ring-blue-500'}
                                                `}
                                                value={displayBaseHours}
                                                onChange={(e) => handleBalanceInputChange(u.id, e.target.value)}
                                            />
                                            {isBalanceChanged && !isBaselineInvalid && <Edit3 size={10} className="absolute -top-1 -right-1 text-blue-500 bg-white rounded-full" />}
                                            {isBaselineInvalid && <AlertOctagon size={10} className="absolute -top-1 -right-1 text-red-500 bg-white rounded-full" />}
                                        </div>
                                        {isBalanceChanged && !isBaselineInvalid && (
                                            <button 
                                                onClick={() => initiateSingleSettlement(u.id, 'SINGLE_BASE')}
                                                className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-sm transition-transform hover:scale-110"
                                                title="確認並簽核此欄位"
                                            >
                                                <Check size={12} strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Rule 4: Visual warning if invalid */}
                                    {isBaselineInvalid && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-10 w-max">
                                            <div className="text-[10px] text-white font-bold bg-red-600 px-3 py-1.5 rounded shadow-xl flex items-center gap-1.5 animate-in fade-in zoom-in duration-200">
                                                <AlertOctagon size={14} />
                                                <span>數值異常: 需介於 0 ~ {monthlyApplied}</span>
                                            </div>
                                            <div className="w-2 h-2 bg-red-600 rotate-45 absolute -top-1 left-1/2 -translate-x-1/2"></div>
                                        </div>
                                    )}

                                    {currentRecord?.baseAuth && !isBaselineInvalid && (
                                        <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200 opacity-80 whitespace-nowrap" title={`審核時間: ${new Date(currentRecord.baseAuth.timestamp).toLocaleString()}`}>
                                            <Shield size={10} />
                                            <span>{currentRecord.baseAuth.name} ({currentRecord.baseAuth.role})</span>
                                        </div>
                                    )}
                                </div>
                            </td>

                            {/* Payout Input Column */}
                            <td className="px-6 py-4 text-center bg-green-50/10 border-l border-green-50 relative group/cell">
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative flex items-center gap-2">
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                min="0"
                                                max={displayBaseHours}
                                                step="0.01"
                                                className={`w-20 text-center border rounded-lg py-1 px-2 outline-none focus:ring-2 transition-all placeholder:text-slate-300
                                                    ${isError ? 'border-red-300 ring-red-200 bg-red-50' : 'border-slate-300 focus:ring-green-500'}
                                                    ${displayPaidHours > 0 ? 'text-green-700 font-bold bg-green-50 border-green-200' : ''}
                                                `}
                                                placeholder="0"
                                                value={payInputs[u.id] !== undefined ? payInputs[u.id] : (isRecordExist ? displayPaidHours : '')}
                                                onChange={(e) => handlePayInputChange(u.id, e.target.value)}
                                            />
                                        </div>
                                        {isPayChanged && (
                                            <button 
                                                onClick={() => initiateSingleSettlement(u.id, 'SINGLE_PAY')}
                                                className="p-1.5 bg-green-600 text-white rounded-full hover:bg-green-700 shadow-sm transition-transform hover:scale-110"
                                                title="確認並簽核此欄位"
                                            >
                                                <Check size={12} strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                    {currentRecord?.payAuth && (
                                        <div className="flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200 opacity-80 whitespace-nowrap" title={`審核時間: ${new Date(currentRecord.payAuth.timestamp).toLocaleString()}`}>
                                            <Shield size={10} />
                                            <span>{currentRecord.payAuth.name} ({currentRecord.payAuth.role})</span>
                                        </div>
                                    )}
                                </div>
                            </td>

                            {/* Settled Result */}
                            <td className="px-6 py-4 text-center border-l border-slate-100">
                                <div className="flex items-center justify-center gap-1">
                                    <span className={`font-bold text-lg ${isError ? 'text-red-600' : 'text-slate-500'}`}>
                                        {recordRemaining.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-slate-400">h</span>
                                </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                                {isBaselineInvalid ? (
                                    <span className="text-red-600 flex items-center justify-center gap-1 font-bold text-xs"><AlertOctagon size={14}/> 數值異常</span>
                                ) : isError ? (
                                    <span className="text-red-500 flex items-center justify-center gap-1 font-bold text-xs"><AlertTriangle size={14}/> 餘額不足</span>
                                ) : isModified ? (
                                    <span className="text-green-600 flex items-center justify-center gap-1 font-bold text-xs animate-pulse"><CheckCircle size={14}/> 待更新</span>
                                ) : isRecordExist ? (
                                    <div className="flex flex-col items-center">
                                        <span className="text-slate-500 flex items-center justify-center gap-1 font-bold text-xs"><History size={14}/> 已紀錄</span>
                                        <span className="text-[10px] text-slate-400">{new Date(currentRecord!.settledAt).toLocaleDateString()}</span>
                                    </div>
                                ) : (
                                    <span className="text-slate-300 text-xs">-</span>
                                )}
                            </td>
                        </tr>
                    );
                })}
                {filteredUsers.length === 0 && (
                    <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">查無資料</td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
      </div>

      {/* Auth Modal remains same but now calls executeSettlement which is async */}
      {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 border border-slate-200">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                          <Lock size={18} className="text-blue-600"/> 審核身分驗證
                      </h3>
                      <button onClick={() => setIsAuthModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <p className="text-sm text-slate-600">
                          {pendingAuthAction?.type === 'BATCH' && <span>您即將批量更新 <span className="font-bold text-blue-600">{modifiedUsers.size}</span> 筆結算資料。</span>}
                          {pendingAuthAction?.type === 'BATCH_BASE' && <span>您即將確認 <span className="font-bold text-blue-600">{Object.keys(balanceInputs).length}</span> 筆結算基準資料。</span>}
                          {(pendingAuthAction?.type === 'SINGLE_BASE' || pendingAuthAction?.type === 'SINGLE_PAY') && <span>您即將更新 <span className="font-bold text-blue-600">1</span> 筆單一欄位資料。</span>}
                          
                          <br/>為確保資料正確性，請輸入您的管理員憑證以進行簽核保證。
                      </p>

                      {authError && (
                          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2 border border-red-100">
                              <AlertTriangle size={14} /> {authError}
                          </div>
                      )}

                      <div className="space-y-3">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">帳號</label>
                              <input 
                                  type="text" 
                                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="輸入管理員帳號"
                                  value={authCreds.username}
                                  onChange={e => setAuthCreds({...authCreds, username: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">密碼</label>
                              <input 
                                  type="password" 
                                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="輸入密碼"
                                  value={authCreds.password}
                                  onChange={e => setAuthCreds({...authCreds, password: e.target.value})}
                              />
                          </div>
                      </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                      <button 
                          onClick={() => setIsAuthModalOpen(false)}
                          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 text-sm"
                      >
                          取消
                      </button>
                      <button 
                          onClick={executeSettlement}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm text-sm flex items-center gap-2"
                      >
                          <Shield size={14} /> 驗證並儲存
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
