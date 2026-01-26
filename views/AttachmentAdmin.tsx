
import React, { useState, useEffect } from 'react';
import { db } from '../services/mockDb';
import { LeaveRequest } from '../types';
import { Search, Paperclip, Download, Trash2, Loader2, ExternalLink, Database, Filter, Calendar, User, FileText, CheckCircle, RefreshCcw, X, Check, AlertTriangle, ChevronDown, Archive } from 'lucide-react';
// @ts-ignore
import JSZip from 'jszip';

export default function AttachmentAdmin() {
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isZipping, setIsZipping] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Modal state for batch delete
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const all = await db.getRequests();
            // 只保留有附件的單據
            const withAttachments = all.filter(r => r.attachmentUrls && r.attachmentUrls.length > 0);
            setRequests(withAttachments.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } finally { setLoading(false); }
    };

    const filtered = requests.filter(r => {
        const matchesKeyword = r.userName.includes(searchTerm) || 
                              r.type.includes(searchTerm) ||
                              (r.attachmentUrls || []).some(u => u.includes(searchTerm));
        const matchesStart = !dateRange.start || r.startDate >= dateRange.start;
        const matchesEnd = !dateRange.end || r.startDate <= dateRange.end;
        return matchesKeyword && matchesStart && matchesEnd;
    });

    const isAllSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            const newSet = new Set(selectedIds);
            filtered.forEach(r => newSet.add(r.id));
            setSelectedIds(newSet);
        }
    };

    const toggleSelect = (id: string) => {
        const n = new Set(selectedIds);
        if (n.has(id)) n.delete(id); else n.add(id);
        setSelectedIds(n);
    };

    const handleBatchDownload = async () => {
        const selectedReqs = requests.filter(r => selectedIds.has(r.id));
        const allUrls = selectedReqs.flatMap(r => r.attachmentUrls || []);
        
        if (allUrls.length === 0) return;

        setIsZipping(true);
        const zip = new JSZip();
        const rootFolder = zip.folder(`人事系統附件打包_${new Date().toISOString().split('T')[0]}`);

        try {
            // 採用 Promise.all 同步抓取所有檔案內容
            await Promise.all(allUrls.map(async (url, index) => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('檔案抓取失敗');
                    const blob = await response.blob();
                    
                    // 從 URL 提取原始檔名
                    const originalName = decodeURIComponent(url.split('/').pop() || `未命名檔案_${index}`);
                    // 加上序號防止壓縮檔內檔名重複被覆蓋
                    rootFolder.file(`${index + 1}_${originalName}`, blob);
                } catch (err) {
                    console.error(`無法下載檔案: ${url}`, err);
                }
            }));

            // 生成 ZIP 並觸發瀏覽器下載
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `人事單據附件批次打包_${selectedIds.size}筆.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            alert('打包過程中發生錯誤，請稍後再試。');
        } finally {
            setIsZipping(false);
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        setIsConfirmDeleteOpen(false);
        try {
            for (const id of Array.from(selectedIds)) {
                const req = requests.find(r => r.id === id);
                if (req && req.attachmentUrls) {
                    for (const url of req.attachmentUrls) {
                        await db.deleteFile(url);
                    }
                    await db.updateRequest({ ...req, attachmentUrls: [], attachmentUrl: '' });
                }
            }
            setSelectedIds(new Set());
            await loadData();
            alert('批次刪除雲端附件成功！');
        } catch (e) { 
            alert('刪除過程中發生錯誤'); 
        } finally { 
            setLoading(false); 
        }
    };

    if (loading && requests.length === 0) return <div className="p-20 text-center font-black text-blue-600 animate-pulse">資源目錄分析中...</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Area */}
            <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100"><Paperclip size={32}/></div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">附件資源中心</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">管理所有假單之雲端證明文件</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-end gap-3 w-full xl:w-auto">
                    {/* Date Range Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">申請日期區間篩選</label>
                        <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-1 gap-2">
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 outline-none" />
                            <span className="text-slate-300">~</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 outline-none" />
                        </div>
                    </div>

                    {/* Search Field */}
                    <div className="flex flex-col gap-1.5 flex-1 xl:w-64">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">關鍵字搜尋</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="text" 
                                placeholder="人員、假別或檔名..." 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:bg-white focus:border-indigo-500 transition-all" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                            />
                        </div>
                    </div>

                    <button onClick={loadData} className="p-2.5 bg-white border-2 border-slate-100 text-slate-400 hover:text-blue-600 rounded-xl transition-all" title="重新整理資料">
                        <RefreshCcw size={20}/>
                    </button>
                </div>
            </div>

            {/* List & Actions Area */}
            <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 px-8 py-5 border-b flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={isAllSelected} 
                                onChange={toggleSelectAll} 
                                className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-black text-slate-500 uppercase">全選 ({filtered.length} 筆)</span>
                        </div>
                        
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                                <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">已選取 {selectedIds.size} 筆</span>
                                <button 
                                    onClick={handleBatchDownload} 
                                    disabled={isZipping}
                                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isZipping ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12}/>}
                                    {isZipping ? '正在打包中...' : '打包 ZIP 下載'}
                                </button>
                                <button 
                                    onClick={() => setIsConfirmDeleteOpen(true)} 
                                    className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95"
                                >
                                    <Trash2 size={12}/> 批次刪除
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400">
                        <Database size={12}/> 雲端伺服器連線中：穩定
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                            <tr>
                                <th className="px-8 py-4 w-12 text-center">選取</th>
                                <th className="px-6 py-4">申請人員與單據資訊</th>
                                <th className="px-6 py-4">雲端附件清單 (可個別下載)</th>
                                <th className="px-6 py-4 text-right">儲存狀態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(r => (
                                <tr key={r.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(r.id) ? 'bg-indigo-50/30' : ''}`}>
                                    <td className="px-8 py-6 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(r.id)} 
                                            onChange={() => toggleSelect(r.id)} 
                                            className="w-5 h-5 rounded-lg border-2 border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
                                        />
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-500 shadow-inner group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                {r.userName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 text-sm flex items-center gap-2">
                                                    {r.userName} 
                                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${r.type.includes('加班') ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                        {r.type}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold flex items-center gap-2 mt-0.5">
                                                    <Calendar size={10}/> 申請日期：{r.startDate}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex flex-wrap gap-2">
                                            {r.attachmentUrls?.map((url, i) => (
                                                <a 
                                                    key={i} 
                                                    href={url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm group/link"
                                                >
                                                    <Download size={12} className="shrink-0 text-slate-300 group-hover/link:text-indigo-500"/>
                                                    <span className="max-w-[180px] truncate">{decodeURIComponent(url.split('/').pop() || '')}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-right">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 text-[10px] font-black uppercase shadow-sm">
                                            <CheckCircle size={12}/> 雲端同步完成
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {filtered.length === 0 && (
                    <div className="p-32 text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4">
                            <Search size={40}/>
                        </div>
                        <p className="text-slate-400 font-black italic">查無任何符合篩選條件的附件單據。</p>
                        <button onClick={() => { setSearchTerm(''); setDateRange({start: '', end: ''}); }} className="mt-4 text-xs font-black text-indigo-600 hover:underline">重設所有過濾條件</button>
                    </div>
                )}
            </div>

            {/* Batch Delete Confirmation Modal */}
            {isConfirmDeleteOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 text-center animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
                            <AlertTriangle size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-2">確定批次刪除？</h3>
                        <p className="text-sm text-slate-500 mb-8 font-medium leading-relaxed">
                            您即將從雲端儲存空間永久移除 <span className="text-red-600 font-black">{selectedIds.size}</span> 筆單據的所有附件。此動作無法復原，請確認是否繼續？
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setIsConfirmDeleteOpen(false)} 
                                className="py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleBatchDelete} 
                                className="py-3.5 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                確認刪除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
