import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import { getDatabase } from '../db.ts';

export async function getSectionMarksMatrix(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

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
          parentContact: s.contactNumber || s.parentContact || '',
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
    return res.status(400).json({ success: false, message: 'Missing required mark parameters.' });
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

export async function exportSampleExcel(req: Request, res: Response) {
  const { sectionId } = req.params;

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Student Tracker';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Marks Matrix');

    // Define columns
    const columns: Array<{ header: string; key: string; width: number }> = [
      { header: 'Roll Number', key: 'rollNumber', width: 14 },
      { header: 'Student Name', key: 'studentName', width: 28 },
      { header: 'Symbol Number', key: 'symbolNumber', width: 18 },
      { header: 'Contact Number', key: 'contactNumber', width: 20 },
    ];

    assignments.forEach((a) => {
      columns.push({ header: a.name, key: `item_${a._id}`, width: 20 });
    });

    examinations.forEach((e) => {
      columns.push({ header: e.name, key: `item_${e._id}`, width: 20 });
    });

    worksheet.columns = columns;

    // Add rows
    for (const s of students) {
      const rowData: Record<string, any> = {
        rollNumber: s.rollNumber,
        studentName: s.studentName || '',
        symbolNumber: s.symbolNumber || '',
        contactNumber: s.contactNumber || s.parentContact || '',
      };

      for (const a of assignments) {
        const score = markMap.get(`${s._id.toString()}_${a._id.toString()}`);
        rowData[`item_${a._id}`] = score !== null && score !== undefined ? score : '';
      }

      for (const e of examinations) {
        const score = markMap.get(`${s._id.toString()}_${e._id.toString()}`);
        rowData[`item_${e._id}`] = score !== null && score !== undefined ? score : '';
      }

      worksheet.addRow(rowData);
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const filename = `${(classDoc?.name || 'Class').replace(/\s+/g, '_')}_${section.name.replace(/\s+/g, '_')}_Marks_Sample.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(excelBuffer));
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

export async function importMarksExcel(req: Request, res: Response) {
  const { sectionId } = req.params;
  const { fileData } = req.body;

  if (!fileData) {
    return res.status(400).json({ success: false, message: 'Excel fileData is required.' });
  }

  try {
    const db = getDatabase();
    const section = await db.collection('sections').findOne({ _id: new ObjectId(sectionId) });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found.' });

    const classId = section.classId;

    // Load existing students in this section for strict identity matching
    const existingStudents = await db.collection('students').find({ sectionId }).toArray();
    const studentByRoll = new Map<number, any>();

    existingStudents.forEach((s) => {
      studentByRoll.set(s.rollNumber, s);
    });

    // Load dynamic items for this class
    const assignments = await db.collection('assignments').find({ classId }).toArray();
    const examinations = await db.collection('examinations').find({ classId }).toArray();

    const itemByName = new Map<string, { id: string; type: 'assignment' | 'examination'; maxMarks: number }>();
    assignments.forEach((a) => itemByName.set(a.name.trim().toLowerCase(), { id: a._id.toString(), type: 'assignment', maxMarks: a.maxMarks }));
    examinations.forEach((e) => itemByName.set(e.name.trim().toLowerCase(), { id: e._id.toString(), type: 'examination', maxMarks: e.maxMarks }));

    let buffer: Buffer;
    if (typeof fileData === 'string') {
      const base64Clean = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
      buffer = Buffer.from(base64Clean, 'base64');
    } else if (Buffer.isBuffer(fileData)) {
      buffer = fileData;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid Excel file format.' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'Excel workbook contains no sheets or is empty.' });
    }

    const rawRows: any[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues: any[] = [];
      const colCount = Math.max(worksheet.columnCount || 0, row.cellCount || 0, 10);
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        let val = cell.value;
        if (val && typeof val === 'object') {
          if ('result' in (val as any)) {
            val = (val as any).result;
          } else if ('text' in (val as any)) {
            val = (val as any).text;
          }
        }
        rowValues.push(val !== null && val !== undefined ? val : '');
      }
      rawRows.push(rowValues);
    });

    if (rawRows.length < 2) {
      return res.status(400).json({ success: false, message: 'Excel sheet is empty or missing data rows.' });
    }

    const headerRow: string[] = (rawRows[0] || []).map((h: any) => String(h).trim());

    if (headerRow.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Excel is missing required identity columns: 'Roll Number', 'Student Name', 'Symbol Number', 'Contact Number'.",
      });
    }

    // Map assessment columns (index >= 4)
    const columnMappings: Array<{ colIdx: number; name: string; item: { id: string; type: 'assignment' | 'examination'; maxMarks: number } }> = [];

    for (let i = 4; i < headerRow.length; i++) {
      const colName = headerRow[i];
      if (!colName) continue;
      const match = itemByName.get(colName.toLowerCase());
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

    for (let rowIdx = 1; rowIdx < rawRows.length; rowIdx++) {
      const row = rawRows[rowIdx];
      const rowNum = rowIdx + 1;

      if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) {
        continue;
      }

      const rollVal = row[0];
      const symbolVal = row[2] !== undefined ? String(row[2]).trim() : '';

      const numericRoll = Number(rollVal);
      if (isNaN(numericRoll)) {
        errors.push(`Row ${rowNum}: Invalid Roll Number "${rollVal}".`);
        continue;
      }

      const student = studentByRoll.get(numericRoll);
      if (!student) {
        errors.push(`Row ${rowNum}: Student with Roll Number ${numericRoll} does not exist in this section. Excel cannot create new students.`);
        continue;
      }

      if (symbolVal && student.symbolNumber.trim().toLowerCase() !== symbolVal.toLowerCase()) {
        errors.push(`Row ${rowNum}: Symbol Number mismatch for Roll ${numericRoll}. Expected "${student.symbolNumber}", found "${symbolVal}".`);
        continue;
      }

      for (const col of columnMappings) {
        if (col.colIdx < row.length) {
          const rawMark = row[col.colIdx];
          if (rawMark === '' || rawMark === null || rawMark === undefined) {
            continue;
          }

          const score = Number(rawMark);
          if (isNaN(score) || score < 0) {
            errors.push(`Row ${rowNum} (${student.studentName}): Invalid marks "${rawMark}" for "${col.name}".`);
            continue;
          }

          if (score > col.item.maxMarks) {
            errors.push(
              `Row ${rowNum} (${student.studentName}): Marks ${score} exceed maximum allowed marks (${col.item.maxMarks}) for "${col.name}".`
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
        message: 'Excel validation failed. No marks were imported.',
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
      message: `Excel marks imported successfully. Updated ${marksToUpsert.length} mark record(s).`,
      recordsCount: marksToUpsert.length,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}
