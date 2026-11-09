import { prisma } from "@/lib/prisma";

export interface ChatMessage {
  id: string;
  userId: string;
  sender: "USER" | "ADMIN";
  adminId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ChatConversation {
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string | null;
  userRole?: string;
  userStatus?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  hasMessages?: boolean;
}

export type ChatBroadcastGroup =
  | "ALL"
  | "ACTIVE"
  | "PENDING_PAYMENT"
  | "FROZEN"
  | "ZERO_BALANCE"
  | "RESELLERS";

let tableEnsured = false;

export async function ensureChatTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS support_chat_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        admin_id TEXT,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_user ON support_chat_messages(user_id, created_at)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_read ON support_chat_messages(read)
    `);
    tableEnsured = true;
  } catch (err) {
    console.error("Failed to ensure support_chat_messages table:", err);
  }
}

export async function getUserChatMessages(
  userId: string,
  markRead = false
): Promise<ChatMessage[]> {
  await ensureChatTable();
  try {
    // Only mark admin messages as read when the user actively opens/views the chat
    if (markRead) {
      await prisma.$executeRawUnsafe(
        `UPDATE support_chat_messages SET read = TRUE WHERE user_id = $1 AND sender = 'ADMIN' AND read = FALSE`,
        userId
      );
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        sender: string;
        admin_id: string | null;
        message: string;
        read: boolean;
        created_at: Date;
      }>
    >(
      `SELECT id, user_id, sender, admin_id, message, read, created_at
       FROM support_chat_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 100`,
      userId
    );

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      sender: r.sender as "USER" | "ADMIN",
      adminId: r.admin_id,
      message: r.message,
      read: Boolean(r.read),
      createdAt: r.created_at.toISOString(),
    }));
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    return [];
  }
}

export async function getChatUserInfo(userId: string): Promise<ChatConversation | null> {
  await ensureChatTable();
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    if (!user) return null;

    const latestRows = await prisma.$queryRawUnsafe<
      Array<{ message: string; created_at: Date }>
    >(
      `SELECT message, created_at
       FROM support_chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      userId
    );

    const latest = latestRows[0];
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
      userRole: user.role,
      userStatus: user.status,
      lastMessage: latest?.message ?? "",
      lastMessageAt: (latest?.created_at ?? user.createdAt).toISOString(),
      unreadCount: 0,
      hasMessages: Boolean(latest),
    };
  } catch (err) {
    console.error("Error fetching chat user info:", err);
    return null;
  }
}

export async function getAdminUserChatMessages(userId: string): Promise<ChatMessage[]> {
  await ensureChatTable();
  try {
    // Mark user messages as read when staff/admin views the user's thread
    await prisma.$executeRawUnsafe(
      `UPDATE support_chat_messages SET read = TRUE WHERE user_id = $1 AND sender = 'USER' AND read = FALSE`,
      userId
    );

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        sender: string;
        admin_id: string | null;
        message: string;
        read: boolean;
        created_at: Date;
      }>
    >(
      `SELECT id, user_id, sender, admin_id, message, read, created_at
       FROM support_chat_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 100`,
      userId
    );

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      sender: r.sender as "USER" | "ADMIN",
      adminId: r.admin_id,
      message: r.message,
      read: Boolean(r.read),
      createdAt: r.created_at.toISOString(),
    }));
  } catch (err) {
    console.error("Error fetching admin user chat messages:", err);
    return [];
  }
}

export async function markChatAsRead(userId: string, senderToMark: "USER" | "ADMIN"): Promise<void> {
  await ensureChatTable();
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE support_chat_messages SET read = TRUE WHERE user_id = $1 AND sender = $2 AND read = FALSE`,
      userId,
      senderToMark
    );
  } catch (err) {
    console.error("Error marking chat messages as read:", err);
  }
}

export async function sendUserChatMessage(userId: string, message: string): Promise<ChatMessage> {
  await ensureChatTable();
  const id = `MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO support_chat_messages (id, user_id, sender, message, read, created_at)
     VALUES ($1, $2, 'USER', $3, FALSE, NOW())`,
    id,
    userId,
    message.trim()
  );

  return {
    id,
    userId,
    sender: "USER",
    adminId: null,
    message: message.trim(),
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export async function sendAdminChatMessage(
  userId: string,
  adminId: string,
  message: string
): Promise<ChatMessage> {
  await ensureChatTable();
  const id = `MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO support_chat_messages (id, user_id, sender, admin_id, message, read, created_at)
     VALUES ($1, $2, 'ADMIN', $3, $4, FALSE, NOW())`,
    id,
    userId,
    adminId,
    message.trim()
  );

  return {
    id,
    userId,
    sender: "ADMIN",
    adminId,
    message: message.trim(),
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export async function sendAdminBulkChatMessages(params: {
  adminId: string;
  message: string;
  userIds?: string[];
  targetGroup?: ChatBroadcastGroup;
}): Promise<{ sentCount: number }> {
  await ensureChatTable();
  const cleanMsg = params.message.trim();
  if (!cleanMsg) return { sentCount: 0 };

  let targetIds: string[] = [];

  if (Array.isArray(params.userIds) && params.userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: params.userIds } },
      select: { id: true },
    });
    targetIds = users.map((u) => u.id);
  } else if (params.targetGroup) {
    const where: Record<string, unknown> = {
      role: { notIn: ["ADMIN", "MANAGER", "SECRETARY"] },
    };
    if (params.targetGroup === "ACTIVE") {
      where.status = "ACTIVE";
    } else if (params.targetGroup === "PENDING_PAYMENT") {
      where.status = "PENDING_PAYMENT";
    } else if (params.targetGroup === "FROZEN") {
      where.status = "FROZEN";
    } else if (params.targetGroup === "ZERO_BALANCE") {
      where.balance = { lte: 0 };
    } else if (params.targetGroup === "RESELLERS") {
      where.role = "RESELLER";
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true },
    });
    targetIds = users.map((u) => u.id);
  }

  if (targetIds.length === 0) {
    return { sentCount: 0 };
  }

  const now = Date.now().toString(36).toUpperCase();
  await prisma.$transaction(
    targetIds.map((uid, idx) => {
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const id = `MSG-${now}-${idx.toString(36).toUpperCase()}-${rand}`;
      return prisma.$executeRawUnsafe(
        `INSERT INTO support_chat_messages (id, user_id, sender, admin_id, message, read, created_at)
         VALUES ($1, $2, 'ADMIN', $3, $4, FALSE, NOW())`,
        id,
        uid,
        params.adminId,
        cleanMsg
      );
    })
  );

  return { sentCount: targetIds.length };
}

export async function deleteChatMessage(messageId: string): Promise<boolean> {
  await ensureChatTable();
  try {
    const count = await prisma.$executeRawUnsafe(
      `DELETE FROM support_chat_messages WHERE id = $1`,
      messageId
    );
    return count > 0;
  } catch (err) {
    console.error("Error deleting chat message:", err);
    return false;
  }
}

export async function deleteUserChatThread(userId: string): Promise<boolean> {
  await ensureChatTable();
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM support_chat_messages WHERE user_id = $1`,
      userId
    );
    return true;
  } catch (err) {
    console.error("Error deleting user chat thread:", err);
    return false;
  }
}

export async function getAdminChatConversations(
  search?: string,
  includeAllUsers = false
): Promise<ChatConversation[]> {
  await ensureChatTable();
  try {
    const trimmed = search?.trim();
    let query: string;
    let params: unknown[] = [];

    if (trimmed) {
      query = `
        SELECT 
          u.id AS user_id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.status,
          COALESCE(m.message, '') AS last_message,
          COALESCE(m.created_at, u."createdAt") AS last_message_at,
          COALESCE(un.unread_count, 0) AS unread_count,
          (m.created_at IS NOT NULL) AS has_messages
        FROM "User" u
        LEFT JOIN (
          SELECT DISTINCT ON (user_id) user_id, message, created_at
          FROM support_chat_messages
          ORDER BY user_id, created_at DESC
        ) m ON m.user_id = u.id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS unread_count
          FROM support_chat_messages
          WHERE sender = 'USER' AND read = FALSE
          GROUP BY user_id
        ) un ON un.user_id = u.id
        WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.phone, '') ILIKE $1
        ORDER BY (m.created_at IS NOT NULL) DESC, COALESCE(m.created_at, u."createdAt") DESC
        LIMIT 100;
      `;
      params = [`%${trimmed}%`];
    } else if (includeAllUsers) {
      query = `
        SELECT 
          u.id AS user_id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.status,
          COALESCE(m.message, '') AS last_message,
          COALESCE(m.created_at, u."createdAt") AS last_message_at,
          COALESCE(un.unread_count, 0) AS unread_count,
          (m.created_at IS NOT NULL) AS has_messages
        FROM "User" u
        LEFT JOIN (
          SELECT DISTINCT ON (user_id) user_id, message, created_at
          FROM support_chat_messages
          ORDER BY user_id, created_at DESC
        ) m ON m.user_id = u.id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS unread_count
          FROM support_chat_messages
          WHERE sender = 'USER' AND read = FALSE
          GROUP BY user_id
        ) un ON un.user_id = u.id
        ORDER BY (m.created_at IS NOT NULL) DESC, COALESCE(m.created_at, u."createdAt") DESC
        LIMIT 100;
      `;
    } else {
      query = `
        SELECT 
          u.id AS user_id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.status,
          m.message AS last_message,
          m.created_at AS last_message_at,
          COALESCE(un.unread_count, 0) AS unread_count,
          TRUE AS has_messages
        FROM (
          SELECT DISTINCT ON (user_id) user_id, message, created_at
          FROM support_chat_messages
          ORDER BY user_id, created_at DESC
        ) m
        JOIN "User" u ON u.id = m.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS unread_count
          FROM support_chat_messages
          WHERE sender = 'USER' AND read = FALSE
          GROUP BY user_id
        ) un ON un.user_id = m.user_id
        ORDER BY m.created_at DESC
        LIMIT 100;
      `;
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        user_id: string;
        name: string;
        email: string;
        phone: string | null;
        role: string;
        status: string;
        last_message: string;
        last_message_at: Date;
        unread_count: string | number;
        has_messages: boolean;
      }>
    >(query, ...params);

    return rows.map((r) => ({
      userId: r.user_id,
      userName: r.name,
      userEmail: r.email,
      userPhone: r.phone,
      userRole: r.role,
      userStatus: r.status,
      lastMessage: r.last_message,
      lastMessageAt: r.last_message_at.toISOString(),
      unreadCount: Number(r.unread_count),
      hasMessages: Boolean(r.has_messages),
    }));
  } catch (err) {
    console.error("Error fetching admin chat conversations:", err);
    return [];
  }
}
