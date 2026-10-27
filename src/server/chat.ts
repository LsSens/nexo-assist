import { formatClock } from "../domain/clock";
import { materialize, planTurn, corpusFor } from "../domain/plan";
import type { Facts } from "../domain/plan-types";
import { mergeFacts, understandRules } from "../domain/understand";
import type { ChatMessage, ConversationStatus, DraftOverride, MessagePayload } from "../domain/types";
import { mastraEnabled } from "./model";
import {
  addMessage,
  analystReplyDeadline,
  bumpMessageCount,
  createConversation,
  getConversation,
  getLatestConversation,
  getUserById,
  HttpError,
  listMessages,
  saveConversation,
  type ConversationRecord,
} from "./store";
import {
  createTicket,
  LegacyUnavailableError,
  listTickets,
  markWaiting,
  reopenTicket,
  updateTicket,
} from "./tickets";

const SESSION_LIMIT = 30;

export type ChatState = {
  conversation: {
    id: string;
    status: ConversationStatus;
    messageCount: number;
    assigneeName: string | null;
    queue: "N1" | "N2" | null;
  } | null;
  messages: ChatMessage[];
};

export async function getEmployeeChat(userId: string): Promise<ChatState> {
  const conversation = getLatestConversation(userId);
  return snapshot(conversation);
}

export async function startEmployeeSession(userId: string): Promise<ChatState> {
  const current = getLatestConversation(userId);
  if (current && (current.status === "waiting_analyst" || current.status === "with_analyst")) {
    throw new HttpError(409, "Há um analista nesta conversa. Espere o encerramento para abrir outra sessão.");
  }
  if (current && current.status !== "resolved") {
    saveConversation(current.id, { status: "resolved", pending: null });
    addMessage({
      conversationId: current.id,
      role: "system",
      text: "Sessão encerrada. Uma nova conversa foi aberta.",
    });
  }
  return snapshot(createConversation(userId));
}

export async function sendEmployeeMessage(
  userId: string,
  input: { text: string; optionId?: string; draft?: DraftOverride },
): Promise<ChatState> {
  const user = getUserById(userId);
  if (!user || user.role !== "employee") throw new HttpError(403, "Acesso negado.");
  const text = input.text.trim();
  if (!text) throw new HttpError(400, "Escreva uma mensagem.");
  if (text.length > 2000) throw new HttpError(400, "A mensagem passa de 2000 caracteres.");

  let conversation = getLatestConversation(userId);
  if (!conversation || conversation.status === "resolved") conversation = createConversation(userId);

  if (conversation.status !== "with_agent") {
    addMessage({
      conversationId: conversation.id,
      role: "user",
      text,
      authorName: user.name,
    });
    return snapshot(getConversation(conversation.id));
  }

  if (conversation.messageCount >= SESSION_LIMIT) {
    throw new HttpError(409, "Esta sessão chegou a 30 mensagens. Inicie uma nova sessão.");
  }

  addMessage({ conversationId: conversation.id, role: "user", text, authorName: user.name });
  bumpMessageCount(conversation.id);

  let tickets;
  try {
    tickets = await listTickets(userId);
  } catch (error) {
    if (error instanceof LegacyUnavailableError) {
      rememberOutage(conversation.id);
      return snapshot(getConversation(conversation.id));
    }
    throw error;
  }

  const rules = understandRules(text, input.optionId);
  const interpreted = await interpret(userId, text, conversation, rules);
  const now = new Date();
  const plan = planTurn({
    now,
    user: { id: user.id, name: user.name, os: user.os },
    text,
    optionId: input.optionId,
    draftOverride: input.draft,
    facts: interpreted.facts,
    ownTickets: tickets,
    pending: conversation.pending,
    corpus: corpusFor(conversation.pending, text),
    interpreter: interpreted.interpreter,
    model: interpreted.model,
    usage: interpreted.usage,
  });

  let ticket = null;
  let transferQueue: "N1" | "N2" | null = null;
  try {
    if (plan.kind === "create" && plan.draft) ticket = createTicket(plan.draft, userId);
    if (plan.kind === "update" && plan.draft) ticket = updateTicket(plan.draft, userId);
    if (plan.kind === "reopen" && plan.draft) ticket = reopenTicket(plan.draft, userId);
    if (plan.transfer) {
      const ticketId = ticket?.id ?? plan.transfer.ticketId;
      if (ticketId) {
        const waiting = markWaiting(ticketId, userId);
        if (waiting) ticket = waiting;
      }
      const queue = plan.transfer.queue;
      transferQueue = queue;
      saveConversation(conversation.id, {
        status: "waiting_analyst",
        assigneeId: null,
        pending: null,
        transferSummary: plan.transfer.summary,
        transferReason: plan.transfer.reason,
        confidence: plan.transfer.confidence,
        focusTicketId: ticketId ?? null,
        queue,
        respondBy: analystReplyDeadline(now),
      });
    }
  } catch (error) {
    if (error instanceof LegacyUnavailableError) {
      rememberOutage(conversation.id);
      return snapshot(getConversation(conversation.id));
    }
    throw error;
  }

  const view = materialize(plan, ticket, now);
  addMessage({
    conversationId: conversation.id,
    role: "agent",
    text: view.text,
    authorName: "Nexo Assist",
    authorTag: "IA",
    payload: view.payload,
  });
  bumpMessageCount(conversation.id);
  if (transferQueue) {
    addMessage({
      conversationId: conversation.id,
      role: "system",
      text: `Transferida para Suporte ${transferQueue} · ${formatClock(now)}`,
      at: new Date(now.getTime() + 1),
    });
  }
  if (!plan.transfer) {
    saveConversation(conversation.id, {
      pending: plan.pending,
      focusTicketId: ticket?.id ?? plan.ticketId ?? conversation.focusTicketId,
    });
  }
  return snapshot(getConversation(conversation.id));
}

function rememberOutage(conversationId: string): void {
  const payload: MessagePayload = {
    actions: ["tentou consultar o sistema de chamados"],
    trace: {
      understood: "A consulta ao sistema de chamados falhou.",
      intent: "unclear",
      action: "Não gravar nada enquanto o legado não responde.",
      confidence: 1,
      why: "O serviço de chamados recusou a leitura três vezes. A mensagem da pessoa foi guardada.",
      interpreter: "rules",
      model: null,
      tools: [{ name: "chamados.listar", detail: "indisponível depois de 3 tentativas" }],
    },
  };
  addMessage({
    conversationId,
    role: "agent",
    text: "O sistema de chamados ficou indisponível por alguns segundos e ainda não voltou. Sua mensagem está salva — tente de novo daqui a pouco.",
    authorName: "Nexo Assist",
    authorTag: "IA",
    payload,
  });
  bumpMessageCount(conversationId);
}

async function interpret(
  userId: string,
  text: string,
  conversation: ConversationRecord,
  rules: Facts,
): Promise<{
  facts: Facts;
  interpreter: "rules" | "mastra";
  model: string | null;
  usage?: { promptTokens: number; completionTokens: number };
}> {
  if (!mastraEnabled() || rules.source === "button") {
    return { facts: { ...rules, understood: rules.understood || text }, interpreter: "rules", model: null };
  }
  try {
    const { understandWithMastra } = await import("./mastra");
    const modelFacts = await understandWithMastra({
      userId,
      text,
      history: listMessages(conversation.id).slice(-8).map((message) => ({ role: message.role, text: message.text })),
      pendingKind: conversation.pending?.kind ?? null,
    });
    if (!modelFacts) return { facts: { ...rules, understood: text }, interpreter: "rules", model: null };
    const facts = mergeFacts(rules, modelFacts.facts);
    return {
      facts,
      interpreter: facts.source === "model" ? "mastra" : "rules",
      model: facts.source === "model" ? modelFacts.model : null,
      usage: facts.source === "model" ? modelFacts.usage : undefined,
    };
  } catch (error) {
    console.error("Mastra indisponível, seguindo pelas regras.", error);
    return { facts: { ...rules, understood: text }, interpreter: "rules", model: null };
  }
}

function snapshot(conversation: ConversationRecord | null): ChatState {
  if (!conversation) return { conversation: null, messages: [] };
  const assignee = conversation.assigneeId ? getUserById(conversation.assigneeId) : null;
  return {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      messageCount: conversation.messageCount,
      assigneeName: assignee?.name ?? null,
      queue: conversation.queue,
    },
    messages: listMessages(conversation.id),
  };
}
