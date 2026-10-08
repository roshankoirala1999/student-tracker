import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db.ts";
import { parseCsv } from "../utils/csv.ts";
import { RecordReport } from "../../src/types/reports.ts";
const attendanceHeaders = [
  "Section",
  "Roll Number",
  "Student Name",
  "Symbol Number",
  "Day",
  "Date",
  "Status",
  "Remarks",
];
const marksHeaders = [
  "Section",
  "Roll Number",
  "Student Name",
  "Symbol Number",
  "Assessment",
  "Type",
  "Marks",
  "Maximum",
];
const csvMatches = (value: unknown, cell: string) => {
  const text = String(value ?? "");
  return cell === text || (/^[=+@\-\t\r]/.test(text) && cell === "'" + text);
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(
    new Date(),
  );
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
async function scope(req: Request) {
  const db = getDatabase();
  const classId = req.params.classId;
  const cls = await db
    .collection("classes")
    .findOne({ _id: new ObjectId(classId) });
  const sections = await db
    .collection("sections")
    .find({ classId })
    .sort({ order: 1, name: 1 })
    .toArray();
  const sectionId = String(req.query.sectionId || req.body?.sectionId || "");
  if (sectionId && !sections.some((s) => String(s._id) === sectionId))
    throw new Error("This section does not belong to the selected class.");
  const chosen = sectionId
    ? sections.filter((s) => String(s._id) === sectionId)
    : sections;
  const students = await db
    .collection("students")
    .find({ classId })
    .sort({ rollNumber: 1, studentName: 1 })
    .toArray();
  return {
    db,
    classId,
    cls,
    sections: chosen,
    students: students.filter((s) =>
      chosen.some((sec) => String(sec._id) === String(s.sectionId)),
    ),
  };
}
export async function getRecordReport(req: Request, res: Response) {
  try {
    const { db, classId, cls, sections, students } = await scope(req);
    const kind = req.params.kind;
    if (kind !== "attendance" && kind !== "marks")
      return res
        .status(400)
        .json({ success: false, message: "Choose attendance or marks." });
    const rows: (string | number)[][] = [];
    if (kind === "attendance") {
      const from = String(req.query.from || ""),
        to = String(req.query.to || "");
      if (
        (from && !validDate(from)) ||
        (to && !validDate(to)) ||
        (from && to && from > to)
      )
        throw new Error("Choose a valid date range.");
      const days = await db
        .collection("attendance")
        .find({ classId })
        .sort({ dayNumber: 1 })
        .toArray();
      for (const section of sections) {
        const roster = students.filter(
          (s) => s.sectionId === String(section._id),
        );
        const saved = days.filter(
          (d) => String(d.sectionId) === String(section._id),
        );
        const selected =
          req.query.template === "true"
            ? [
                {
                  dayNumber: Math.max(0, ...saved.map((d) => d.dayNumber)) + 1,
                  submissionDate: today(),
                  records: roster.map((s) => ({
                    studentId: String(s._id),
                    status: "",
                  })),
                  comment: "",
                },
              ]
            : saved.filter(
                (d) =>
                  (!from || d.submissionDate >= from) &&
                  (!to || d.submissionDate <= to),
              );
        for (const day of selected)
          for (const student of roster) {
            const record = day.records.find(
              (r: any) => String(r.studentId) === String(student._id),
            );
            if (!record) continue;
            rows.push([
              section.name,
              student.rollNumber,
              student.studentName,
              student.symbolNumber,
              day.dayNumber,
              day.submissionDate,
              record.status || "",
              day.comment || "",
            ]);
          }
      }
    } else {
      const exams = await db
        .collection("examinations")
        .find({ classId })
        .toArray();
      const assignments = await db
        .collection("assignments")
        .find({ classId })
        .toArray();
      const assessments: Array<{
        _id: ObjectId;
        name: string;
        maxMarks: number;
        type: string;
      }> = [
        ...exams.map((x) => ({
          _id: x._id,
          name: x.name,
          maxMarks: x.maxMarks,
          type: "examination",
        })),
        ...assignments.map((x) => ({
          _id: x._id,
          name: x.name,
          maxMarks: x.maxMarks,
          type: "assignment",
        })),
      ];
      const selection = String(req.query.assessment || "examination");
      if (
        !["all", "examination", "assignment"].includes(selection) &&
        !assessments.some((a) => String(a._id) === selection)
      )
        throw new Error("Assessment not found in this class.");
      const selected = assessments.filter(
        (a) =>
          selection === "all" ||
          a.type === selection ||
          String(a._id) === selection,
      );
      const marks = await db.collection("marks").find({ classId }).toArray();
      const values = new Map(
        marks.map((m) => [`${m.studentId}:${m.itemId}`, m.marksObtained]),
      );
      for (const section of sections)
        for (const student of students.filter(
          (s) => s.sectionId === String(section._id),
        ))
          for (const item of selected)
            rows.push([
              section.name,
              student.rollNumber,
              student.studentName,
              student.symbolNumber,
              item.name,
              item.type,
              values.get(`${student._id}:${item._id}`) ?? "",
              item.maxMarks,
            ]);
    }
    const report: RecordReport = {
      kind,
      title: `${kind === "attendance" ? "Attendance" : "Marks"} report`,
      subtitle: `${cls?.name || "Class"} · ${sections.length === 1 ? sections[0].name : "All sections"}`,
      headers: kind === "attendance" ? attendanceHeaders : marksHeaders,
      rows,
      generatedAt: new Date().toISOString(),
    };
    return res.json({ success: true, data: report });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to prepare report.",
    });
  }
}
export async function importRecordCsv(req: Request, res: Response) {
  try {
    const { db, classId, cls, sections, students } = await scope(req);
    const kind = req.params.kind;
    if (kind !== "attendance" && kind !== "marks")
      throw new Error("Choose attendance or marks.");
    if (
      typeof req.body.csvContent !== "string" ||
      req.body.csvContent.length > 5 * 1024 * 1024
    )
      throw new Error("Upload a CSV file smaller than 5 MB.");
    const rows = parseCsv(req.body.csvContent);
    const headers = kind === "attendance" ? attendanceHeaders : marksHeaders;
    if (rows.length < 2 || rows.length > 20001)
      throw new Error("CSV must contain between 1 and 20,000 data rows.");
    if (
      headers.some((h, i) => rows[0][i] !== h) ||
      rows[0].length !== headers.length
    )
      throw new Error(
        "Use the CSV downloaded from this report. Its column headings must stay unchanged.",
      );
    if (kind === "attendance" && !cls?.attendanceEnabled)
      throw new Error("Enable attendance for this class before importing.");
    const exams = await db
      .collection("examinations")
      .find({ classId })
      .toArray();
    const assignments = await db
      .collection("assignments")
      .find({ classId })
      .toArray();
    const existingDays =
      kind === "attendance"
        ? await db.collection("attendance").find({ classId }).toArray()
        : [];
    const groups = new Map<string, any>();
    const operations: any[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index],
        fail = (message: string) => errors.push(`Row ${index + 1}: ${message}`);
      if (row.length !== headers.length) {
        fail("Incorrect number of columns.");
        continue;
      }
      const [sectionName, roll, name, symbol] = row;
      const matches = sections.filter((s) => csvMatches(s.name, sectionName));
      const section = matches.length === 1 ? matches[0] : null;
      const student =
        section &&
        students.find(
          (s) =>
            String(s.sectionId) === String(section._id) &&
            String(s.rollNumber) === roll &&
            csvMatches(s.symbolNumber, symbol) &&
            csvMatches(s.studentName, name),
        );
      if (!student) {
        fail(
          "Section and student details must match the current roster exactly.",
        );
        continue;
      }
      if (kind === "attendance") {
        const day = Number(row[4]),
          date = row[5],
          status = row[6].toLowerCase(),
          comment = row[7];
        if (
          !Number.isSafeInteger(day) ||
          day < 1 ||
          day > 100000 ||
          !validDate(date) ||
          !["present", "absent"].includes(status) ||
          comment.length > 1000
        ) {
          fail(
            "Use a positive day number, YYYY-MM-DD date, present/absent status, and remarks under 1,000 characters.",
          );
          continue;
        }
        const key = `${section._id}:${day}`,
          identity = `${key}:${student._id}`;
        if (seen.has(identity)) {
          fail("Duplicate attendance for this student and day.");
          continue;
        }
        seen.add(identity);
        const existing = existingDays.find(
          (d) =>
            String(d.sectionId) === String(section._id) && d.dayNumber === day,
        );
        if (existing && existing.submissionDate !== date) {
          fail("The date of an existing attendance day cannot be changed.");
          continue;
        }
        let group = groups.get(key);
        if (!group) {
          group = {
            sectionId: String(section._id),
            dayNumber: day,
            submissionDate: date,
            comment,
            records: [],
            existing,
          };
          groups.set(key, group);
        }
        if (group.submissionDate !== date || group.comment !== comment) {
          fail(
            "All rows for a section/day must use the same date and remarks.",
          );
          continue;
        }
        group.records.push({ studentId: String(student._id), status });
      } else {
        const [, , , , itemName, type, raw, max] = row;
        const collection =
          type === "examination"
            ? exams
            : type === "assignment"
              ? assignments
              : [];
        const item = collection.find((a) => csvMatches(a.name, itemName));
        const score = raw === "" ? null : Number(raw);
        if (
          !item ||
          Number(max) !== item.maxMarks ||
          (score !== null &&
            (!Number.isFinite(score) || score < 0 || score > item.maxMarks))
        ) {
          fail(
            "Assessment, maximum, or score is invalid. Blank marks remain ungraded.",
          );
          continue;
        }
        const identity = `${student._id}:${item._id}`;
        if (seen.has(identity)) {
          fail("Duplicate student/assessment row.");
          continue;
        }
        seen.add(identity);
        operations.push({
          updateOne: {
            filter: {
              studentId: String(student._id),
              itemId: String(item._id),
            },
            update: {
              $set: {
                teacherId: cls!.teacherId,
                classId,
                sectionId: student.sectionId,
                studentId: String(student._id),
                itemId: String(item._id),
                itemType: type,
                marksObtained: score,
                updatedAt: new Date().toISOString(),
              },
            },
            upsert: true,
          },
        });
      }
    }
    for (const group of groups.values()) {
      const expected = group.existing
        ? group.existing.records.map((r: any) => String(r.studentId))
        : students
            .filter((s) => String(s.sectionId) === group.sectionId)
            .map((s) => String(s._id));
      if (
        group.records.length !== expected.length ||
        group.records.some((r: any) => !expected.includes(r.studentId))
      )
        errors.push(
          `Section/day ${group.sectionId}/${group.dayNumber}: include every student in that attendance record.`,
        );
      const { existing, ...record } = group;
      const now = new Date().toISOString();
      operations.push({
        updateOne: {
          filter: { sectionId: group.sectionId, dayNumber: group.dayNumber },
          update: {
            $set: {
              ...record,
              classId,
              teacherId: cls!.teacherId,
              lastModifiedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      });
    }
    if (errors.length)
      return res.status(400).json({
        success: false,
        message: "CSV validation failed. No changes were saved.",
        errors: errors.slice(0, 50),
      });
    await db
      .collection(kind === "attendance" ? "attendance" : "marks")
      .bulkWrite(operations);
    return res.json({
      success: true,
      message: `Saved ${operations.length} ${kind === "attendance" ? "attendance day(s)" : "mark(s)"}.`,
      data: { updated: operations.length },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to import CSV.",
    });
  }
}
