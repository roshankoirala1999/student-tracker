import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireDb, csrfProtection, requireAuth, requireTeacher, requireMasterAdmin, verifyClassOwnership, verifySectionOwnership } from './middleware.ts';
import { isDatabaseConnected } from './db.ts';

import * as authCtrl from './controllers/authController.ts';
import * as classCtrl from './controllers/classController.ts';
import * as studentCtrl from './controllers/studentController.ts';
import * as assessCtrl from './controllers/assessmentController.ts';
import * as marksCtrl from './controllers/marksController.ts';
import * as attendCtrl from './controllers/attendanceController.ts';
import * as adminCtrl from './controllers/adminController.ts';

const api = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

// Enforce JWT_SECRET configuration check: if missing or shorter than 32 characters, return HTTP 503 {error:'CONFIG_ERROR', message: 'Server is not configured correctly. Contact the administrator.'}
api.use((req, res, next) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: 'CONFIG_ERROR', message: 'Server is not configured correctly. Contact the administrator.' });
  }
  next();
});

// 1. Health & Connection Status (public, does not require DB to respond)
api.get('/health', (req, res) => {
  const connected = isDatabaseConnected();
  return res.json({
    status: 'ok',
    database: {
      connected,
    },
  });
});

// 2. Auth Endpoints
api.get('/auth/csrf', authCtrl.getCsrfToken);
api.get('/auth/admin-setup-status', requireDb, authCtrl.getAdminSetupStatus);
api.post('/auth/register', authLimiter, requireDb, authCtrl.registerTeacher);
api.post('/auth/register-admin', authLimiter, requireDb, authCtrl.registerMasterAdmin);
api.post('/auth/login', authLimiter, requireDb, authCtrl.login);

api.use(csrfProtection);

api.post('/auth/logout', authCtrl.logout);
api.get('/auth/me', requireDb, requireAuth, authCtrl.getMe);
api.patch('/auth/profile', requireDb, requireAuth, requireTeacher, authCtrl.updateTeacherProfile);
api.post('/auth/change-password', authLimiter, requireDb, requireAuth, authCtrl.changePassword);
api.post('/auth/delete-account', requireDb, requireAuth, authCtrl.deleteAccount);

// Profile Questions (Accessible for all authenticated users to read, Master Admin to manage)
api.get('/profile-questions', requireDb, requireAuth, authCtrl.listProfileQuestions);
api.post('/profile-questions', requireDb, requireAuth, requireMasterAdmin, authCtrl.createProfileQuestion);
api.put('/profile-questions/reorder', requireDb, requireAuth, requireMasterAdmin, authCtrl.reorderProfileQuestions);
api.delete('/profile-questions/:id', requireDb, requireAuth, requireMasterAdmin, authCtrl.deleteProfileQuestion);

// From here down: All endpoints require active DB connection and authentication
api.use(requireDb);
api.use(requireAuth);

// 3. Classes
api.get('/classes', classCtrl.listClasses);
api.post('/classes', requireTeacher, classCtrl.createClass);
api.put('/classes/reorder', requireTeacher, classCtrl.reorderClasses);
api.patch('/classes/:classId/rename', requireTeacher, verifyClassOwnership, classCtrl.renameClass);
api.delete('/classes/:classId', requireTeacher, verifyClassOwnership, classCtrl.deleteClass); // Sensitive: requires password
api.patch('/classes/:classId/attendance', requireTeacher, verifyClassOwnership, classCtrl.toggleAttendance);

// 4. Sections
api.get('/classes/:classId/sections', verifyClassOwnership, classCtrl.listSections);
api.post('/classes/:classId/sections', requireTeacher, verifyClassOwnership, classCtrl.addSection); // Sensitive: requires password
api.delete('/classes/:classId/sections/:sectionId', requireTeacher, verifyClassOwnership, classCtrl.deleteSection); // Sensitive: requires password

// 5. Assessments (Class-scoped)
api.get('/classes/:classId/examinations', verifyClassOwnership, assessCtrl.listExaminations);
api.post('/classes/:classId/examinations', requireTeacher, verifyClassOwnership, assessCtrl.createExamination);

api.get('/classes/:classId/assignments', verifyClassOwnership, assessCtrl.listAssignments);
api.post('/classes/:classId/assignments', requireTeacher, verifyClassOwnership, assessCtrl.createAssignment);

api.patch('/classes/:classId/assessments/:type/:id', requireTeacher, verifyClassOwnership, assessCtrl.updateAssessment);
api.delete('/classes/:classId/assessments/:type/:id', requireTeacher, verifyClassOwnership, assessCtrl.deleteAssessment);

// 6. Students
api.get('/classes/:classId/students', verifyClassOwnership, studentCtrl.listClassStudents);
api.get('/sections/:sectionId/students', verifySectionOwnership, studentCtrl.listStudents);
api.post('/sections/:sectionId/students', requireTeacher, verifySectionOwnership, studentCtrl.createStudent);
api.put('/students/:studentId', requireTeacher, studentCtrl.updateStudent);
api.delete('/students/:studentId', requireTeacher, studentCtrl.deleteStudent); // Sensitive: requires password
api.get('/students/:studentId/record', studentCtrl.getStudentRecord);

// 6b. Students CSV & Roster (Student Info)
api.get('/sections/:sectionId/students/csv-template', verifySectionOwnership, marksCtrl.exportStudentRosterCsv);
api.post('/sections/:sectionId/students/csv-import', requireTeacher, verifySectionOwnership, marksCtrl.importStudentRosterCsv);
api.get('/sections/:sectionId/students/excel/export', verifySectionOwnership, marksCtrl.exportStudentRosterExcel);
api.post('/sections/:sectionId/students/excel/import', requireTeacher, verifySectionOwnership, marksCtrl.importStudentRosterExcel);

// 7. Marks CSV & Dynamic Grid
api.get('/sections/:sectionId/marks', verifySectionOwnership, marksCtrl.getSectionMarksMatrix);
api.post('/sections/:sectionId/marks/single', requireTeacher, verifySectionOwnership, marksCtrl.updateSingleMark);
api.get('/sections/:sectionId/marks/csv-template', verifySectionOwnership, marksCtrl.exportMarksCsv);
api.post('/sections/:sectionId/marks/csv-import', requireTeacher, verifySectionOwnership, marksCtrl.importMarksCsv);
api.get('/sections/:sectionId/excel/sample', verifySectionOwnership, marksCtrl.exportSampleExcel);
api.post('/sections/:sectionId/excel/import', requireTeacher, verifySectionOwnership, marksCtrl.importMarksExcel);

// 8. Attendance
api.get('/classes/:classId/attendance/download-csv', verifyClassOwnership, attendCtrl.downloadAttendanceCsv);
api.get('/sections/:sectionId/attendance/download-csv', verifySectionOwnership, attendCtrl.downloadSectionAttendanceCsv);
api.get('/sections/:sectionId/attendance', verifySectionOwnership, attendCtrl.getAttendanceMetaAndHistory);
api.post('/sections/:sectionId/attendance', requireTeacher, verifySectionOwnership, attendCtrl.submitDailyAttendance);
api.get('/attendance/:attendanceId', attendCtrl.getHistoricalDay);
api.put('/attendance/:attendanceId', requireTeacher, attendCtrl.updateHistoricalAttendance);

// 9. Master Admin
api.get('/admin/teachers', requireMasterAdmin, adminCtrl.listAllTeachers);
api.get('/admin/teachers/:teacherId/inspect', requireMasterAdmin, adminCtrl.inspectTeacherData);
api.get('/admin/teachers/:teacherId/export', requireMasterAdmin, adminCtrl.exportTeacherData);
api.patch('/admin/teachers/:teacherId/status', requireMasterAdmin, adminCtrl.updateTeacherStatus);
api.patch('/admin/teachers/:teacherId/profile', requireMasterAdmin, adminCtrl.updateTeacherProfileByAdmin);
api.patch('/admin/teachers/:teacherId/expiry', requireMasterAdmin, adminCtrl.updateTeacherExpiry);
api.patch('/admin/teachers/:teacherId/lock-deletion', requireMasterAdmin, adminCtrl.updateTeacherDeletionLock);
api.patch('/admin/teachers/:teacherId/deletion-lock', requireMasterAdmin, adminCtrl.updateTeacherDeletionLock);
api.patch('/admin/teachers/:teacherId/password', requireMasterAdmin, adminCtrl.editTeacherPassword);
api.post('/admin/teachers/:teacherId/reset-password', requireMasterAdmin, adminCtrl.resetTeacherPassword);
api.delete('/admin/teachers/:teacherId', requireMasterAdmin, adminCtrl.deleteTeacher);

// New User Default Settings
api.get('/admin/new-user-defaults', requireMasterAdmin, adminCtrl.getNewUserDefaults);
api.put('/admin/new-user-defaults', requireMasterAdmin, adminCtrl.updateNewUserDefaults);

// Developer Contact Info
api.get('/developer-contact', adminCtrl.getDeveloperContact);
api.put('/admin/developer-contact', requireMasterAdmin, adminCtrl.updateDeveloperContact);

// Notifications (Admin -> Teacher)
api.get('/notifications', adminCtrl.getTeacherNotifications);
api.patch('/notifications/read', adminCtrl.markNotificationsRead);
api.get('/admin/teachers/:teacherId/notifications', requireMasterAdmin, adminCtrl.getAdminTeacherNotifications);
api.post('/admin/teachers/:teacherId/notifications', requireMasterAdmin, adminCtrl.sendTeacherNotification);
api.delete('/admin/notifications/:notificationId', requireMasterAdmin, adminCtrl.deleteAdminNotification);

// Institutional Profile Questions (Admin)
api.get('/admin/profile-questions', requireMasterAdmin, authCtrl.listProfileQuestions);
api.post('/admin/profile-questions', requireMasterAdmin, authCtrl.createProfileQuestion);
api.put('/admin/profile-questions/reorder', requireMasterAdmin, authCtrl.reorderProfileQuestions);
api.delete('/admin/profile-questions/:id', requireMasterAdmin, authCtrl.deleteProfileQuestion);

export default api;
