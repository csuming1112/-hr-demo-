
import React, { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import { UserRole } from '../types';
import { db } from '../services/mockDb';
import { 
  LayoutDashboard, FilePlus, ListOrdered, CheckSquare, Users, LogOut, UserCircle, Menu, X, BarChart2, LineChart, Clock, DollarSign, Paperclip 
} from 'lucide-react';
import { ROLE_LABELS } from '../constants';

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canViewTeamStats, setCanViewTeamStats] = useState(false);

  useEffect(() => {
    const checkStatsAccess = async () => {
      if (user) {
        const hasAccess = await db.canAccessTeamStats(user);
        setCanViewTeamStats(hasAccess);
      }
    };
    checkStatsAccess();
  }, [user]);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isManager = user?.role !== UserRole.EMPLOYEE && !isAdmin;
  const canReviewOT = isAdmin || !!user?.canReviewOvertime;

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => (
    <NavLink 
      to={to} 
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) => 
        `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
          isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      <Icon size={20} />
      <span className="font-bold text-sm">{label}</span>
    </NavLink>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)}/>}

      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-50"><h1 className="text-2xl font-black text-blue-700 flex items-center gap-2"><span className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xl shadow-lg">HR</span>人事系統</h1></div>
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            <NavItem to="/" icon={LayoutDashboard} label="儀表板" />
            {!isAdmin && (
              <>
                <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">申請服務</div>
                <NavItem to="/apply" icon={FilePlus} label="申請請假" />
                <NavItem to="/apply-overtime" icon={Clock} label="申請加班" />
                <NavItem to="/my-requests" icon={ListOrdered} label="申請紀錄" />
              </>
            )}
            {(isManager || canViewTeamStats || canReviewOT) && (
              <>
                <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">管理作業</div>
                {isManager && <NavItem to="/approvals" icon={CheckSquare} label="簽核中心" />}
                {canViewTeamStats && <NavItem to="/team-stats" icon={BarChart2} label="團隊統計" />}
                {canReviewOT && <NavItem to="/admin-overtime" icon={DollarSign} label="加班費結算" />}
              </>
            )}
            {isAdmin && (
              <>
                <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">系統維護</div>
                <NavItem to="/admin" icon={Users} label="帳號管理" />
                <NavItem to="/admin-stats" icon={LineChart} label="資料數據" />
                <NavItem to="/attachment-management" icon={Paperclip} label="附件維護" />
              </>
            )}
            <div className="pt-4 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">個人中心</div>
            <NavItem to="/profile" icon={UserCircle} label="個人資料" />
          </nav>
          <div className="p-4 border-t border-slate-50"><button onClick={() => { logout(); navigate('/login'); }} className="flex items-center space-x-3 px-4 py-3 w-full text-red-500 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"><LogOut size={20} /><span>登出系統</span></button></div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 shrink-0">
          <button className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setSidebarOpen(true)}><Menu size={24} /></button>
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-right hidden sm:block"><p className="text-sm font-black text-slate-800">{user?.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase">{user && ROLE_LABELS[user.role]}</p></div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black text-lg border-2 border-blue-100 shadow-sm">{user?.name.charAt(0)}</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
