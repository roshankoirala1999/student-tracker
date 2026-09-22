import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db.ts';

// Helper to determine if a role is admin
function isAdminRole(role?: string): boolean {
  return role === 'master_admin' || role === 'administrator';
}

/**
 * Get all conversation summaries for current user
 */
export async function getConversations(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const db = getDatabase();
    const isAdmin = isAdminRole(user.role);

    let messages: any[] = [];
    if (isAdmin) {
      // Find all messages involving admin
      messages = await db.collection('messages')
        .find({
          $or: [
            { senderRole: { $in: ['administrator', 'master_admin'] } },
            { recipientRole: { $in: ['administrator', 'master_admin'] } },
            { conversationId: /^admin:/ },
          ],
        })
        .sort({ createdAt: -1 })
        .toArray();
    } else {
      // Find all messages involving this teacher
      messages = await db.collection('messages')
        .find({
          $or: [
            { senderId: user.userId },
            { recipientId: user.userId },
            { conversationId: `admin:${user.userId}` },
          ],
        })
        .sort({ createdAt: -1 })
        .toArray();
    }

    // Group messages by other participant
    const conversationMap = new Map<string, {
      conversationId: string;
      participantId: string;
      participantUsername: string;
      participantFullName?: string;
      participantRole: string;
      participantPhoneNumber?: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
    }>();

    for (const msg of messages) {
      let participantId: string;
      let participantUsername: string;
      let participantFullName: string;
      let participantRole: string;

      if (isAdmin) {
        // Participant is the teacher in the conversation
        if (isAdminRole(msg.senderRole)) {
          participantId = msg.recipientId;
          participantUsername = msg.recipientUsername;
          participantFullName = msg.recipientFullName || '';
          participantRole = msg.recipientRole;
        } else {
          participantId = msg.senderId;
          participantUsername = msg.senderUsername;
          participantFullName = msg.senderFullName || '';
          participantRole = msg.senderRole;
        }
      } else {
        // Current user is teacher
        if (msg.senderId === user.userId) {
          // Other is recipient
          if (isAdminRole(msg.recipientRole) || msg.recipientId === 'admin') {
            participantId = 'admin';
            participantUsername = 'admin';
            participantFullName = 'Master Administrator';
            participantRole = 'master_admin';
          } else {
            participantId = msg.recipientId;
            participantUsername = msg.recipientUsername;
            participantFullName = msg.recipientFullName || '';
            participantRole = msg.recipientRole;
          }
        } else {
          // Other is sender
          if (isAdminRole(msg.senderRole) || msg.senderId === 'admin') {
            participantId = 'admin';
            participantUsername = 'admin';
            participantFullName = 'Master Administrator';
            participantRole = 'master_admin';
          } else {
            participantId = msg.senderId;
            participantUsername = msg.senderUsername;
            participantFullName = msg.senderFullName || '';
            participantRole = msg.senderRole;
          }
        }
      }

      if (!participantId) continue;

      const convKey = participantId;
      const isUnread = isAdmin
        ? (!msg.read && !isAdminRole(msg.senderRole))
        : (!msg.read && msg.recipientId === user.userId);

      if (!conversationMap.has(convKey)) {
        conversationMap.set(convKey, {
          conversationId: msg.conversationId,
          participantId,
          participantUsername: participantUsername || 'User',
          participantFullName: participantFullName || '',
          participantRole: participantRole || (participantId === 'admin' ? 'master_admin' : 'teacher'),
          lastMessage: msg.message,
          lastMessageAt: msg.createdAt,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        const item = conversationMap.get(convKey)!;
        if (isUnread) {
          item.unreadCount += 1;
        }
      }
    }

    // If teacher, ensure Admin conversation thread is always accessible
    if (!isAdmin && !conversationMap.has('admin')) {
      conversationMap.set('admin', {
        conversationId: `admin:${user.userId}`,
        participantId: 'admin',
        participantUsername: 'admin',
        participantFullName: 'Master Administrator',
        participantRole: 'master_admin',
        lastMessage: 'Tap to start a conversation with the Administrator',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
      });
    }

    // Enrich teacher participants with up-to-date phone number and full name if missing
    const teacherIdsToFetch: ObjectId[] = [];
    conversationMap.forEach((conv) => {
      if (conv.participantId !== 'admin' && ObjectId.isValid(conv.participantId)) {
        teacherIdsToFetch.push(new ObjectId(conv.participantId));
      }
    });

    if (teacherIdsToFetch.length > 0) {
      const usersData = await db.collection('users')
        .find({ _id: { $in: teacherIdsToFetch } })
        .project({ username: 1, fullName: 1, phoneNumber: 1 })
        .toArray();

      const userLookup = new Map<string, any>(usersData.map((u) => [u._id.toString(), u]));
      conversationMap.forEach((conv) => {
        const found = userLookup.get(conv.participantId);
        if (found) {
          conv.participantUsername = found.username || conv.participantUsername;
          conv.participantFullName = found.fullName || conv.participantFullName;
          conv.participantPhoneNumber = found.phoneNumber || '';
        }
      });
    }

    const conversations = Array.from(conversationMap.values()).sort((a, b) => {
      // Prioritize admin thread if teacher, otherwise latest message
      if (!isAdmin && a.participantId === 'admin') return -1;
      if (!isAdmin && b.participantId === 'admin') return 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return res.json({ success: true, data: conversations });
  } catch (err: any) {
    console.error('Error fetching conversations:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
}

/**
 * Search active teachers by username or 10-digit phone number
 */
export async function searchTeachers(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery) {
      return res.json({ success: true, data: [] });
    }

    const db = getDatabase();
    const cleanDigits = rawQuery.replace(/\D/g, '');
    const cleanUsername = rawQuery.replace(/^@/, '').trim();

    const searchConditions: any[] = [];

    // Match username or full name
    if (cleanUsername) {
      const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchConditions.push({ username: { $regex: escaped, $options: 'i' } });
      searchConditions.push({ fullName: { $regex: escaped, $options: 'i' } });
    }

    // Match phone number
    if (cleanDigits.length >= 3) {
      searchConditions.push({ phoneNumber: { $regex: cleanDigits } });
    }

    const queryFilter: any = {
      role: 'teacher',
      status: { $ne: 'suspended' },
      $or: searchConditions,
    };

    // Exclude current user
    if (ObjectId.isValid(user.userId)) {
      queryFilter._id = { $ne: new ObjectId(user.userId) };
    }

    const teachers = await db.collection('users')
      .find(queryFilter)
      .limit(10)
      .project({ username: 1, fullName: 1, phoneNumber: 1 })
      .toArray();

    return res.json({
      success: true,
      data: teachers.map((t) => ({
        id: t._id.toString(),
        username: t.username,
        fullName: t.fullName || '',
        phoneNumber: t.phoneNumber || '',
      })),
    });
  } catch (err: any) {
    console.error('Error searching teachers:', err);
    return res.status(500).json({ success: false, message: 'Failed to search teachers.' });
  }
}

/**
 * Get messages thread with a specific participant (admin or teacherId)
 */
export async function getThread(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const targetId = req.params.targetId;
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Target participant ID is required.' });
    }

    const db = getDatabase();
    const isAdmin = isAdminRole(user.role);

    let conversationId: string;
    let participant: {
      id: string;
      username: string;
      fullName: string;
      role: string;
      phoneNumber?: string;
    };

    if (isAdmin) {
      // Target is teacherId
      if (!ObjectId.isValid(targetId)) {
        return res.status(400).json({ success: false, message: 'Invalid teacher ID.' });
      }
      const teacher = await db.collection('users').findOne({ _id: new ObjectId(targetId) });
      if (!teacher) {
        return res.status(404).json({ success: false, message: 'Teacher not found.' });
      }
      conversationId = `admin:${targetId}`;
      participant = {
        id: teacher._id.toString(),
        username: teacher.username,
        fullName: teacher.fullName || '',
        role: teacher.role,
        phoneNumber: teacher.phoneNumber || '',
      };

      // Mark incoming messages as read by admin
      await db.collection('messages').updateMany(
        {
          conversationId,
          recipientRole: { $in: ['administrator', 'master_admin'] },
          read: false,
        },
        { $set: { read: true } }
      );
    } else {
      // Current user is teacher
      if (targetId === 'admin') {
        conversationId = `admin:${user.userId}`;
        participant = {
          id: 'admin',
          username: 'admin',
          fullName: 'Master Administrator',
          role: 'master_admin',
        };

        // Mark incoming messages as read by this teacher
        await db.collection('messages').updateMany(
          {
            conversationId,
            recipientId: user.userId,
            read: false,
          },
          { $set: { read: true } }
        );
      } else {
        // Target is another teacher
        if (!ObjectId.isValid(targetId)) {
          return res.status(400).json({ success: false, message: 'Invalid teacher ID.' });
        }
        if (targetId === user.userId) {
          return res.status(400).json({ success: false, message: 'Cannot open chat with yourself.' });
        }
        const otherTeacher = await db.collection('users').findOne({ _id: new ObjectId(targetId) });
        if (!otherTeacher) {
          return res.status(404).json({ success: false, message: 'Teacher not found.' });
        }
        conversationId = `teacher:${[user.userId, targetId].sort().join(':')}`;
        participant = {
          id: otherTeacher._id.toString(),
          username: otherTeacher.username,
          fullName: otherTeacher.fullName || '',
          role: otherTeacher.role,
          phoneNumber: otherTeacher.phoneNumber || '',
        };

        // Mark incoming messages from other teacher as read
        await db.collection('messages').updateMany(
          {
            conversationId,
            recipientId: user.userId,
            read: false,
          },
          { $set: { read: true } }
        );
      }
    }

    // Fetch messages in chronological order
    const rawMessages = await db.collection('messages')
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .toArray();

    const formattedMessages = rawMessages.map((m) => {
      const isMine = m.senderId === user.userId || (isAdmin && isAdminRole(m.senderRole));
      return {
        id: m._id.toString(),
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderUsername: m.senderUsername,
        senderFullName: m.senderFullName || '',
        senderRole: m.senderRole,
        recipientId: m.recipientId,
        recipientUsername: m.recipientUsername,
        recipientFullName: m.recipientFullName || '',
        recipientRole: m.recipientRole,
        message: m.message,
        read: !!m.read,
        createdAt: m.createdAt,
        isMine,
      };
    });

    return res.json({
      success: true,
      data: {
        conversationId,
        participant,
        messages: formattedMessages,
      },
    });
  } catch (err: any) {
    console.error('Error fetching thread:', err);
    return res.status(500).json({ success: false, message: 'Failed to load message thread.' });
  }
}

/**
 * Send a message to admin or another teacher
 * Enforces:
 * - Max length: 300 characters
 * - 30 messages/day between teachers
 * - 30 messages/day from teacher to admin
 * - Unlimited from admin to teacher
 */
export async function sendMessage(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { recipientId, message } = req.body;
    if (!recipientId || typeof recipientId !== 'string') {
      return res.status(400).json({ success: false, message: 'Recipient is required.' });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    const cleanMsg = message.trim();
    if (!cleanMsg) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    }

    if (cleanMsg.length > 300) {
      return res.status(400).json({ success: false, message: 'Message cannot exceed 300 characters.' });
    }

    if (recipientId === user.userId) {
      return res.status(400).json({ success: false, message: 'Cannot send message to yourself.' });
    }

    const db = getDatabase();
    const isAdmin = isAdminRole(user.role);
    const now = new Date().toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let recipientUsername = '';
    let recipientFullName = '';
    let recipientRole = 'teacher';
    let conversationId = '';

    if (isAdmin) {
      // Admin to Teacher: Unlimited messages
      if (!ObjectId.isValid(recipientId)) {
        return res.status(400).json({ success: false, message: 'Invalid teacher ID.' });
      }
      const teacher = await db.collection('users').findOne({ _id: new ObjectId(recipientId) });
      if (!teacher) {
        return res.status(404).json({ success: false, message: 'Teacher not found.' });
      }
      recipientUsername = teacher.username;
      recipientFullName = teacher.fullName || '';
      recipientRole = teacher.role;
      conversationId = `admin:${recipientId}`;
    } else {
      // Current user is Teacher
      if (recipientId === 'admin') {
        // Teacher to Admin: Daily limit 30
        const sentCount = await db.collection('messages').countDocuments({
          senderId: user.userId,
          recipientRole: { $in: ['administrator', 'master_admin'] },
          createdAt: { $gte: oneDayAgo },
        });

        if (sentCount >= 30) {
          return res.status(429).json({
            success: false,
            message: 'Daily message limit reached. Please try again tomorrow.',
          });
        }

        recipientUsername = 'admin';
        recipientFullName = 'Master Administrator';
        recipientRole = 'master_admin';
        conversationId = `admin:${user.userId}`;
      } else {
        // Teacher to Teacher: Daily limit 30
        if (!ObjectId.isValid(recipientId)) {
          return res.status(400).json({ success: false, message: 'Invalid recipient teacher ID.' });
        }
        const otherTeacher = await db.collection('users').findOne({ _id: new ObjectId(recipientId) });
        if (!otherTeacher) {
          return res.status(404).json({ success: false, message: 'Teacher not found.' });
        }
        if (otherTeacher.status === 'suspended') {
          return res.status(403).json({ success: false, message: 'Cannot message a suspended teacher account.' });
        }

        const sentCount = await db.collection('messages').countDocuments({
          senderId: user.userId,
          recipientRole: 'teacher',
          createdAt: { $gte: oneDayAgo },
        });

        if (sentCount >= 30) {
          return res.status(429).json({
            success: false,
            message: 'Daily message limit reached. Please try again tomorrow.',
          });
        }

        recipientUsername = otherTeacher.username;
        recipientFullName = otherTeacher.fullName || '';
        recipientRole = otherTeacher.role;
        conversationId = `teacher:${[user.userId, recipientId].sort().join(':')}`;
      }
    }

    const newDoc = {
      conversationId,
      senderId: isAdmin ? 'admin' : user.userId,
      senderUsername: isAdmin ? 'admin' : user.username,
      senderFullName: isAdmin ? 'Master Administrator' : (user.fullName || ''),
      senderRole: user.role,
      recipientId,
      recipientUsername,
      recipientFullName,
      recipientRole,
      message: cleanMsg,
      read: false,
      createdAt: now,
    };

    const insertResult = await db.collection('messages').insertOne(newDoc);

    return res.status(201).json({
      success: true,
      data: {
        id: insertResult.insertedId.toString(),
        ...newDoc,
        isMine: true,
      },
    });
  } catch (err: any) {
    console.error('Error sending message:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
}

/**
 * Get total unread message count for header indicator badge
 */
export async function getUnreadCount(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const db = getDatabase();
    const isAdmin = isAdminRole(user.role);

    let count = 0;
    if (isAdmin) {
      count = await db.collection('messages').countDocuments({
        recipientRole: { $in: ['administrator', 'master_admin'] },
        read: false,
      });
    } else {
      count = await db.collection('messages').countDocuments({
        recipientId: user.userId,
        read: false,
      });
    }

    return res.json({ success: true, data: { unreadCount: count } });
  } catch (err: any) {
    console.error('Error getting unread count:', err);
    return res.status(500).json({ success: false, message: 'Failed to get unread count.' });
  }
}

/**
 * Mark a thread as read explicitly
 */
export async function markThreadRead(req: Request, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const targetId = req.params.targetId;
    const db = getDatabase();
    const isAdmin = isAdminRole(user.role);

    let conversationId: string;
    if (isAdmin) {
      conversationId = `admin:${targetId}`;
      await db.collection('messages').updateMany(
        {
          conversationId,
          recipientRole: { $in: ['administrator', 'master_admin'] },
          read: false,
        },
        { $set: { read: true } }
      );
    } else {
      if (targetId === 'admin') {
        conversationId = `admin:${user.userId}`;
      } else {
        conversationId = `teacher:${[user.userId, targetId].sort().join(':')}`;
      }
      await db.collection('messages').updateMany(
        {
          conversationId,
          recipientId: user.userId,
          read: false,
        },
        { $set: { read: true } }
      );
    }

    return res.json({ success: true, message: 'Thread marked as read.' });
  } catch (err: any) {
    console.error('Error marking thread as read:', err);
    return res.status(500).json({ success: false, message: 'Failed to mark thread as read.' });
  }
}
