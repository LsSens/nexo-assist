import { formatClock } from "../domain/clock";
import { addBusinessHours } from "../domain/sla";
import type { ChatMessage, MessagePayload, Pending, TransferReason, User } from "../domain/types";
import { getDb } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
  department: string;
  level: "N1" | "N2" | null;
  os: string | null;
  avatar_bg: string;
  avatar_fg: string;
  password_changed_at: string;
  demo_online: number;
};

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    level: row.level,
    os: row.os,
    avatarBg: row.avatar_bg,
    avatarFg: row.avatar_fg,
    passwordChangedAt: row.password_changed_at,
    demoOnline: row.demo_online === 1,
  };
}

export function getUserByEmail(email: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserById(id: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function createSession(userId: string, remember: boolean): { id: string; maxAge: number } {
  const id = crypto.randomUUID();
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const expires = new Date(Date.now() + maxAge * 1000).toISOString();
  getDb().prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires);
  return { id, maxAge };
}

export function deleteSession(id: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function getUserBySession(sessionId: string): User | null {
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, new Date().toISOString()) as UserRow | undefined;
  if (!row) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return mapUser(row);
}

export function hasActiveSession(userId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM sessions WHERE user_id = ? AND expires_at > ? LIMIT 1")
    .get(userId, new Date().toISOString()) as { ok: number } | undefined;
  return Boolean(row);
}

export type ConversationRecord = {
  id: string;
  employeeId: string;
  status: "with_agent" | "waiting_analyst" | "with_analyst" | "resolved";
  assigneeId: string | null;
  pending: Pending | null;
  transferSummary: string | null;
  transferReason: TransferReason | null;
  confidence: number | null;
  focusTicketId: string | null;
  queue: "N1" | "N2" | null;
  respondBy: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type ConvRow = {
  id: string;
  employee_id: string;
  status: ConversationRecord["status"];
  assignee_id: string | null;
  pending_json: string | null;
  transfer_summary: string | null;
  transfer_reason: TransferReason | null;
  confidence: number | null;
  focus_ticket_id: string | null;
  queue: "N1" | "N2" | null;
  respond_by: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

function mapConversation(row: ConvRow): ConversationRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    status: row.status,
    assigneeId: row.assignee_id,
    pending: parseJson<Pending>(row.pending_json),
    transferSummary: row.transfer_summary,
    transferReason: row.transfer_reason,
    confidence: row.confidence,
    focusTicketId: row.focus_ticket_id,
    queue: row.queue,
    respondBy: row.respond_by,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getLatestConversation(employeeId: string): ConversationRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE employee_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(employeeId) as ConvRow | undefined;
  return row ? mapConversation(row) : null;
}

export function getConversation(id: string): ConversationRecord | null {
  const row = getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConvRow | undefined;
  return row ? mapConversation(row) : null;
}

export function createConversation(employeeId: string): ConversationRecord {
  const now = new Date().toISOString();
  const id = `c-${crypto.randomUUID().slice(0, 8)}`;
  getDb()
    .prepare(`
      INSERT INTO conversations (
        id, employee_id, status, message_count, created_at, updated_at
      ) VALUES (?, ?, 'with_agent', 0, ?, ?)
    `)
    .run(id, employeeId, now, now);
  const created = getConversation(id);
  if (!created) throw new Error("Falha ao abrir a conversa.");
  return created;
}

export function saveConversation(
  id: string,
  patch: Partial<{
    status: ConversationRecord["status"];
    assigneeId: string | null;
    pending: Pending | null;
    transferSummary: string | null;
    transferReason: TransferReason | null;
    confidence: number | null;
    focusTicketId: string | null;
    queue: "N1" | "N2" | null;
    respondBy: string | null;
    messageCount: number;
  }>,
): void {
  const sets: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [new Date().toISOString()];
  const write = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.status) write("status", patch.status);
  if ("assigneeId" in patch) write("assignee_id", patch.assigneeId ?? null);
  if ("pending" in patch) write("pending_json", patch.pending ? JSON.stringify(patch.pending) : null);
  if ("transferSummary" in patch) write("transfer_summary", patch.transferSummary ?? null);
  if ("transferReason" in patch) write("transfer_reason", patch.transferReason ?? null);
  if ("confidence" in patch) write("confidence", patch.confidence ?? null);
  if ("focusTicketId" in patch) write("focus_ticket_id", patch.focusTicketId ?? null);
  if ("queue" in patch) write("queue", patch.queue ?? null);
  if ("respondBy" in patch) write("respond_by", patch.respondBy ?? null);
  if (patch.messageCount != null) write("message_count", patch.messageCount);
  values.push(id);
  getDb().prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function bumpMessageCount(id: string): void {
  getDb()
    .prepare("UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ChatMessage["role"];
  text: string;
  created_at: string;
  author_name: string | null;
  author_tag: string | null;
  payload_json: string | null;
};

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    createdAt: row.created_at,
    authorName: row.author_name,
    authorTag: row.author_tag,
    payload: parseJson<MessagePayload>(row.payload_json),
  };
}

export function listMessages(conversationId: string): ChatMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC")
    .all(conversationId) as MessageRow[];
  return rows.map(mapMessage);
}

export function addMessage(input: {
  conversationId: string;
  role: ChatMessage["role"];
  text: string;
  authorName?: string | null;
  authorTag?: string | null;
  payload?: MessagePayload | null;
  at?: Date;
}): ChatMessage {
  const at = input.at ?? new Date();
  const id = `m-${crypto.randomUUID().slice(0, 8)}`;
  getDb()
    .prepare(`
      INSERT INTO messages (id, conversation_id, role, text, created_at, author_name, author_tag, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      input.conversationId,
      input.role,
      input.text,
      at.toISOString(),
      input.authorName ?? null,
      input.authorTag ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    );
  getDb().prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(at.toISOString(), input.conversationId);
  return {
    id,
    role: input.role,
    text: input.text,
    createdAt: at.toISOString(),
    authorName: input.authorName ?? null,
    authorTag: input.authorTag ?? null,
    payload: input.payload ?? null,
  };
}

export function listDeskConversations(): (ConversationRecord & { employee: User })[] {
  const rows = getDb()
    .prepare(`
      SELECT c.*, u.name, u.email, u.role, u.department, u.level, u.os, u.avatar_bg, u.avatar_fg,
             u.password_changed_at, u.demo_online
      FROM conversations c
      JOIN users u ON u.id = c.employee_id
      ORDER BY c.updated_at DESC
    `)
    .all() as (ConvRow & UserRow)[];
  return rows.map((row) => ({
    ...mapConversation(row),
    employee: mapUser({ ...row, id: row.employee_id }),
  }));
}

export function analystReplyDeadline(now: Date): string {
  return addBusinessHours(now, 2).toISOString();
}

export function clockLabel(iso: string): string {
  return formatClock(new Date(iso));
}
