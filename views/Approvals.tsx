
import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { db } from '../services/mockDb';
import { LeaveRequest, UserRole, RequestStatus, ApprovalLog, WorkflowConfig, WorkflowGroup } from '../types';
import { ROLE_LABELS } from '../constants';
import { Check, X, Eye, AlertTriangle, CheckSquare, Square, Calendar, Clock, Loader2, Users, UserPlus, Paperclip, ExternalLink } from 'lucide-react';

export default function Approvals() {
  const { user } = useContext(AuthContext);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowConfig>([]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [allReqs, allGroups, allUsers] = await Promise.all([
        db.getRequests(),
        db.getWorkflowConfig(),
        db.getUsers()
    ]);
    setWorkflowGroups(allGroups);
    const myPending = allReqs.filter(req => {
        const isProcess = req.status === RequestStatus.IN_PROCESS || req.status.startsWith('待');
        if (!isProcess) return false;
        const requestor = allUsers.find(u => u.id === req.userId);
        if (!requestor) return false;
        const group = allGroups.find(g => g.id === requestor.workflowGroupId) || allGroups[0];
        const stepIndex = (req.currentStep || 1) - 1;
        const currentStepConfig = group.steps[stepIndex];
        if (!currentStepConfig) return false;
        const amIApprover = currentStepConfig.approverIds.includes(user.id);
        const haveIApproved = req.stepApprovedBy && req.stepApprovedBy.includes(user.id);
        return amIApprover && !haveIApproved && req.userId !== user.id;
    });
    setPendingRequests(myPending);
    setSelectedIds(prev => {
        const newSet = new Set<string>();
        myPending.forEach(r => { if (prev.has(r.id)) newSet.add(r.id); });
        return newSet;
    });
    if (selectedReq && !myPending.find(r => r.id === selectedReq.id)) setSelectedReq(null);
  };

  const getDays = (req: LeaveRequest) => {
    if (!req.isPartialDay) {
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    return 0.5; 
  };

  const getDurationText = (req: LeaveRequest) => {
      if (!req.isPartialDay) {
          return `${getDays(req)} 天`;
      } else {
          if (req.startTime && req.endTime) {
            const s = String(req.startTime);
            const e = String(req.endTime);
            if (s.includes(':') && e.includes(':')) {
                const [sh, sm] = s.split(':').map(Number);
                const [eh, em] = e.split(':').map(Number);
                const mins = (eh * 60 + em) - (sh * 60 + sm);
                const hours = (mins / 60).toFixed(1);
                return `${hours} 小時`;
            }
          }
          return '0.5 天';
      }
  };

  const processSingleRequest = async (req: LeaveRequest, approved: boolean) => {
      if (!user) return;
      const requestorGroup = await db.getUserWorkflowGroup(req.userId);
      if (!requestorGroup) return;
      const currentStepIdx = (req.currentStep || 1) - 1;
      const currentStepConfig = requestorGroup.steps[currentStepIdx];
      let newStatus = req.status;
      let newStep = req.currentStep || 1;
      let newStepApprovedBy = req.stepApprovedBy || [];
      const action = approved ? 'APPROVE' : 'REJECT';
      let comment = '';
      if (!approved) {
          newStatus = req.isCancellationRequest ? RequestStatus.APPROVED : RequestStatus.REJECTED;
          comment = req.isCancellationRequest ? '駁回銷假 (維持原假單)' : '駁回申請';
          if(req.isCancellationRequest) req.isCancellationRequest = false;
      } else {
          if (!newStepApprovedBy.includes(user.id)) newStepApprovedBy.push(user.id);
          comment = '同意/核准';
          const allNeeded = currentStepConfig.approverIds;
          const allHaveApproved = allNeeded.every(uid => newStepApprovedBy.includes(uid));
          if (allHaveApproved) {
              const nextStep = newStep + 1;
              const maxSteps = req.totalSteps || requestorGroup.steps.length;
              if (nextStep > maxSteps) {
                  newStatus = req.isCancellationRequest ? RequestStatus.CANCELLED : RequestStatus.APPROVED;
                  comment += ' (流程結案)';
              } else {
                  newStep = nextStep;
                  newStepApprovedBy = []; 
                  newStatus = RequestStatus.IN_PROCESS;
                  comment += ' (晉級)';
              }
          } else {
              comment += ' (等待同級其他人員簽核)';
          }
      }
      const newLog: ApprovalLog = { approverId: user.id, approverName: user.name, action: action, timestamp: new Date().toISOString(), comment: comment };
      const updatedReq: LeaveRequest = { ...req, status: newStatus, currentStep: newStep, stepApprovedBy: newStepApprovedBy, logs: [...(req.logs || []), newLog] };
      await db.updateRequest(updatedReq);
  };

  const handleSingleProcess = async (req: LeaveRequest, approved: boolean) => {
      const actionText = approved ? '核准' : '駁回';
      if(!window.confirm(`確定要${actionText}此申請嗎？`)) return;
      try { 
          await processSingleRequest(req, approved); 
          await loadData(); 
      } catch (e) { 
          console.error(e); 
          alert('操作失敗'); 
      }
  };

  const openBatchModal = (approved: boolean) => { if (selectedIds.size === 0) return; setBatchAction(approved ? 'APPROVE' : 'REJECT'); };

  const executeBatchAction = async () => {
      if (!user || !batchAction) return;
      const isApprove = batchAction === 'APPROVE';
      setIsProcessing(true);
      try {
        const allRequests = await db.getRequests();
        const requestsToProcess = allRequests.filter(r => selectedIds.has(r.id));
        for (const req of requestsToProcess) { 
            await processSingleRequest(req, isApprove); 
        }
        setSelectedIds(new Set()); 
        setBatchAction(null); 
        await loadData();
        setTimeout(() => { setIsProcessing(false); alert('批量處理完成！'); }, 50);
      } catch (error) { 
          console.error(error); 
          setIsProcessing(false); 
          setBatchAction(null); 
          alert('處理錯誤'); 
      }
  };

  const toggleSelection = (id: string) => { setSelectedIds(prev => { const newSet = new Set(prev); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; }); };

  const toggleSelectAll = () => {
      if (selectedIds.size === pendingRequests.length && pendingRequests.length > 0) { setSelectedIds(new Set()); }
      else { const allIds = pendingRequests.map(r => r.id); setSelectedIds(new Set(allIds)); }
  };

  const getCurrentStepLabel = (req: LeaveRequest) => {
      const requestor = db.getUser(req.userId); // This is still technically a promise but we use pre-fetched data in practice
      const group = workflowGroups.find(g => {
          // Fallback logic if we didn't pre-fetch specifically for this user's ID
          return g.steps.some(s => s.approverIds.includes(user?.id || ''));
      }) || workflowGroups[0];
      
      if(!group) return `Level ${req.currentStep}`;
      const step = group.steps[(req.currentStep || 1) - 1];
      return step ? step.label : `Level ${req.currentStep}`;
  };

  const getConsensusProgress = (req: LeaveRequest) => {
      const group = workflowGroups.find(g => {
          return g.steps.some(s => s.approverIds.includes(user?.id || ''));
      }) || workflowGroups[0];
      
      if(!group) return null;
      const step = group.steps[(req.currentStep || 1) - 1];
      if (!step) return null;
      const total = step.approverIds.length;
      const current = (req.stepApprovedBy || []).length;
      if (total <= 1) return null;
      return <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 flex items-center gap-1"><Users size={10} /> 會簽進度: {current}/{total}</span>;
  };

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col relative">
      <div className="flex justify-between items-end shrink-0">
          <div><h2 className="text-2xl font-bold text-slate-800">待簽核項目</h2><p className="text-slate-500">這些是輪到您（{user?.name}）簽核的假單。</p></div>
          <div className="flex gap-3">
              <button onClick={() => openBatchModal(false)} disabled={selectedIds.size === 0 || isProcessing} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg font-medium flex gap-2"><X size={16} /> 批量駁回</button>
              <button onClick={() => openBatchModal(true)} disabled={selectedIds.size === 0 || isProcessing} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium flex gap-2 shadow-sm"><Check size={16} /> 批量核准</button>
          </div>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
           <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 shrink-0">
               <button onClick={toggleSelectAll} disabled={isProcessing} className="text-slate-500 hover:text-blue-600">
                   {pendingRequests.length > 0 && selectedIds.size === pendingRequests.length ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
               </button>
               <span className="text-sm font-bold text-slate-500 uppercase">全選 / 取消 ({pendingRequests.length} 筆)</span>
           </div>
           <div className="flex-1 overflow-y-auto">
               {pendingRequests.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-500"><CheckSquare size={48} className="mb-4 opacity-20" /><p>目前沒有待簽核項目！</p></div>
               ) : (
                 <ul className="divide-y divide-slate-100">
                   {pendingRequests.map(r => (
                     <li key={r.id} className={`hover:bg-slate-50 transition-colors border-b border-slate-50 ${selectedReq?.id === r.id ? 'bg-blue-50/50' : ''}`}>
                       <div className="flex items-stretch select-none">
                           <div className="pl-4 py-4 flex items-start pt-5 justify-center cursor-pointer w-12 shrink-0" onClick={() => !isProcessing && toggleSelection(r.id)}>
                               <div className="text-slate-400">{selectedIds.has(r.id) ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}</div>
                           </div>
                           <div className="flex-1 p-4 cursor-pointer" onClick={() => setSelectedReq(r)}>
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-900 text-sm">{r.userName}</span>
                                        <span className="px-2 py-0.5 rounded text-[10px] border bg-slate-100 text-slate-600 border-slate-200">{r.type}</span>
                                        {r.isCancellationRequest && <span className="text-[10px] text-red-600 font-bold flex items-center gap-0.5"><AlertTriangle size={10} /> 銷假</span>}
                                        {getConsensusProgress(r)}
                                    </div>
                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{getDurationText(r)}</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-slate-500"><Calendar size={12} /> {r.startDate} {r.startDate !== r.endDate && `→ ${r.endDate}`}<span className="ml-auto font-medium text-orange-600">{getCurrentStepLabel(r)}</span></div>
                           </div>
                       </div>
                     </li>
                   ))}
                 </ul>
               )}
           </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full overflow-y-auto">
          {selectedReq ? (
            <>
              <div className="flex-1 space-y-4">
                  <h3 className="text-xl font-bold text-slate-900">{selectedReq.userName}</h3>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 mb-1">事由</p>
                    <p className="text-slate-700">"{selectedReq.reason}"</p>
                  </div>
                  
                  {selectedReq.deputy && (
                    <div className="p-2 bg-blue-50 border border-blue-100 rounded flex items-center gap-2">
                        <UserPlus size={16} className="text-blue-500" />
                        <span className="text-xs text-slate-500 font-bold uppercase">職務代理人:</span>
                        <span className="text-sm font-bold text-slate-800">{selectedReq.deputy}</span>
                    </div>
                  )}

                  {/* Attachment in Detail View */}
                  {selectedReq.attachmentUrl && (
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                        <div className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-1">
                            <Paperclip size={14} /> 附件證明
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-indigo-900 truncate max-w-[180px]">{selectedReq.attachmentUrl}</p>
                            <a 
                                href={selectedReq.attachmentUrl.startsWith('http') ? selectedReq.attachmentUrl : `https://${selectedReq.attachmentUrl}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                <ExternalLink size={12} /> 開啟附件
                            </a>
                        </div>
                    </div>
                  )}
                  
                  <div>
                     <p className="text-xs font-bold text-slate-400 mb-2">當前進度: {getCurrentStepLabel(selectedReq)}</p>
                     <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${((selectedReq.currentStep || 1) / (selectedReq.totalSteps || 5)) * 100}%` }}></div>
                     </div>
                  </div>
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-slate-800 mb-3">簽核歷程</h4>
                    <div className="space-y-3 text-sm">
                      {selectedReq.logs?.map((log, index) => (
                        <div key={index} className="flex gap-3">
                          <div className="mt-1 w-2 h-2 rounded-full bg-slate-300 shrink-0"></div>
                          <div><p className="font-bold text-slate-700">{log.action} <span className="text-slate-400 font-normal">by {log.approverName}</span></p><p className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString('zh-TW')} - {log.comment}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 flex-col"><Eye size={48} className="opacity-20 mb-2" /><p>請選擇左側單據</p></div>
          )}
        </div>
      </div>
      {batchAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"><h3 className="text-lg font-bold mb-4">確認{batchAction === 'APPROVE' ? '核准' : '駁回'} {selectedIds.size} 筆單據？</h3><div className="flex justify-end gap-3"><button onClick={() => setBatchAction(null)} className="px-4 py-2 bg-slate-100 rounded">取消</button><button onClick={executeBatchAction} className="px-4 py-2 bg-blue-600 text-white rounded">確認</button></div></div>
          </div>
      )}
    </div>
  );
}
