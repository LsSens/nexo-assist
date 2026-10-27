import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../src/server/db";
import { sendEmployeeMessage } from "../src/server/chat";
import { getUserByEmail } from "../src/server/store";
import { armLegacyOutage, getTicket, listTickets, resetLegacyOutage } from "../src/server/tickets";

beforeEach(() => {
  resetDatabase();
  resetLegacyOutage();
});

describe("serviço de chamados e conversa", () => {
  it("não entrega chamado de uma pessoa para outra e sobrevive no sqlite", () => {
    const ana = getUserByEmail("ana.souza@nexo.com.br");
    const carla = getUserByEmail("carla.mendes@nexo.com.br");
    expect(ana && carla).toBeTruthy();
    return listTickets(carla!.id).then(async (tickets) => {
      expect(tickets.some((ticket) => ticket.id === "INC-20311")).toBe(false);
      expect(await getTicket("INC-20311", carla!.id)).toBeNull();
      const own = await getTicket("INC-20311", ana!.id);
      expect(own?.title).toMatch(/Notebook lento/);
      expect(new Date(own!.dueAt).getTime()).toBeLessThan(Date.now());
    });
  });

  it("cria o chamado só depois da confirmação e pausa o agent na transferência", async () => {
    const ana = getUserByEmail("ana.souza@nexo.com.br")!;
    const before = (await listTickets(ana.id)).length;
    const asked = await sendEmployeeMessage(ana.id, {
      text: "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.",
    });
    expect((await listTickets(ana.id)).length).toBe(before);
    expect(asked.messages.at(-1)?.payload?.question).toMatch(/afetado/i);

    const draft = await sendEmployeeMessage(ana.id, {
      text: "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.",
    });
    expect(draft.messages.at(-1)?.payload?.card?.fields.find((field) => field.key === "Prioridade")?.value).toBe("Alta");
    expect((await listTickets(ana.id)).length).toBe(before);

    const created = await sendEmployeeMessage(ana.id, { text: "Confirmar", optionId: "confirm" });
    const tickets = await listTickets(ana.id);
    expect(tickets.length).toBe(before + 1);
    expect(created.messages.at(-1)?.text).toMatch(/INC-\d+/);
    expect(created.conversation?.status).toBe("with_agent");

    const carla = getUserByEmail("carla.mendes@nexo.com.br")!;
    const carlaView = await listTickets(carla.id);
    expect(carlaView.some((ticket) => ticket.title.includes("erro 809") || ticket.title.includes("VPN"))).toBe(false);

    const transferred = await sendEmployeeMessage(ana.id, { text: "Quero falar com um analista." });
    expect(transferred.conversation?.status).toBe("waiting_analyst");
    const paused = await sendEmployeeMessage(ana.id, { text: "Continuo aguardando." });
    expect(paused.messages.at(-1)?.role).toBe("user");
    expect(paused.messages.filter((message) => message.role === "agent").length).toBe(
      transferred.messages.filter((message) => message.role === "agent").length,
    );
  });

  it("tenta de novo quando o legado pisca e avisa se ele não volta", async () => {
    const ana = getUserByEmail("ana.souza@nexo.com.br")!;
    armLegacyOutage(2);
    const recovered = await sendEmployeeMessage(ana.id, { text: "Qual o status do meu chamado?" });
    expect(recovered.messages.at(-1)?.text).toMatch(/chamados abertos/);

    armLegacyOutage(5);
    const down = await sendEmployeeMessage(ana.id, { text: "E o segundo monitor?" });
    expect(down.messages.at(-1)?.text).toMatch(/indisponível/);
    expect(down.messages.at(-1)?.payload?.trace?.tools[0]?.detail).toMatch(/3 tentativas/);
  });

  it("trava a sessão em 30 mensagens", async () => {
    const ana = getUserByEmail("ana.souza@nexo.com.br")!;
    for (let index = 0; index < 15; index += 1) {
      await sendEmployeeMessage(ana.id, { text: index === 0 ? "oi" : `oi de novo ${index}` });
    }
    await expect(sendEmployeeMessage(ana.id, { text: "mais uma" })).rejects.toThrow(/30 mensagens/);
  });
});
