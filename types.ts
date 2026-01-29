
export enum UserRole {
  ADMIN = 'ADMIN',
  CHAIRMAN = 'CHAIRMAN',
  GM = 'GM',
  VP = 'VP',
  MGR_DEPT = 'MGR_DEPT',
  MGR_SECT = 'MGR_SECT',
  LEADER = 'LEADER',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE'
}

export enum Gender {
  MALE = '男',
  FEMALE = '女'
}

export enum GenderRestriction {
  ALL = '無限制',
  MALE_ONLY = '限男性',
  FEMALE_ONLY = '限女性'
}

export interface LeaveCategory {
  id: string;
  name: string;
  allowedGender: GenderRestriction;
  isSystemDefault?: boolean;
}

export enum LeaveType {
  ANNUAL = '特休',
  SICK = '病假',
  PERSONAL = '事假',
  MENSTRUAL = '生理假',
  BEREAVEMENT = '喪假',
  OFFICIAL = '公假',
  OVERTIME = '加班申請',
  COMPENSATORY = '抵休'
}

export enum RequestStatus {
  DRAFT = '草稿',
  IN_PROCESS = '簽核中', 
  PENDING_L1 = '待課級主管簽核',
  PENDING_L2 = '待部級主管簽核',
  PENDING_L3 = '待副總簽核',
  PENDING_L4 = '待總經理簽核',
  APPROVED = '已核准',
  REJECTED = '已駁回',
  CANCELLED = '已取消'
}

export interface UserQuota {
  annual: Record<number, number>;
  overtime: number; 
}

export interface UserUsage {
  annual: Record<number, number>;
  sick: number;
  personal: number;
  menstrual: number;
}

export interface User {
  id: string;
  employeeId: string;
  username: string;
  name: string;
  gender: Gender;
  role: UserRole;
  password?: string; 
  department: string;
  jobTitle: string;
  quota: UserQuota;
  usedQuota: UserUsage;
  isFirstLogin: boolean;
  workflowGroupId?: string;
  enableDeputy?: boolean;
  canReviewOvertime?: boolean;
}

export interface WorkflowStep {
  id: string;
  level: number;
  label: string;
  approverIds: string[];
}

export interface JobTitleRule {
  jobTitle: string;
  maxLevel: number;
}

export interface WorkflowGroup {
  id: string;
  name: string;
  steps: WorkflowStep[];
  titleRules: JobTitleRule[];
}

export type WorkflowConfig = WorkflowGroup[];

export interface UserStatsConfig {
  id: string;
  targetType: 'USER' | 'DEPT' | 'ROLE' | 'JOB_TITLE';
  targetValue: string;
  userId?: string; 
  allowedDepts: string[]; 
  allowedRoles: UserRole[];
  allowedTitles: string[];
}

export type WarningOperator = '>' | '>=' | '<' | '<=';

// Updated TimeWindowType for more flexibility
export type TimeWindowType = 
  | 'ALL_TIME'          // 不限時間 (總累積)
  | 'LAST_N_DAYS'       // 從今天起往回推算 N 天
  | 'FROM_DATE_N_DAYS'  // 從特定日期往後推算 N 天
  | 'FIXED_RANGE';      // 特定區間 (起訖日期)

export interface WarningRule {
  id: string;
  name: string;
  targetType: string; // LeaveCategory Name
  operator: WarningOperator;
  threshold: number; // Cumulative days
  
  timeWindow: TimeWindowType;
  // Specific params for time window
  daysCount?: number;   // For LAST_N_DAYS and FROM_DATE_N_DAYS
  startDate?: string;   // For FROM_DATE_N_DAYS and FIXED_RANGE
  endDate?: string;     // For FIXED_RANGE

  message: string;
  color: 'yellow' | 'red';
}

export interface ActiveWarning {
  ruleId: string;
  ruleName: string;
  message: string;
  color: 'yellow' | 'red';
  currentValue: number;
}

export interface AuthSignature {
    name: string;
    role: string;
    timestamp: string;
}

export interface OvertimeSettlementRecord {
  id: string;
  userId: string;
  year: number;
  month: number;
  appliedHours: number;
  actualHours: number;
  paidHours: number;
  remainingHours: number;
  settledAt: string;
  settledBy: string;
  baseAuth?: AuthSignature;
  payAuth?: AuthSignature;
}

// 新增：加班核對明細紀錄 (對應 overtime_check)
export interface OvertimeCheck {
  id: string;
  requestId: string;
  userId: string;
  year: number;
  month: number;
  actualStartDate: string;
  actualEndDate: string;
  actualStartTime: string;
  actualEndTime: string;
  actualDuration: number;
  isVerified: boolean;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  isPartialDay: boolean;
  startTime?: string;
  endTime?: string;
  reason: string;
  deputy?: string;
  attachmentUrl?: string;
  attachmentUrls?: string[];
  status: RequestStatus;
  createdAt: string;
  logs: ApprovalLog[];
  isCancellationRequest?: boolean;
  currentStep: number;
  stepApprovedBy: string[];
  totalSteps: number;
  // 這些欄位保留作為前端 UI 顯示使用，實際儲存位置改為 overtime_check
  actualStartDate?: string;
  actualEndDate?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDuration?: number;
  isVerified?: boolean;
}

export interface ApprovalLog {
  approverId: string;
  approverName: string;
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'UPDATE';
  timestamp: string;
  comment?: string;
}
