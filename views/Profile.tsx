
import React, { useContext, useState } from 'react';
import { AuthContext } from '../App';
import { db } from '../services/mockDb';
import { Lock } from 'lucide-react';
import { ROLE_LABELS } from '../constants';

export default function Profile() {
  const { user, refreshUser } = useContext(AuthContext);
  const [passData, setPassData] = useState({ old: '', new: '', confirm: '' });
  const [msg, setMsg] = useState('');

  if (!user) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passData.new !== passData.confirm) {
      setMsg('新密碼不相符。');
      return;
    }
    if (user.password !== passData.old) {
      setMsg('目前密碼錯誤。');
      return;
    }

    const all = await db.getUsers();
    const idx = all.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      all[idx].password = passData.new;
      all[idx].isFirstLogin = false;
      await db.saveUsers(all);
      setMsg('密碼更新成功！');
      setPassData({ old: '', new: '', confirm: '' });
      await refreshUser();
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{user.name}</h2>
            <p className="text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-slate-50 rounded">
            <span className="block text-xs text-slate-400 uppercase">部門</span>
            <span className="font-medium text-slate-800">{user.department}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded">
            <span className="block text-xs text-slate-400 uppercase">帳號</span>
            <span className="font-medium text-slate-800">{user.username}</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Lock size={20} className="text-blue-500" />
          修改密碼
        </h3>
        
        {msg && <div className={`p-3 mb-4 rounded text-sm ${msg.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">目前密碼</label>
            <input 
              type="password" 
              required
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={passData.old}
              onChange={e => setPassData({...passData, old: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">新密碼</label>
            <input 
              type="password" 
              required
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={passData.new}
              onChange={e => setPassData({...passData, new: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">確認新密碼</label>
            <input 
              type="password" 
              required
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={passData.confirm}
              onChange={e => setPassData({...passData, confirm: e.target.value})}
            />
          </div>
          <button type="submit" className="w-full py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors">
            更新密碼
          </button>
        </form>
      </div>
    </div>
  );
}
