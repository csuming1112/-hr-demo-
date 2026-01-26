
import { UserRole, RequestStatus } from "./types";

export const APPROVAL_HIERARCHY = {
  [UserRole.LEADER]: 1,
  [UserRole.MGR_SECT]: 2,
  [UserRole.MGR_DEPT]: 3,
  [UserRole.VP]: 4,
  [UserRole.GM]: 5,
  [UserRole.CHAIRMAN]: 6,
};

// Numerical rank for comparison (Higher number = Higher Rank)
export const ROLE_RANK: Record<string, number> = {
  [UserRole.ADMIN]: 99,
  [UserRole.HR]: 90, // HR has high system rank but specific workflow role
  [UserRole.CHAIRMAN]: 6,
  [UserRole.GM]: 5,
  [UserRole.VP]: 4,
  [UserRole.MGR_DEPT]: 3,
  [UserRole.MGR_SECT]: 2,
  [UserRole.LEADER]: 1,
  [UserRole.EMPLOYEE]: 0
};

// Maps the current status to the Role that needs to approve it next
// Note: This is legacy for static views, dynamic logic will override this in Approvals.tsx
export const NEXT_APPROVER_ROLE = {
  [RequestStatus.PENDING_L1]: UserRole.MGR_SECT,
  [RequestStatus.PENDING_L2]: UserRole.MGR_DEPT,
  [RequestStatus.PENDING_L3]: UserRole.VP,
  [RequestStatus.PENDING_L4]: UserRole.GM,
};

export const ROLE_LABELS = {
  [UserRole.ADMIN]: '系統管理員',
  [UserRole.HR]: '人事管理員',
  [UserRole.CHAIRMAN]: '董事長',
  [UserRole.GM]: '總經理',
  [UserRole.VP]: '副總經理',
  [UserRole.MGR_DEPT]: '部級主管',
  [UserRole.MGR_SECT]: '課級主管',
  [UserRole.LEADER]: '組長',
  [UserRole.EMPLOYEE]: '一般員工'
};
