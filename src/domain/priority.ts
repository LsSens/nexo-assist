import type { Affected, Priority, TicketType, Urgency } from "./types";

/**
 * Annex A, encoded so a model cannot assign the SLA by itself.
 * Critical: something is down for a team or the company.
 * High: one person cannot work, or there is a same-day commitment.
 * Medium: it hurts, but there is a workaround.
 * Low: requests and improvements without urgency.
 */
export function classifyPriority(
  type: TicketType,
  affected: Affected,
  urgency: Urgency,
): Priority {
  const wide = affected === "team" || affected === "company";
  if (wide && (urgency === "down" || urgency === "blocked")) return "critica";
  if (urgency === "down" || urgency === "same_day" || urgency === "blocked") return "alta";
  if (urgency === "workaround") return "media";
  if (type === "REQ") return "baixa";
  return "media";
}

export function priorityBecause(priority: Priority, urgency: Urgency, affected: Affected): string {
  if (priority === "critica") {
    return affected === "company"
      ? "algo parado para a empresa inteira"
      : "algo parado para uma equipe";
  }
  if (priority === "alta" && urgency === "same_day") return "há um compromisso no mesmo dia";
  if (priority === "alta") return "impede uma pessoa de trabalhar";
  if (priority === "baixa") return "é um pedido sem urgência";
  return "atrapalha, mas há alternativa ou o impacto é limitado";
}
