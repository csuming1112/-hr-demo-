
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { User, UserRole } from './types';
import { db } from './services/mockDb';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import LeaveApply from './views/LeaveApply';
import OvertimeApply from './views/OvertimeApply';
import MyRequests from './views/MyRequests';
import Approvals from './views/Approvals';
import AdminPanel from './views/AdminPanel';
import AdminStats from './views/AdminStats';
import AdminOvertimeReview from './views/AdminOvertimeReview';
import TeamStats from './views/TeamStats';
import Layout from './components/Layout';
import Profile from './views/Profile';
import AttachmentAdmin from './views/AttachmentAdmin';

export const AuthContext = React.createContext<{
  user: User | null;
  login: (u: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}>({
  user: null, login: () => {}, logout: () => {}, refreshUser: async () => {},
});

const ProtectedRoute = ({ children, allowedRoles, customCheck }: { children?: React.ReactNode, allowedRoles?: UserRole[], customCheck?: (u: User) => Promise<boolean> | boolean }) => {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) return;
      if (allowedRoles && !allowedRoles.includes(user.role)) { setIsAllowed(false); return; }
      if (customCheck) { const result = await customCheck(user); setIsAllowed(result); return; }
      setIsAllowed(true);
    };
    checkAccess();
  }, [user, allowedRoles, customCheck]);

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (isAllowed === null) return <div className="flex h-screen items-center justify-center bg-slate-50 font-black text-blue-600 animate-pulse">權限驗證中...</div>;
  if (isAllowed === false) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const storedId = localStorage.getItem('hr_current_user_id');
      if (storedId) { const found = await db.getUser(storedId); if (found) setUser(found); }
      setInitLoading(false);
    };
    load();
  }, []);

  const login = (u: User) => { setUser(u); localStorage.setItem('hr_current_user_id', u.id); };
  const logout = () => { setUser(null); localStorage.removeItem('hr_current_user_id'); };
  const refreshUser = async () => { if (user) { const updated = await db.getUser(user.id); if (updated) setUser(updated); } };

  if (initLoading) return <div className="flex h-screen items-center justify-center bg-slate-50 font-black text-blue-600">系統初始化中...</div>;

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="apply" element={<LeaveApply />} />
            <Route path="apply-overtime" element={<OvertimeApply />} />
            <Route path="my-requests" element={<MyRequests />} />
            <Route path="profile" element={<Profile />} />
            <Route path="approvals" element={<ProtectedRoute allowedRoles={[UserRole.LEADER, UserRole.MGR_SECT, UserRole.MGR_DEPT, UserRole.VP, UserRole.GM, UserRole.CHAIRMAN, UserRole.HR]}><Approvals /></ProtectedRoute>} />
            <Route path="team-stats" element={<ProtectedRoute customCheck={(u) => db.canAccessTeamStats(u)}><TeamStats /></ProtectedRoute>} />
            <Route path="admin" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminPanel /></ProtectedRoute>} />
            <Route path="admin-stats" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminStats /></ProtectedRoute>} />
            <Route path="attachment-management" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AttachmentAdmin /></ProtectedRoute>} />
            <Route path="admin-overtime" element={<ProtectedRoute customCheck={(u) => u.role === UserRole.ADMIN || !!u.canReviewOvertime}><AdminOvertimeReview /></ProtectedRoute>} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthContext.Provider>
  );
}
