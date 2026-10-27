export type Role = "employee" | "analyst";
export type AnalystLevel = "N1" | "N2";
export type TicketType = "INC" | "REQ";
export type Category =
  | "Acesso"
  | "Rede e VPN"
  | "Hardware"
  | "Software"
  | "E-mail"
  | "Outros";
export type Priority = "critica" | "alta" | "media" | "baixa";
export type TicketStatus =
  | "aberto"
  | "em_andamento"
  | "aguardando_analista"
  | "aprovado"
  | "resolvido"
  | "encerrado";
export type Affected = "self" | "team" | "company" | "unknown";
export type Urgency = "down" | "blocked" | "same_day" | "workaround" | "none";
export type ConversationStatus =
  | "with_agent"
  | "waiting_analyst"
  | "with_analyst"
  | "resolved";
export type TransferReason = "user" | "critical" | "overdue" | "low_confidence";
export type OutOfScope = "rh" | "financeiro" | "facilities";

export type Intent =
  | "greeting"
  | "kb"
  | "status"
  | "select_ticket"
  | "open"
  | "update"
  | "confirm"
  | "cancel"
  | "transfer"
  | "decline"
  | "add_info"
  | "out_of_scope"
  | "unclear";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  level: AnalystLevel | null;
  os: string | null;
  avatarBg: string;
  avatarFg: string;
  passwordChangedAt: string;
  demoOnline: boolean;
};

export type TicketEvent = {
  id: string;
  at: string;
  text: string;
  author: string;
};

export type Ticket = {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  requesterId: string;
  affected: Affected;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  dueAt: string;
  events: TicketEvent[];
};

export type DecisionTrace = {
  understood: string;
  intent: Intent;
  action: string;
  confidence: number;
  why: string;
  interpreter: "rules" | "mastra";
  model: string | null;
  tools: { name: string; detail: string }[];
  usage?: { promptTokens: number; completionTokens: number };
};

export type QuickOption = { id: string; n: number; label: string };

export type TicketChoice = {
  id: string;
  title: string;
  status: string;
  date: string;
};

export type CardField = {
  key: string;
  value: string;
  tone?: "default" | "warning";
  note?: string;
};

export type CardAction = {
  id: string;
  label: string;
  style: "primary" | "secondary" | "ghost";
  hint?: string;
};

export type TicketCard = {
  variant: "draft" | "ticket";
  eyebrow: string;
  code?: string;
  badge: { label: string; tone: "warning" | "success" | "info" | "neutral" | "danger" };
  title: string;
  description: string;
  fields: CardField[];
  actions?: CardAction[];
};

export type MessagePayload = {
  actions?: string[];
  trace?: DecisionTrace;
  question?: string;
  options?: QuickOption[];
  choices?: TicketChoice[];
  card?: TicketCard;
  followups?: { id: string; label: string }[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "analyst" | "system";
  text: string;
  createdAt: string;
  authorName: string | null;
  authorTag: string | null;
  payload: MessagePayload | null;
};

export type Draft = {
  code: string;
  mode: "create" | "update" | "reopen";
  ticketId?: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  affected: Affected;
  dueAt: string;
};

export type AffectedPartial = {
  mode: "create";
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  urgency: Urgency;
};

export type Pending =
  | { kind: "affected"; partial: AffectedPartial }
  | { kind: "draft"; draft: Draft }
  | { kind: "pick" }
  | { kind: "transfer_offer"; ticketId?: string }
  | { kind: "add_info"; ticketId: string };

export type DraftOverride = {
  title?: string;
  description?: string;
  category?: Category;
  priority?: Priority;
};

export function isOpenStatus(status: TicketStatus): boolean {
  return status !== "resolvido" && status !== "encerrado";
}
