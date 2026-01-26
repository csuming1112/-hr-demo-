
import React, { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../App';
import { LeaveType, RequestStatus, ApprovalLog, LeaveRequest } from '../types';
import { db } from '../services/mockDb';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Calendar, AlertCircle, Paperclip, ExternalLink, Upload, Trash2, Loader2, FileText, Check } from 'lucide-react';

export default function OvertimeApply() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRequestId, setEditRequestId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
    isFullDay: false,
    attachmentUrls: [] as string[]
  });

  useEffect(() => {
    if (location.state) {
        if (location.state.editRequest) {
            const req = location.state.editRequest as LeaveRequest;
            if (req.type === LeaveType.OVERTIME) {
                setFormData({
                    date: req.startDate,
                    startTime: req.startTime || '18:00',
                    endTime: req.endTime || '20:00',
                    reason: req.reason,
                    isFullDay: !req.isPartialDay,
                    attachmentUrls: req.attachmentUrls || (req.attachmentUrl ? [req.attachmentUrl] : [])
                });
                setIsEditMode(true);
                setEditRequestId(req.id);
            }
        } else if (location.state.cloneRequest) {
             const req = location.state.cloneRequest as LeaveRequest;
             if (req.type === LeaveType.OVERTIME) {
                setFormData({
                    date: req.startDate,
                    startTime: req.startTime || '18:00',
                    endTime: req.endTime || '20:00',
                    reason: req.reason,
                    isFullDay: !req.isPartialDay,
                    attachmentUrls: []
                });
                setIsEditMode(false);
                setEditRequestId(null);
            }
        }
    }
  }, [location.state]);

  if (!user) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !user) return;

      setUploading(true);
      setError('');
      try {
          const newUrls: string[] = [];
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              if (file.size > 3 * 1024 * 1024) throw new Error(`檔案「${file.name}」超過 3MB 限制。`);
              const sequence = formData.attachmentUrls.length + i + 1;
              const publicUrl = await db.uploadFile(file, user.id, user.employeeId, formData.date, sequence);
              newUrls.push(publicUrl);
          }
          setFormData(prev => ({ ...prev, attachmentUrls: [...prev.attachmentUrls, ...newUrls] }));
      } catch (err: any) {
          setError('檔案上傳失敗: ' + (err.message || '未知錯誤'));
      } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleRemoveAttachment = async (url: string) => {
      if (!window.confirm('確定要刪除此附件檔案嗎？')) return;
      setUploading(true);
      try {
          await db.deleteFile(url);
          setFormData(prev => ({ ...prev, attachmentUrls: prev.attachmentUrls.filter(u => u !== url) }));
      } catch (err: any) {
          setError('刪除附件失敗');
      } finally {
          setUploading(false);
      }
  };

  const getDuration = () => {
      if (formData.isFullDay) return '8.0 小時 (1天)';
      const [sh, sm] = formData.startTime.split(':').map(Number);
      const [eh, em] = formData.endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 1440; 
      return `${(diff / 60).toFixed(1)} 小時`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
        const conflict = await db.checkTimeOverlap(
            user.id, 
            formData.date, 
            formData.date, 
            formData.isFullDay ? undefined : formData.startTime, 
            formData.isFullDay ? undefined : formData.endTime, 
            !formData.isFullDay, 
            editRequestId || undefined
        );

        if (conflict.overlap) throw new Error(`時間重疊！您已在此時段申請過假單或加班。`);

        const userGroup = await db.getUserWorkflowGroup(user.id);
        if (!userGroup) throw new Error('系統錯誤：找不到您的簽核流程設定。');

        let totalSteps = userGroup.steps.length;
        const rule = userGroup.titleRules.find(r => r.jobTitle === user.jobTitle);
        if (rule) totalSteps = Math.min(rule.maxLevel, totalSteps);

        const newLog: ApprovalLog = {
          approverId: user.id,
          approverName: user.name,
          action: isEditMode ? 'UPDATE' : 'SUBMIT',
          timestamp: new Date().toISOString(),
          comment: isEditMode ? '修改加班申請' : '提交加班申請'
        };

        const record: Partial<LeaveRequest> = {
            id: isEditMode && editRequestId ? editRequestId : crypto.randomUUID(),
            userId: user.id,
            userName: user.name,
            type: LeaveType.OVERTIME,
            startDate: formData.date,
            endDate: formData.date,
            isPartialDay: !formData.isFullDay,
            startTime: formData.isFullDay ? undefined : formData.startTime,
            endTime: formData.isFullDay ? undefined : formData.endTime,
            reason: formData.reason,
            attachmentUrls: formData.attachmentUrls,
            attachmentUrl: formData.attachmentUrls[0] || '',
            status: RequestStatus.IN_PROCESS,
            currentStep: 1,
            stepApprovedBy: [],
            totalSteps: totalSteps,
            createdAt: new Date().toISOString(),
        };

        if (isEditMode && editRequestId) {
            const all = await db.getRequests();
            const existing = all.find(r => r.id === editRequestId);
            if (existing) {
                await db.updateRequest({ ...existing, ...record, logs: [...(existing.logs || []), newLog] } as LeaveRequest);
            }
        } else {
            await db.createRequest({ ...record, logs: [newLog] } as LeaveRequest);
        }

        navigate('/my-requests');
    } catch (err: any) {
        setError(err.message || '儲存失敗');
        setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-12 animate-in fade-in duration-500">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-8 py-6 border-b flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <div className="w-2 h-8 bg-orange-500 rounded-full"></div>
                    {isEditMode ? '修改加班申請' : '申請加班'}
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium italic">核准後將自動轉換為補休額度 (1小時加班 = 1小時補休)</p>
            </div>
            {uploading && <div className="text-orange-600 font-bold animate-pulse text-xs flex items-center gap-2"><Loader2 size={14} className="animate-spin"/> 檔案處理中...</div>}
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 text-sm flex items-center gap-3">
              <AlertCircle size={20} className="shrink-0" /> <span className="font-bold">{error}</span>
            </div>
          )}

          <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">加班日期</label>
                <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-slate-700 focus:border-orange-500 transition-all"
                    />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 space-y-6">
                  <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="fullDay"
                        checked={formData.isFullDay}
                        onChange={(e) => setFormData({...formData, isFullDay: e.target.checked})}
                        className="w-5 h-5 text-orange-600 rounded-lg border-slate-200 focus:ring-orange-500 cursor-pointer"
                      />
                      <label htmlFor="fullDay" className="text-sm font-black text-slate-700 cursor-pointer select-none">
                        此為整天加班 (自動計算 8 小時)
                      </label>
                  </div>

                  {!formData.isFullDay && (
                      <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                         <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest ml-1">開始時間</label>
                            <input
                                type="time"
                                required={!formData.isFullDay}
                                value={formData.startTime}
                                onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                                className="w-full px-4 py-2 border-2 border-orange-50 rounded-xl font-black text-orange-600 outline-none focus:border-orange-500"
                            />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest ml-1">結束時間</label>
                            <input
                                type="time"
                                required={!formData.isFullDay}
                                value={formData.endTime}
                                onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                                className="w-full px-4 py-2 border-2 border-orange-50 rounded-xl font-black text-orange-600 outline-none focus:border-orange-500"
                            />
                         </div>
                      </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                     <span className="text-xs font-black text-slate-400 uppercase">預計核定額度</span>
                     <span className="font-black text-2xl text-orange-600 bg-orange-50 px-4 py-1 rounded-xl border border-orange-100 shadow-inner">{getDuration()}</span>
                  </div>
              </div>
          </div>

          {/* 附件管理 */}
          <div className="space-y-4">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Paperclip size={16} className="text-orange-500" /> 加班證明附件 (支援多檔，單檔最大3MB)
              </label>
              
              <div 
                onClick={() => !uploading && !loading && fileInputRef.current?.click()}
                className={`border-3 border-dashed rounded-[2rem] p-8 text-center transition-all cursor-pointer group
                    ${uploading ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-orange-50/20 border-orange-100 hover:border-orange-400 hover:bg-orange-50/50'}
                `}
              >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  {uploading ? (
                      <Loader2 size={32} className="mx-auto text-orange-500 animate-spin" />
                  ) : (
                      <div className="flex flex-col items-center gap-2">
                          <Upload className="text-orange-400 group-hover:scale-110 transition-transform" />
                          <p className="text-sm font-black text-slate-600">點擊或拖放檔案上傳加班證明</p>
                      </div>
                  )}
              </div>

              {formData.attachmentUrls.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {formData.attachmentUrls.map((url, i) => (
                          <div key={i} className="bg-white border-2 border-slate-100 p-3 rounded-2xl flex items-center justify-between shadow-sm animate-in zoom-in-95 hover:border-orange-200 transition-all">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <FileText size={16} className="text-orange-500 shrink-0" />
                                  <div className="overflow-hidden">
                                      <p className="text-[10px] font-black text-slate-700 truncate max-w-[120px]">{decodeURIComponent(url.split('/').pop() || '')}</p>
                                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-orange-600 hover:underline flex items-center gap-1 font-bold"><ExternalLink size={10}/> 檢視</a>
                                  </div>
                              </div>
                              <button type="button" onClick={() => handleRemoveAttachment(url)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">加班具體事由 / 工作內容</label>
            <textarea
              rows={3}
              required
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-medium text-slate-700 focus:border-orange-500 focus:bg-white transition-all resize-none"
              placeholder="請簡述加班原因及主要處理的工作項目..."
            ></textarea>
          </div>

          <div className="pt-6 flex justify-end gap-4 border-t">
             <button
              type="button"
              onClick={() => navigate('/my-requests')}
              className="px-8 py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="px-12 py-3.5 bg-orange-600 text-white rounded-2xl font-black shadow-xl shadow-orange-100 hover:bg-orange-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Check size={20}/>}
              {loading ? '傳送中...' : (isEditMode ? '更新加班申請' : '送出加班申請')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
