import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { comparePassword } from '../auth.ts';

export async function listClasses(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const targetTeacherId = req.user!.userId;

    const classes = await db.collection('classes')
      .find({ teacherId: targetTeacherId })
      .sort({ order: 1, createdAt: 1 })
      .toArray();

    const formatted = classes.map((c, index) => ({
      id: c._id.toString(),
      teacherId: c.teacherId,
      name: c.name,
      order: c.order !== undefined ? c.order : index,
      attendanceEnabled: !!c.attendanceEnabled,
      createdAt: c.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function createClass(req: Request, res: Response) {
  const { name, attendanceEnabled } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Class name is required.' });
  }

  const cleanName = name.trim();
  const teacherId = req.user!.userId;

  try {
    const db = getDatabase();
    const existing = await db.collection('classes').findOne({
      teacherId,
      name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: `You already have a class named "${cleanName}".` });
    }

    const count = await db.collection('classes').countDocuments({ teacherId });
    if (count >= 100) {
      return res.status(400).json({ success: false, message: 'Maximum limit of 100 classes reached.' });
    }
    const order = count + 1;
    const now = new Date().toISOString();

    const insertResult = await db.collection('classes').insertOne({
      teacherId,
      name: cleanName,
      order,
      attendanceEnabled: !!attendanceEnabled,
      createdAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: insertResult.insertedId.toString(),
        teacherId,
        name: cleanName,
        order,
        attendanceEnabled: !!attendanceEnabled,
        createdAt: now,
      },
      message: `Class "${cleanName}" created successfully.`,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function reorderClasses(req: Request, res: Response) {
  const { classIds, orders } = req.body;
  const teacherId = req.user!.userId;

  try {
    const db = getDatabase();

    if (Array.isArray(classIds)) {
      const updates = classIds.map((id: string, index: number) => {
        if (!ObjectId.isValid(id)) return null;
        return db.collection('classes').updateOne(
          { _id: new ObjectId(id), teacherId },
          { $set: { order: index + 1 } }
        );
      });
      await Promise.all(updates.filter(Boolean));
    } else if (Array.isArray(orders)) {
      const updates = orders.map((item: { classId?: string; id?: string; order: number }) => {
        const id = item.classId || item.id;
        if (!id || !ObjectId.isValid(id)) return null;
        return db.collection('classes').updateOne(
          { _id: new ObjectId(id), teacherId },
          { $set: { order: item.order } }
        );
      });
      await Promise.all(updates.filter(Boolean));
    } else {
      return res.status(400).json({ success: false, message: 'classIds array or orders array is required.' });
    }

    return res.json({ success: true, message: 'Classes reordered successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function renameClass(req: Request, res: Response) {
  const { classId } = req.params;
  const { name } = req.body;
  const teacherId = req.user!.userId;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Class name cannot be empty.' });
  }

  if (!classId || !ObjectId.isValid(classId)) {
    return res.status(400).json({ success: false, message: 'Invalid Class ID.' });
  }

  const cleanName = name.trim();

  try {
    const db = getDatabase();
    const existing = await db.collection('classes').findOne({
      _id: { $ne: new ObjectId(classId) },
      teacherId,
      name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: `You already have another class named "${cleanName}".` });
    }

    const result = await db.collection('classes').updateOne(
      { _id: new ObjectId(classId), teacherId },
      { $set: { name: cleanName } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Class not found or unauthorized.' });
    }

    const updated = await db.collection('classes').findOne({ _id: new ObjectId(classId) });

    return res.json({
      success: true,
      message: 'Class renamed successfully.',
      data: {
        id: updated!._id.toString(),
        teacherId: updated!.teacherId,
        name: updated!.name,
        order: updated!.order ?? 0,
        attendanceEnabled: !!updated!.attendanceEnabled,
        createdAt: updated!.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function deleteClass(req: Request, res: Response) {
  const { classId } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required to delete a class.' });
  }

  if (!classId || !ObjectId.isValid(classId)) {
    return res.status(400).json({ success: false, message: 'Invalid Class ID.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'Incorrect password. Class cannot be deleted.' });
    }

    const classDoc = await db.collection('classes').findOne({
      _id: new ObjectId(classId),
      teacherId: req.user!.userId,
    });

    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found or unauthorized.' });
    }

    // Cascade delete all sections, students, marks, attendance records, examinations, and assignments belonging to that class
    const classObjId = new ObjectId(classId);
    const classIdFilter = { $in: [classId, classObjId] };
    await Promise.all([
      db.collection('classes').deleteOne({ _id: classObjId }),
      db.collection('sections').deleteMany({ classId: classIdFilter }),
      db.collection('students').deleteMany({ classId: classIdFilter }),
      db.collection('marks').deleteMany({ classId: classIdFilter }),
      db.collection('attendance').deleteMany({ classId: classIdFilter }),
      db.collection('examinations').deleteMany({ classId: classIdFilter }),
      db.collection('assignments').deleteMany({ classId: classIdFilter }),
    ]);

    return res.json({
      success: true,
      message: `Class "${classDoc.name}" and all associated academic records deleted successfully.`,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function toggleAttendance(req: Request, res: Response) {
  const { classId } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid attendance status parameter.' });
  }

  if (!classId || !ObjectId.isValid(classId)) {
    return res.status(400).json({ success: false, message: 'Invalid Class ID.' });
  }

  try {
    const db = getDatabase();
    const result = await db.collection('classes').updateOne(
      { _id: new ObjectId(classId), teacherId: req.user!.userId },
      { $set: { attendanceEnabled: enabled } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Class not found or unauthorized.' });
    }

    return res.json({
      success: true,
      message: `Attendance has been turned ${enabled ? 'ON' : 'OFF'} for this class.`,
      attendanceEnabled: enabled,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function listSections(req: Request, res: Response) {
  const { classId } = req.params;

  try {
    const db = getDatabase();
    const sections = await db.collection('sections')
      .find({ classId })
      .sort({ order: 1, name: 1 })
      .toArray();

    // Get student count for each section
    const sectionIds = sections.map((s) => s._id.toString());
    const counts = await db.collection('students').aggregate([
      { $match: { sectionId: { $in: sectionIds } } },
      { $group: { _id: '$sectionId', count: { $sum: 1 } } },
    ]).toArray();

    const countMap = new Map<string, number>();
    counts.forEach((c) => countMap.set(c._id, c.count));

    const formatted = sections.map((s) => ({
      id: s._id.toString(),
      teacherId: s.teacherId,
      classId: s.classId,
      name: s.name,
      order: s.order || 0,
      studentCount: countMap.get(s._id.toString()) || 0,
      createdAt: s.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function addSection(req: Request, res: Response) {
  const { classId } = req.params;
  const { name, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Please provide a section name.' });
  }

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required to add a section.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'Incorrect password. Cannot add section.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(classId) });
    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    if (classDoc.teacherId.toString() !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this class.' });
    }

    const cleanName = name.trim();
    const nameRegex = new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existing = await db.collection('sections').findOne({ classId, name: { $regex: nameRegex } });
    if (existing) {
      return res.status(409).json({ success: false, message: `A section named "${cleanName}" already exists in this class.` });
    }

    const totalInClass = await db.collection('sections').countDocuments({ classId });
    if (totalInClass >= 20) {
      return res.status(400).json({
        success: false,
        error: 'SECTION_LIMIT_REACHED',
        message: 'Max number of sections limit reached (20 per class)',
      });
    }

    const sectionTeacherId = classDoc.teacherId.toString();

    const insertResult = await db.collection('sections').insertOne({
      teacherId: sectionTeacherId,
      classId,
      name: cleanName,
      order: totalInClass + 1,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      data: {
        id: insertResult.insertedId.toString(),
        teacherId: sectionTeacherId,
        classId,
        name: cleanName,
        order: totalInClass + 1,
        studentCount: 0,
      },
      message: `Section "${cleanName}" created successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function deleteSection(req: Request, res: Response) {
  const { classId, sectionId } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password confirmation is required to delete a section.' });
  }

  try {
    const db = getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user!.userId) });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const passwordOk = await comparePassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'This section cannot be deleted because the password is incorrect.' });
    }

    if (!ObjectId.isValid(sectionId) || !ObjectId.isValid(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID supplied.' });
    }

    // Strict ownership verification: ensure section belongs to THIS class and THIS teacher
    const section = await db.collection('sections').findOne({
      _id: new ObjectId(sectionId),
      classId,
      teacherId: req.user!.userId,
    });

    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found in this class or permission denied.' });
    }

    // Cascade delete students, marks, attendance belonging to this section
    const secObjId = new ObjectId(sectionId);
    await Promise.all([
      db.collection('students').deleteMany({ sectionId: { $in: [sectionId, secObjId] } }),
      db.collection('marks').deleteMany({ sectionId: { $in: [sectionId, secObjId] } }),
      db.collection('attendance').deleteMany({ sectionId: { $in: [sectionId, secObjId] } }),
      db.collection('sections').deleteOne({ _id: secObjId }),
    ]);

    return res.json({ success: true, message: 'Section and all associated records deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function getClassById(req: Request, res: Response) {
  const { classId } = req.params;
  try {
    const db = getDatabase();
    if (!ObjectId.isValid(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class ID.' });
    }
    const cls = await db.collection('classes').findOne({ _id: new ObjectId(classId) });
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });
    return res.json({
      success: true,
      data: {
        id: cls._id.toString(),
        teacherId: cls.teacherId,
        name: cls.name,
        order: cls.order ?? 0,
        attendanceEnabled: !!cls.attendanceEnabled,
        createdAt: cls.createdAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve class.' });
  }
}

