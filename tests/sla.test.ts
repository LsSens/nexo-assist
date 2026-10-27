import { describe, expect, it } from "vitest";
import { wallOf } from "../src/domain/clock";
import { addBusinessDays, addBusinessHours, addClockHours, dueDate, isOverdue } from "../src/domain/sla";
import { classifyPriority } from "../src/domain/priority";

describe("SLA e prioridade", () => {
  it("conta hora útil pulando a noite e o fim de semana", () => {
    const tuesday = new Date("2026-10-27T17:00:00-03:00");
    const later = addBusinessHours(tuesday, 4);
    const wall = wallOf(later);
    expect(wall.d).toBe(28);
    expect(wall.h).toBe(11);

    const friday = new Date("2026-10-30T17:00:00-03:00");
    const monday = wallOf(addBusinessHours(friday, 4));
    expect(monday.dow).toBe(1);
    expect(monday.h).toBe(11);
  });

  it("trata crítica em hora corrida, inclusive no fim de semana", () => {
    const saturday = new Date("2026-10-31T10:00:00-03:00");
    const due = wallOf(addClockHours(saturday, 1));
    expect(due.dow).toBe(6);
    expect(due.h).toBe(11);
    expect(dueDate(saturday, "critica").toISOString()).toBe(addClockHours(saturday, 1).toISOString());
  });

  it("soma dias úteis sem contar sábado e domingo", () => {
    const wednesday = new Date("2026-10-28T14:20:00-03:00");
    const due = wallOf(addBusinessDays(wednesday, 3));
    expect(due.dow).toBe(1);
    expect(due.h).toBe(14);
  });

  it("classifica impacto e urgência como no anexo A", () => {
    expect(classifyPriority("INC", "company", "down")).toBe("critica");
    expect(classifyPriority("INC", "team", "down")).toBe("critica");
    expect(classifyPriority("INC", "self", "same_day")).toBe("alta");
    expect(classifyPriority("INC", "self", "blocked")).toBe("alta");
    expect(classifyPriority("INC", "self", "workaround")).toBe("media");
    expect(classifyPriority("INC", "self", "none")).toBe("media");
    expect(classifyPriority("REQ", "self", "none")).toBe("baixa");
    expect(classifyPriority("REQ", "self", "same_day")).toBe("alta");
  });

  it("não marca aprovado ou resolvido como vencido", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isOverdue(past, "aguardando_analista", new Date())).toBe(true);
    expect(isOverdue(past, "aprovado", new Date())).toBe(false);
    expect(isOverdue(past, "resolvido", new Date())).toBe(false);
  });
});
