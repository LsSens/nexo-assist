import { dueDate } from "../domain/sla";
import type { Category, Draft, Priority, Ticket, TicketEvent, TicketStatus, TicketType } from "../domain/types";
import { getDb } from "./db";

export class LegacyUnavailableError extends Error {
  constructor() {
    super("O sistema de chamados ficou indisponível por alguns segundos.");
    this.name = "LegacyUnavailableError";
  }
}

let forcedFailures = 0;

export function armLegacyOutage(times: number): void {
  forcedFailures = times;
}

export function resetLegacyOutage(): void {
  forcedFailures = 0;
}

function touchLegacy(): void {
  if (forcedFailures > 0) {
    forcedFailures -= 1;
    throw new LegacyUnavailableError();
  }
  const rate = Number(process.env.TICKET_FLAKY ?? "0.05");
  if (Number.isFinite(rate) && rate > 0 && Math.random() < rate) throw new LegacyUnavailableError();
}

async function withRetry<T>(fn: () => T): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      if (!(error instanceof LegacyUnavailableError)) throw error;
      last = error;
      if (attempt < 2) await delay(process.env.VITEST ? 0 : 400);
    }
  }
  throw last;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TicketRow = {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  requester_id: string;
  affected: Ticket["affected"];
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  due_at: string;
};

function eventsFor(id: string): TicketEvent[] {
  const rows = getDb()
    .prepare("SELECT id, at, text, author FROM ticket_events WHERE ticket_id = ? ORDER BY at ASC")
    .all(id) as TicketEvent[];
  return rows;
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    priority: row.priority,
    status: row.status,
    requesterId: row.requester_id,
    affected: row.affected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    dueAt: row.due_at,
    events: eventsFor(row.id),
  };
}

function listSync(requesterId: string): Ticket[] {
  const rows = getDb()
    .prepare("SELECT * FROM tickets WHERE requester_id = ? ORDER BY updated_at DESC")
    .all(requesterId) as TicketRow[];
  return rows.map(mapTicket);
}

function getSync(id: string, requesterId: string): Ticket | null {
  const row = getDb()
    .prepare("SELECT * FROM tickets WHERE id = ? AND requester_id = ?")
    .get(id, requesterId) as TicketRow | undefined;
  return row ? mapTicket(row) : null;
}

export function listTickets(requesterId: string): Promise<Ticket[]> {
  return withRetry(() => {
    touchLegacy();
    return listSync(requesterId);
  });
}

export function getTicket(id: string, requesterId: string): Promise<Ticket | null> {
  return withRetry(() => {
    touchLegacy();
    return getSync(id, requesterId);
  });
}

function nextId(type: TicketType): string {
  const rows = getDb().prepare("SELECT id FROM tickets WHERE type = ?").all(type) as { id: string }[];
  let max = type === "INC" ? 20519 : 10480;
  for (const row of rows) {
    const value = Number(row.id.split("-")[1]);
    if (value > max) max = value;
  }
  return `${type}-${max + 1}`;
}

function addEvent(ticketId: string, text: string, author: string, at: Date): void {
  getDb()
    .prepare("INSERT INTO ticket_events (id, ticket_id, at, text, author) VALUES (?, ?, ?, ?, ?)")
    .run(`${ticketId}-${crypto.randomUUID().slice(0, 8)}`, ticketId, at.toISOString(), text, author);
}

export function createTicket(draft: Draft, requesterId: string): Ticket {
  const now = new Date();
  const id = nextId(draft.type);
  getDb()
    .prepare(`
      INSERT INTO tickets (
        id, type, title, description, category, subcategory, priority, status,
        requester_id, affected, created_at, updated_at, resolved_at, due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?, NULL, ?)
    `)
    .run(
      id,
      draft.type,
      draft.title,
      draft.description,
      draft.category,
      draft.subcategory,
      draft.priority,
      requesterId,
      draft.affected,
      now.toISOString(),
      now.toISOString(),
      dueDate(now, draft.priority).toISOString(),
    );
  addEvent(id, "Chamado aberto pelo Nexo Assist.", "Nexo Assist", now);
  const created = getSync(id, requesterId);
  if (!created) throw new Error("Falha ao abrir o chamado.");
  return created;
}

export function updateTicket(draft: Draft, requesterId: string): Ticket | null {
  if (!draft.ticketId) return null;
  const current = getSync(draft.ticketId, requesterId);
  if (!current) return null;
  const now = new Date();
  const description = `${current.description}\n\nComplemento: ${draft.description}`.trim();
  getDb()
    .prepare(`
      UPDATE tickets
      SET title = ?, description = ?, category = ?, priority = ?, updated_at = ?, due_at = ?
      WHERE id = ? AND requester_id = ?
    `)
    .run(
      draft.title,
      description,
      draft.category,
      draft.priority,
      now.toISOString(),
      dueDate(now, draft.priority).toISOString(),
      draft.ticketId,
      requesterId,
    );
  addEvent(draft.ticketId, `Complemento registrado: ${draft.description}`, "Nexo Assist", now);
  return getSync(draft.ticketId, requesterId);
}

export function reopenTicket(draft: Draft, requesterId: string): Ticket | null {
  if (!draft.ticketId) return null;
  const current = getSync(draft.ticketId, requesterId);
  if (!current) return null;
  const now = new Date();
  getDb()
    .prepare(`
      UPDATE tickets
      SET status = 'aberto', description = ?, priority = ?, updated_at = ?, resolved_at = NULL, due_at = ?
      WHERE id = ? AND requester_id = ?
    `)
    .run(
      `${current.description}\n\nReaberto: ${draft.description}`.trim(),
      draft.priority,
      now.toISOString(),
      dueDate(now, draft.priority).toISOString(),
      draft.ticketId,
      requesterId,
    );
  addEvent(draft.ticketId, "Chamado reaberto dentro da janela de 7 dias.", "Nexo Assist", now);
  return getSync(draft.ticketId, requesterId);
}

export function markWaiting(id: string, requesterId: string): Ticket | null {
  const current = getSync(id, requesterId);
  if (!current) return null;
  if (current.status === "resolvido" || current.status === "encerrado") return current;
  const now = new Date();
  getDb()
    .prepare("UPDATE tickets SET status = 'aguardando_analista', updated_at = ? WHERE id = ? AND requester_id = ?")
    .run(now.toISOString(), id, requesterId);
  addEvent(id, "Transferido para um analista.", "Nexo Assist", now);
  return getSync(id, requesterId);
}

export function addTicketNote(id: string, requesterId: string, text: string, author: string): void {
  const current = getSync(id, requesterId);
  if (!current) return;
  const now = new Date();
  getDb().prepare("UPDATE tickets SET updated_at = ? WHERE id = ? AND requester_id = ?").run(now.toISOString(), id, requesterId);
  addEvent(id, text, author, now);
}
