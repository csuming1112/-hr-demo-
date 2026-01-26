
import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { UserRole, RequestStatus, LeaveType, LeaveCategory, LeaveRequest } from '../types';
import { db } from '../services/mockDb';
import { Calendar, Clock, AlertCircle, CheckCircle, BarChart2, Briefcase, Info, Sun, Timer } from 'lucide-react';

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveCategories, setLeaveCategories] = useState<LeaveCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  const currentYear = new Date().getFullYear();
  const [alYear, setAlYear] = useState(currentYear);
  const [statsYear, setStatsYear] = useState(currentYear);
  const [statsMonth, setStatsMonth] = useState<string>('ALL');

  useEffect(() => {
    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [reqs, cats] = await Promise.all([
                db.getRequests(),
                db.getLeaveCategories()
            ]);
            setRequests(reqs);
            setLeaveCategories(cats);
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [user]);

  if (!user || loading) return <div className="flex h-64 items-center justify-center text-slate-400 font-bold">載入儀表板資料中...</div>;

  const isAdmin = user.role === UserRole.ADMIN;
  const myRequests = requests.filter(r => r.userId === user.id);
  const pendingRequests = myRequests.filter(r => r.status === RequestStatus.IN_PROCESS || r.status.startsWith('待')).length;
  const approvedRequests = myRequests.filter(r => r.status === RequestStatus.APPROVED).length;

  const calculateDuration = (req: LeaveRequest) => {
      if (!req.isPartialDay) {
          const start = new Date(req.startDate);
          const end = new Date(req.endDate);
          return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      } else if (req.startTime && req.endTime) {
          const [sh, sm] = req.startTime.split(':').map(Number);
          const [eh, em] = req.endTime.split(':').map(Number);
          const mins = (eh * 60 + em) - (sh * 60 + sm);
          return Math.max(0, parseFloat((mins / 480).toFixed(3)));
      }
      return 0.5;
  };

  // 通用假別統計 (當前統計年份)
  const usageStats: Record<string, number> = {};
  leaveCategories.forEach(cat => usageStats[cat.name] = 0);
  myRequests.forEach(req => {
      if (req.status === RequestStatus.APPROVED) {
          const d = new Date(req.startDate);
          if (d.getFullYear() === statsYear && (statsMonth === 'ALL' || (d.getMonth() + 1) === parseInt(statsMonth))) {
              usageStats[req.type] = (usageStats[req.type] || 0) + calculateDuration(req);
          }
      }
  });

  // 專門針對「特休 (年休)」的即時計算
  const annualTotal = user.quota.annual[currentYear] || 0;
  const annualUsed = usageStats[LeaveType.ANNUAL] || 0;
  const annualRemaining = Math.max(0, annualTotal - annualUsed);

  // 專門針對「加班補休」的即時計算 (由 quota.overtime 直接反映剩餘天數)
  const overtimeRemainingDays = user.quota.overtime || 0;
  const overtimeRemainingHours = overtimeRemainingDays * 8;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">歡迎，{user.name}</h2>
          <p className="text-slate-500 mt-1">Supabase 雲端同步模式</p>
        </div>
      </div>

      {/* 主要統計卡片區域 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡片 1: 待簽核 (既有) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">待簽核申請</p>
                <p className="text-3xl font-black text-slate-800">{pendingRequests}</p>
            </div>
            <Clock className="text-yellow-500" size={32} />
        </div>

        {/* 卡片 2: 已核准 (既有) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">已核准紀錄</p>
                <p className="text-3xl font-black text-slate-800">{approvedRequests}</p>
            </div>
            <CheckCircle className="text-green-500" size={32} />
        </div>

        {/* 卡片 3: 年休 (特休) 額度追蹤 (新增) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between group hover:border-blue-300 transition-colors">
            <div>
                <p className="text-xs font-bold text-blue-600 mb-1 uppercase tracking-wider">{currentYear} 特休 (年休)</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-800">{annualRemaining.toFixed(1)}</span>
                    <span className="text-sm font-bold text-slate-400">/ {annualTotal} 天剩餘</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">已申請: {annualUsed.toFixed(1)} 天</p>
            </div>
            <Sun className="text-blue-500 group-hover:scale-110 transition-transform" size={32} />
        </div>

        {/* 卡片 4: 加班補休餘額 (新增) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between group hover:border-orange-300 transition-colors">
            <div>
                <p className="text-xs font-bold text-orange-600 mb-1 uppercase tracking-wider">加班補休餘額</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-800">{overtimeRemainingDays.toFixed(2)}</span>
                    <span className="text-sm font-bold text-slate-400">天</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">換算約: {overtimeRemainingHours.toFixed(1)} 小時</p>
            </div>
            <Timer className="text-orange-500 group-hover:scale-110 transition-transform" size={32} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><BarChart2 size={20} className="text-blue-600"/> 年度假別使用統計</h3>
              <div className="flex items-center gap-2">
                  <select 
                    value={statsYear} 
                    onChange={(e) => setStatsYear(Number(e.target.value))}
                    className="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y} 年</option>)}
                  </select>
              </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {leaveCategories.filter(c => c.name !== LeaveType.ANNUAL).map(cat => (
                  <div key={cat.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{cat.name}</div>
                      <div className="text-xl font-black text-slate-800">{usageStats[cat.name]?.toFixed(1) || 0} 天</div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
}
