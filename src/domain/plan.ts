import { formatClock, formatDayMonth, formatDayMonthTime, formatRelative, sameSaoDay } from "./clock";
import { matchArticle } from "./knowledge";
import {
  AFFECTED_OPTIONS,
  affectedLabel,
  categoryLine,
  firstName,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from "./labels";
import type { Facts } from "./plan-types";
import { classifyPriority, priorityBecause } from "./priority";
import { dueDate, isOverdue, slaLabel, slaSpoken } from "./sla";
import { buildDescription, buildTitle, effectiveUrgency, extractSignals, findSimilar } from "./signals";
import {
  isOpenStatus,
  type Affected,
  type DecisionTrace,
  type Draft,
  type DraftOverride,
  type MessagePayload,
  type Pending,
  type Priority,
  type Ticket,
  type TicketCard,
  type TransferReason,
  type Urgency,
} from "./types";

const RANK: Record<Priority, number> = { baixa: 0, media: 1, alta: 2, critica: 3 };
const WEEK_MS = 7 * 86_400_000;

export type TransferPlan = {
  summary: string;
  reason: TransferReason;
  queue: "N1" | "N2";
  confidence: number;
  ticketId?: string;
};

export type Plan = {
  kind: "reply" | "create" | "update" | "reopen" | "transfer";
  actions: string[];
  trace: DecisionTrace;
  pending: Pending | null;
  text: string;
  payload: MessagePayload;
  draft?: Draft;
  ticketId?: string;
  note?: string;
  transfer?: TransferPlan;
};

export type TurnInput = {
  now: Date;
  user: { id: string; name: string; os: string | null };
  text: string;
  optionId?: string;
  draftOverride?: DraftOverride;
  facts: Facts;
  ownTickets: Ticket[];
  pending: Pending | null;
  corpus: string;
  interpreter: "rules" | "mastra";
  model: string | null;
  usage?: { promptTokens: number; completionTokens: number };
};

export function corpusFor(pending: Pending | null, text: string): string {
  if (pending?.kind === "affected") return `${pending.partial.description}\n${text}`;
  return text;
}

export function applyOverride(draft: Draft, override: DraftOverride | undefined, now: Date): Draft {
  if (!override) return draft;
  const priority = override.priority ?? draft.priority;
  const title = override.title?.trim() || draft.title;
  const description = override.description?.trim() || draft.description;
  return {
    ...draft,
    title,
    description,
    category: override.category ?? draft.category,
    priority,
    dueAt: dueDate(now, priority).toISOString(),
  };
}

export function planTurn(input: TurnInput): Plan {
  const signals = extractSignals(input.corpus, input.user.os);
  const open = input.ownTickets.filter((ticket) => isOpenStatus(ticket.status));
  const article = matchArticle(signals.normalized, signals.os);
  const pending = input.pending;

  if (pending?.kind === "draft") return continueDraft(input, pending.draft);
  if (pending?.kind === "affected") return continueAffected(input, pending, signals);
  if (pending?.kind === "pick") return continuePick(input, open);
  if (pending?.kind === "transfer_offer") return continueOffer(input, pending.ticketId);
  if (pending?.kind === "add_info") {
    const ticket = input.ownTickets.find((item) => item.id === pending.ticketId);
    if (!ticket) {
      return say(
        input,
        ["consultou seus chamados"],
        "Não encontrei esse chamado entre os seus.",
        "O complemento apontava para um chamado que não é desta pessoa.",
        0.9,
      );
    }
    return draftUpdate(input, ticket, input.text);
  }

  if (signals.outOfScope || input.facts.intent === "out_of_scope") return outOfScope(input, signals.outOfScope ?? "rh");
  if (input.facts.intent === "greeting") return greeting(input);
  if (input.facts.intent === "transfer" || input.optionId === "transfer") return transferNow(input, undefined, "user");
  if (input.facts.intent === "status") return listOrShow(input, open);
  if (input.facts.intent === "select_ticket" || input.optionId?.startsWith("ticket:")) {
    return showSelected(input, input.facts.ticketId ?? input.optionId?.slice("ticket:".length) ?? signals.ticketId);
  }
  if (input.facts.intent === "decline") return say(input, ["nenhuma alteração"], "Tudo bem. Se precisar, é só escrever de novo.", "Registrar a recusa.", 0.9);
  const openDuplicate = findSimilar(open, input.corpus);
  const gaveUp = /(nao resolveu|ja tentei|continua|nao adiantou|ja reinic)/.test(signals.normalized);
  if (article?.solves && !openDuplicate && !gaveUp) return answerArticle(input, article.article.title, article.article.body);
  if (input.facts.intent === "unclear" || input.facts.confidence < 0.55) return transferNow(input, undefined, "low_confidence");

  return openOrUpdate(input, signals, open, article);
}

export function materialize(plan: Plan, ticket: Ticket | null, now: Date): { text: string; payload: MessagePayload } {
  const stamp = (payload: MessagePayload): MessagePayload => ({
    ...payload,
    actions: plan.actions,
    trace: plan.trace,
  });
  if (ticket && (plan.kind === "create" || plan.kind === "update" || plan.kind === "reopen")) {
    return {
      text: successText(plan.kind, ticket, Boolean(plan.transfer)),
      payload: stamp({ card: ticketCard(ticket, now, false) }),
    };
  }
  if (plan.kind === "transfer" && ticket) {
    return {
      text: plan.text,
      payload: stamp({ ...plan.payload, card: plan.payload.card ?? ticketCard(ticket, now, false) }),
    };
  }
  return { text: plan.text, payload: stamp(plan.payload) };
}

function openOrUpdate(
  input: TurnInput,
  signals: ReturnType<typeof extractSignals>,
  open: Ticket[],
  article: ReturnType<typeof matchArticle>,
): Plan {
  const duplicate = findSimilar(open, input.corpus);
  if (duplicate) return draftUpdate(input, duplicate, input.corpus);
  const recent = input.ownTickets.find(
    (ticket) =>
      ticket.resolvedAt &&
      input.now.getTime() - new Date(ticket.resolvedAt).getTime() <= WEEK_MS &&
      findSimilar([ticket], input.corpus),
  );
  if (recent) return draftReopen(input, recent, input.corpus);

  const affected = affectedFrom(input.optionId, signals);
  if (!affected) return askAffected(input, signals, article);
  return showCreateDraft(input, signals, affected, article);
}

function continueDraft(input: TurnInput, draft: Draft): Plan {
  if (input.facts.intent === "cancel" || input.optionId === "cancel") {
    return say(input, ["cancelei o rascunho"], "Cancelei o rascunho. Nada foi aberto.", "Descartar o rascunho sem gravar.", 0.99, null);
  }
  if (input.facts.intent === "transfer") return transferNow(input, draft.ticketId, "user");
  if (input.facts.intent === "confirm" || input.optionId === "confirm") {
    const next = applyOverride(draft, input.draftOverride, input.now);
    const adjusted = input.draftOverride?.priority && input.draftOverride.priority !== draft.priority;
    const actions = ["conferiu a confirmação", next.mode === "create" ? "criou o chamado" : "atualizou o chamado"];
    const transfer =
      next.priority === "critica" && next.mode === "create"
        ? transferMeta(input, undefined, "critical")
        : undefined;
    return {
      kind: next.mode === "create" ? "create" : next.mode === "reopen" ? "reopen" : "update",
      actions,
      trace: makeTrace(input, `Confirmar ${next.mode === "create" ? "a abertura" : "a atualização"} de ${next.title}.`, input.facts.confidence || 0.99, [
        { name: "chamados.gravar", detail: "só depois da confirmação da pessoa" },
        ...(adjusted ? [{ name: "rascunho.editar", detail: "a pessoa alterou um campo antes de confirmar" }] : []),
      ]),
      pending: null,
      text: "",
      payload: {},
      draft: next,
      ticketId: next.ticketId,
      note: next.description,
      transfer,
    };
  }
  const rewritten: Draft = {
    ...draft,
    description: `${draft.description} ${input.text}`.trim(),
  };
  return replyDraft(input, rewritten, "Atualizei o rascunho com o que você escreveu. Confira de novo antes de eu salvar:");
}

function continueAffected(
  input: TurnInput,
  pending: Extract<Pending, { kind: "affected" }>,
  signals: ReturnType<typeof extractSignals>,
): Plan {
  const affected = affectedFrom(input.optionId, signals);
  if (!affected) return askAffected(input, signals, matchArticle(signals.normalized, signals.os));
  const urgency = stronger(pending.partial.urgency, signals.urgency);
  const merged = { ...signals, urgency, category: pending.partial.category, type: pending.partial.type, subcategory: pending.partial.subcategory };
  return showCreateDraft(input, merged, affected, matchArticle(signals.normalized, signals.os));
}

function continuePick(input: TurnInput, open: Ticket[]): Plan {
  const id = input.optionId?.startsWith("ticket:")
    ? input.optionId.slice("ticket:".length)
    : input.facts.ticketId;
  if (id) return showSelected(input, id);
  return listOrShow(input, open);
}

function continueOffer(input: TurnInput, ticketId?: string): Plan {
  if (input.facts.intent === "transfer" || input.optionId === "transfer") return transferNow(input, ticketId, ticketId ? "overdue" : "user");
  if (input.facts.intent === "add_info" || input.optionId === "add_info") {
    const ticket = ticketId ? input.ownTickets.find((item) => item.id === ticketId) : undefined;
    if (!ticket) return say(input, ["pedi o complemento"], "Sobre qual chamado você quer acrescentar algo?", "Falta o número do chamado.", 0.7);
    return say(
      input,
      ["pedi o complemento"],
      `O que você quer acrescentar ao ${ticket.id}?`,
      "Esperar o complemento antes de gravar.",
      0.9,
      { kind: "add_info", ticketId: ticket.id },
    );
  }
  if (input.facts.intent === "decline" || input.optionId === "decline") {
    return say(input, ["mantive o chamado como está"], "Tudo bem. O chamado continua como está. Se mudar de ideia, peça para falar com um analista.", "A pessoa recusou a transferência.", 0.95, null);
  }
  return say(
    input,
    ["ofereci um analista"],
    "Quer que eu chame um analista, acrescente algo ao chamado, ou deixo como está?",
    "A oferta anterior ainda está sem resposta.",
    0.8,
    { kind: "transfer_offer", ticketId },
    { followups: FOLLOWUPS },
  );
}

function listOrShow(input: TurnInput, open: Ticket[]): Plan {
  if (open.length === 0) {
    return say(
      input,
      ["consultou seus chamados"],
      "Você não tem chamados abertos. Se quiser, descreva o que está acontecendo que eu consulto a central de ajuda ou preparo um chamado.",
      "Consulta vazia: não há chamado aberto desta pessoa.",
      0.9,
      null,
      { tools: [{ name: "chamados.listar", detail: "filtro pelo solicitante da sessão" }] },
    );
  }
  if (open.length === 1) return showTicket(input, open[0], ["consultou seus chamados"]);
  return {
    kind: "reply",
    actions: ["consultou seus chamados"],
    trace: makeTrace(input, "Há mais de um chamado aberto; perguntar qual é antes de detalhar.", 0.9, [
      { name: "chamados.listar", detail: `${open.length} abertos, só desta pessoa` },
    ]),
    pending: { kind: "pick" },
    text: `Você tem ${open.length} chamados abertos. Sobre qual deles quer saber?`,
    payload: {
      actions: ["consultou seus chamados"],
      choices: open.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: STATUS_LABEL[ticket.status],
        date: formatDayMonth(new Date(ticket.updatedAt)),
      })),
    },
  };
}

function showSelected(input: TurnInput, id: string | null): Plan {
  if (!id) return listOrShow(input, input.ownTickets.filter((ticket) => isOpenStatus(ticket.status)));
  const ticket = input.ownTickets.find((item) => item.id.toUpperCase() === id.toUpperCase());
  if (!ticket) {
    return say(
      input,
      ["consultou seus chamados"],
      `Não encontrei o ${id.toUpperCase()} entre os seus chamados.`,
      "O número não pertence a esta pessoa, ou não existe. A resposta não confirma a existência.",
      0.93,
      null,
      { tools: [{ name: "chamados.obter", detail: "consulta restrita ao solicitante" }] },
    );
  }
  return showTicket(input, ticket, ["consultou seus chamados", `consultou o ${ticket.id}`, "calculou o prazo"]);
}

function showTicket(input: TurnInput, ticket: Ticket, actions: string[]): Plan {
  const overdue = isOverdue(ticket.dueAt, ticket.status, input.now);
  const resolvedRecently =
    ticket.resolvedAt && input.now.getTime() - new Date(ticket.resolvedAt).getTime() <= WEEK_MS;
  let text = `${ticket.id} está ${STATUS_LABEL[ticket.status].toLowerCase()}.`;
  if (overdue) {
    text = `Está sem atualização ${formatRelative(new Date(ticket.updatedAt), input.now)}, acima do prazo de ${slaSpoken(ticket.priority)} para prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}. Quer que eu chame um analista?`;
  } else if (ticket.status === "resolvido" || ticket.status === "encerrado") {
    text = resolvedRecently
      ? `${ticket.id} foi resolvido ${formatRelative(new Date(ticket.resolvedAt!), input.now)}. Se o problema voltou, conte o que aconteceu que eu preparo a reabertura — ainda está na janela de 7 dias.`
      : `${ticket.id} foi encerrado ${formatRelative(new Date(ticket.resolvedAt ?? ticket.updatedAt), input.now)}, fora da janela de 7 dias para reabrir. Se voltou, descreva que eu abro um chamado novo.`;
  }
  const pending: Pending | null = overdue
    ? { kind: "transfer_offer", ticketId: ticket.id }
    : resolvedRecently
      ? { kind: "add_info", ticketId: ticket.id }
      : null;
  return {
    kind: "reply",
    actions,
    trace: makeTrace(
      input,
      overdue ? "Chamado vencido: oferecer analista em vez de só repetir o status." : "Mostrar o chamado pedido, sem dados de outra pessoa.",
      0.92,
      [
        { name: "chamados.obter", detail: ticket.id },
        { name: "sla.calcular", detail: overdue ? "prazo vencido" : slaLabel(ticket.priority) },
      ],
    ),
    pending,
    text,
    payload: {
      actions,
      card: ticketCard(ticket, input.now, false),
      followups: overdue ? FOLLOWUPS : undefined,
    },
  };
}

function askAffected(
  input: TurnInput,
  signals: ReturnType<typeof extractSignals>,
  article: ReturnType<typeof matchArticle>,
): Plan {
  const intro = article && !article.solves
    ? `Não há chamado aberto sobre o mesmo assunto, e o artigo “${article.article.title}” não resolve o seu caso. ${articleHint(article.article.id, signals.os)} Vou abrir um chamado.`
    : "Não há chamado aberto sobre o mesmo assunto, e a central de ajuda não resolve sozinha. Vou abrir um chamado.";
  const actions = ["consultou seus chamados", ...(article ? ["buscou na central de ajuda"] : [])];
  return {
    kind: "reply",
    actions,
    trace: makeTrace(input, "Falta quem é afetado. Sem isso a prioridade ficaria chutada.", 0.86, [
      { name: "chamados.listar", detail: "nenhum aberto parecido" },
      ...(article ? [{ name: "ajuda.buscar", detail: article.article.title }] : []),
    ]),
    pending: {
      kind: "affected",
      partial: {
        mode: "create",
        type: signals.type,
        title: buildTitle(signals, input.text),
        description: input.corpus,
        category: signals.category,
        subcategory: signals.subcategory,
        urgency: signals.urgency,
      },
    },
    text: intro,
    payload: {
      actions,
      question: "Quem está sendo afetado?",
      options: [...AFFECTED_OPTIONS],
    },
  };
}

function showCreateDraft(
  input: TurnInput,
  signals: ReturnType<typeof extractSignals>,
  affected: Affected,
  article: ReturnType<typeof matchArticle>,
): Plan {
  const priority = classifyPriority(signals.type, affected, effectiveUrgency({ ...signals, affected }));
  const because = priorityBecause(priority, signals.urgency, affected);
  const draft: Draft = {
    code: draftCode(input.now),
    mode: "create",
    type: signals.type,
    title: buildTitle(signals, input.corpus),
    description: buildDescription(input.corpus, signals.os),
    category: signals.category,
    subcategory: signals.subcategory,
    priority,
    affected,
    dueAt: dueDate(input.now, priority).toISOString(),
  };
  const actions = [
    ...(article ? ["buscou na central de ajuda"] : []),
    "classificou a prioridade",
    "consultou o SLA",
    "montou o rascunho",
  ];
  const text = `Coloquei prioridade ${PRIORITY_LABEL[priority].toLowerCase()} porque ${because}. A resposta sai em até ${slaSpoken(priority)}. Confira antes de eu criar:`;
  return replyDraft(input, draft, text, actions, [
    { name: "prioridade.classificar", detail: `${PRIORITY_LABEL[priority]} · ${because}` },
    { name: "sla.calcular", detail: slaLabel(priority) },
  ]);
}

function draftUpdate(input: TurnInput, ticket: Ticket, note: string): Plan {
  const signals = extractSignals(`${ticket.title}\n${note}`, input.user.os);
  const raised = classifyPriority(ticket.type, ticket.affected, signals.urgency);
  const priority = RANK[raised] > RANK[ticket.priority] ? raised : ticket.priority;
  const draft: Draft = {
    code: draftCode(input.now),
    mode: "update",
    ticketId: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: note.replace(/\s+/g, " ").trim(),
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority,
    affected: ticket.affected,
    dueAt: dueDate(input.now, priority).toISOString(),
  };
  return replyDraft(
    input,
    draft,
    `Você já tem o ${ticket.id} aberto sobre isso. Não vou duplicar: preparei um complemento. Confira antes de eu salvar:`,
    ["consultou seus chamados", "evitou duplicidade", "montou o rascunho"],
    [{ name: "chamados.listar", detail: `parecido com ${ticket.id}` }],
  );
}

function draftReopen(input: TurnInput, ticket: Ticket, note: string): Plan {
  const draft: Draft = {
    code: draftCode(input.now),
    mode: "reopen",
    ticketId: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: note.replace(/\s+/g, " ").trim(),
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    affected: ticket.affected,
    dueAt: dueDate(input.now, ticket.priority).toISOString(),
  };
  return replyDraft(
    input,
    draft,
    `O ${ticket.id} foi resolvido ${formatRelative(new Date(ticket.resolvedAt ?? ticket.updatedAt), input.now)}, dentro de 7 dias. Posso reabrir em vez de criar outro. Confira:`,
    ["consultou seus chamados", "montou o rascunho"],
    [{ name: "chamados.listar", detail: `${ticket.id} resolvido dentro de 7 dias` }],
  );
}

function replyDraft(
  input: TurnInput,
  draft: Draft,
  text: string,
  actions = ["montou o rascunho"],
  tools: DecisionTrace["tools"] = [],
): Plan {
  const payload: MessagePayload = {
    actions,
    card: {
      variant: "draft",
      eyebrow: draft.mode === "create" ? "Novo chamado" : draft.mode === "reopen" ? "Reabertura" : "Atualização",
      code: `Rascunho ${draft.code}`,
      badge: { label: "Aguardando confirmação", tone: "warning" },
      title: draft.title,
      description: draft.description,
      fields: [
        { key: "Categoria", value: categoryLine(draft.category, draft.subcategory) },
        {
          key: "Prioridade",
          value: PRIORITY_LABEL[draft.priority],
          note: dueNote(draft.priority, draft.dueAt, input.now),
        },
        { key: "Afetados", value: affectedLabel(draft.affected) },
      ],
      actions: [
        { id: "confirm", label: "Confirmar", style: "primary", hint: "⌘↵" },
        { id: "edit", label: "Editar", style: "secondary" },
        { id: "cancel", label: "Cancelar", style: "ghost" },
      ],
    },
  };
  return {
    kind: "reply",
    actions,
    trace: makeTrace(input, "Mostrar o rascunho e gravar só depois da confirmação.", 0.9, tools),
    pending: { kind: "draft", draft },
    text,
    payload,
  };
}

function transferNow(input: TurnInput, ticketId: string | undefined, reason: TransferReason): Plan {
  const ticket = ticketId ? input.ownTickets.find((item) => item.id === ticketId) : undefined;
  const meta = transferMeta(input, ticket?.id, reason);
  const queueName = meta.queue === "N2" ? "Suporte N2" : "Suporte N1";
  const text =
    reason === "low_confidence"
      ? `Não tenho segurança para decidir o que fazer com isso (confiança ${Math.round(input.facts.confidence * 100)}%). Encaminhei para o ${queueName} com o que você escreveu, sem abrir chamado novo. Um analista fala com você em até 2 h úteis.`
      : `Encaminhei para o ${queueName}. Um analista vai falar com você em até 2 h úteis. Eu fico em pausa até alguém me devolver a conversa.`;
  return {
    kind: "transfer",
    actions: ["encaminhou para um analista"],
    trace: makeTrace(input, transferWhy(reason), meta.confidence, [
      { name: "conversa.transferir", detail: `${queueName} · ${reason}` },
    ]),
    pending: null,
    text,
    payload: { actions: ["encaminhou para um analista"] },
    transfer: meta,
    ticketId: ticket?.id,
  };
}

function answerArticle(input: TurnInput, title: string, body: string): Plan {
  return say(
    input,
    ["buscou na central de ajuda"],
    body,
    `A central de ajuda responde “${title}” sem abrir chamado.`,
    0.9,
    null,
    { tools: [{ name: "ajuda.buscar", detail: title }] },
  );
}

function greeting(input: TurnInput): Plan {
  return say(
    input,
    [],
    `Olá, ${firstName(input.user.name)}. Pode descrever o problema, perguntar de um chamado ou pedir um acesso. Se a central de ajuda resolver, eu não abro chamado.`,
    "Saudação. Ainda não há pedido para classificar.",
    0.9,
  );
}

function outOfScope(input: TurnInput, domain: "rh" | "financeiro" | "facilities"): Plan {
  const team = domain === "rh" ? "RH" : domain === "financeiro" ? "Financeiro" : "Facilities";
  return say(
    input,
    ["reconheceu assunto fora de TI"],
    `Isso é com o ${team}, não com o service desk de TI. Eu não abro chamado para esse assunto.`,
    "Escopo do Anexo A: só TI.",
    0.93,
    null,
    { tools: [{ name: "escopo.checar", detail: team }] },
  );
}

function say(
  input: TurnInput,
  actions: string[],
  text: string,
  action: string,
  confidence: number,
  pending: Pending | null = null,
  extra?: { tools?: DecisionTrace["tools"]; followups?: MessagePayload["followups"] },
): Plan {
  return {
    kind: "reply",
    actions,
    trace: makeTrace(input, action, confidence, extra?.tools ?? []),
    pending,
    text,
    payload: { actions, followups: extra?.followups },
  };
}

function makeTrace(input: TurnInput, action: string, confidence: number, tools: DecisionTrace["tools"]): DecisionTrace {
  const understood = input.facts.understood || input.text.replace(/\s+/g, " ").trim();
  return {
    understood,
    intent: input.facts.intent,
    action,
    confidence,
    why: input.facts.why,
    interpreter: input.interpreter,
    model: input.model,
    tools,
    usage: input.usage,
  };
}

function affectedFrom(optionId: string | undefined, signals: { affected: Affected | null }): Affected | null {
  if (optionId?.startsWith("affected:")) {
    const value = optionId.slice("affected:".length);
    if (value === "self" || value === "team" || value === "company" || value === "unknown") return value;
  }
  return signals.affected;
}

function stronger(previous: Urgency, next: Urgency): Urgency {
  const rank: Record<Urgency, number> = { none: 0, workaround: 1, same_day: 2, blocked: 3, down: 4 };
  return rank[next] > rank[previous] ? next : previous;
}

function draftCode(now: Date): string {
  return `D-${100 + (Math.abs(now.getTime()) % 900)}`;
}

function articleHint(id: string, os: string | null): string {
  if (id === "vpn-809") {
    return `Ele vale só para Windows 10 — o seu é ${os ?? "outro sistema"}.`;
  }
  return "O artigo explica o caminho, mas não conclui o atendimento.";
}

function dueNote(priority: Priority, dueAt: string, now: Date): string {
  const due = new Date(dueAt);
  if (priority === "baixa" || priority === "media") return `· em até ${slaSpoken(priority)}`;
  if (!sameSaoDay(due, now)) return `· resposta até ${formatDayMonthTime(due)}`;
  return `· resposta até ${formatClock(due)}`;
}

function transferMeta(input: TurnInput, ticketId: string | undefined, reason: TransferReason): TransferPlan {
  const queue: "N1" | "N2" = reason === "user" && !ticketId ? "N2" : reason === "user" && input.ownTickets.find((t) => t.id === ticketId)?.type === "REQ" ? "N1" : "N2";
  return {
    summary: `${input.user.name}: ${input.text.replace(/\s+/g, " ").trim()}${ticketId ? ` Chamado ${ticketId}.` : ""}`,
    reason,
    queue,
    confidence: input.facts.confidence,
    ticketId,
  };
}

function transferWhy(reason: TransferReason): string {
  if (reason === "critical") return "Prioridade crítica: chamar analista junto com o chamado.";
  if (reason === "overdue") return "Chamado vencido: a pessoa pediu um analista.";
  if (reason === "low_confidence") return "Confiança abaixo de 55%: não decidir sozinho.";
  return "A pessoa pediu para falar com um analista.";
}

const FOLLOWUPS = [
  { id: "transfer", label: "Falar com um analista" },
  { id: "add_info", label: "Adicionar informação" },
  { id: "decline", label: "Não, obrigado" },
];

export function ticketCard(ticket: Ticket, now: Date, actionable: boolean): TicketCard {
  const overdue = isOverdue(ticket.dueAt, ticket.status, now);
  return {
    variant: "ticket",
    eyebrow: "Chamado",
    code: ticket.id,
    badge: {
      label: STATUS_LABEL[ticket.status],
      tone: overdue ? "warning" : ticket.status === "resolvido" || ticket.status === "aprovado" ? "success" : "info",
    },
    title: ticket.title,
    description: ticket.description,
    fields: [
      { key: "Categoria", value: categoryLine(ticket.category, ticket.subcategory) },
      { key: "Prioridade", value: PRIORITY_LABEL[ticket.priority] },
      { key: "Aberto em", value: formatDayMonthTime(new Date(ticket.createdAt)) },
      overdue
        ? {
            key: "Última atualização",
            value: formatRelative(new Date(ticket.updatedAt), now),
            tone: "warning",
            note: "· prazo vencido",
          }
        : { key: "Última atualização", value: formatRelative(new Date(ticket.updatedAt), now) },
    ],
    actions: actionable ? undefined : undefined,
  };
}

function successText(kind: Plan["kind"], ticket: Ticket, transferred: boolean): string {
  const label = PRIORITY_LABEL[ticket.priority].toLowerCase();
  if (kind === "update") {
    return `Atualizei o ${ticket.id} e renovei o prazo (${slaSpoken(ticket.priority)}).`;
  }
  if (kind === "reopen") {
    return `Reabri o ${ticket.id}. O prazo de resposta voltou a contar: ${slaSpoken(ticket.priority)}.`;
  }
  const base = `Pronto: abri o ${ticket.id} com prioridade ${label}. Um analista fala com você em até ${slaSpoken(ticket.priority)}.`;
  return transferred ? `${base} Como a prioridade é crítica, também chamei alguém agora.` : base;
}
