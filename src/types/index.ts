export type UserRole = 'teacher' | 'administrator' | 'master_admin';
export type UserStatus = 'active' | 'suspended';

export interface ProfileQuestion {
  id: string;
  questionLabel?: string;
  questionText?: string;
  required?: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string;
  college?: string;
  dob?: string;
  customFields?: Record<string, string>;
  role: UserRole;
  status: UserStatus;
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  tokenVersion?: number;
  expiryMode?: boolean;
  expiresAt?: string;
  isExpired?: boolean;
  daysRemaining?: number;
  createdAt: string;
  fullNameLocked?: boolean;
  isReadOnly?: boolean;
  readOnlyReason?: 'expired' | 'admin_locked' | null;
  missingFields?: string[];
}

export interface TeacherItem {
  id: string;
  username: string;
  fullName?: string;
  phoneNumber?: string;
  college?: string;
  dob?: string;
  customFields?: Record<string, string>;
  role: string;
  status: 'active' | 'suspended';
  isReadOnly?: boolean;
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  fullNameLocked?: boolean;
  expiryMode?: boolean;
  expiresAt?: string;
  isExpired?: boolean;
  daysRemaining?: number;
  createdAt: string;
  classCount: number;
  studentCount: number;
}

export interface DeveloperContact {
  name: string;
  phone: string;
  address: string;
  email: string;
}

export interface NewUserDefaults {
  expiryMode: boolean;
  canDeleteAccount: boolean;
  allowAccountDeletion?: boolean;
}

export interface NotificationItem {
  id: string;
  teacherId?: string;
  message: string;
  read?: boolean;
  isRead?: boolean;
  createdAt: string;
  adminUsername?: string;
}

export interface ClassItem {
  id: string;
  teacherId: string;
  name: string;
  order: number;
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
  sectionName?: string;
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

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderFullName?: string;
  senderRole: string;
  recipientId: string;
  recipientUsername: string;
  recipientFullName?: string;
  recipientRole: string;
  message: string;
  read: boolean;
  createdAt: string;
  isMine: boolean;
}

export interface ConversationItem {
  conversationId: string;
  participantId: string;
  participantUsername: string;
  participantFullName?: string;
  participantRole: string;
  participantPhoneNumber?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface TeacherSearchItem {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string;
  role?: string;
}

