import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { comparePassword } from '../auth.ts';

const MAX_STUDENTS_PER_SECTION = 100;

export async function listStudents(req: Request, res: Response) {
  const { sectionId } = req.params;
  const search = req.query.search as string | undefined;

  try {
    const db = getDatabase();
    const query: any = { sectionId };

    if (search && search.trim() !== '') {
      const capped = search.trim().slice(0, 50);
      const escaped = capped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { studentName: regex },
        { symbolNumber: regex },
        { rollNumber: !isNaN(Number(capped)) ? Number(capped) : -999999 },
      ];
    }

    const students = await db.collection('students')
      .find(query)
      .sort({ rollNumber: 1 })
      .toArray();

    const totalCount = await db.collection('students').countDocuments({ sectionId });

    const formatted = students.map((s) => ({
      id: s._id.toString(),
      teacherId: s.teacherId,
      classId: s.classId,
      sectionId: s.sectionId,
      rollNumber: s.rollNumber,
      studentName: s.studentName,
      symbolNumber: s.symbolNumber,
      contactNumber: s.contactNumber || s.parentContact || '',
      parentContact: s.contactNumber || s.parentContact || '',
      createdAt: s.createdAt,
    }));

    return res.json({
      success: true,
      data: formatted,
      totalCount,
      maxLimit: MAX_STUDENTS_PER_SECTION,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function createStudent(req: Request, res: Response) {
  const { sectionId } = req.params;
  const { rollNumber, studentName, symbolNumber, contactNumber, parentContact } = req.body;

  if (rollNumber === undefined || rollNumber === null) {
    return res.status(400).json({ success: false, message: 'Please provide a valid numeric Roll Number.' });
  }

  const rollNum = Number(rollNumber);
  if (!Number.isInteger(rollNum) || rollNum <= 0) {
    return res.status(400).json({ success: false, message: 'Roll Number must be a positive integer.' });
  }

  if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') {
    return res.status(400).json({ success: false, message: 'Student Name is required.' });
  }
  if (studentName.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Student Name cannot exceed 100 characters.' });
  }

  if (!symbolNumber || typeof symbolNumber !== 'string' || symbolNumber.trim() === '') {
    return res.status(400).json({ success: false, message: 'Symbol Number is required.' });
  }
  if (symbolNumber.trim().length > 30) {
    return res.status(400).json({ success: false, message: 'Symbol Number cannot exceed 30 characters.' });
  }

  const phone = (contactNumber || parentContact || '').trim();
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Contact Number is required.' });
  }
  if (phone.length > 20) {
    return res.status(400).json({ success: false, message: 'Contact Number cannot exceed 20 characters.' });
  }

  try {
    const db = getDatabase();

    // 1. Strict limit verification: Max 100 students per section
    const currentCount = await db.collection('students').countDocuments({ sectionId });
    if (currentCount >= MAX_STUDENTS_PER_SECTION) {
      return res.status(400).json({
        success: false,
        error: 'SECTION_LIMIT_REACHED',
        message: 'You have reached the maximum of 100 students in this section.',
      });
    }

    // 2. Uniqueness check for Roll Number in section
    const existingRoll = await db.collection('students').findOne({ sectionId, rollNumber: rollNum });
    if (existingRoll) {
      return res.status(409).json({
        success: false,
        message: `A student with Roll Number ${rollNum} already exists in this section.`,
      });
    }

    // 3. Uniqueness check for Symbol Number in section
    const cleanSymbol = symbolNumber.trim();
    const existingSymbol = await db.collection('students').findOne({ sectionId, symbolNumber: cleanSymbol });
    if (existingSymbol) {
      return res.status(409).json({
        success: false,
        message: `A student with Symbol Number "${cleanSymbol}" already exists in this section.`,
      });
    }

    // Get parent section to extract classId
    const sectionDoc = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!sectionDoc) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    const now = new Date().toISOString();
    const insertResult = await db.collection('students').insertOne({
      teacherId: sectionDoc.teacherId,
      classId: sectionDoc.classId,
      sectionId,
      rollNumber: rollNum,
      studentName: studentName.trim(),
      symbolNumber: cleanSymbol,
      contactNumber: phone,
      parentContact: phone,
      createdAt: now,
    });

    // Post-Insert Recount
    const countAfter = await db.collection('students').countDocuments({ sectionId });
    if (countAfter > MAX_STUDENTS_PER_SECTION) {
      await db.collection('students').deleteOne({ _id: insertResult.insertedId });
      return res.status(400).json({
        success: false,
        error: 'SECTION_LIMIT_REACHED',
        message: 'You have reached the maximum of 100 students in this section.',
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: insertResult.insertedId.toString(),
        teacherId: sectionDoc.teacherId,
        classId: sectionDoc.classId,
        sectionId,
        rollNumber: rollNum,
        studentName: studentName.trim(),
        symbolNumber: cleanSymbol,
        contactNumber: phone,
        parentContact: phone,
        createdAt: now,
      },
      message: 'Student added successfully.',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateStudent(req: Request, res: Response) {
  const { studentId } = req.params;
  const { rollNumber, studentName, symbolNumber, contactNumber, parentContact } = req.body;

  if (!studentId || !ObjectId.isValid(studentId)) {
    return res.status(400).json({ success: false, message: 'Invalid Student ID.' });
  }

  if (rollNumber !== undefined && rollNumber !== null) {
    const rollNum = Number(rollNumber);
    if (!Number.isInteger(rollNum) || rollNum <= 0) {
      return res.status(400).json({ success: false, message: 'Roll Number must be a positive integer.' });
    }
  }

  if (studentName !== undefined) {
    if (typeof studentName !== 'string' || studentName.trim() === '') {
      return res.status(400).json({ success: false, message: 'Student Name is required.' });
    }
    if (studentName.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Student Name cannot exceed 100 characters.' });
    }
  }

  if (symbolNumber !== undefined) {
    if (typeof symbolNumber !== 'string' || symbolNumber.trim() === '') {
      return res.status(400).json({ success: false, message: 'Symbol Number is required.' });
    }
    if (symbolNumber.trim().length > 30) {
      return res.status(400).json({ success: false, message: 'Symbol Number cannot exceed 30 characters.' });
    }
  }

  if (contactNumber !== undefined || parentContact !== undefined) {
    const phone = (contactNumber || parentContact || '').trim();
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Contact Number is required.' });
    }
    if (phone.length > 20) {
      return res.status(400).json({ success: false, message: 'Contact Number cannot exceed 20 characters.' });
    }
  }

  try {
    const db = getDatabase();
    const student = await db.collection('students').findOne({ _id: new ObjectId(studentId) });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (student.teacherId !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this student.' });
    }

    const updateFields: any = {};

    if (rollNumber !== undefined && rollNumber !== null) {
      const rollNum = Number(rollNumber);
      if (rollNum !== student.rollNumber) {
        // Check if new roll number is taken in this section
        const conflict = await db.collection('students').findOne({
          sectionId: student.sectionId,
          rollNumber: rollNum,
          _id: { $ne: student._id },
        });
        if (conflict) {
          return res.status(409).json({ success: false, message: `Roll Number ${rollNum} is already assigned to another student in this section.` });
        }
        updateFields.rollNumber = rollNum;
      }
    }

    if (studentName !== undefined) {
      updateFields.studentName = studentName.trim();
    }
    if (symbolNumber !== undefined) {
      const cleanSymbol = symbolNumber.trim();
      if (cleanSymbol !== student.symbolNumber) {
        const conflictSym = await db.collection('students').findOne({
          sectionId: student.sectionId,
          symbolNumber: cleanSymbol,
          _id: { $ne: student._id },
        });
        if (conflictSym) {
          return res.status(409).json({ success: false, message: `Symbol Number "${cleanSymbol}" is already assigned to another student in this section.` });
        }
        updateFields.symbolNumber = cleanSymbol;
      }
    }
    if (contactNumber !== undefined || parentContact !== undefined) {
      const phone = (contactNumber || parentContact || '').trim();
      updateFields.contactNumber = phone;
      updateFields.parentContact = phone;
    }

    await db.collection('students').updateOne(
      { _id: new ObjectId(studentId) },
      { $set: updateFields }
    );

    return res.json({ success: true, message: 'Student information updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function deleteStudent(req: Request, res: Response) {
  const { studentId } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required to delete a student.' });
  }

  if (!studentId || !ObjectId.isValid(studentId)) {
    return res.status(400).json({ success: false, message: 'Invalid Student ID.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'Incorrect password. Student was not deleted.' });
    }

    const student = await db.collection('students').findOne({ _id: new ObjectId(studentId) });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (student.teacherId !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this student.' });
    }

    // Delete student, student's marks, and remove student from attendance records
    await Promise.all([
      db.collection('marks').deleteMany({ studentId }),
      db.collection('attendance').updateMany(
        { sectionId: student.sectionId },
        { $pull: { records: { studentId } } } as any
      ),
      db.collection('students').deleteOne({ _id: new ObjectId(studentId) }),
    ]);

    return res.json({ success: true, message: 'Student deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function getStudentRecord(req: Request, res: Response) {
  const { studentId } = req.params;

  if (!studentId || !ObjectId.isValid(studentId)) {
    return res.status(400).json({ success: false, message: 'Invalid Student ID.' });
  }

  try {
    const db = getDatabase();
    const student = await db.collection('students').findOne({ _id: new ObjectId(studentId) });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (student.teacherId !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to view this student.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(student.classId) });
    const sectionDoc = await db.collection('sections').findOne({ _id: new ObjectId(student.sectionId) });

    const classId = student.classId;

    // Fetch dynamic assignments and examinations for this class
    const assignments = await db.collection('assignments')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const examinations = await db.collection('examinations')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    // Fetch student marks
    const marks = await db.collection('marks').find({ studentId }).toArray();
    const marksMap = new Map<string, number | null>();
    marks.forEach((m) => {
      marksMap.set(m.itemId, m.marksObtained);
    });

    const assignmentScores = assignments.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      maxMarks: a.maxMarks,
      score: marksMap.has(a._id.toString()) ? marksMap.get(a._id.toString())! : null,
    }));

    const examinationScores = examinations.map((e) => ({
      id: e._id.toString(),
      name: e.name,
      maxMarks: e.maxMarks,
      score: marksMap.has(e._id.toString()) ? marksMap.get(e._id.toString())! : null,
    }));

    return res.json({
      success: true,
      data: {
        student: {
          id: student._id.toString(),
          teacherId: student.teacherId,
          classId: student.classId,
          sectionId: student.sectionId,
          rollNumber: student.rollNumber,
          studentName: student.studentName,
          symbolNumber: student.symbolNumber,
          contactNumber: student.contactNumber || student.parentContact || '',
          parentContact: student.contactNumber || student.parentContact || '',
          createdAt: student.createdAt,
        },
        className: classDoc ? classDoc.name : 'Unknown Class',
        sectionName: sectionDoc ? sectionDoc.name : 'Unknown Section',
        assignments: assignmentScores,
        examinations: examinationScores,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
