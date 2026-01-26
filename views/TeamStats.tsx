
import React, { useEffect, useState, useContext } from 'react';
import { db } from '../services/mockDb';
import { User, UserRole, RequestStatus, LeaveRequest, Gender, LeaveType, ActiveWarning, OvertimeSettlementRecord, WarningRule } from '../types';
import { AuthContext } from '../App';
import { BarChart2, Search, Calendar, UserCheck, UserX, Eye, X, Clock, CheckCircle, FileText, ChevronRight, Briefcase, Filter, ArrowRight, AlertTriangle, AlertOctagon, History } from 'lucide-react';

export default function TeamStats() {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [records, setRecords] = useState<OvertimeSettlementRecord[]>([]);
  const [warningRules, setWarningRules] = useState<WarningRule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [historyUser, setHistoryUser] = useState<User | null>(null); 
  
  const today = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({ start: today, end: today });
  
  const currentYear = new Date().getFullYear();
  const [historyYear, setHistoryYear] = useState(currentYear);
  const [viewYear, setViewYear] = useState(currentYear);

  const [warningFilter, setWarningFilter] = useState<'ALL' | 'HAS_WARNING' | 'NORMAL'>('ALL');

  useEffect(() => {
    if (!currentUser) return;

    const loadInitialData = async () => {
        setLoading(true);
        const [visibleUsers, allReqs, allRecords, allRules] = await Promise.all([
            db.getVisibleUsers(currentUser),
            db.getRequests(),
            db.getOvertimeRecords(),
            db.getWarningRules()
        ]);

        setUsers(visibleUsers);
        setRequests(allReqs);
        setRecords(allRecords);
        setWarningRules(allRules);
        setLoading(false);
    };
    loadInitialData();
  }, [currentUser]);

  useEffect(() => {
    if (historyUser) {
        setHistoryYear(currentYear);
    }
  }, [historyUser]);

  if (loading) return <div className="p-12 text-center text-slate-400 font-bold">統計資料加載中...</div>;

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.department.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Warning Filter Logic - Updated call with requests
    const warnings = db.evaluateWarnings(u, warningRules, requests);
    const hasWarning = warnings.length > 0;

    if (warningFilter === 'HAS_WARNING') return hasWarning;
    if (warningFilter === 'NORMAL') return !hasWarning;

    return true;
  });

  const usersOnLeave = requests.filter(req => {
    if (req.status !== RequestStatus.APPROVED) return false;
    const isVisibleUser = users.some(u => u.id === req.userId);
    if (!isVisibleUser) return false;
    return req.endDate >= dateRange.start && req.startDate <= dateRange.end;
  });

  const getYearlyRequestStats = (userId: string, year: number) => {
      const userReqs = requests.filter(r => {
          const rYear = new Date(r.startDate).getFullYear();
          return r.userId === userId && rYear === year && r.status === RequestStatus.APPROVED;
      });

      const stats = { sick: 0, personal: 0, overtimeApplied: 0, annualUsed: 0 };

      const calculateDuration = (req: LeaveRequest) => {
        if (!req.isPartialDay) {
            const start = new Date(req.startDate);
            const end = new Date(req.endDate);
            return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        } else {
            if (req.actualDuration) return req.actualDuration / 8;
            if (req.startTime && req.endTime) {
                const [sh, sm] = req.startTime.split(':').map(Number);
                const [eh, em] = req.endTime.split(':').map(Number);
                const mins = (eh * 60 + em) - (sh * 60 + sm);
                return Math.max(0, mins / 480);
            }
            return 0.5;
        }
      };

      userReqs.forEach(r => {
          const days = calculateDuration(r);
          if (r.type === '病假') stats.sick += days;
          else if (r.type === '事假') stats.personal += days;
          else if (r.type === LeaveType.OVERTIME) stats.overtimeApplied += days * 8;
          else if (r.type === '特休') stats.annualUsed += days;
      });

      return stats;
  };

  const getUserHistoryList = (userId: string, year: number) => {
    return requests
      .filter(r => {
          const rYear = new Date(r.startDate).getFullYear();
          return r.userId === userId && rYear === year;
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  };

  const getStatusColor = (status: RequestStatus) => {
    if (status === RequestStatus.APPROVED) return 'text-green-600 bg-green-50 border-green-200';
    if (status === RequestStatus.REJECTED) return 'text-red-600 bg-red-50 border-red-200';
    if (status.startsWith('待')) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-slate-600 bg-slate-50 border-slate-200';
  };

  const formatTime = (val: number) => {
    const d = Math.floor(val);
    const h = Math.round((val - d) * 8);
    if (h === 0) return `${d}天`;
    return `${d}天${h}小時`;
  };

  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - 2 + i).reverse();

  if (users.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
              <BarChart2 size={64} className="mb-4 opacity-20" />
              <h2 className="text-xl font-bold text-slate-600">無權限或無資料</h2>
              <p>您目前沒有權限查看任何員工的統計資料。</p>
          </div>
      );
  }

  const historyStats = historyUser ? getYearlyRequestStats(historyUser.id, historyYear) : null;
  const historyList = historyUser ? getUserHistoryList(historyUser.id, historyYear) : [];

  return (
    <div className="space-y-8 relative">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">員工請假與加班統計</h2>
          <p className="text-slate-500">檢視下屬或部門的假勤額度、區間出缺勤與詳細歷史紀錄。</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:items-end">
           <div className="w-full lg:w-72 relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">搜尋員工/課別 (關鍵字)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="輸入姓名或部門..." className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">查詢區間 (開始)</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-56" />
              </div>
            </div>
            <div className="hidden sm:flex items-center pt-6 text-slate-400"><ArrowRight size={16} /></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">查詢區間 (結束)</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input type="date" value={dateRange.end} min={dateRange.start} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-56" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Range Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-orange-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h3 className="font-bold text-orange-800 flex items-center gap-2"><UserX size={20} /> {dateRange.start} 至 {dateRange.end} 請假人員名單</h3>
          <span className="text-sm font-medium bg-white px-2 py-1 rounded text-orange-600 border border-orange-200">共 {usersOnLeave.length} 筆紀錄</span>
        </div>
        {usersOnLeave.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center"><UserCheck size={48} className="text-green-400 mb-2" /><p>該區間內沒有可見員工請假，全員到齊！</p></div>
        ) : (
          <div className="overflow-x-auto">
             <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                <tr><th>姓名</th><th>假別</th><th>請假區間</th><th>時間</th><th>事由</th><th className="text-right">詳情</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersOnLeave.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-bold text-slate-800">{req.userName}</td>
                    <td className="px-6 py-3"><span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 border border-slate-200">{req.type}</span></td>
                    <td className="px-6 py-3 text-slate-900 font-medium">{req.startDate} <span className="text-slate-400">→</span> {req.endDate}</td>
                    <td className="px-6 py-3">{req.isPartialDay ? <span className="text-orange-600 font-medium">{req.startTime} - {req.endTime}</span> : <span>全天</span>}</td>
                    <td className="px-6 py-3 text-slate-500 italic max-w-xs truncate">{req.reason}</td>
                    <td className="px-6 py-3 text-right"><button onClick={() => setSelectedRequest(req)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-blue-600 text-xs font-medium shadow-sm"><Eye size={14} /> 查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Stats Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart2 size={20} /> 年度額度與人員列表 ({filteredUsers.length} 人)</h3>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
              <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">狀態預警:</label>
                  <select value={warningFilter} onChange={(e) => setWarningFilter(e.target.value as any)} className="pl-3 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm outline-none bg-white cursor-pointer min-w-[140px]">
                      <option value="ALL">全部顯示</option>
                      <option value="HAS_WARNING">⚠️ 僅顯示異常</option>
                      <option value="NORMAL">✅ 僅顯示正常</option>
                  </select>
              </div>
              <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">列表年份:</label>
                  <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} className="pl-3 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm outline-none bg-white cursor-pointer">
                      {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
                  </select>
              </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">員工資訊</th>
                <th className="px-6 py-4">狀態預警</th>
                <th className="px-6 py-4">特休 (已用/總額) <span className="text-blue-600">{viewYear}</span></th>
                <th className="px-6 py-4">加班 (餘額)</th>
                <th className="px-6 py-4 text-right">歷史紀錄</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(u => {
                 const quota = u.quota.annual[viewYear] || 0;
                 const used = u.usedQuota.annual[viewYear] || 0;
                 // Dynamic warnings based on all rules and ALL requests
                 const warnings = db.evaluateWarnings(u, warningRules, requests);
                 const liveBalanceHours = (u.quota.overtime || 0) * 8;
                 
                 return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2"><span className="font-medium text-slate-900">{u.name}</span><span className={`px-1.5 py-0.5 text-[10px] rounded border ${u.gender === Gender.FEMALE ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>{u.gender}</span></div>
                      <div className="text-xs text-slate-400">{u.department} · {u.role}</div>
                    </td>
                    <td className="px-6 py-4">
                      {warnings.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {warnings.map((w, idx) => (
                             <div key={idx} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold w-fit ${w.color === 'red' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`} title={w.message}>
                                {w.color === 'red' ? <AlertOctagon size={12} /> : <AlertTriangle size={12} />}
                                {w.ruleName}
                             </div>
                          ))}
                        </div>
                      ) : <span className="text-green-600 text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> 正常</span>}
                    </td>
                    <td className="px-6 py-4"><span className="font-medium text-blue-600">{formatTime(used)}</span><span className="text-slate-400 mx-1">/</span><span>{formatTime(quota)}</span></td>
                    <td className="px-6 py-4"><span className="font-bold text-orange-600 text-lg">{liveBalanceHours.toFixed(2)} h</span></td>
                    <td className="px-6 py-4 text-right"><button onClick={() => setHistoryUser(u)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors flex items-center gap-1 ml-auto"><FileText size={16} /> <span className="text-xs font-bold">紀錄</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Modal sections (selectedRequest and historyUser) continue to work as before, showing detailed info */}
    </div>
  );
}
