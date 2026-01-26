

import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { db } from '../services/mockDb';
import { LeaveRequest, RequestStatus, LeaveType } from '../types';
import { Edit2, Clock, CheckCircle, XCircle, Ban, AlertTriangle, RefreshCcw, Trash2, Info, RotateCcw, Undo2, X, Check, CopyPlus, Lock, UserPlus, ClipboardCheck, Paperclip, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ActionType = 'APPLY_CANCEL' | 'WITHDRAW' | 'ABORT_CANCEL' | 'DELETE';

interface PendingAction {
    type: ActionType;
    req: LeaveRequest;
}

export default function MyRequests() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  
  // Custom Modal State
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    loadRequests();
  }, [user]);

  const loadRequests = async () => {
    if (user) {
      const all = await db.getRequests();
      setRequests(all.filter(r => r.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }
  };

  const handleEdit = (req: LeaveRequest) => {
    if (req.type === LeaveType.OVERTIME) {
        navigate('/apply-overtime', { state: { editRequest: req } });
    } else {
        navigate('/apply', { state: { editRequest: req } });
    }
  };

  const handleClone = (req: LeaveRequest) => {
    const target = req.type === LeaveType.OVERTIME ? '/apply-overtime' : '/apply';
    navigate(target, { state: { cloneRequest: req } });
  };

  const promptApplyCancellation = (e: React.MouseEvent, req: LeaveRequest) => {
      e.stopPropagation();
      setPendingAction({ type: 'APPLY_CANCEL', req });
  };

  const promptWithdraw = (e: React.MouseEvent, req: LeaveRequest) => {
      e.stopPropagation();
      setPendingAction({ type: 'WITHDRAW', req });
  };

  const promptAbortCancellation = (e: React.MouseEvent, req: LeaveRequest) => {
      e.stopPropagation();
      setPendingAction({ type: 'ABORT_CANCEL', req });
  };

  const promptDelete = (e: React.MouseEvent, req: LeaveRequest) => {
      e.stopPropagation();
      setPendingAction({ type: 'DELETE', req });
  };

  const executeAction = async () => {
      if (!user || !pendingAction) return;
      const { type, req } = pendingAction;

      try {
        if (type === 'APPLY_CANCEL') {
            const updated: LeaveRequest = {
                ...req,
                status: RequestStatus.PENDING_L1, 
                isCancellationRequest: true,
                currentStep: 1, 
                stepApprovedBy: [], 
                logs: [
                    ...(req.logs || []), 
                    {
                        approverId: user.id,
                        approverName: user.name,
                        action: 'SUBMIT',
                        timestamp: new Date().toISOString(),
                        comment: '申請銷假 (啟動完整簽核流程)'
                    }
                ]
            };
            await db.updateRequest(updated);
        }
        else if (type === 'WITHDRAW') {
             const updated: LeaveRequest = {
                ...req,
                status: RequestStatus.CANCELLED,
                logs: [
                    ...(req.logs || []), 
                    {
                        approverId: user.id,
                        approverName: user.name,
                        action: 'CANCEL',
                        timestamp: new Date().toISOString(),
                        comment: '使用者自行撤回'
                    }
                ]
            };
            await db.updateRequest(updated);
        }
        else if (type === 'ABORT_CANCEL') {
            const updated: LeaveRequest = {
                ...req,
                status: RequestStatus.APPROVED,
                isCancellationRequest: false,
                logs: [
                    ...(req.logs || []),
                    {
                        approverId: user.id,
                        approverName: user.name,
                        action: 'CANCEL',
                        timestamp: new Date().toISOString(),
                        comment: '使用者中止銷假申請 (保留原假單)'
                    }
                ]
            };
            await db.updateRequest(updated);
        }
        else if (type === 'DELETE') {
            await db.deleteRequest(req.id);
        }

        await loadRequests();
        setPendingAction(null);

      } catch (error) {
          console.error(error);
          alert('操作失敗，請稍後再試。');
          setPendingAction(null);
      }
  };

  const getModalContent = () => {
      if (!pendingAction) return null;
      const { type, req } = pendingAction;

      switch(type) {
          case 'APPLY_CANCEL':
              return {
                  title: '申請銷假確認',
                  color: 'text-orange-600',
                  bgColor: 'bg-orange-50',
                  borderColor: 'border-orange-100',
                  icon: <RefreshCcw size={24} />,
                  msg: `您確定要對「${req.startDate}」的假單申請銷假嗎？送出後需經主管重新簽核所有流程。`,
                  btnClass: 'bg-orange-600 hover:bg-orange-700',
                  btnText: '確認申請銷假'
              };
          case 'WITHDRAW':
              return {
                  title: '撤回申請確認',
                  color: 'text-red-600',
                  bgColor: 'bg-red-50',
                  borderColor: 'border-red-100',
                  icon: <RotateCcw size={24} />,
                  msg: `您確定要撤回此筆待簽核的申請嗎？撤回後單據將直接取消。`,
                  btnClass: 'bg-red-600 hover:bg-red-700',
                  btnText: '確認撤回'
              };
          case 'ABORT_CANCEL':
              return {
                  title: '中止銷假確認',
                  color: 'text-blue-600',
                  bgColor: 'bg-blue-50',
                  borderColor: 'border-blue-100',
                  icon: <Undo2 size={24} />,
                  msg: `您確定要中止銷假申請嗎？確認後將回復為「已核准」狀態 (繼續請假)。`,
                  btnClass: 'bg-blue-600 hover:bg-blue-700',
                  btnText: '確認中止銷假'
              };
          case 'DELETE':
              return {
                  title: '刪除紀錄確認',
                  color: 'text-red-700',
                  bgColor: 'bg-red-50',
                  borderColor: 'border-red-100',
                  icon: <Trash2 size={24} />,
                  msg: `您確定要永久刪除此筆歷史紀錄嗎？此動作無法復原。`,
                  btnClass: 'bg-red-700 hover:bg-red-800',
                  btnText: '確認刪除'
              };
          default:
              return null;
      }
  };

  const modalData = getModalContent();

  const getStatusColor = (status: RequestStatus) => {
    if (status === RequestStatus.APPROVED) return 'bg-green-100 text-green-700 border-green-200';
    if (status === RequestStatus.REJECTED) return 'bg-red-100 text-red-700 border-red-200';
    if (status === RequestStatus.CANCELLED) return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  };

  const getStatusIcon = (status: RequestStatus) => {
    if (status === RequestStatus.APPROVED) return <CheckCircle size={14} className="mr-1" />;
    if (status === RequestStatus.REJECTED) return <XCircle size={14} className="mr-1" />;
    if (status === RequestStatus.CANCELLED) return <Ban size={14} className="mr-1" />;
    return <Clock size={14} className="mr-1" />;
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
        <h2 className="text-2xl font-bold text-slate-800">我的請假紀錄</h2>
        <div className="text-xs text-slate-500 flex gap-4 bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> 簽核中</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> 已核准</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-400"></div> 已取消/駁回</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Info size={48} className="mb-4 opacity-20" />
            <p>目前查無請假紀錄，請點擊上方「申請請假」開始申請。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-4">類型</th>
                  <th className="px-6 py-4">日期 / 時間</th>
                  <th className="px-6 py-4">狀態 / 更新時間</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const isApproved = r.status === RequestStatus.APPROVED;
                  const isRejected = r.status === RequestStatus.REJECTED;
                  const isPending = r.status.startsWith('待') || r.status === RequestStatus.IN_PROCESS;
                  const isDraft = r.status === RequestStatus.DRAFT;
                  const isCancelled = r.status === RequestStatus.CANCELLED;
                  const isCancellationWorkflow = r.isCancellationRequest && isPending;
                  const isNormalPending = isPending && !r.isCancellationRequest;
                  const currentStep = r.currentStep || 1;
                  const hasPassedLevel1 = currentStep > 1;
                  const lastLog = r.logs && r.logs.length > 0 ? r.logs[r.logs.length - 1] : null;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                              {r.type}
                              {isCancellationWorkflow && (
                                  <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-100 inline-flex items-center gap-1 animate-pulse">
                                      <AlertTriangle size={10} /> 銷假審核中
                                  </span>
                              )}
                              {r.attachmentUrl && (
                                  <Paperclip size={12} className="text-blue-500" />
                              )}
                          </div>
                          {r.deputy && (
                              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" title="職務代理人">
                                  <UserPlus size={12} /> {r.deputy}
                              </div>
                          )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-700">
                          {r.startDate} <span className="text-slate-400 mx-1">~</span> {r.endDate}
                        </div>
                        {r.isPartialDay && <div className="text-xs text-orange-600 mt-1 flex items-center gap-1"><Clock size={10}/> {r.startTime} - {r.endTime}</div>}
                        
                        {r.attachmentUrl && (
                            <div className="mt-2 text-[10px]">
                                <a 
                                    href={r.attachmentUrl.startsWith('http') ? r.attachmentUrl : `https://${r.attachmentUrl}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"
                                >
                                    <ExternalLink size={10} /> 檢視附件
                                </a>
                            </div>
                        )}

                        {r.type === LeaveType.OVERTIME && r.isVerified && (
                            <div className="mt-2 text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 p-2 rounded-md shadow-sm w-fit">
                                <div className="font-bold flex items-center gap-1 mb-1 border-b border-indigo-100 pb-1">
                                    <ClipboardCheck size={12} /> 核定通知
                                </div>
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1">
                                        <span className="text-indigo-400">日期:</span> {r.actualStartDate}
                                        {r.actualStartDate !== r.actualEndDate && ` ~ ${r.actualEndDate}`}
                                    </div>
                                    <div className="font-bold text-indigo-800 flex items-center gap-1 bg-white/50 px-1 rounded w-fit">
                                        <CheckCircle size={10} /> 核定: {r.actualDuration}小時
                                    </div>
                                </div>
                            </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(r.status)}`}>
                            {getStatusIcon(r.status)}
                            {r.status}
                            </span>
                            {lastLog && (
                                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(lastLog.timestamp).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                                </div>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 items-center opacity-90 group-hover:opacity-100 transition-opacity">
                            {isDraft && (
                                <>
                                  <button onClick={() => handleEdit(r)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"><Edit2 size={16} /></button>
                                  <button onClick={(e) => promptDelete(e, r)} className="flex items-center gap-1 px-3 py-2 border border-red-200 text-red-700 bg-white hover:bg-red-50 rounded-lg transition-all text-xs font-bold shadow-sm"><Trash2 size={16} /> 刪除</button>
                                </>
                            )}
                            {isNormalPending && !hasPassedLevel1 && (
                                <>
                                  <button onClick={() => handleEdit(r)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"><Edit2 size={16} /></button>
                                  <button onClick={(e) => promptWithdraw(e, r)} className="flex items-center gap-1 px-3 py-2 border border-red-200 text-red-700 bg-white hover:bg-red-50 rounded-lg transition-all text-xs font-bold shadow-sm"><RotateCcw size={16} /><span>撤回申請</span></button>
                                </>
                            )}
                            {isNormalPending && hasPassedLevel1 && (
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-100"><Lock size={12} /> 簽核中 (已鎖定)</span>
                                </div>
                            )}
                            {isCancellationWorkflow && (
                                <button onClick={(e) => promptAbortCancellation(e, r)} className="flex items-center gap-1 px-3 py-2 border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 rounded-lg transition-all text-xs font-bold shadow-sm"><Undo2 size={16} /><span>中止銷假</span></button>
                            )}
                            {isApproved && (
                                <button onClick={(e) => promptApplyCancellation(e, r)} className="flex items-center gap-1 px-3 py-2 border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 rounded-lg transition-all text-xs font-bold shadow-sm"><RefreshCcw size={16} /><span>申請銷假</span></button>
                            )}
                             {isRejected && (
                                <button onClick={() => handleClone(r)} className="flex items-center gap-1 px-3 py-2 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg transition-all text-xs font-bold shadow-sm"><CopyPlus size={16} /><span>重新申請</span></button>
                            )}
                            {isCancelled && (
                                <>
                                    <button onClick={() => handleClone(r)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"><CopyPlus size={16} /></button>
                                    <button onClick={(e) => promptDelete(e, r)} className="flex items-center gap-1 px-3 py-2 border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 rounded-lg transition-all text-xs font-bold shadow-sm"><Trash2 size={16} /><span>刪除紀錄</span></button>
                                </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className={`px-6 py-4 border-b ${modalData.bgColor} ${modalData.borderColor} flex justify-between items-center`}>
                      <h3 className={`font-bold text-lg flex items-center gap-2 ${modalData.color}`}>{modalData.icon} {modalData.title}</h3>
                      <button onClick={() => setPendingAction(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>
                  <div className="p-6">
                      <p className="text-slate-700 font-medium leading-relaxed">{modalData.msg}</p>
                  </div>
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                      <button onClick={() => setPendingAction(null)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium">取消</button>
                      <button onClick={executeAction} className={`px-4 py-2 text-white rounded-lg font-bold shadow-sm flex items-center gap-2 ${modalData.btnClass}`}><Check size={16} /> {modalData.btnText}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
