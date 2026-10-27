import { formatClock, formatListTime, formatRelative } from "../domain/clock";
import { PRIORITY_LABEL, STATUS_LABEL } from "../domain/labels";
import { isOpenStatus, type Ticket } from "../domain/types";
import { HttpError } from "./store";
import {
  addMessage,
  bumpMessageCount,
  getConversation,
  getUserById,
  hasActiveSession,
  listDeskConversations,
  listMessages,
  saveConversation,
} from "./store";
import { addTicketNote, listTickets } from "./tickets";

export type DeskFilter = "todas" | "para-voce" | "agent" | "minhas";

export async function listDesk(analystId: string, filter: DeskFilter, query: string) {
  const analyst = requireAnalyst(analystId);
  const now = new Date();
  const needle = query.trim().toLowerCase();
  const rows = listDeskConversations();
  const counts = {
    todas: rows.length,
    paraVoce: rows.filter((row) => row.status === "waiting_analyst").length,
    agent: rows.filter((row) => row.status === "with_agent").length,
    minhas: rows.filter((row) => row.assigneeId === analyst.id && row.status === "with_analyst").length,
  };
  const items = [];
  for (const row of rows) {
    const messages = listMessages(row.id);
    const last = messages[messages.length - 1];
    const label = statusLabel(row, analyst.id);
    const haystack = `${row.employee.name} ${row.employee.email} ${last?.text ?? ""} ${row.focusTicketId ?? ""}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    if (filter === "para-voce" && row.status !== "waiting_analyst") continue;
    if (filter === "agent" && row.status !== "with_agent") continue;
    if (filter === "minhas" && (row.assigneeId !== analyst.id || row.status !== "with_analyst")) continue;
    items.push({
      id: row.id,
      name: row.employee.name,
      email: row.employee.email,
      department: row.employee.department,
      initials: initials(row.employee.name),
      avatarBg: row.employee.avatarBg,
      avatarFg: row.employee.avatarFg,
      online: row.employee.demoOnline || hasActiveSession(row.employeeId),
      lastText: last?.text ?? "",
      timeLabel: last ? formatListTime(new Date(last.createdAt), now) : "",
      status: row.status,
      statusLabel: label.text,
      tone: label.tone,
      unread: unread(messages, row.status),
      ticketId: row.focusTicketId,
    });
  }
  return { items, counts, analyst: publicAnalyst(analyst) };
}

export async function getDeskConversation(analystId: string, conversationId: string) {
  requireAnalyst(analystId);
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  const employee = getUserById(conversation.employeeId);
  if (!employee) throw new HttpError(404, "Funcionário não encontrado.");
  const tickets = await listTickets(employee.id);
  const now = new Date();
  const assignee = conversation.assigneeId ? getUserById(conversation.assigneeId) : null;
  return {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      assigneeName: assignee?.name ?? null,
      assigneeId: conversation.assigneeId,
      queue: conversation.queue,
      summary: conversation.transferSummary,
      respondBy: conversation.respondBy,
      focusTicketId: conversation.focusTicketId,
    },
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      initials: initials(employee.name),
      avatarBg: employee.avatarBg,
      avatarFg: employee.avatarFg,
      online: employee.demoOnline || hasActiveSession(employee.id),
    },
    messages: listMessages(conversation.id),
    tickets: tickets.map((ticket) => serializeTicket(ticket, now)),
    openCount: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
    closedCount: tickets.filter((ticket) => !isOpenStatus(ticket.status)).length,
  };
}

export async function assumeConversation(analystId: string, conversationId: string) {
  const analyst = requireAnalyst(analystId);
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  if (conversation.status === "resolved") throw new HttpError(409, "Esta conversa já foi encerrada.");
  if (conversation.status === "with_analyst" && conversation.assigneeId && conversation.assigneeId !== analyst.id) {
    const other = getUserById(conversation.assigneeId);
    throw new HttpError(409, `Esta conversa está com ${other?.name ?? "outro analista"}.`);
  }
  const now = new Date();
  saveConversation(conversation.id, {
    status: "with_analyst",
    assigneeId: analyst.id,
    pending: null,
  });
  addMessage({
    conversationId: conversation.id,
    role: "system",
    text: `${analyst.name} assumiu · agent pausado · ${formatClock(now)}`,
    at: now,
  });
  if (conversation.focusTicketId) {
    addTicketNote(conversation.focusTicketId, conversation.employeeId, `Assumido por ${analyst.name}.`, analyst.name);
  }
  return getDeskConversation(analystId, conversationId);
}

export async function returnConversation(analystId: string, conversationId: string) {
  const analyst = requireAnalyst(analystId);
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  if (conversation.status === "with_analyst" && conversation.assigneeId !== analyst.id) {
    throw new HttpError(409, "Só quem assumiu pode devolver a conversa ao agent.");
  }
  if (conversation.status === "resolved") throw new HttpError(409, "Esta conversa já foi encerrada.");
  saveConversation(conversation.id, {
    status: "with_agent",
    assigneeId: null,
    pending: null,
    transferReason: null,
    transferSummary: null,
  });
  addMessage({
    conversationId: conversation.id,
    role: "system",
    text: "Devolvida ao Nexo Assist",
  });
  addMessage({
    conversationId: conversation.id,
    role: "agent",
    text: "Voltei. Pode continuar de onde paramos.",
    authorName: "Nexo Assist",
    authorTag: "IA",
  });
  bumpMessageCount(conversation.id);
  return getDeskConversation(analystId, conversationId);
}

export async function closeConversation(analystId: string, conversationId: string) {
  const analyst = requireAnalyst(analystId);
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  if (conversation.status === "with_analyst" && conversation.assigneeId !== analyst.id) {
    throw new HttpError(409, "Só quem está atendendo pode encerrar.");
  }
  saveConversation(conversation.id, { status: "resolved", pending: null, assigneeId: conversation.assigneeId });
  addMessage({
    conversationId: conversation.id,
    role: "system",
    text: `Atendimento encerrado por ${analyst.name}`,
  });
  return getDeskConversation(analystId, conversationId);
}

export async function analystMessage(analystId: string, conversationId: string, text: string) {
  const analyst = requireAnalyst(analystId);
  const body = text.trim();
  if (!body) throw new HttpError(400, "Escreva uma mensagem.");
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  if (conversation.status !== "with_analyst" || conversation.assigneeId !== analyst.id) {
    throw new HttpError(409, "Assuma o atendimento para responder.");
  }
  addMessage({
    conversationId: conversation.id,
    role: "analyst",
    text: body,
    authorName: analyst.name,
    authorTag: `Suporte ${analyst.level ?? "N1"}`,
  });
  return getDeskConversation(analystId, conversationId);
}

function requireAnalyst(userId: string) {
  const user = getUserById(userId);
  if (!user || user.role !== "analyst") throw new HttpError(403, "Apenas analistas acessam o console.");
  return user;
}

function publicAnalyst(user: NonNullable<ReturnType<typeof getUserById>>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    level: user.level,
    initials: initials(user.name),
    avatarBg: user.avatarBg,
    avatarFg: user.avatarFg,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

function statusLabel(
  row: { status: string; focusTicketId: string | null; transferReason: string | null; confidence: number | null; assigneeId: string | null },
  analystId: string,
): { text: string; tone: "danger" | "warning" | "info" | "neutral" } {
  if (row.status === "with_analyst" && row.assigneeId === analystId) return { text: "Você está atendendo", tone: "info" };
  if (row.status === "with_analyst") return { text: "Com outro analista", tone: "neutral" };
  if (row.status === "resolved") return { text: "Resolvida pelo agent", tone: "neutral" };
  if (row.status === "with_agent") return { text: "Agent atendendo", tone: "neutral" };
  if (row.transferReason === "low_confidence") {
    return { text: `Agent pediu ajuda · confiança ${Math.round((row.confidence ?? 0.41) * 100)}%`, tone: "warning" };
  }
  if (row.focusTicketId) return { text: `Transferida · ${row.focusTicketId}`, tone: "danger" };
  return { text: "Transferida", tone: "danger" };
}

function unread(messages: { role: string }[], status: string): number {
  if (status !== "waiting_analyst") return 0;
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") count += 1;
    else break;
  }
  return Math.max(count, 1);
}

function serializeTicket(ticket: Ticket, now: Date) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    category: ticket.category,
    priorityLabel: PRIORITY_LABEL[ticket.priority],
    statusLabel: STATUS_LABEL[ticket.status],
    updatedLabel: formatRelative(new Date(ticket.updatedAt), now),
    lastEvent: ticket.events[ticket.events.length - 1]?.text ?? "",
    lastEventTime: ticket.events.length ? formatClock(new Date(ticket.events[ticket.events.length - 1]!.at)) : "",
    open: isOpenStatus(ticket.status),
  };
}

