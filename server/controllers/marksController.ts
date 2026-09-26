import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';
import { parseCsv, generateCsv } from '../utils/csv.ts';

export async function getSectionMarksMatrix(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classId = section.classId;

    const students = await db.collection('students')
      .find({ sectionId })
      .sort({ rollNumber: 1 })
      .toArray();

    const assignments = await db.collection('assignments')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const examinations = await db.collection('examinations')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const marks = await db.collection('marks').find({ sectionId }).toArray();

    // Map: studentId -> { [itemId]: number | null }
    const marksByStudent: Record<string, Record<string, number | null>> = {};
    for (const m of marks) {
      if (!marksByStudent[m.studentId]) {
        marksByStudent[m.studentId] = {};
      }
      marksByStudent[m.studentId][m.itemId] = m.marksObtained;
    }

    return res.json({
      success: true,
      data: {
        students: students.map((s) => ({
          id: s._id.toString(),
          rollNumber: s.rollNumber,
          studentName: s.studentName,
          symbolNumber: s.symbolNumber,
          contactNumber: s.contactNumber || s.parentContact || '',
        })),
        assignments: assignments.map((a) => ({
          id: a._id.toString(),
          name: a.name,
          maxMarks: a.maxMarks,
        })),
        examinations: examinations.map((e) => ({
          id: e._id.toString(),
          name: e.name,
          maxMarks: e.maxMarks,
        })),
        marks: marksByStudent,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function updateSingleMark(req: Request, res: Response) {
  const { sectionId } = req.params;
  const { studentId, itemId, itemType, marksObtained } = req.body;

  if (!studentId || !itemId || !itemType) {
    return res.status(400).json({ success: false, message: 'studentId, itemId, and itemType are required.' });
  }

  if (itemType !== 'assignment' && itemType !== 'examination') {
    return res.status(400).json({ success: false, message: 'itemType must be "assignment" or "examination".' });
  }

  let numericScore: number | null = null;
  if (marksObtained !== null && marksObtained !== undefined && marksObtained !== '') {
    numericScore = Number(marksObtained);
    if (isNaN(numericScore) || numericScore < 0) {
      return res.status(400).json({ success: false, message: 'Marks must be a non-negative number.' });
    }
  }

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    if (!ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student ID.' });
    }
    const student = await db.collection('students').findOne({ _id: new ObjectId(studentId), sectionId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in this section.' });
    }

    // Validate maximum marks
    const collectionName = itemType === 'examination' ? 'examinations' : 'assignments';
    const item = await db.collection(collectionName).findOne({ _id: new ObjectId(itemId), classId: section.classId });
    if (!item) {
      return res.status(404).json({ success: false, message: `${itemType} does not belong to this class.` });
    }

    if (numericScore !== null && numericScore > item.maxMarks) {
      return res.status(400).json({
        success: false,
        message: `Marks (${numericScore}) cannot exceed maximum allowed marks (${item.maxMarks}) for ${item.name}.`,
      });
    }

    const now = new Date().toISOString();

    await db.collection('marks').updateOne(
      { studentId, itemId },
      {
        $set: {
          teacherId: section.teacherId,
          classId: section.classId,
          sectionId,
          studentId,
          itemType,
          itemId,
          marksObtained: numericScore,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Mark updated successfully.', score: numericScore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

// Helper to decode CSV text from request body (raw csv string or base64 data url)
function extractCsvText(body: any): string {
  if (typeof body.csvContent === 'string') {
    return body.csvContent;
  }
  if (typeof body.fileData === 'string') {
    const data = body.fileData;
    if (data.includes('base64,')) {
      const base64Part = data.split('base64,')[1];
      return Buffer.from(base64Part, 'base64').toString('utf-8');
    }
    return data;
  }
  return '';
}

/**
 * 1. STUDENT INFO CSV EXPORT (Section view)
 * Columns: Roll Number, Student Name, Symbol Number, Contact Number
 */
export async function exportStudentRosterCsv(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(section.classId) });

    const students = await db.collection('students')
      .find({ sectionId })
      .sort({ rollNumber: 1 })
      .toArray();

    const headers = ['Roll Number', 'Student Name', 'Symbol Number', 'Contact Number'];
    let rows: (string | number)[][] = [];

    if (students.length > 0) {
      rows = students.map((s) => [
        s.rollNumber,
        s.studentName || '',
        s.symbolNumber || '',
        s.contactNumber || s.parentContact || '',
      ]);
    } else {
      // Provide clean sample rows if section has no enrolled students yet
      rows = [
        [1, 'John Doe', 'SYM-1001', '9841000001'],
        [2, 'Jane Smith', 'SYM-1002', '9841000002'],
      ];
    }

    const csvContent = generateCsv(headers, rows);
    const filename = `${(classDoc?.name || 'Class').replace(/\s+/g, '_')}_${section.name.replace(/\s+/g, '_')}_Student_Info_Template.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + csvContent);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to export student info CSV.' });
  }
}

/**
 * 2. STUDENT INFO CSV IMPORT (Section view)
 * Strictly imports student roster info (Roll Number, Student Name, Symbol Number, Contact Number).
 * No marks logic here. Handles roll-number swaps cleanly without corrupting student records.
 */
export async function importStudentRosterCsv(req: Request, res: Response) {
  const { sectionId } = req.params;
  const csvText = extractCsvText(req.body);

  if (!csvText || csvText.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'CSV file content is required.' });
  }

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const rawRows = parseCsv(csvText);
    if (rawRows.length < 2) {
      return res.status(400).json({ success: false, message: 'CSV file contains no student data rows.' });
    }

    const errors: string[] = [];
    const parsedStudents: Array<{
      rollNumber: number;
      studentName: string;
      symbolNumber: string;
      contactNumber: string;
    }> = [];

    const seenRolls = new Set<number>();
    const seenSymbols = new Set<string>();

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      const rowNum = r + 1;
      if (!row || row.every((c) => c === '')) continue;

      const rollVal = row[0];
      const nameVal = row[1] !== undefined ? row[1].trim() : '';
      const symbolVal = row[2] !== undefined ? row[2].trim() : '';
      const phoneVal = row[3] !== undefined ? row[3].trim() : '';

      const numRoll = Number(rollVal);
      if (isNaN(numRoll) || !Number.isInteger(numRoll) || numRoll <= 0) {
        errors.push(`Row ${rowNum}: Invalid Roll Number "${rollVal}". Must be a positive integer.`);
        continue;
      }

      if (seenRolls.has(numRoll)) {
        errors.push(`Row ${rowNum}: Duplicate Roll Number ${numRoll} found in uploaded file.`);
        continue;
      }
      seenRolls.add(numRoll);

      if (!nameVal) {
        errors.push(`Row ${rowNum}: Student Name is required.`);
        continue;
      }

      if (!symbolVal) {
        errors.push(`Row ${rowNum}: Symbol Number is required.`);
        continue;
      }

      const lowerSym = symbolVal.toLowerCase();
      if (seenSymbols.has(lowerSym)) {
        errors.push(`Row ${rowNum}: Duplicate Symbol Number "${symbolVal}" found in uploaded file.`);
        continue;
      }
      seenSymbols.add(lowerSym);

      parsedStudents.push({
        rollNumber: numRoll,
        studentName: nameVal,
        symbolNumber: symbolVal,
        contactNumber: phoneVal || '-',
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for student info CSV.',
        errors,
      });
    }

    // Existing students in section
    const existingStudents = await db.collection('students').find({ sectionId }).toArray();
    const existingBySymbol = new Map<string, any>();
    const existingByRoll = new Map<number, any>();
    existingStudents.forEach((s) => {
      if (s.symbolNumber) existingBySymbol.set(s.symbolNumber.trim().toLowerCase(), s);
      existingByRoll.set(s.rollNumber, s);
    });

    // Student identity matching (to handle roll-number swaps cleanly without corrupting student records)
    const claimedStudentIds = new Set<string>();
    const resolvedStudents: Array<{
      rollNumber: number;
      studentName: string;
      symbolNumber: string;
      contactNumber: string;
      matchedDoc?: any;
    }> = parsedStudents.map((p) => ({ ...p }));

    // Pass 1: Match by Symbol Number (primary unique identifier in section)
    for (const p of resolvedStudents) {
      const matchBySym = existingBySymbol.get(p.symbolNumber.toLowerCase());
      if (matchBySym) {
        p.matchedDoc = matchBySym;
        claimedStudentIds.add(matchBySym._id.toString());
      }
    }

    // Pass 2: For any remaining unmatched rows, check if roll number matches an unclaimed existing student
    // whose symbol was not used in this file (e.g. symbol number was edited for that roll number)
    const parsedSymbolsSet = new Set(parsedStudents.map((p) => p.symbolNumber.toLowerCase()));
    for (const p of resolvedStudents) {
      if (!p.matchedDoc) {
        const matchByRoll = existingByRoll.get(p.rollNumber);
        if (matchByRoll && !claimedStudentIds.has(matchByRoll._id.toString())) {
          const oldSym = (matchByRoll.symbolNumber || '').trim().toLowerCase();
          if (!parsedSymbolsSet.has(oldSym)) {
            p.matchedDoc = matchByRoll;
            claimedStudentIds.add(matchByRoll._id.toString());
          }
        }
      }
    }

    // Check non-updated students in the same section for symbol conflicts
    const nonUpdatedStudents = existingStudents.filter((s) => !claimedStudentIds.has(s._id.toString()));
    const nonUpdatedSymbols = new Map<string, any>();
    nonUpdatedStudents.forEach((s) => {
      if (s.symbolNumber) {
        nonUpdatedSymbols.set(s.symbolNumber.trim().toLowerCase(), s);
      }
    });

    for (const p of resolvedStudents) {
      const conflict = nonUpdatedSymbols.get(p.symbolNumber.toLowerCase());
      if (conflict) {
        errors.push(
          `Symbol Number "${p.symbolNumber}" is already assigned to Roll #${conflict.rollNumber} (${conflict.studentName}) who is not included in this file.`
        );
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for student info CSV.',
        errors,
      });
    }

    const newCount = resolvedStudents.filter((p) => !p.matchedDoc).length;
    if (existingStudents.length + newCount > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Max number of students limit reached (1000 per section)',
      });
    }

    const classTotal = await db.collection('students').countDocuments({ classId: section.classId });
    if (classTotal + newCount > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Max number of students limit reached (2000 per class)',
      });
    }

    // Phase 1: Assign temporary roll and symbol numbers to matched existing students to prevent unique constraint collisions during swaps
    const matchedList = resolvedStudents.filter((p) => p.matchedDoc);
    if (matchedList.length > 0) {
      const swapTimestamp = Date.now();
      await Promise.all(
        matchedList.map((p, idx) =>
          db.collection('students').updateOne(
            { _id: p.matchedDoc._id },
            {
              $set: {
                rollNumber: -1 * (idx + 100000),
                symbolNumber: `__TEMP_SWAP_${p.matchedDoc._id.toString()}_${swapTimestamp}_${idx}`,
              },
            }
          )
        )
      );
    }

    // Phase 2: Perform final updates and insertions with clean student roster data
    const now = new Date().toISOString();
    let upsertCount = 0;

    for (const p of resolvedStudents) {
      if (p.matchedDoc) {
        await db.collection('students').updateOne(
          { _id: p.matchedDoc._id },
          {
            $set: {
              rollNumber: p.rollNumber,
              studentName: p.studentName,
              symbolNumber: p.symbolNumber,
              contactNumber: p.contactNumber,
              parentContact: p.contactNumber,
              updatedAt: now,
            },
          }
        );
      } else {
        await db.collection('students').insertOne({
          teacherId: section.teacherId,
          classId: section.classId,
          sectionId,
          rollNumber: p.rollNumber,
          studentName: p.studentName,
          symbolNumber: p.symbolNumber,
          contactNumber: p.contactNumber,
          parentContact: p.contactNumber,
          createdAt: now,
        });
      }
      upsertCount++;
    }

    return res.json({
      success: true,
      message: `Successfully processed ${upsertCount} student(s) into roster.`,
      count: upsertCount,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to import student info CSV.' });
  }
}

/**
 * 3. MARKS CSV EXPORT (Marks section view)
 * "Columns should be Roll std name symbol only all column which is visiable at the instant"
 * "Download template means current table download"
 * Columns: Roll Number, Student Name, Symbol Number + [All Assignment and Exam Columns]
 * Note: Contact Number and Total Marks are REMOVED!
 */
export async function exportMarksCsv(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classDoc = await db.collection('classes').findOne({ _id: new ObjectId(section.classId) });
    const classId = section.classId;

    const students = await db.collection('students')
      .find({ sectionId })
      .sort({ rollNumber: 1 })
      .toArray();

    const assignments = await db.collection('assignments')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const examinations = await db.collection('examinations')
      .find({ classId })
      .sort({ createdAt: 1 })
      .toArray();

    const marks = await db.collection('marks').find({ sectionId }).toArray();
    const markMap = new Map<string, number | null>();
    marks.forEach((m) => markMap.set(`${m.studentId}_${m.itemId}`, m.marksObtained));

    // Columns: Roll Number, Student Name, Symbol Number, [Assignments...], [Examinations...]
    const headers = ['Roll Number', 'Student Name', 'Symbol Number'];
    assignments.forEach((a) => headers.push(a.name));
    examinations.forEach((e) => headers.push(e.name));

    const rows = students.map((s) => {
      const row: (string | number)[] = [s.rollNumber, s.studentName || '', s.symbolNumber || ''];

      assignments.forEach((a) => {
        const score = markMap.get(`${s._id.toString()}_${a._id.toString()}`);
        row.push(score !== null && score !== undefined ? score : '');
      });

      examinations.forEach((e) => {
        const score = markMap.get(`${s._id.toString()}_${e._id.toString()}`);
        row.push(score !== null && score !== undefined ? score : '');
      });

      return row;
    });

    const csvContent = generateCsv(headers, rows);
    const filename = `${(classDoc?.name || 'Class').replace(/\s+/g, '_')}_${section.name.replace(/\s+/g, '_')}_Marks.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + csvContent);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to export marks CSV.' });
  }
}

/**
 * 4. MARKS CSV IMPORT (Marks section view)
 * "Download template means current table download and upload means uploading after editing"
 * "Remember student name roll number and sym no here uploaded must match the student rec or dont take file if name sym no is inc or decreased or edited"
 */
export async function importMarksCsv(req: Request, res: Response) {
  const { sectionId } = req.params;
  const csvText = extractCsvText(req.body);

  if (!csvText || csvText.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Marks CSV file content is required.' });
  }

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    if (section.teacherId.toString() !== req.user!.userId && req.user!.role === 'teacher') {
      return res.status(403).json({ success: false, message: 'Unauthorized: You do not own this section.' });
    }

    const classId = section.classId;

    // Load enrolled students in this section
    const existingStudents = await db.collection('students').find({ sectionId }).sort({ rollNumber: 1 }).toArray();
    if (existingStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This section has no enrolled students. Please add or upload students first before uploading marks.',
      });
    }

    const studentByRoll = new Map<number, any>();
    existingStudents.forEach((s) => studentByRoll.set(s.rollNumber, s));

    // Load dynamic class assignments and examinations
    const assignments = await db.collection('assignments').find({ classId }).toArray();
    const examinations = await db.collection('examinations').find({ classId }).toArray();

    // Helper to find assessment item matching column name and type
    const findAssessmentItem = (rawHeader: string) => {
      const trimmed = rawHeader.trim();
      const lower = trimmed.toLowerCase();

      // Check if header specifies type
      const isExamSpecified = /\b(exam|examination)\b/i.test(trimmed);
      const isAssignmentSpecified = /\b(assignment|hw|homework)\b/i.test(trimmed);

      // Clean prefix/suffix: "Exam: Final", "Assignment: Lab 1", "[Exam] Final", "Final (Exam)", "Final [100]"
      const cleanName = trimmed
        .replace(/^(exam|examination|assignment)\s*[:\-]\s*/i, '')
        .replace(/^\[(exam|examination|assignment)\]\s*/i, '')
        .replace(/^\((exam|examination|assignment)\)\s*/i, '')
        .replace(/\s*\(?(exam|examination|assignment)\)?$/i, '')
        .replace(/\s*\[?(exam|examination|assignment)\]?$/i, '')
        .replace(/\s*\(\d+\)$/, '')
        .replace(/\s*\[\d+\]$/, '')
        .trim()
        .toLowerCase();

      // If exam explicitly specified, search examinations first
      if (isExamSpecified && !isAssignmentSpecified) {
        const examMatch = examinations.find((e) => e.name.trim().toLowerCase() === cleanName || e.name.trim().toLowerCase() === lower);
        if (examMatch) {
          return { id: examMatch._id.toString(), type: 'examination' as const, maxMarks: examMatch.maxMarks, name: examMatch.name };
        }
      }

      // If assignment explicitly specified, search assignments first
      if (isAssignmentSpecified && !isExamSpecified) {
        const assignMatch = assignments.find((a) => a.name.trim().toLowerCase() === cleanName || a.name.trim().toLowerCase() === lower);
        if (assignMatch) {
          return { id: assignMatch._id.toString(), type: 'assignment' as const, maxMarks: assignMatch.maxMarks, name: assignMatch.name };
        }
      }

      // Check exact name match against examinations and assignments
      const examExact = examinations.find((e) => e.name.trim().toLowerCase() === lower || e.name.trim().toLowerCase() === cleanName);
      if (examExact) {
        return { id: examExact._id.toString(), type: 'examination' as const, maxMarks: examExact.maxMarks, name: examExact.name };
      }

      const assignExact = assignments.find((a) => a.name.trim().toLowerCase() === lower || a.name.trim().toLowerCase() === cleanName);
      if (assignExact) {
        return { id: assignExact._id.toString(), type: 'assignment' as const, maxMarks: assignExact.maxMarks, name: assignExact.name };
      }

      return null;
    };

    const rawRows = parseCsv(csvText);
    if (rawRows.length < 2) {
      return res.status(400).json({ success: false, message: 'Uploaded CSV contains no student marks rows.' });
    }

    const headerRow = rawRows[0];
    if (headerRow.length < 3) {
      return res.status(400).json({
        success: false,
        message: "CSV header is missing required columns: 'Roll Number', 'Student Name', 'Symbol Number'.",
      });
    }

    // Filter out blank rows
    const dataRows = rawRows.slice(1).filter((r) => r && r.some((c) => c !== ''));

    // 1. Strict Count Check: Row count must EXACTLY match the number of enrolled students in this section!
    if (dataRows.length !== existingStudents.length) {
      return res.status(400).json({
        success: false,
        message: `Upload rejected: Student count mismatch. File contains ${dataRows.length} student rows, but this section has ${existingStudents.length} enrolled students. Student count cannot be increased or decreased in marks upload.`,
      });
    }

    // Map assessment columns starting at index 3
    const columnMappings: Array<{ colIdx: number; name: string; item: { id: string; type: 'assignment' | 'examination'; maxMarks: number; name: string } }> = [];

    for (let i = 3; i < headerRow.length; i++) {
      const colName = headerRow[i]?.trim();
      if (!colName) continue;
      // If header is accidentally Total or Contact, ignore
      const lower = colName.toLowerCase();
      if (lower === 'total' || lower === 'total marks' || lower === 'contact' || lower === 'contact number') {
        continue;
      }
      const match = findAssessmentItem(colName);
      if (match) {
        columnMappings.push({ colIdx: i, name: colName, item: match });
      } else {
        return res.status(400).json({
          success: false,
          message: `Column "${colName}" does not correspond to any assignment or examination configured for this class.`,
        });
      }
    }

    const errors: string[] = [];
    const marksToUpsert: any[] = [];
    const seenRollsInFile = new Set<number>();

    // 2. Strict Student Identity Check for Every Row
    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const rowNum = rowIdx + 2;

      const rollVal = row[0];
      const nameVal = row[1] !== undefined ? row[1].trim() : '';
      const symbolVal = row[2] !== undefined ? row[2].trim() : '';

      const numericRoll = Number(rollVal);
      if (isNaN(numericRoll)) {
        errors.push(`Row ${rowNum}: Invalid Roll Number "${rollVal}".`);
        continue;
      }

      if (seenRollsInFile.has(numericRoll)) {
        errors.push(`Row ${rowNum}: Duplicate Roll Number ${numericRoll} found in marks file.`);
        continue;
      }
      seenRollsInFile.add(numericRoll);

      const student = studentByRoll.get(numericRoll);
      if (!student) {
        errors.push(`Row ${rowNum}: Student with Roll Number ${numericRoll} does not exist in this section.`);
        continue;
      }

      // Check student name
      if (student.studentName.trim().toLowerCase() !== nameVal.toLowerCase()) {
        errors.push(`Row ${rowNum}: Student name mismatch for Roll #${numericRoll}. Expected "${student.studentName}", found "${nameVal}". Student names cannot be altered during marks upload.`);
        continue;
      }

      // Check symbol number
      if (student.symbolNumber.trim().toLowerCase() !== symbolVal.toLowerCase()) {
        errors.push(`Row ${rowNum}: Symbol number mismatch for Roll #${numericRoll}. Expected "${student.symbolNumber}", found "${symbolVal}". Symbol numbers cannot be altered during marks upload.`);
        continue;
      }

      // Validate scores for each assessment column
      for (const col of columnMappings) {
        if (col.colIdx < row.length) {
          const rawMark = row[col.colIdx]?.trim();
          if (rawMark === '' || rawMark === undefined || rawMark === null) {
            // Unentered score -> set to null or leave unentered
            marksToUpsert.push({
              teacherId: section.teacherId,
              classId: section.classId,
              sectionId,
              studentId: student._id.toString(),
              itemType: col.item.type,
              itemId: col.item.id,
              marksObtained: null,
              updatedAt: new Date().toISOString(),
            });
            continue;
          }

          const score = Number(rawMark);
          if (isNaN(score) || score < 0) {
            errors.push(`Row ${rowNum} (${student.studentName}): Invalid mark score "${rawMark}" for "${col.name}". Must be a non-negative number.`);
            continue;
          }

          if (score > col.item.maxMarks) {
            errors.push(
              `Row ${rowNum} (${student.studentName}): Mark ${score} exceeds maximum allowed marks (${col.item.maxMarks}) for "${col.name}".`
            );
            continue;
          }

          marksToUpsert.push({
            teacherId: section.teacherId,
            classId: section.classId,
            sectionId,
            studentId: student._id.toString(),
            itemType: col.item.type,
            itemId: col.item.id,
            marksObtained: score,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks CSV validation failed. No marks were saved.',
        errors,
      });
    }

    if (marksToUpsert.length > 0) {
      const operations = marksToUpsert.map((m) => ({
        updateOne: {
          filter: { studentId: m.studentId, itemId: m.itemId },
          update: { $set: m },
          upsert: true,
        },
      }));

      await db.collection('marks').bulkWrite(operations);
    }

    return res.json({
      success: true,
      message: `Marks successfully imported for ${dataRows.length} students. Updated ${marksToUpsert.length} assessment record(s).`,
      recordsCount: marksToUpsert.length,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

// Backwards-compatible aliases pointing to the new CSV implementations
export const exportSampleExcel = exportMarksCsv;
export const importMarksExcel = importMarksCsv;
export const exportStudentRosterExcel = exportStudentRosterCsv;
export const importStudentRosterExcel = importStudentRosterCsv;

export async function getMarksByAssessment(req: Request, res: Response) {
  const { assessmentId } = req.params;
  try {
    const db = getDatabase();
    const marks = await db.collection('marks').find({ itemId: assessmentId }).toArray();
    return res.json({
      success: true,
      data: marks.map((m) => ({
        id: m._id.toString(),
        studentId: m.studentId,
        itemId: m.itemId,
        assessmentId: m.itemId,
        itemType: m.itemType,
        marksObtained: m.marksObtained,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch marks.' });
  }
}

export async function saveMarksBatch(req: Request, res: Response) {
  const { marks } = req.body;
  if (!Array.isArray(marks)) {
    return res.status(400).json({ success: false, message: 'marks array is required.' });
  }
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    for (const m of marks) {
      const assessmentId = m.itemId || m.assessmentId;
      if (m.studentId && assessmentId) {
        await db.collection('marks').updateOne(
          { studentId: m.studentId, itemId: assessmentId },
          {
            $set: {
              teacherId: req.user!.userId,
              studentId: m.studentId,
              itemId: assessmentId,
              itemType: m.itemType || 'examination',
              marksObtained: m.marksObtained !== undefined ? Number(m.marksObtained) : null,
              sectionId: m.sectionId,
              classId: m.classId,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
      }
    }
    return res.json({ success: true, message: 'Marks updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to save marks.' });
  }
}

