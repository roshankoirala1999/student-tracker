import { MongoClient, Db, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

dotenv.config();

let client: MongoClient | null = null;
let db: Db | null = null;
let connectionError: string | null = null;
let isConnecting = false;
let usingInMemoryFallback = false;

export function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '';
  return msg.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/gi, '$1*****$2');
}

// ---------------------------------------------------------
// High-Fidelity In-Memory MongoDB Engine (Fallback for AI Studio)
// ---------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'server', '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function matchesFilter(doc: any, filter: any): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (filter.$or && Array.isArray(filter.$or)) {
    const orMatched = filter.$or.some((sub: any) => matchesFilter(doc, sub));
    if (!orMatched) return false;
  }

  for (const [key, filterVal] of Object.entries(filter)) {
    if (key === '$or') continue;

    let docVal: any;
    if (key.includes('.')) {
      const parts = key.split('.');
      docVal = doc;
      for (const p of parts) {
        if (docVal == null) break;
        docVal = docVal[p];
      }
    } else {
      docVal = doc[key];
    }

    if (filterVal === undefined) continue;

    if (filterVal === null) {
      if (docVal !== null && docVal !== undefined) return false;
      continue;
    }

    // Query operators: $in, $nin, $regex, $gt, $gte, $lt, $lte, $ne, $exists
    if (typeof filterVal === 'object' && !(filterVal instanceof RegExp) && !(filterVal instanceof ObjectId)) {
      const ops = Object.keys(filterVal);
      const isOpObj = ops.some((k) => k.startsWith('$'));

      if (isOpObj) {
        if ('$in' in filterVal) {
          const inList = filterVal.$in;
          if (!Array.isArray(inList)) return false;
          const matched = inList.some((item: any) => {
            if (item instanceof ObjectId || typeof item === 'string') {
              return String(item) === String(docVal);
            }
            return item === docVal;
          });
          if (!matched) return false;
        }
        if ('$nin' in filterVal) {
          const ninList = filterVal.$nin;
          if (Array.isArray(ninList)) {
            const found = ninList.some((item: any) => String(item) === String(docVal));
            if (found) return false;
          }
        }
        if ('$regex' in filterVal) {
          const regVal = (filterVal as any).$regex;
          const regOpt = (filterVal as any).$options || '';
          const regex = regVal instanceof RegExp ? regVal : new RegExp(String(regVal), regOpt);
          if (!regex.test(String(docVal ?? ''))) return false;
        }
        if ('$gt' in filterVal && !(docVal > filterVal.$gt)) return false;
        if ('$gte' in filterVal && !(docVal >= filterVal.$gte)) return false;
        if ('$lt' in filterVal && !(docVal < filterVal.$lt)) return false;
        if ('$lte' in filterVal && !(docVal <= filterVal.$lte)) return false;
        if ('$ne' in filterVal && String(docVal) === String(filterVal.$ne)) return false;
        if ('$exists' in filterVal) {
          const exists = docVal !== undefined;
          if (exists !== Boolean(filterVal.$exists)) return false;
        }
        continue;
      }
    }

    // RegExp matching
    if (filterVal instanceof RegExp) {
      if (!filterVal.test(String(docVal ?? ''))) return false;
      continue;
    }

    // ID matching (handles string and ObjectId comparisons)
    if (key === '_id' || key.endsWith('Id') || filterVal instanceof ObjectId || docVal instanceof ObjectId) {
      const docStr = docVal != null ? (docVal.toString ? docVal.toString() : String(docVal)) : '';
      const filterStr = filterVal != null ? (filterVal.toString ? filterVal.toString() : String(filterVal)) : '';
      if (docStr !== filterStr) return false;
      continue;
    }

    // Exact primitive equality
    if (docVal !== filterVal) {
      return false;
    }
  }

  return true;
}

function sortDocs(docs: any[], sortObj?: Record<string, 1 | -1>): any[] {
  if (!sortObj || Object.keys(sortObj).length === 0) return docs;
  const entries = Object.entries(sortObj);
  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const valA = a[field];
      const valB = b[field];
      if (valA === valB) continue;
      if (valA == null) return dir;
      if (valB == null) return -dir;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * dir;
      }
      const strA = String(valA);
      const strB = String(valB);
      const cmp = strA.localeCompare(strB);
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
}

function applyUpdate(doc: any, update: any) {
  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = v;
      } else {
        doc[k] = v;
      }
    }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let target = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) break;
          target = target[parts[i]];
        }
        if (target) delete target[parts[parts.length - 1]];
      } else {
        delete doc[k];
      }
    }
  }
}

class InMemoryCursor {
  private docs: any[];
  private sortObj?: Record<string, 1 | -1>;
  private limitCount?: number;
  private skipCount?: number;

  constructor(docs: any[]) {
    this.docs = docs;
  }

  sort(s: Record<string, 1 | -1>) {
    this.sortObj = s;
    return this;
  }

  limit(l: number) {
    this.limitCount = l;
    return this;
  }

  skip(s: number) {
    this.skipCount = s;
    return this;
  }

  async toArray(): Promise<any[]> {
    let res = sortDocs(this.docs, this.sortObj);
    if (this.skipCount) res = res.slice(this.skipCount);
    if (this.limitCount) res = res.slice(0, this.limitCount);
    return res.map((d) => {
      const cloned = { ...d };
      if (cloned._id && typeof cloned._id === 'string' && ObjectId.isValid(cloned._id)) {
        cloned._id = new ObjectId(cloned._id);
      }
      return cloned;
    });
  }
}

class InMemoryCollection {
  private name: string;
  private docs: any[] = [];
  private onMutate: () => void;

  constructor(name: string, initialDocs: any[], onMutate: () => void) {
    this.name = name;
    this.docs = initialDocs;
    this.onMutate = onMutate;
  }

  getDocs() {
    return this.docs;
  }

  find(filter: any = {}) {
    const matched = this.docs.filter((d) => matchesFilter(d, filter));
    return new InMemoryCursor(matched);
  }

  async findOne(filter: any = {}): Promise<any | null> {
    const doc = this.docs.find((d) => matchesFilter(d, filter));
    if (!doc) return null;
    const cloned = { ...doc };
    if (cloned._id && typeof cloned._id === 'string' && ObjectId.isValid(cloned._id)) {
      cloned._id = new ObjectId(cloned._id);
    }
    return cloned;
  }

  async insertOne(doc: any): Promise<{ insertedId: ObjectId | string; acknowledged: boolean }> {
    const newDoc = { ...doc };
    if (!newDoc._id) {
      newDoc._id = new ObjectId();
    }
    this.docs.push(newDoc);
    this.onMutate();
    return { insertedId: newDoc._id, acknowledged: true };
  }

  async insertMany(docs: any[]): Promise<{ insertedIds: Record<number, any>; acknowledged: boolean }> {
    const insertedIds: Record<number, any> = {};
    docs.forEach((doc, idx) => {
      const newDoc = { ...doc };
      if (!newDoc._id) {
        newDoc._id = new ObjectId();
      }
      this.docs.push(newDoc);
      insertedIds[idx] = newDoc._id;
    });
    this.onMutate();
    return { insertedIds, acknowledged: true };
  }

  async updateOne(
    filter: any,
    update: any,
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: any }> {
    const doc = this.docs.find((d) => matchesFilter(d, filter));
    if (!doc) {
      if (options?.upsert) {
        const newDoc: any = {};
        for (const [k, v] of Object.entries(filter)) {
          if (!k.startsWith('$') && typeof v !== 'object') {
            newDoc[k] = v;
          }
        }
        newDoc._id = new ObjectId();
        applyUpdate(newDoc, update);
        this.docs.push(newDoc);
        this.onMutate();
        return { matchedCount: 0, modifiedCount: 1, upsertedId: newDoc._id };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }

    applyUpdate(doc, update);
    this.onMutate();
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter: any, update: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    const matched = this.docs.filter((d) => matchesFilter(d, filter));
    matched.forEach((d) => applyUpdate(d, update));
    if (matched.length > 0) {
      this.onMutate();
    }
    return { matchedCount: matched.length, modifiedCount: matched.length };
  }

  async deleteOne(filter: any): Promise<{ deletedCount: number }> {
    const idx = this.docs.findIndex((d) => matchesFilter(d, filter));
    if (idx !== -1) {
      this.docs.splice(idx, 1);
      this.onMutate();
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter: any): Promise<{ deletedCount: number }> {
    const initialLen = this.docs.length;
    this.docs = this.docs.filter((d) => !matchesFilter(d, filter));
    const deletedCount = initialLen - this.docs.length;
    if (deletedCount > 0) {
      this.onMutate();
    }
    return { deletedCount };
  }

  async countDocuments(filter: any = {}): Promise<number> {
    return this.docs.filter((d) => matchesFilter(d, filter)).length;
  }

  async createIndex(keys: any, options?: any): Promise<string> {
    return 'index_ok';
  }

  aggregate(pipeline: any[]) {
    let result = [...this.docs];
    for (const stage of pipeline) {
      if (stage.$match) {
        result = result.filter((d) => matchesFilter(d, stage.$match));
      } else if (stage.$group) {
        const groupKeyExpr = stage.$group._id;
        const fieldName =
          typeof groupKeyExpr === 'string' && groupKeyExpr.startsWith('$') ? groupKeyExpr.slice(1) : null;

        const groups = new Map<string, any>();
        for (const item of result) {
          const groupVal = fieldName ? item[fieldName] : null;
          const key = groupVal ? (groupVal.toString ? groupVal.toString() : String(groupVal)) : 'null';
          if (!groups.has(key)) {
            groups.set(key, { _id: groupVal });
          }
          const g = groups.get(key);
          for (const [accKey, accExpr] of Object.entries(stage.$group)) {
            if (accKey === '_id') continue;
            if (typeof accExpr === 'object' && accExpr !== null && '$sum' in (accExpr as any)) {
              const sumVal = (accExpr as any).$sum;
              const inc =
                typeof sumVal === 'number'
                  ? sumVal
                  : typeof sumVal === 'string' && sumVal.startsWith('$')
                  ? Number(item[sumVal.slice(1)] || 0)
                  : 1;
              g[accKey] = (g[accKey] || 0) + inc;
            }
          }
        }
        result = Array.from(groups.values());
      } else if (stage.$sort) {
        result = sortDocs(result, stage.$sort);
      } else if (stage.$limit) {
        result = result.slice(0, stage.$limit);
      }
    }

    return {
      toArray: async () => result,
    };
  }
}

class InMemoryDb {
  private collections: Map<string, InMemoryCollection> = new Map();
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    let storedData: Record<string, any[]> = {};
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        storedData = JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    // Seed defaults if empty
    if (!storedData.users || storedData.users.length === 0) {
      storedData = this.getSeedData();
    }

    for (const [colName, docs] of Object.entries(storedData)) {
      this.collections.set(
        colName,
        new InMemoryCollection(colName, docs, () => this.scheduleSave())
      );
    }
  }

  private getSeedData(): Record<string, any[]> {
    const adminId = new ObjectId('650000000000000000000001');
    const teacherId = new ObjectId('650000000000000000000002');
    const classId = new ObjectId('650000000000000000000010');
    const secAId = new ObjectId('650000000000000000000020');
    const secBId = new ObjectId('650000000000000000000021');
    const examId = new ObjectId('650000000000000000000040');
    const assignId = new ObjectId('650000000000000000000050');

    const s1Id = new ObjectId('650000000000000000000030');
    const s2Id = new ObjectId('650000000000000000000031');
    const s3Id = new ObjectId('650000000000000000000032');
    const s4Id = new ObjectId('650000000000000000000033');

    const now = new Date().toISOString();

    return {
      system_settings: [
        { _id: 'new_user_defaults', expiryMode: false, canDeleteAccount: true, defaultDays: 30 },
        { _id: 'developer_contact', name: 'Support Team', email: 'support@studenttracker.local', phoneNumber: '9800000000' },
      ],
      users: [
        {
          _id: adminId,
          username: 'admin',
          passwordHash: bcrypt.hashSync('AdminPassword123!', 10),
          fullName: 'System Administrator',
          phoneNumber: '9800000001',
          college: 'District Education Board',
          role: 'master_admin',
          status: 'active',
          mustChangePassword: false,
          tokenVersion: 0,
          createdAt: now,
        },
        {
          _id: teacherId,
          username: 'teacher1',
          passwordHash: bcrypt.hashSync('TeacherPassword123!', 10),
          fullName: 'Roshan Koirala',
          phoneNumber: '9812345678',
          college: 'Kathmandu Model College',
          dob: '1995-05-15',
          customFields: {},
          role: 'teacher',
          status: 'active',
          isDeletionLocked: false,
          mustChangePassword: false,
          tokenVersion: 0,
          expiryMode: false,
          createdAt: now,
        },
      ],
      classes: [
        {
          _id: classId,
          teacherId: teacherId.toString(),
          name: 'Class 10 - Computer Science',
          order: 1,
          attendanceEnabled: true,
          createdAt: now,
        },
      ],
      sections: [
        {
          _id: secAId,
          classId: classId.toString(),
          teacherId: teacherId.toString(),
          name: 'Section A',
          order: 1,
          createdAt: now,
        },
        {
          _id: secBId,
          classId: classId.toString(),
          teacherId: teacherId.toString(),
          name: 'Section B',
          order: 2,
          createdAt: now,
        },
      ],
      students: [
        {
          _id: s1Id,
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentName: 'Aarav Sharma',
          rollNumber: 1,
          symbolNumber: 'CS10-01',
          contactNumber: '9841234560',
          createdAt: now,
        },
        {
          _id: s2Id,
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentName: 'Bikash Thapa',
          rollNumber: 2,
          symbolNumber: 'CS10-02',
          contactNumber: '9841234561',
          createdAt: now,
        },
        {
          _id: s3Id,
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentName: 'Diya Shrestha',
          rollNumber: 3,
          symbolNumber: 'CS10-03',
          contactNumber: '9841234562',
          createdAt: now,
        },
        {
          _id: s4Id,
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secBId.toString(),
          studentName: 'Kiran Adhikari',
          rollNumber: 1,
          symbolNumber: 'CS10-04',
          contactNumber: '9841234563',
          createdAt: now,
        },
      ],
      examinations: [
        {
          _id: examId,
          classId: classId.toString(),
          teacherId: teacherId.toString(),
          name: 'First Terminal Examination',
          maxMarks: 100,
          createdAt: now,
        },
      ],
      assignments: [
        {
          _id: assignId,
          classId: classId.toString(),
          teacherId: teacherId.toString(),
          name: 'Practical Lab Project',
          maxMarks: 25,
          createdAt: now,
        },
      ],
      marks: [
        {
          _id: new ObjectId(),
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentId: s1Id.toString(),
          itemId: examId.toString(),
          itemType: 'examination',
          marksObtained: 88,
          updatedAt: now,
        },
        {
          _id: new ObjectId(),
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentId: s1Id.toString(),
          itemId: assignId.toString(),
          itemType: 'assignment',
          marksObtained: 22,
          updatedAt: now,
        },
        {
          _id: new ObjectId(),
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentId: s2Id.toString(),
          itemId: examId.toString(),
          itemType: 'examination',
          marksObtained: 74,
          updatedAt: now,
        },
        {
          _id: new ObjectId(),
          teacherId: teacherId.toString(),
          classId: classId.toString(),
          sectionId: secAId.toString(),
          studentId: s3Id.toString(),
          itemId: examId.toString(),
          itemType: 'examination',
          marksObtained: 95,
          updatedAt: now,
        },
      ],
      attendance: [],
      messages: [],
      notifications: [],
      profile_questions: [],
    };
  }

  private scheduleSave() {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const state: Record<string, any[]> = {};
        for (const [colName, col] of this.collections.entries()) {
          state[colName] = col.getDocs();
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
      } catch {
        // ignore disk save error
      }
    }, 400);
  }

  collection(name: string): any {
    if (!this.collections.has(name)) {
      this.collections.set(
        name,
        new InMemoryCollection(name, [], () => this.scheduleSave())
      );
    }
    return this.collections.get(name);
  }
}

// ---------------------------------------------------------
// Connection Lifecycle
// ---------------------------------------------------------

export async function connectToDatabase(): Promise<{ db: Db | null; error: string | null }> {
  if (db) {
    return { db, error: null };
  }

  const rawUri = process.env.MONGODB_URI;

  // If a real URI is configured, attempt connecting to it first
  if (rawUri && (rawUri.startsWith('mongodb://') || rawUri.startsWith('mongodb+srv://'))) {
    if (isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (db) return { db, error: null };
    }

    isConnecting = true;
    try {
      const mongoClient = new MongoClient(rawUri.trim(), {
        connectTimeoutMS: 2500,
        serverSelectionTimeoutMS: 2500,
        maxPoolSize: 10,
      });

      await mongoClient.connect();
      client = mongoClient;
      db = client.db(client.options.dbName || 'student_tracker');
      connectionError = null;
      usingInMemoryFallback = false;
      console.log('[Database] Connected to external MongoDB Atlas');

      try {
        await db.collection('users').updateMany({}, { $unset: { adminPasswordRecord: '', plainPassword: '' } });
      } catch {
        // ignore
      }

      await initializeIndexes(db);
      return { db, error: null };
    } catch (err: any) {
      const msg = sanitizeErrorMessage(err?.message || String(err));
      console.warn('[Database Notice]: External MongoDB Atlas connection failed (' + msg + '). Falling back to fast In-Memory storage.');
    } finally {
      isConnecting = false;
    }
  }

  // Graceful In-Memory fallback for AI Studio environment
  console.log('[Database] Initializing In-Memory Document Database (Zero-Configuration Fallback)...');
  const memoryDb = new InMemoryDb();
  db = memoryDb as unknown as Db;
  usingInMemoryFallback = true;
  connectionError = null;

  return { db, error: null };
}

export function getDatabase(): Db {
  if (!db) {
    // If not connected yet, initialize in-memory fallback on demand
    const memoryDb = new InMemoryDb();
    db = memoryDb as unknown as Db;
    usingInMemoryFallback = true;
    connectionError = null;
  }
  return db;
}

export function isDatabaseConnected(): boolean {
  return db !== null;
}

export function getDbConnectionError(): string | null {
  return connectionError;
}

export async function initializeIndexes(database: Db): Promise<void> {
  try {
    const usersCol = database.collection('users');
    await usersCol.createIndex({ username: 1 }, { unique: true });

    const classesCol = database.collection('classes');
    await classesCol.createIndex({ teacherId: 1, name: 1 });

    const sectionsCol = database.collection('sections');
    await sectionsCol.createIndex({ classId: 1, name: 1 });
    await sectionsCol.createIndex({ teacherId: 1 });

    const studentsCol = database.collection('students');
    await studentsCol.createIndex({ sectionId: 1, rollNumber: 1 }, { unique: true });
    await studentsCol.createIndex({ sectionId: 1, symbolNumber: 1 }, { unique: true });
    await studentsCol.createIndex({ teacherId: 1 });

    const examsCol = database.collection('examinations');
    await examsCol.createIndex({ classId: 1, teacherId: 1 });

    const assignmentsCol = database.collection('assignments');
    await assignmentsCol.createIndex({ classId: 1, teacherId: 1 });

    const marksCol = database.collection('marks');
    await marksCol.createIndex({ studentId: 1, itemId: 1 }, { unique: true });
    await marksCol.createIndex({ sectionId: 1 });

    const attendanceCol = database.collection('attendance');
    await attendanceCol.createIndex({ sectionId: 1, dayNumber: 1 }, { unique: true });
    await attendanceCol.createIndex({ teacherId: 1 });

    const messagesCol = database.collection('messages');
    await messagesCol.createIndex({ senderId: 1, recipientId: 1, createdAt: -1 });

    const notificationsCol = database.collection('notifications');
    await notificationsCol.createIndex({ recipientId: 1, createdAt: -1 });

    console.log('[Database] Indexes verified successfully');
  } catch (err) {
    console.warn('[Database] Warning initializing indexes:', err);
  }
}
