import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { comparePassword } from '../auth.ts';

function getCollectionName(type: string): 'examinations' | 'assignments' | null {
  if (type === 'examination' || type === 'examinations') return 'examinations';
  if (type === 'assignment' || type === 'assignments') return 'assignments';
  return null;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// EXAMINATIONS
export async function listExaminations(req: Request, res: Response) {
  const { classId } = req.params;

  try {
    const db = getDatabase();
    const exams = await db.collection('examinations')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const formatted = exams.map((e) => ({
      id: e._id.toString(),
      teacherId: e.teacherId,
      classId: e.classId,
      name: e.name,
      maxMarks: e.maxMarks,
      createdAt: e.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function createExamination(req: Request, res: Response) {
  const { classId } = req.params;
  const { name, maxMarks } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Examination name is required.' });
  }

  const numericMax = Number(maxMarks);
  if (isNaN(numericMax) || !isFinite(numericMax) || numericMax <= 0 || numericMax > 10000) {
    return res.status(400).json({ success: false, message: 'Maximum Marks must be a number between 1 and 10000.' });
  }

  try {
    const db = getDatabase();
    const cleanName = name.trim();
    const nameRegex = new RegExp(`^${escapeRegExp(cleanName)}$`, 'i');

    // Unified name uniqueness across both examinations and assignments
    const [existingExam, existingAssign] = await Promise.all([
      db.collection('examinations').findOne({ classId, name: { $regex: nameRegex } }),
      db.collection('assignments').findOne({ classId, name: { $regex: nameRegex } }),
    ]);

    if (existingExam || existingAssign) {
      return res.status(409).json({
        success: false,
        message: `An assessment named "${cleanName}" already exists in this class.`,
      });
    }

    const now = new Date().toISOString();
    const result = await db.collection('examinations').insertOne({
      teacherId: req.user!.userId,
      classId,
      name: cleanName,
      maxMarks: numericMax,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        teacherId: req.user!.userId,
        classId,
        name: cleanName,
        maxMarks: numericMax,
        createdAt: now,
      },
      message: `Examination "${cleanName}" created successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

// ASSIGNMENTS
export async function listAssignments(req: Request, res: Response) {
  const { classId } = req.params;

  try {
    const db = getDatabase();
    const assignments = await db.collection('assignments')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const formatted = assignments.map((a) => ({
      id: a._id.toString(),
      teacherId: a.teacherId,
      classId: a.classId,
      name: a.name,
      maxMarks: a.maxMarks,
      createdAt: a.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function createAssignment(req: Request, res: Response) {
  const { classId } = req.params;
  const { name, maxMarks } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Assignment name is required.' });
  }

  const numericMax = Number(maxMarks);
  if (isNaN(numericMax) || !isFinite(numericMax) || numericMax <= 0 || numericMax > 10000) {
    return res.status(400).json({ success: false, message: 'Maximum Marks must be a number between 1 and 10000.' });
  }

  try {
    const db = getDatabase();
    const cleanName = name.trim();
    const nameRegex = new RegExp(`^${escapeRegExp(cleanName)}$`, 'i');

    // Unified name uniqueness across both examinations and assignments
    const [existingExam, existingAssign] = await Promise.all([
      db.collection('examinations').findOne({ classId, name: { $regex: nameRegex } }),
      db.collection('assignments').findOne({ classId, name: { $regex: nameRegex } }),
    ]);

    if (existingExam || existingAssign) {
      return res.status(409).json({
        success: false,
        message: `An assessment named "${cleanName}" already exists in this class.`,
      });
    }

    const now = new Date().toISOString();
    const result = await db.collection('assignments').insertOne({
      teacherId: req.user!.userId,
      classId,
      name: cleanName,
      maxMarks: numericMax,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        teacherId: req.user!.userId,
        classId,
        name: cleanName,
        maxMarks: numericMax,
        createdAt: now,
      },
      message: `Assignment "${cleanName}" created successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateAssessment(req: Request, res: Response) {
  const { classId, type, id } = req.params;
  const { name, maxMarks } = req.body;

  const collectionName = getCollectionName(type);
  if (!collectionName) {
    return res.status(400).json({ success: false, message: 'Invalid assessment type. Must be assignment or examination.' });
  }

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Assessment ID.' });
  }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Assessment name is required.' });
  }

  const numericMax = Number(maxMarks);
  if (isNaN(numericMax) || !isFinite(numericMax) || numericMax <= 0 || numericMax > 10000) {
    return res.status(400).json({ success: false, message: 'Maximum Marks must be a number between 1 and 10000.' });
  }

  try {
    const db = getDatabase();
    const assessmentObjId = new ObjectId(id);

    const existing = await db.collection(collectionName).findOne({ _id: assessmentObjId, classId });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    const cleanName = name.trim();
    const nameRegex = new RegExp(`^${escapeRegExp(cleanName)}$`, 'i');

    const [conflictExam, conflictAssign] = await Promise.all([
      db.collection('examinations').findOne({
        classId,
        _id: { $ne: assessmentObjId },
        name: { $regex: nameRegex },
      }),
      db.collection('assignments').findOne({
        classId,
        _id: { $ne: assessmentObjId },
        name: { $regex: nameRegex },
      }),
    ]);

    if (conflictExam || conflictAssign) {
      return res.status(409).json({
        success: false,
        message: `An assessment named "${cleanName}" already exists in this class.`,
      });
    }

    const countViolations = await db.collection('marks').countDocuments({
      itemId: id,
      marksObtained: { $gt: numericMax },
    });

    if (countViolations > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot lower maximum marks to ${numericMax}. ${countViolations} student(s) already have a higher score.`,
      });
    }

    await db.collection(collectionName).updateOne(
      { _id: assessmentObjId },
      {
        $set: {
          name: cleanName,
          maxMarks: numericMax,
        },
      }
    );

    return res.json({ success: true, message: 'Assessment updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function deleteAssessment(req: Request, res: Response) {
  const { classId, type, id } = req.params;
  const { password } = req.body;

  const collectionName = getCollectionName(type);
  if (!collectionName) {
    return res.status(400).json({ success: false, message: 'Invalid assessment type. Must be assignment or examination.' });
  }

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Assessment ID.' });
  }

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'Incorrect password. Cannot delete assessment.' });
    }

    const assessmentObjId = new ObjectId(id);
    const existing = await db.collection(collectionName).findOne({ _id: assessmentObjId, classId });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    await db.collection(collectionName).deleteOne({ _id: assessmentObjId });
    await db.collection('marks').deleteMany({ itemId: id });

    return res.json({ success: true, message: 'Assessment and associated marks deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
