

import { supabase } from './supabaseClient';
import { 
  User, LeaveRequest, UserRole, RequestStatus, LeaveType, 
  WorkflowConfig, UserStatsConfig, WorkflowGroup, LeaveCategory, 
  WarningRule, OvertimeSettlementRecord, ActiveWarning, Gender, GenderRestriction
} from '../types';

class SupabaseDB {
  // --- Storage ---
  /**
   * 根據需求命名：申請日期-工號-序號
   * 衝突處理：自動附加 (n) 編號
   */
  async uploadFile(file: File, userId: string, employeeId: string, applyDate: string, sequence: number): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const baseName = `${applyDate}-${employeeId}-${sequence}`;
    
    let success = false;
    let counter = 0;
    let finalPublicUrl = '';

    while (!success && counter < 20) {
      const currentName = counter === 0 ? `${baseName}.${fileExt}` : `${baseName}(${counter}).${fileExt}`;
      const filePath = `${userId}/${currentName}`;

      const { error } = await supabase.storage
        .from('leave-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false, // 確保不覆蓋，觸發錯誤以便我們重新命名
          contentType: file.type
        });

      if (error) {
          // 若檔案已存在，增加計數器重試
          if (error.message.includes('already exists') || (error as any).status === 409) {
              counter++;
          } else {
              throw new Error(error.message);
          }
      } else {
          const { data: { publicUrl } } = supabase.storage
            .from('leave-attachments')
            .getPublicUrl(filePath);
          finalPublicUrl = publicUrl;
          success = true;
      }
    }

    if (!success) throw new Error('上傳失敗：檔案重複命名嘗試次數過多。');
    return finalPublicUrl;
  }

  async deleteFile(url: string) {
    try {
      const bucketName = 'leave-attachments';
      const searchStr = `/${bucketName}/`;
      const index = url.indexOf(searchStr);
      if (index === -1) return;
      const pathPart = url.substring(index + searchStr.length);
      const { error } = await supabase.storage.from(bucketName).remove([pathPart]);
      if (error) throw error;
    } catch (err) {
      console.error('Delete Storage file failed:', err);
    }
  }

  // --- Requests 核心相容性處理 ---
  private sanitizeForDB(req: LeaveRequest) {
    const payload = { ...req } as any;
    // 將多附件陣列轉為 JSON 字串存入舊欄位，避免 Schema Error
    if (req.attachmentUrls) {
      payload.attachmentUrl = JSON.stringify(req.attachmentUrls);
    }
    // 移除資料庫不存在的欄位
    delete payload.attachmentUrls;
    return payload;
  }

  private processFromDB(req: any): LeaveRequest {
    let urls: string[] = [];
    try {
      if (req.attachmentUrl && (req.attachmentUrl.startsWith('[') || req.attachmentUrl.startsWith('{'))) {
        urls = JSON.parse(req.attachmentUrl);
      } else if (req.attachmentUrl) {
        urls = [req.attachmentUrl];
      }
    } catch (e) {
      urls = req.attachmentUrl ? [req.attachmentUrl] : [];
    }
    return { ...req, attachmentUrls: urls, attachmentUrl: urls[0] || '' };
  }

  async getRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase.from('leave_requests').select('*');
    if (error) throw error;
    return (data || []).map(r => this.processFromDB(r));
  }

  async createRequest(req: LeaveRequest) {
    const sanitized = this.sanitizeForDB(req);
    const { error } = await supabase.from('leave_requests').insert(sanitized);
    if (error) throw error;
  }

  async updateRequest(req: LeaveRequest) {
    const sanitized = this.sanitizeForDB(req);
    const { error } = await supabase.from('leave_requests').update(sanitized).eq('id', req.id);
    if (error) throw error;
  }

  async deleteRequest(id: string) {
    const { error } = await supabase.from('leave_requests').delete().eq('id', id);
    if (error) throw error;
  }

  async saveRequests(reqs: LeaveRequest[]) {
      const sanitized = reqs.map(r => this.sanitizeForDB(r));
      const { error } = await supabase.from('leave_requests').upsert(sanitized);
      if (error) throw error;
  }

  // --- Users ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return data as User[];
  }
  async getUser(id: string): Promise<User | null> {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error) return null;
    return data as User;
  }
  // Implement createUser
  async createUser(user: User) {
    const { error } = await supabase.from('users').insert(user);
    if (error) throw error;
  }
  async updateUser(user: User) {
    const { error } = await supabase.from('users').update(user).eq('id', user.id);
    if (error) throw error;
  }
  async saveUsers(users: User[]) {
    const { error } = await supabase.from('users').upsert(users);
    if (error) throw error;
  }
  async deleteUser(id: string) {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
  }

  // --- Configs & Metadata ---
  async getWorkflowConfig(): Promise<WorkflowConfig> {
    const { data, error } = await supabase.from('workflow_groups').select('*');
    if (error) throw error;
    return data as WorkflowConfig;
  }
  async saveWorkflowConfig(config: WorkflowConfig) {
      const { error } = await supabase.from('workflow_groups').upsert(config);
      if (error) throw error;
  }
  async getLeaveCategories(): Promise<LeaveCategory[]> {
    const { data, error } = await supabase.from('leave_categories').select('*');
    if (error) throw error;
    return data as LeaveCategory[];
  }
  async saveLeaveCategories(cats: LeaveCategory[]) {
      const { error } = await supabase.from('leave_categories').upsert(cats);
      if (error) throw error;
  }
  async getWarningRules(): Promise<WarningRule[]> {
    const { data, error } = await supabase.from('warning_rules').select('*');
    if (error) throw error;
    return data as WarningRule[];
  }
  // Implement deleteWarningRule
  async deleteWarningRule(id: string) {
    const { error } = await supabase.from('warning_rules').delete().eq('id', id);
    if (error) throw error;
  }
  async saveWarningRules(rules: WarningRule[]) {
      const { error } = await supabase.from('warning_rules').upsert(rules);
      if (error) throw error;
  }
  async getOvertimeRecords(): Promise<OvertimeSettlementRecord[]> {
    const { data, error } = await supabase.from('overtime_records').select('*');
    if (error) throw error;
    return data as OvertimeSettlementRecord[];
  }
  async saveOvertimeRecords(records: OvertimeSettlementRecord[]) {
      const { error } = await supabase.from('overtime_records').upsert(records);
      if (error) throw error;
  }

  // --- Helpers ---
  async getUserWorkflowGroup(userId: string): Promise<WorkflowGroup | null> {
      const user = await this.getUser(userId);
      if (!user) return null;
      const groups = await this.getWorkflowConfig();
      return groups.find(g => g.id === user.workflowGroupId) || groups[0] || null;
  }
  async canAccessTeamStats(currentUser: User): Promise<boolean> {
    if (currentUser.role === UserRole.ADMIN) return true;
    const configs = await this.getStatsConfigs();
    return configs.some(c => (c.targetValue || c.userId) === currentUser.id);
  }
  async getStatsConfigs(): Promise<UserStatsConfig[]> {
    const { data, error } = await supabase.from('user_stats_configs').select('*');
    if (error) throw error;
    return data as UserStatsConfig[];
  }
  async saveStatsConfigs(configs: UserStatsConfig[]) {
      const { error } = await supabase.from('user_stats_configs').upsert(configs);
      if (error) throw error;
  }
  async getVisibleUsers(currentUser: User): Promise<User[]> {
    if (currentUser.role === UserRole.ADMIN) return [];
    const [allUsers, configs] = await Promise.all([this.getUsers(), this.getStatsConfigs()]);
    const myConf = configs.filter(c => (c.targetValue || c.userId) === currentUser.id);
    if (myConf.length === 0) return [];
    const depts = new Set(myConf.flatMap(c => c.allowedDepts || []));
    return allUsers.filter(u => u.id !== currentUser.id && (depts.has(u.department)));
  }
  evaluateWarnings(user: User, rules: WarningRule[], allRequests: LeaveRequest[]): ActiveWarning[] {
      const warnings: ActiveWarning[] = [];
      const approved = allRequests.filter(r => r.userId === user.id && r.status === RequestStatus.APPROVED);
      rules.forEach(rule => {
          let count = 0;
          approved.filter(r => r.type === rule.targetType).forEach(r => {
              if (!r.isPartialDay) {
                  const s = new Date(r.startDate), e = new Date(r.endDate);
                  count += Math.ceil(Math.abs(e.getTime() - s.getTime()) / 86400000) + 1;
              } else count += 0.5;
          });
          if (count >= rule.threshold) {
              warnings.push({ ruleId: rule.id, ruleName: rule.name, message: rule.message, color: rule.color, currentValue: count });
          }
      });
      return warnings;
  }
  async checkTimeOverlap(userId: string, start: string, end: string, sTime?: string, eTime?: string, isPartial?: boolean, excludeId?: string) {
      const requests = await this.getRequests();
      const overlap = requests.find(r => r.userId === userId && r.id !== excludeId && r.status !== RequestStatus.REJECTED && r.status !== RequestStatus.CANCELLED && (start <= r.endDate && end >= r.startDate));
      return { overlap: !!overlap, conflictingRequest: overlap };
  }
}

export const db = new SupabaseDB();
