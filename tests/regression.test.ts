import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
const originalCwd = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "student-tracker-test-"));
let server: Server;
let base: string;
let cookie = "";
let csrf = "";
const classId = "650000000000000000000010";
const sectionId = "650000000000000000000020";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(async () => {
  process.chdir(directory);
  process.env.NODE_ENV = "test";
  delete process.env.MONGODB_URI;
  const { connectToDatabase } = await import("../server/db.ts");
  await connectToDatabase();
  const { default: router } = await import("../server/apiRouter.ts");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", router);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api`;
  const login = await request(
    "/auth/login",
    "POST",
    {
      username: "teacher1",
      password: "TeacherPassword123!",
      portal: "teacher",
    },
    false,
  );
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  csrf = (await login.json()).csrfToken;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Allow the development store's pending save to complete before removing the isolated test directory.
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.chdir(originalCwd);
  rmSync(directory, { recursive: true, force: true });
});
test("health uses the response envelope expected by the frontend", async () => {
  const result = await (await request("/health")).json();
  assert.equal(result.success, true);
  assert.equal(result.data.database.connected, true);
});
test("class reorder is not intercepted by the class ID route", async () => {
  const response = await request("/classes/reorder", "PUT", {
    classIds: [classId],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});
test("class rename persists through the supported endpoint", async () => {
  assert.equal(
    (
      await request(`/classes/${classId}/rename`, "PATCH", {
        name: "Computer Science",
      })
    ).status,
    200,
  );
  const result = await (await request("/classes")).json();
  assert.equal(result.data[0].name, "Computer Science");
});
test("unauthenticated requests cannot access classroom data", async () => {
  assert.equal(
    (await request("/classes", "GET", undefined, false)).status,
    401,
  );
});
test("mutations without CSRF are rejected", async () => {
  const response = await fetch(base + "/classes", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Blocked" }),
  });
  assert.equal(response.status, 403);
});
test("attendance inserts and updates the same day without duplication", async () => {
  const students = (
    await (await request(`/sections/${sectionId}/students`)).json()
  ).data;
  const records = students.map((s: any) => ({
    studentId: s.id,
    status: "present",
  }));
  const first = await request(`/sections/${sectionId}/attendance`, "POST", {
    records,
    targetDayNumber: 99,
  });
  assert.equal(first.status, 201);
  const data = await first.json();
  assert.ok(data.data.id);
  records[0].status = "absent";
  const second = await request(`/sections/${sectionId}/attendance`, "POST", {
    records,
    targetDayNumber: 99,
  });
  assert.ok(second.ok);
  const history = (
    await (await request(`/sections/${sectionId}/attendance`)).json()
  ).data.history.filter((d: any) => d.dayNumber === 99);
  assert.equal(history.length, 1);
  assert.equal(history[0].absentCount, 1);
  assert.ok(history[0].createdAt);
});
test("marks CSV export can be imported and uses bulk updates", async () => {
  const exported = await request(`/sections/${sectionId}/marks/csv-template`);
  assert.equal(exported.status, 200);
  const csvText = await exported.text();
  const response = await request(
    `/sections/${sectionId}/marks/csv-import`,
    "POST",
    { csvContent: csvText },
  );
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
});
test("Excel export remains valid after UUID dependency update", async () => {
  const response = await request(
    `/sections/${sectionId}/students/excel/export`,
  );
  assert.equal(response.status, 200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
});
test("deleting a student also removes their attendance entries", async () => {
  const studentId = "650000000000000000000030";
  assert.equal(
    (
      await request(`/students/${studentId}`, "DELETE", {
        password: "TeacherPassword123!",
      })
    ).status,
    200,
  );
  const { getDatabase } = await import("../server/db.ts");
  const rows = await getDatabase()
    .collection("attendance")
    .find({ sectionId })
    .toArray();
  assert.ok(
    rows.every((row) =>
      row.records.every((r: any) => r.studentId !== studentId),
    ),
  );
});
test("production requires a non-default JWT secret", async () => {
  const { getJwtSecret } = await import("../server/auth.ts");
  const saved = process.env.JWT_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  } finally {
    process.env.NODE_ENV = "test";
    if (saved !== undefined) process.env.JWT_SECRET = saved;
  }
});

test("teacher cannot access another teacher through compatibility endpoints", async () => {
  const { getDatabase } = await import("../server/db.ts");
  const { ObjectId } = await import("mongodb");
  const db = getDatabase();
  const other = "650000000000000000000099",
    foreignClass = "650000000000000000000098",
    foreignSection = "650000000000000000000097",
    foreignStudent = "650000000000000000000096",
    foreignExam = "650000000000000000000095";
  await db
    .collection("classes")
    .insertOne({
      _id: new ObjectId(foreignClass),
      teacherId: other,
      name: "Private",
    });
  await db
    .collection("sections")
    .insertOne({
      _id: new ObjectId(foreignSection),
      teacherId: other,
      classId: foreignClass,
    });
  await db
    .collection("students")
    .insertOne({
      _id: new ObjectId(foreignStudent),
      teacherId: other,
      classId: foreignClass,
      sectionId: foreignSection,
    });
  await db
    .collection("examinations")
    .insertOne({
      _id: new ObjectId(foreignExam),
      teacherId: other,
      classId: foreignClass,
      maxMarks: 100,
    });
  await db
    .collection("attendance")
    .insertOne({
      teacherId: other,
      classId: foreignClass,
      sectionId: foreignSection,
      records: [],
    });
  for (const [path, body] of [
    ["/students", { sectionId: foreignSection, studentName: "No access" }],
    ["/assessments", { classId: foreignClass, name: "No access" }],
    ["/attendance/save", { sectionId: foreignSection, records: [] }],
    [
      "/marks/save-batch",
      {
        marks: [
          { studentId: foreignStudent, itemId: foreignExam, marksObtained: 99 },
        ],
      },
    ],
  ] as const)
    assert.equal((await request(path, "POST", body)).status, 403, path);
  assert.equal((await request(`/assessments/${foreignExam}`)).status, 403);
  assert.equal(
    (await request(`/attendance/student-summary/${foreignStudent}`)).status,
    403,
  );
  const attendance = await (await request("/attendance/by-class-date")).json();
  assert.ok(attendance.data.every((r: any) => r.classId !== foreignClass));
});
test("batch marks validate the entire batch before writing and preserve null scores", async () => {
  const itemId = "650000000000000000000040",
    studentId = "650000000000000000000031";
  assert.equal(
    (
      await request("/marks/save-batch", "POST", {
        marks: [{ studentId, itemId, marksObtained: null }],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/marks/save-batch", "POST", {
        marks: [
          { studentId, itemId, marksObtained: 34 },
          { studentId, itemId, marksObtained: 99999 },
        ],
      })
    ).status,
    400,
  );
  const rows = (await (await request(`/marks/by-assessment/${itemId}`)).json())
    .data;
  assert.equal(
    rows.find((r: any) => r.studentId === studentId).marksObtained,
    null,
  );
});
test("Excel marks workbook can round-trip through the import endpoint", async () => {
  const response = await request(`/sections/${sectionId}/excel/sample`);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  const imported = await request(
    `/sections/${sectionId}/excel/import`,
    "POST",
    {
      fileData:
        "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," +
        bytes.toString("base64"),
    },
  );
  assert.equal(imported.status, 200, await imported.text());
});
