import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedDatabase } from "./seed";

const SCHEMA = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  level TEXT,
  os TEXT,
  avatar_bg TEXT NOT NULL,
  avatar_fg TEXT NOT NULL,
  password_changed_at TEXT NOT NULL,
  demo_online INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  affected TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  due_at TEXT NOT NULL
);
CREATE TABLE ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  at TEXT NOT NULL,
  text TEXT NOT NULL,
  author TEXT NOT NULL
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL,
  assignee_id TEXT,
  pending_json TEXT,
  transfer_summary TEXT,
  transfer_reason TEXT,
  confidence REAL,
  focus_ticket_id TEXT,
  queue TEXT,
  respond_by TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author_name TEXT,
  author_tag TEXT,
  payload_json TEXT
);
CREATE INDEX idx_tickets_requester ON tickets(requester_id);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_conv_employee ON conversations(employee_id, updated_at);
`;

let database: DatabaseSync | null = null;

export function dbPath(): string {
  return path.resolve(process.env.NEXO_DB ?? path.join(process.cwd(), "data", "nexo.sqlite"));
}

export function getDb(): DatabaseSync {
  if (database) return database;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  database = db;
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined;
  if (row?.value === "1") {
    const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    if (count.n === 0) seedDatabase(db);
    return;
  }
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS ticket_events;
    DROP TABLE IF EXISTS tickets;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS meta;
  `);
  db.exec(SCHEMA);
  db.prepare("INSERT INTO meta (key, value) VALUES ('schema', '1')").run();
  seedDatabase(db);
}

export function resetDatabase(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM ticket_events;
    DELETE FROM tickets;
    DELETE FROM sessions;
    DELETE FROM users;
  `);
  seedDatabase(db);
}
