
import { supabase } from './supabaseClient';
import { 
  User, LeaveRequest, UserRole, RequestStatus, LeaveType, 
  WorkflowConfig, UserStatsConfig, WorkflowGroup, LeaveCategory, 
  WarningRule, OvertimeSettlementRecord, ActiveWarning, Gender, GenderRestriction, OvertimeCheck
} from '../types';

// 定義與資料庫對接的介面
export interface OvertimeReview {
  id: string;
  year: number;
  month: number;
  note: string;
  updatedAt: string;
  updatedBy: string;
  updatedById: string;
}

class SupabaseDB {
  // --- Overtime Reviews (與 Supabase overtime_reviews 資料表連線) ---
  async getOvertimeReviews(year: number, month: number): Promise<OvertimeReview[]> {
    console.log(`Fetching reviews for ${year}/${month}`);
    const { data, error } = await supabase
      .from('overtime_reviews')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error("Supabase fetch error:", error);
      throw error;
    }

    return (data || []).map(r => ({
        id: r.id,
        year: r.year,
        month: r.month,
        note: r.note,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        updatedById: r.updated_by_id
    }));
  }

  async saveOvertimeReview(review: OvertimeReview) {
    console.log("Saving review to Supabase:", review);
    
    // 顯式轉換為資料庫蛇形命名
    const payload = {
        id: review.id,
        year: review.year,
        month: review.month,
        note: review.note,
        updated_at: review.updatedAt,
        updated_by: review.updatedBy,
        updated_by_id: review.updatedById
    };

    const { data, error } = await supabase
      .from('overtime_reviews')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Supabase upsert error details:", error);
      throw new Error(`儲存失敗: ${error.message}`);
    }
    
    return data;
  }

  async deleteOvertimeReview(id: string) {
    const { error } = await supabase.from('overtime_reviews').delete().eq('id', id);
    if (error) {
      console.error("Supabase delete error:", error);
      throw error;
    }
  }

  // --- Overtime Checks (新增：加班明細核對 overtime_check) ---
  async getOvertimeChecks(year: number, month: number): Promise<OvertimeCheck[]> {
    const { data, error } = await supabase
      .from('overtime_check')
      .select('*')
      .eq('year', year)
      .eq('month', month);
      
    if (error) {
        // 如果資料表不存在，Supabase 會回傳錯誤，這裡改為回傳空陣列以免卡住 UI
        console.warn("Fetch overtime_check warning (table might be missing):", error.message);
        return [];
    }

    return (data || []).map(r => ({
        id: r.id,
        requestId: r.request_id,
        userId: r.user_id,
        year: r.year,
        month: r.month,
        actualStartDate: r.actual_start_date,
        actualEndDate: r.actual_end_date,
        actualStartTime: r.actual_start_time,
        actualEndTime: r.actual_end_time,
        actualDuration: r.actual_duration,
        isVerified: r.is_verified,
        updatedAt: r.updated_at
    }));
  }

  async saveOvertimeChecks(checks: OvertimeCheck[]) {
      if (checks.length === 0) return;
      
      // 轉換為資料庫欄位格式
      const payload = checks.map(c => ({
          id: c.id,
          request_id: c.requestId,
          user_id: c.userId,
          year: c.year,
          month: c.month,
          actual_start_date: c.actualStartDate,
          actual_end_date: c.actualEndDate,
          actual_start_time: c.actualStartTime,
          actual_end_time: c.actualEndTime,
          actual_duration: c.actualDuration || 0, // 確保非 NaN
          is_verified: c.isVerified,
          updated_at: c.updatedAt
      }));

      // 修改：移除 onConflict: 'request_id'。
      // 前端已經負責解析出正確的 id (若 DB 有則用舊 id)，因此依靠 PK 'id' 進行 Upsert 即可。
      // 這樣可以避免因 DB 缺少 unique constraint (request_id) 而導致的報錯。
      const { error } = await supabase
        .from('overtime_check')
        .upsert(payload);
        
      if (error) {
          console.error("Save Overtime Check Error:", error);
          throw new Error(`加班核對儲存失敗: ${error.message} (Hint: Check Table Permissions/RLS)`);
      }
  }

  // --- 其他現有功能維持不變 ---
  async uploadFile(file: File, userId: string, employeeId: string, applyDate: string, sequence: number): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const baseName = `${applyDate}-${employeeId}-${sequence}`;
    let success = false; let counter = 0; let finalPublicUrl = '';
    while (!success && counter < 20) {
      const currentName = counter === 0 ? `${baseName}.${fileExt}` : `${baseName}(${counter}).${fileExt}`;
      const filePath = `${userId}/${currentName}`;
      const { error } = await supabase.storage.from('leave-attachments').upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (error) { if (error.message.includes('already exists') || (error as any).status === 409) { counter++; } else { throw new Error(error.message); } }
      else { const { data: { publicUrl } } = supabase.storage.from('leave-attachments').getPublicUrl(filePath); finalPublicUrl = publicUrl; success = true; }
    }
    if (!success) throw new Error('上傳失敗');
    return finalPublicUrl;
  }

  async deleteFile(url: string) {
    try {
      const bucketName = 'leave-attachments'; const searchStr = `/${bucketName}/`; const index = url.indexOf(searchStr);
      if (index === -1) return; const pathPart = url.substring(index + searchStr.length);
      await supabase.storage.from(bucketName).remove([pathPart]);
    } catch (err) { console.error(err); }
  }

  private sanitizeForDB(req: LeaveRequest) {
    const payload = { ...req } as any;
    if (req.attachmentUrls) payload.attachmentUrl = JSON.stringify(req.attachmentUrls);
    delete payload.attachmentUrls; 
    // 移除 UI 用的 Overtime Check 欄位，避免寫入 leave_requests
    delete payload.actualStartDate; delete payload.actualEndDate;
    delete payload.actualStartTime; delete payload.actualEndTime;
    delete payload.actualDuration; delete payload.isVerified;
    return payload;
  }

  private processFromDB(req: any): LeaveRequest {
    let urls: string[] = [];
    try {
      if (req.attachmentUrl && (req.attachmentUrl.startsWith('[') || req.attachmentUrl.startsWith('{'))) urls = JSON.parse(req.attachmentUrl);
      else if (req.attachmentUrl) urls = [req.attachmentUrl];
    } catch (e) { urls = req.attachmentUrl ? [req.attachmentUrl] : []; }
    return { ...req, attachmentUrls: urls, attachmentUrl: urls[0] || '' };
  }

  async getRequests(): Promise<LeaveRequest[]> {
    const { data, error } = await supabase.from('leave_requests').select('*');
    if (error) throw error; return (data || []).map(r => this.processFromDB(r));
  }

  async createRequest(req: LeaveRequest) { await supabase.from('leave_requests').insert(this.sanitizeForDB(req)); }
  async updateRequest(req: LeaveRequest) { await supabase.from('leave_requests').update(this.sanitizeForDB(req)).eq('id', req.id); }
  async deleteRequest(id: string) { await supabase.from('leave_requests').delete().eq('id', id); }
  async saveRequests(reqs: LeaveRequest[]) { await supabase.from('leave_requests').upsert(reqs.map(r => this.sanitizeForDB(r))); }
  
  // 新增：依日期範圍批次刪除
  async deleteRequestsByRange(startDate: string, endDate: string) {
      console.log(`Deleting requests from ${startDate} to ${endDate}`);
      const { error } = await supabase
          .from('leave_requests')
          .delete()
          .gte('startDate', startDate)
          .lte('startDate', endDate);
      
      if (error) {
          console.error("Batch delete error:", error);
          throw new Error(`批量刪除失敗: ${error.message}`);
      }
  }

  async getUsers(): Promise<User[]> { const { data, error } = await supabase.from('users').select('*'); if (error) throw error; return data as User[]; }
  async getUser(id: string): Promise<User | null> { const { data, error } = await supabase.from('users').select('*').eq('id', id).single(); if (error) return null; return data as User; }
  async createUser(user: User) { await supabase.from('users').insert(user); }
  async updateUser(user: User) { await supabase.from('users').update(user).eq('id', user.id); }
  async saveUsers(users: User[]) { await supabase.from('users').upsert(users); }
  async deleteUser(id: string) { await supabase.from('users').delete().eq('id', id); }

  async getWorkflowConfig(): Promise<WorkflowConfig> { const { data, error } = await supabase.from('workflow_groups').select('*'); if (error) throw error; return data as WorkflowConfig; }
  async saveWorkflowConfig(config: WorkflowConfig) { await supabase.from('workflow_groups').upsert(config); }
  async getLeaveCategories(): Promise<LeaveCategory[]> { const { data, error } = await supabase.from('leave_categories').select('*'); if (error) throw error; return data as LeaveCategory[]; }
  async saveLeaveCategories(cats: LeaveCategory[]) { await supabase.from('leave_categories').upsert(cats); }
  async getWarningRules(): Promise<WarningRule[]> { const { data, error } = await supabase.from('warning_rules').select('*'); if (error) throw error; return data as WarningRule[]; }
  async deleteWarningRule(id: string) { await supabase.from('warning_rules').delete().eq('id', id); }
  async saveWarningRules(rules: WarningRule[]) { await supabase.from('warning_rules').upsert(rules); }
  async getOvertimeRecords(): Promise<OvertimeSettlementRecord[]> { const { data, error } = await supabase.from('overtime_records').select('*'); if (error) throw error; return data as OvertimeSettlementRecord[]; }
  async saveOvertimeRecords(records: OvertimeSettlementRecord[]) { await supabase.from('overtime_records').upsert(records); }

  async getUserWorkflowGroup(userId: string): Promise<WorkflowGroup | null> { const user = await this.getUser(userId); if (!user) return null; const groups = await this.getWorkflowConfig(); return groups.find(g => g.id === user.workflowGroupId) || groups[0] || null; }
  async canAccessTeamStats(currentUser: User): Promise<boolean> { if (currentUser.role === UserRole.ADMIN) return true; const configs = await this.getStatsConfigs(); return configs.some(c => (c.targetValue || c.userId) === currentUser.id); }
  async getStatsConfigs(): Promise<UserStatsConfig[]> { const { data, error } = await supabase.from('user_stats_configs').select('*'); if (error) throw error; return data as UserStatsConfig[]; }
  async saveStatsConfigs(configs: UserStatsConfig[]) { await supabase.from('user_stats_configs').upsert(configs); }
  async getVisibleUsers(currentUser: User): Promise<User[]> { if (currentUser.role === UserRole.ADMIN) return []; const [allUsers, configs] = await Promise.all([this.getUsers(), this.getStatsConfigs()]); const myConf = configs.filter(c => (c.targetValue || c.userId) === currentUser.id); if (myConf.length === 0) return []; const depts = new Set(myConf.flatMap(c => c.allowedDepts || [])); return allUsers.filter(u => u.id !== currentUser.id && (depts.has(u.department))); }
  
  evaluateWarnings(user: User, rules: WarningRule[], allRequests: LeaveRequest[]): ActiveWarning[] {
      const warnings: ActiveWarning[] = []; const approved = allRequests.filter(r => r.userId === user.id && r.status === RequestStatus.APPROVED);
      rules.forEach(rule => {
          let count = 0; approved.filter(r => r.type === rule.targetType).forEach(r => {
              if (!r.isPartialDay) { const s = new Date(r.startDate), e = new Date(r.endDate); count += Math.ceil(Math.abs(e.getTime() - s.getTime()) / 86400000) + 1; }
              else count += 0.5;
          });
          if (count >= rule.threshold) { warnings.push({ ruleId: rule.id, ruleName: rule.name, message: rule.message, color: rule.color, currentValue: count }); }
      });
      return warnings;
  }
  async checkTimeOverlap(userId: string, start: string, end: string, sTime?: string, eTime?: string, isPartial?: boolean, excludeId?: string) {
      const requests = await this.getRequests(); const overlap = requests.find(r => r.userId === userId && r.id !== excludeId && r.status !== RequestStatus.REJECTED && r.status !== RequestStatus.CANCELLED && (start <= r.endDate && end >= r.startDate));
      return { overlap: !!overlap, conflictingRequest: overlap };
  }
}

export const db = new SupabaseDB();
