import type { Facts } from "./plan-types";
import { extractSignals, normalize } from "./signals";
import type { Intent } from "./types";

export type { Facts };

const BUTTON: Record<string, Intent> = {
  confirm: "confirm",
  cancel: "cancel",
  transfer: "transfer",
  decline: "decline",
  add_info: "add_info",
};

export function understandRules(text: string, optionId?: string): Facts {
  if (optionId?.startsWith("affected:")) {
    return fact("open", 0.99, "button", "A pessoa escolheu uma opção de quem é afetado.");
  }
  if (optionId?.startsWith("ticket:")) {
    return {
      ...fact("select_ticket", 0.99, "button", "A pessoa escolheu um chamado na lista."),
      ticketId: optionId.slice("ticket:".length).toUpperCase(),
    };
  }
  if (optionId && BUTTON[optionId]) {
    return fact(BUTTON[optionId], 0.99, "button", "A pessoa usou um botão da conversa.");
  }

  const n = normalize(text);
  const signals = extractSignals(text);
  if (signals.outOfScope) {
    return fact("out_of_scope", 0.92, "rules", "O assunto não é de TI.");
  }
  if (/(falar com|quero um analista|quero uma pessoa|me transfere|atendente humano|chamar um analista)/.test(n)) {
    return fact("transfer", 0.93, "rules", "A pessoa pediu para falar com um analista.");
  }
  if (signals.ticketId) {
    return {
      ...fact("select_ticket", 0.95, "rules", `A mensagem cita ${signals.ticketId}.`),
      ticketId: signals.ticketId,
    };
  }
  if (/(qual o status|status do|como esta|meus chamados|meu chamado|andamento do)/.test(n)) {
    return fact("status", 0.9, "rules", "A pessoa quer saber de um chamado, sem citar o número.");
  }
  if (/^(confirmar|confirma|pode criar|pode abrir|pode sim|pode salvar|isso mesmo)\b/.test(n)) {
    return fact("confirm", 0.9, "rules", "A mensagem confirma o rascunho.");
  }
  if (/^(cancelar|cancela|deixa quieto|nao precisa)\b/.test(n)) {
    return fact("cancel", 0.9, "rules", "A mensagem cancela o rascunho.");
  }
  if (/(nao, obrigado|nao obrigado|agora nao|deixa pra la)/.test(n)) {
    return fact("decline", 0.86, "rules", "A pessoa recusou a oferta.");
  }
  if (/(adicionar informacao|complementar|nova informacao)/.test(n)) {
    return fact("add_info", 0.88, "rules", "A pessoa quer complementar um chamado.");
  }
  if (/(horario|que horas|plantao|senha do wi-fi|senha do wifi|como resetar)/.test(n)) {
    return fact("kb", 0.88, "rules", "A pergunta cabe na central de ajuda.");
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|opa)\b/.test(n) && n.split(/\s+/).length < 6) {
    return fact("greeting", 0.9, "rules", "Saudação, sem pedido ainda.");
  }
  if (/(nao|erro|lent|parou|vpn|sap|outlook|monitor|acesso|senha|notebook|sharepoint|instalar|wifi)/.test(n)) {
    return fact("open", 0.84, "rules", "A mensagem descreve um problema ou um pedido de TI.");
  }
  return fact("unclear", 0.41, "rules", "Não há palavras suficientes para escolher uma ação com segurança.");
}

function fact(intent: Intent, confidence: number, source: Facts["source"], why: string): Facts {
  return { intent, confidence, why, source, ticketId: null, understood: "" };
}

export function mergeFacts(rules: Facts, model: Facts | null): Facts {
  if (!model || rules.source === "button") return rules;
  const strong =
    rules.confidence >= 0.8 &&
    (rules.intent === "confirm" ||
      rules.intent === "cancel" ||
      rules.intent === "transfer" ||
      rules.intent === "status" ||
      rules.intent === "select_ticket" ||
      rules.intent === "out_of_scope" ||
      rules.intent === "decline");
  if (strong) {
    return { ...rules, understood: model.understood || rules.understood };
  }
  if (model.confidence >= 0.55) {
    return {
      ...model,
      source: "model",
      ticketId: model.ticketId || rules.ticketId,
    };
  }
  if (rules.confidence >= 0.55) return rules;
  return { ...rules, intent: "unclear", confidence: Math.min(rules.confidence, model.confidence) };
}
