import type { Affected, Category, TicketType, Urgency } from "./types";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const STOP = new Set([
  "para", "como", "meu", "minha", "meus", "minhas", "com", "uma", "uns", "que",
  "depois", "desde", "ontem", "hoje", "nao", "esta", "estou", "tenho", "preciso",
  "quero", "sobre", "pelo", "pela", "dos", "das", "nos", "nas", "por", "mais",
  "muito", "ainda", "quando", "onde", "porque", "favor", "obrigado", "obrigada",
  "chamado", "abrir", "problema", "voce", "seu", "sua", "isso", "esse", "essa",
]);

export function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !STOP.has(token)),
  );
}

export function similarityScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

export function findSimilar<T extends { title: string; description: string }>(
  items: T[],
  text: string,
): T | null {
  let best: T | null = null;
  let score = 1;
  for (const item of items) {
    const next = similarityScore(`${item.title} ${item.description}`, text);
    if (next > score) {
      score = next;
      best = item;
    }
  }
  return best;
}

export type Signals = {
  normalized: string;
  category: Category;
  type: TicketType;
  urgency: Urgency;
  affected: Affected | null;
  os: string | null;
  ticketId: string | null;
  subcategory: string | null;
  outOfScope: "rh" | "financeiro" | "facilities" | null;
};

function detectCategory(text: string): Category {
  if (/(vpn|wi-fi|wifi|rede|internet|proxy)/.test(text)) return "Rede e VPN";
  if (/(outlook|e-mail|email|caixa de entrada)/.test(text)) return "E-mail";
  if (/(notebook|monitor|mouse|teclado|headset|computador|lentidao|lento|impressora|webcam)/.test(text)) {
    return "Hardware";
  }
  if (/(sap|sharepoint|senha|acesso|permiss|login|bloquead)/.test(text)) return "Acesso";
  if (/(excel|software|instalar|licenca|office|teams|vscode)/.test(text)) return "Software";
  return "Outros";
}

function detectSubcategory(text: string): string | null {
  if (/vpn|809/.test(text)) return "VPN";
  if (/sharepoint/.test(text)) return "SharePoint";
  if (/sap/.test(text)) return "SAP";
  if (/outlook/.test(text)) return "Outlook";
  if (/monitor/.test(text)) return "Monitor";
  if (/notebook|lento|lentidao/.test(text)) return "Notebook";
  if (/wifi|wi-fi/.test(text)) return "Wi-Fi";
  return null;
}

function detectType(text: string, category: Category): TicketType {
  const broken = /(nao funciona|nao conect|erro|parou|fora do ar|lent|bloquead|nao abre|nao sincron)/.test(text);
  const request = /(pedido|solicit|preciso de|segundo monitor|licenca|instalar|liberar acesso|acesso ao|acesso a )/.test(text);
  if (broken) return "INC";
  if (request) return "REQ";
  if (category === "Hardware" && /monitor|headset|mouse|teclado/.test(text)) return "REQ";
  return "INC";
}

export function effectiveUrgency(signals: Signals): Urgency {
  const wide = signals.affected === "team" || signals.affected === "company";
  if (wide && /(nao conect|nao funciona|fora do ar|parou|caiu|ninguem)/.test(signals.normalized)) return "down";
  return signals.urgency;
}

export function detectUrgency(text: string): Urgency {
  if (/(parou|fora do ar|ninguem consegue|todo mundo|empresa parada|caiu para|nao consegue trabalhar)/.test(text)) {
    return "down";
  }
  if (/(reuniao|cliente as|ainda hoje|hoje as|compromisso|preciso hoje|daqui a pouco)/.test(text)) {
    return "same_day";
  }
  if (/(nao consigo trabalhar|impede|travou o trabalho|sem alternativa)/.test(text)) return "blocked";
  if (/(alternativa|contorno|consigo usar outro|workaround)/.test(text)) return "workaround";
  return "none";
}

export function detectAffected(text: string): Affected | null {
  if (/(toda a empresa|empresa toda|todo mundo|todos os funcionarios)/.test(text)) return "company";
  if (/(minha equipe|meu time|o time|nosso time|departamento)/.test(text)) return "team";
  if (/(so eu|apenas eu|somente eu|eu mesmo|so comigo)/.test(text)) return "self";
  if (/(nao sei|ninguem sabe)/.test(text)) return "unknown";
  return null;
}

function detectOutOfScope(text: string): Signals["outOfScope"] {
  const it = /(vpn|sap|outlook|sharepoint|notebook|senha|acesso|wifi|wi-fi|monitor|e-mail|email|software|chamado|computador|rede)/.test(text);
  if (it) return null;
  if (/(ferias|holerite|salario|beneficio|recursos humanos|\brh\b|ponto eletronico)/.test(text)) return "rh";
  if (/(reembolso|nota fiscal|contas a pagar|holerite)/.test(text)) return "financeiro";
  if (/(ar-condicionado|ar condicionado|cadeira|limpeza|estacionamento|facilities|copa|lampada)/.test(text)) {
    return "facilities";
  }
  return null;
}

export function extractSignals(text: string, profileOs?: string | null): Signals {
  const normalized = normalize(text);
  const category = detectCategory(normalized);
  let os: string | null = profileOs ?? null;
  if (/windows\s*11|win\s*11/.test(normalized)) os = "Windows 11";
  if (/windows\s*10|win\s*10/.test(normalized)) os = "Windows 10";
  const ticket = text.match(/\b((?:INC|REQ)-\d+)\b/i);
  return {
    normalized,
    category,
    type: detectType(normalized, category),
    urgency: detectUrgency(normalized),
    affected: detectAffected(normalized),
    os,
    ticketId: ticket?.[1]?.toUpperCase() ?? null,
    subcategory: detectSubcategory(normalized),
    outOfScope: detectOutOfScope(normalized),
  };
}

export function buildTitle(signals: Signals, text: string): string {
  const n = signals.normalized;
  if (/vpn/.test(n) && /809/.test(n)) return "VPN não conecta no notebook — erro 809";
  if (/sap/.test(n) && /(senha|bloque)/.test(n)) return "Senha do SAP bloqueada";
  if (/monitor/.test(n)) return "Segundo monitor para home office";
  if (/sharepoint/.test(n)) return "Acesso à pasta no SharePoint";
  if (/outlook/.test(n)) return "Outlook não sincroniza";
  if (/notebook/.test(n) && /lent/.test(n)) return "Notebook lento após atualização";
  const clean = text.replace(/\s+/g, " ").trim();
  const slice = clean.length > 72 ? `${clean.slice(0, 69).trimEnd()}…` : clean;
  return slice.charAt(0).toUpperCase() + slice.slice(1);
}

export function buildDescription(text: string, os: string | null): string {
  const n = normalize(text);
  if (/vpn/.test(n) && /809/.test(n)) {
    const machine = os ? ` (${os})` : "";
    const when = /desde ontem/.test(n) ? "Desde ontem, o" : "O";
    const meeting = /(reuniao|14h|as 14)/.test(n) ? " Precisa dela para a reunião de hoje." : "";
    return `${when} notebook${machine} não conecta na VPN e mostra o erro 809.${meeting}`;
  }
  return text.replace(/\s+/g, " ").trim();
}
