import type { Category, Priority, TicketStatus } from "./types";

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  encerrado: "Encerrado",
};

export const CATEGORIES: Category[] = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
];

export const AFFECTED_OPTIONS = [
  { id: "affected:self", n: 1, label: "Só eu" },
  { id: "affected:team", n: 2, label: "Minha equipe" },
  { id: "affected:company", n: 3, label: "Toda a empresa" },
  { id: "affected:unknown", n: 4, label: "Não sei" },
] as const;

export function categoryLine(category: Category, subcategory: string | null): string {
  return subcategory ? `${category} › ${subcategory}` : category;
}

export function affectedLabel(value: string): string {
  if (value === "self") return "Somente você";
  if (value === "team") return "Sua equipe";
  if (value === "company") return "Toda a empresa";
  return "Não informado";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
