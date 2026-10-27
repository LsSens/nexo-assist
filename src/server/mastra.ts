import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchArticles } from "../domain/knowledge";
import type { Facts } from "../domain/plan-types";
import type { Intent } from "../domain/types";
import { resolveModel } from "./model";
import { getTicket, listTickets } from "./tickets";

const INTENTS = [
  "greeting",
  "kb",
  "status",
  "select_ticket",
  "open",
  "update",
  "confirm",
  "cancel",
  "transfer",
  "decline",
  "add_info",
  "out_of_scope",
  "unclear",
] as const satisfies readonly Intent[];

const FactsSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  why: z.string(),
  ticketId: z.string().nullable(),
  understood: z.string(),
});

const listMyTickets = createTool({
  id: "list-my-tickets",
  description: "Lista somente os chamados da pessoa que está na conversa. Não aceita outro usuário.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    tickets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        category: z.string(),
        priority: z.string(),
      }),
    ),
  }),
  execute: async (_input, context) => {
    const userId = context.requestContext.get("userId");
    if (typeof userId !== "string") return { tickets: [] };
    const tickets = await listTickets(userId);
    return {
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        category: ticket.category,
        priority: ticket.priority,
      })),
    };
  },
});

const getMyTicket = createTool({
  id: "get-my-ticket",
  description: "Busca um chamado pelo número, apenas se for da pessoa da conversa.",
  inputSchema: z.object({ ticketId: z.string() }),
  outputSchema: z.object({
    found: z.boolean(),
    ticket: z
      .object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        status: z.string(),
        priority: z.string(),
      })
      .nullable(),
  }),
  execute: async ({ ticketId }, context) => {
    const userId = context.requestContext.get("userId");
    if (typeof userId !== "string") return { found: false, ticket: null };
    const ticket = await getTicket(ticketId.toUpperCase(), userId);
    if (!ticket) return { found: false, ticket: null };
    return {
      found: true,
      ticket: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
      },
    };
  },
});

const searchHelp = createTool({
  id: "search-help-center",
  description: "Busca artigos curtos da central de ajuda de TI.",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ articles: z.array(z.object({ title: z.string(), body: z.string() })) }),
  execute: async ({ query }) => ({ articles: searchArticles(query) }),
});

const INSTRUCTIONS = `Você é o intérprete do Nexo Assist, o agent do service desk de TI da Nexo.
Sua única tarefa é entender a mensagem e devolver um objeto com intent, confidence, why, ticketId e understood.
Você não abre, não atualiza e não promete que um chamado foi criado. A política do service desk faz isso depois.
Use as ferramentas antes de citar um número de chamado. Nunca invente INC ou REQ.
Intents: greeting, kb (dúvida que a central pode resolver), status, select_ticket, open (problema ou pedido novo),
update, confirm, cancel, transfer (pediu analista), decline, add_info, out_of_scope (RH, financeiro, facilities), unclear.
confidence é 0 a 1. Abaixo de 0.55 a política chama um analista.
ticketId é o número citado ou null. understood é uma frase curta, em português, do que a pessoa quer.`;

let cached: { model: string; agent: Agent } | null = null;

function agentFor(model: string): Agent {
  if (cached?.model === model) return cached.agent;
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: INSTRUCTIONS,
    model,
    tools: { listMyTickets, getMyTicket, searchHelp },
  });
  cached = { model, agent };
  return agent;
}

function readUsage(usage: unknown): { promptTokens: number; completionTokens: number } | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const prompt = numberOf(record.promptTokens ?? record.inputTokens);
  const completion = numberOf(record.completionTokens ?? record.outputTokens);
  if (prompt == null && completion == null) return undefined;
  return { promptTokens: prompt ?? 0, completionTokens: completion ?? 0 };
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function understandWithMastra(input: {
  userId: string;
  text: string;
  history: { role: string; text: string }[];
  pendingKind: string | null;
}): Promise<{ facts: Facts; model: string; usage?: { promptTokens: number; completionTokens: number } } | null> {
  const model = resolveModel();
  if (!model) return null;
  const requestContext = new RequestContext();
  requestContext.set("userId", input.userId);
  const history = input.history.map((message) => `${message.role}: ${message.text}`).join("\n");
  const prompt = `Estado pendente: ${input.pendingKind ?? "nenhum"}.
Histórico recente:
${history || "(vazio)"}

Mensagem atual:
${input.text}`;
  const result = await agentFor(model).generate(prompt, {
    requestContext,
    maxSteps: 4,
    abortSignal: AbortSignal.timeout(20_000),
    structuredOutput: {
      schema: FactsSchema,
      errorStrategy: "fallback",
      fallbackValue: {
        intent: "unclear",
        confidence: 0.3,
        why: "O modelo não devolveu um objeto válido.",
        ticketId: null,
        understood: input.text,
      },
    },
  });
  const object = result.object;
  if (!object) return null;
  return {
    model,
    usage: readUsage(result.totalUsage),
    facts: {
      intent: object.intent,
      confidence: object.confidence,
      why: object.why,
      source: "model",
      ticketId: object.ticketId,
      understood: object.understood,
    },
  };
}
