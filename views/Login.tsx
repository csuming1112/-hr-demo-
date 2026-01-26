
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/mockDb';
import { AuthContext } from '../App';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
        const users = await db.getUsers();
        const found = users.find(u => u.username === username && u.password === password);
        
        if (found) {
          login(found);
          navigate('/');
        } else {
          setError('帳號或密碼錯誤');
        }
    } catch (err) {
        setError('系統連線失敗，請檢查網路狀態');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-lg flex items-center justify-center text-xl font-bold mx-auto mb-4">HR</div>
          <h1 className="text-2xl font-bold text-slate-800">歡迎回來</h1>
          <p className="text-slate-500">請登入人事管理系統 (Supabase版)</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">帳號</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="請輸入帳號"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密碼</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
          >
            {loading ? '登入中...' : '登入系統'}
          </button>
        </form>
      </div>
    </div>
  );
}
