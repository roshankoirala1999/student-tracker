import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client: MongoClient | null = null;
let db: Db | null = null;
let connectionError: string | null = null;
let isConnecting = false;

function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/gi, '$1*****$2');
}

export async function connectToDatabase(): Promise<{ db: Db | null; error: string | null }> {
  if (db) {
    return { db, error: null };
  }

  const rawUri = process.env.MONGODB_URI;
  if (!rawUri || rawUri.trim() === '') {
    connectionError = 'MONGODB_URI environment variable is not configured. Please provide a valid MongoDB Atlas connection string in Settings.';
    return { db: null, error: connectionError };
  }

  const uri = rawUri.trim();

  // Validate scheme to catch malformed inputs before calling MongoClient
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    connectionError = `Invalid scheme in MONGODB_URI: expected connection string to start with "mongodb://" or "mongodb+srv://". Example format: mongodb+srv://<username>:<password>@cluster0.mongodb.net/student_tracker?retryWrites=true&w=majority`;
    console.warn('[Database Notice]', connectionError);
    return { db: null, error: connectionError };
  }

  if (isConnecting) {
    // Wait briefly for in-flight connection
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (db) return { db, error: null };
  }

  isConnecting = true;

  try {
    const mongoClient = new MongoClient(uri, {
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });

    await mongoClient.connect();
    client = mongoClient;
    db = client.db(client.options.dbName || 'student_tracker');
    connectionError = null;
    console.log('[Database] Successfully connected to MongoDB Atlas');

    // Startup migration: Unset legacy plaintext adminPasswordRecord
    try {
      await db.collection('users').updateMany({}, { $unset: { adminPasswordRecord: "" } });
    } catch (migErr) {
      console.warn('[Database] Migration notice (adminPasswordRecord unset):', migErr);
    }

    // Create vital indexes
    await initializeIndexes(db);

    return { db, error: null };
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    connectionError = sanitizeErrorMessage(`Failed to connect to MongoDB Atlas: ${rawMsg}`);
    console.warn('[Database Connection Notice]', connectionError);
    return { db: null, error: connectionError };
  } finally {
    isConnecting = false;
  }
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error(connectionError || 'Database is not connected');
  }
  return db;
}

export function isDatabaseConnected(): boolean {
  return db !== null;
}

export function getDbConnectionError(): string | null {
  return connectionError;
}

async function initializeIndexes(database: Db) {
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

    console.log('[Database] Indexes verified successfully');
  } catch (err) {
    console.warn('[Database] Warning initializing indexes:', err);
  }
}
