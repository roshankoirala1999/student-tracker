export type UserRole = 'teacher' | 'administrator' | 'master_admin';
export type UserStatus = 'active' | 'suspended';

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  tokenVersion?: number;
  createdAt: string;
}

export interface TeacherItem {
  id: string;
  username: string;
  role: string;
  status: 'active' | 'suspended';
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  classCount: number;
  studentCount: number;
}

export interface ClassItem {
  id: string;
  teacherId: string;
  name: string;
  attendanceEnabled: boolean;
  createdAt: string;
}

export interface SectionItem {
  id: string;
  teacherId: string;
  classId: string;
  name: string;
  order: number;
  studentCount?: number;
  createdAt: string;
}

export interface StudentItem {
  id: string;
  teacherId: string;
  classId: string;
  sectionId: string;
  rollNumber: number;
  studentName: string;
  symbolNumber: string;
  contactNumber: string;
  parentContact?: string;
  createdAt: string;
}

export interface AssignmentItem {
  id: string;
  teacherId: string;
  classId: string;
  name: string;
  maxMarks: number;
  createdAt: string;
}

export interface ExaminationItem {
  id: string;
  teacherId: string;
  classId: string;
  name: string;
  maxMarks: number;
  createdAt: string;
}

export interface MarkItem {
  id: string;
  teacherId: string;
  classId: string;
  sectionId: string;
  studentId: string;
  itemType: 'assignment' | 'examination';
  itemId: string;
  marksObtained: number | null;
  updatedAt: string;
}

export interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent';
}

export interface AttendanceItem {
  id: string;
  teacherId: string;
  classId: string;
  sectionId: string;
  dayNumber: number;
  submissionDate: string; // YYYY-MM-DD
  records: AttendanceRecord[];
  lastModifiedAt?: string;
  createdAt: string;
}

export interface StudentProfileData {
  student: StudentItem;
  className: string;
  sectionName: string;
  assignments: Array<{
    id: string;
    name: string;
    maxMarks: number;
    score: number | null;
  }>;
  examinations: Array<{
    id: string;
    name: string;
    maxMarks: number;
    score: number | null;
  }>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: string[];
  totalCount?: number;
  maxLimit?: number;
}
