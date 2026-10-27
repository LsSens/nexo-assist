import { describe, expect, it } from "vitest";
import { corpusFor, planTurn, type TurnInput } from "../src/domain/plan";
import type { Facts } from "../src/domain/plan-types";
import { understandRules } from "../src/domain/understand";
import type { Ticket } from "../src/domain/types";

const now = new Date("2026-10-27T15:00:00.000Z");

function ticket(partial: Partial<Ticket> & Pick<Ticket, "id" | "title" | "status">): Ticket {
  return {
    type: partial.id.startsWith("REQ") ? "REQ" : "INC",
    description: partial.description ?? partial.title,
    category: partial.category ?? "Hardware",
    subcategory: partial.subcategory ?? null,
    priority: partial.priority ?? "media",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date(now.getTime() - 11 * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 6 * 86_400_000).toISOString(),
    resolvedAt: null,
    dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
    events: [],
    ...partial,
  };
}

function turn(text: string, extra: Partial<TurnInput> = {}): TurnInput {
  const facts = extra.facts ?? understandRules(text, extra.optionId);
  return {
    now,
    user: { id: "u-ana", name: "Ana Souza", os: "Windows 11" },
    text,
    optionId: extra.optionId,
    facts,
    ownTickets: extra.ownTickets ?? [],
    pending: extra.pending ?? null,
    corpus: extra.corpus ?? corpusFor(extra.pending ?? null, text),
    interpreter: facts.source === "model" ? "mastra" : "rules",
    model: facts.source === "model" ? "test/model" : null,
  };
}

describe("decisões do service desk", () => {
  const anaOpen = [
    ticket({
      id: "INC-20311",
      title: "Notebook lento após atualização do Windows",
      description: "Lentidão geral desde a atualização. O diagnóstico não resolveu.",
      status: "aguardando_analista",
      category: "Hardware",
      subcategory: "Notebook",
      dueAt: new Date(now.getTime() - 86_400_000).toISOString(),
    }),
    ticket({
      id: "INC-20298",
      title: "Acesso à pasta Financeiro no SharePoint",
      status: "em_andamento",
      category: "Acesso",
      subcategory: "SharePoint",
    }),
    ticket({
      id: "REQ-10442",
      title: "Segundo monitor para home office",
      status: "aprovado",
      category: "Hardware",
      priority: "baixa",
    }),
  ];

  it("pergunta quem é afetado no erro 809 de Windows 11 e não abre chamado", () => {
    const plan = planTurn(turn("Meu notebook não conecta na VPN desde ontem. Aparece o erro 809."));
    expect(plan.kind).toBe("reply");
    expect(plan.pending?.kind).toBe("affected");
    expect(plan.payload.question).toMatch(/afetado/i);
    expect(plan.actions).toEqual(expect.arrayContaining(["consultou seus chamados", "buscou na central de ajuda"]));
    expect(plan.text).toMatch(/Windows 11/);
  });

  it("classifica alta quando há compromisso no mesmo dia, mesmo que o modelo não diga a prioridade", () => {
    const first = planTurn(turn("Meu notebook não conecta na VPN desde ontem. Aparece o erro 809."));
    const text = "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.";
    const model: Facts = {
      intent: "open",
      confidence: 0.91,
      why: "O modelo entendeu um problema de VPN.",
      source: "model",
      ticketId: null,
      understood: "VPN pessoal com reunião hoje.",
    };
    const plan = planTurn(turn(text, { pending: first.pending, facts: model }));
    expect(plan.pending?.kind).toBe("draft");
    if (plan.pending?.kind !== "draft") return;
    expect(plan.pending.draft.priority).toBe("alta");
    expect(plan.pending.draft.category).toBe("Rede e VPN");
    expect(plan.payload.card?.badge.label).toBe("Aguardando confirmação");
    expect(plan.text).toMatch(/antes de eu criar/);
  });

  it("responde o artigo de VPN no Windows 10 sem abrir chamado", () => {
    const plan = planTurn({
      ...turn("Meu notebook não conecta na VPN. Erro 809."),
      user: { id: "u-diego", name: "Diego Ramos", os: "Windows 10" },
    });
    expect(plan.kind).toBe("reply");
    expect(plan.pending).toBeNull();
    expect(plan.text).toMatch(/Windows 10/);
    expect(plan.actions).toContain("buscou na central de ajuda");
  });

  it("lista os chamados abertos e só oferece analista quando o prazo venceu", () => {
    const list = planTurn(turn("Qual o status do meu chamado?", { ownTickets: anaOpen }));
    expect(list.payload.choices?.map((choice) => choice.id)).toEqual(["INC-20311", "INC-20298", "REQ-10442"]);
    const detail = planTurn(turn("INC-20311", { ownTickets: anaOpen }));
    expect(detail.text).toMatch(/prazo vencido|acima do prazo/);
    expect(detail.payload.followups?.map((item) => item.id)).toContain("transfer");
  });

  it("atualiza o chamado parecido em vez de duplicar", () => {
    const plan = planTurn(turn("Meu notebook continua lento depois da atualização do Windows.", { ownTickets: anaOpen }));
    expect(plan.pending?.kind).toBe("draft");
    if (plan.pending?.kind !== "draft") return;
    expect(plan.pending.draft.mode).toBe("update");
    expect(plan.pending.draft.ticketId).toBe("INC-20311");
    expect(plan.text).toMatch(/Não vou duplicar/);
  });

  it("reabre chamado resolvido há menos de 7 dias e não reabre o antigo", () => {
    const recent = ticket({
      id: "INC-20150",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP bloqueou.",
      status: "resolvido",
      category: "Acesso",
      subcategory: "SAP",
      resolvedAt: new Date(now.getTime() - 4 * 86_400_000).toISOString(),
    });
    const old = ticket({
      id: "INC-19410",
      title: "Troca de senha da rede",
      description: "Senha da rede expirada.",
      status: "resolvido",
      category: "Acesso",
      resolvedAt: new Date("2026-07-11T16:00:00-03:00").toISOString(),
    });
    const reopen = planTurn(turn("Minha senha do SAP bloqueou de novo.", { ownTickets: [recent, old] }));
    expect(reopen.pending?.kind).toBe("draft");
    if (reopen.pending?.kind !== "draft") return;
    expect(reopen.pending.draft.mode).toBe("reopen");
    expect(reopen.pending.draft.ticketId).toBe("INC-20150");

    const fresh = planTurn(turn("Preciso trocar a senha da rede de novo.", { ownTickets: [old] }));
    expect(fresh.pending?.kind === "draft" && fresh.pending.draft.mode === "reopen").toBe(false);
  });

  it("não abre chamado de RH e não confirma chamado de outra pessoa", () => {
    const outside = planTurn(turn("Quero marcar férias para dezembro."));
    expect(outside.text).toMatch(/RH/);
    expect(outside.pending).toBeNull();

    const hidden = planTurn(turn("INC-99999", { ownTickets: anaOpen }));
    expect(hidden.text).toMatch(/Não encontrei/);
  });

  it("chama analista em caso crítico e quando não tem segurança", () => {
    const critical = planTurn(turn("A VPN caiu para toda a empresa, ninguém consegue trabalhar."));
    expect(critical.pending?.kind).toBe("draft");
    if (critical.pending?.kind !== "draft") return;
    expect(critical.pending.draft.priority).toBe("critica");
    const confirmed = planTurn(
      turn("Confirmar", {
        optionId: "confirm",
        pending: critical.pending,
        corpus: "A VPN caiu para toda a empresa, ninguém consegue trabalhar.",
      }),
    );
    expect(confirmed.kind).toBe("create");
    expect(confirmed.transfer?.reason).toBe("critical");

    const unsure = planTurn(turn("aconteceu um negócio esquisito aqui"));
    expect(unsure.kind).toBe("transfer");
    expect(unsure.transfer?.reason).toBe("low_confidence");
  });
});
