"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, PRIORITY_LABEL } from "../domain/labels";
import type { ChatMessage, MessagePayload, Priority, TicketCard } from "../domain/types";
import { EmployeeShell, TopBar, type SessionUser } from "./employee-shell";

type ChatResponse = {
  conversation: {
    id: string;
    status: "with_agent" | "waiting_analyst" | "with_analyst" | "resolved";
    messageCount: number;
    assigneeName: string | null;
    queue: "N1" | "N2" | null;
  } | null;
  messages: ChatMessage[];
  error?: string;
};

export function ChatScreen({ user }: { user: SessionUser }) {
  const [data, setData] = useState<ChatResponse | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/chat");
    if (response.ok) setData((await response.json()) as ChatResponse);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const poll = window.setInterval(() => {
      if (!busy) void load();
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [busy]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, busy]);

  const status = data?.conversation?.status ?? "with_agent";
  const count = data?.conversation?.messageCount ?? 0;
  const locked = status === "with_agent" && count >= 30;

  const send = useCallback(async (value: string, optionId?: string, draft?: { title: string; description: string; category: string; priority: Priority }) => {
    const payload = value.trim();
    if (!payload || busy) return;
    setBusy(true);
    setError(null);
    setEditing(false);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: payload, optionId, draft }),
    });
    const body = (await response.json()) as ChatResponse;
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Não consegui enviar.");
      return;
    }
    setText("");
    setData(body);
  }, [busy]);

  async function newSession() {
    setBusy(true);
    const response = await fetch("/api/chat/session", { method: "POST" });
    const body = (await response.json()) as ChatResponse;
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Não foi possível abrir outra sessão.");
      return;
    }
    setData(body);
    setError(null);
  }

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void sendRef.current("Confirmar", "confirm");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const banner = bannerFor(data?.conversation ?? null);

  return (
    <EmployeeShell user={user}>
      <TopBar
        here="Atendimento"
        status={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${banner ? "bg-warning-soft text-warning-text" : "bg-success-soft text-success-text"}`}>
            <span className={`size-1.5 rounded-full ${banner ? "bg-warning-text" : "bg-success"}`} />
            {banner ? "Assistente em pausa" : "Assistente online"}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-[760px] flex-col gap-6">
            {!data ? <p className="text-ink-3">Carregando a conversa…</p> : null}
            {data && data.messages.length === 0 ? (
              <p className="text-[15px] text-ink-3">Descreva o que está acontecendo. Pode ser uma dúvida, um chamado ou um pedido.</p>
            ) : null}
            {data?.messages.map((message, index) => (
              <MessageView
                key={message.id}
                message={message}
                interactive={index === data.messages.length - 1 && status === "with_agent" && !busy}
                editing={editing && index === data.messages.length - 1}
                onEdit={() => setEditing(true)}
                onSend={(value, optionId, draft) => void send(value, optionId, draft)}
              />
            ))}
            {busy ? <p className="text-[13.5px] text-ink-3">Nexo está consultando chamados e a central de ajuda…</p> : null}
            {banner ? <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13.5px] text-warning-text">{banner}</p> : null}
            {error ? <p className="text-[13.5px] text-danger-text" role="alert">{error}</p> : null}
            <div ref={bottom} />
          </div>
        </div>
        <div className="border-t border-rule px-6 py-4">
          <div className="mx-auto max-w-[760px]">
            {locked ? (
              <button type="button" onClick={() => void newSession()} className="h-11 rounded-lg bg-cta px-4 text-[13.5px] font-semibold text-white">
                Iniciar nova sessão
              </button>
            ) : (
              <form
                className="flex h-12 items-center gap-2 rounded-xl border border-rule bg-paper px-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(text);
                }}
              >
                <input
                  data-testid="composer"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Escreva para o Nexo…"
                  className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
                  disabled={busy}
                />
                <button type="submit" data-testid="send" disabled={busy || !text.trim()} className="rounded-lg bg-cta px-3 py-1.5 text-[13.5px] font-semibold text-white disabled:opacity-40">
                  Enviar
                </button>
              </form>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3" data-testid="counter">{count}/30 mensagens nesta sessão</p>
          </div>
        </div>
      </div>
    </EmployeeShell>
  );
}

function bannerFor(conversation: ChatResponse["conversation"]): string | null {
  if (!conversation) return null;
  if (conversation.status === "waiting_analyst") return "Aguardando atendente. O assistente fica em pausa até alguém devolver a conversa.";
  if (conversation.status === "with_analyst") return `${conversation.assigneeName ?? "Um analista"} está atendendo. O assistente continua em pausa.`;
  if (conversation.status === "resolved") return "Atendimento encerrado. Escreva de novo para abrir outra sessão.";
  return null;
}

function MessageView({
  message,
  interactive,
  editing,
  onEdit,
  onSend,
}: {
  message: ChatMessage;
  interactive: boolean;
  editing: boolean;
  onEdit: () => void;
  onSend: (text: string, optionId?: string, draft?: { title: string; description: string; category: TicketCard["fields"][number] extends never ? never : string; priority: Priority }) => void;
}) {
  if (message.role === "system") {
    return <p className="text-center text-[12.5px] text-ink-3">{message.text}</p>;
  }
  if (message.role === "user") {
    return (
      <div className="flex justify-end" data-testid="msg">
        <p className="max-w-[520px] rounded-2xl bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed text-white">{message.text}</p>
      </div>
    );
  }
  const payload = message.payload;
  return (
    <article className="max-w-[680px]" data-testid="msg">
      <p className="text-[12.5px] font-semibold">{message.authorName ?? "Nexo Assist"} {message.authorTag ? <span className="ml-1 rounded bg-primary-soft px-1 py-0.5 text-[11px] text-primary-text">{message.authorTag}</span> : null}</p>
      {payload?.actions && payload.actions.length > 0 ? (
        <p className="mt-0.5 text-[12.5px] text-ink-3">{payload.actions.join(" · ")}</p>
      ) : null}
      {payload?.trace ? <Trace trace={payload.trace} /> : null}
      {message.role === "analyst" ? <p className="mt-2 rounded-2xl bg-human px-4 py-2.5 text-[14.5px] leading-relaxed">{message.text}</p> : <p className="mt-2 text-[14.5px] leading-relaxed">{message.text}</p>}
      {payload?.question ? <p className="mt-3 text-[14.5px] font-semibold">{payload.question}</p> : null}
      {payload?.options ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {payload.options.map((option) => (
            <button key={option.id} type="button" disabled={!interactive} data-testid={`option-${option.id}`} onClick={() => onSend(option.label, option.id)} className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-[13.5px] disabled:opacity-60">
              <span className={`grid size-5 place-items-center rounded-full text-[12px] ${option.n === 1 ? "bg-cta text-white" : "text-ink-3"}`}>{option.n}</span>
              <span className={option.n === 1 ? "font-medium text-primary-text" : ""}>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {payload?.choices ? (
        <div className="mt-3 overflow-hidden rounded-[14px] border border-rule">
          {payload.choices.map((choice) => (
            <button key={choice.id} type="button" disabled={!interactive} data-testid={`choice-${choice.id}`} onClick={() => onSend(`${choice.id} · ${choice.title}`, `ticket:${choice.id}`)} className="flex w-full items-center gap-3 border-b border-rule px-3 py-3 text-left last:border-0 hover:bg-desk disabled:hover:bg-transparent">
              <span className="w-24 shrink-0 text-[12.5px] text-ink-3">{choice.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{choice.title}</span>
                <span className="text-[12.5px] text-ink-3">{choice.status}</span>
              </span>
              <span className="text-[12.5px] text-ink-3">{choice.date}</span>
            </button>
          ))}
        </div>
      ) : null}
      {payload?.card ? (
        <CardView card={payload.card} interactive={interactive} editing={editing} onEdit={onEdit} onSend={onSend} />
      ) : null}
      {payload?.followups ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {payload.followups.map((action) => (
            <button key={action.id} type="button" disabled={!interactive} data-testid={`action-${action.id}`} onClick={() => onSend(action.label, action.id)} className="rounded-lg border border-rule px-3 py-2 text-[13.5px] font-medium disabled:opacity-60">
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Trace({ trace }: { trace: NonNullable<MessagePayload["trace"]> }) {
  return (
    <details className="mt-2 rounded-xl bg-desk px-3 py-2 text-[13px]" data-testid="decision">
      <summary className="cursor-pointer font-medium text-ink-2">Por que esta resposta · {Math.round(trace.confidence * 100)}%</summary>
      <dl className="mt-2 space-y-1.5 text-ink-2">
        <div><dt className="text-ink-3">O que entendi</dt><dd>{trace.understood}</dd></div>
        <div><dt className="text-ink-3">Ação</dt><dd>{trace.action}</dd></div>
        <div><dt className="text-ink-3">Por quê</dt><dd>{trace.why}</dd></div>
        <div>
          <dt className="text-ink-3">Quem interpretou</dt>
          <dd>{trace.interpreter === "mastra" ? `Mastra · ${trace.model ?? "modelo"}` : "Regras do service desk, sem LLM nesta resposta"}</dd>
        </div>
        {trace.tools.length > 0 ? (
          <div>
            <dt className="text-ink-3">Ferramentas</dt>
            <dd>{trace.tools.map((tool) => `${tool.name} (${tool.detail})`).join(" · ")}</dd>
          </div>
        ) : null}
        {trace.usage ? <div><dt className="text-ink-3">Tokens</dt><dd>{trace.usage.promptTokens + trace.usage.completionTokens} nesta resposta</dd></div> : null}
      </dl>
    </details>
  );
}

function CardView({
  card,
  interactive,
  editing,
  onEdit,
  onSend,
}: {
  card: TicketCard;
  interactive: boolean;
  editing: boolean;
  onEdit: () => void;
  onSend: (text: string, optionId?: string, draft?: { title: string; description: string; category: string; priority: Priority }) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [category, setCategory] = useState(card.fields.find((field) => field.key === "Categoria")?.value.split(" › ")[0] ?? "Outros");
  const [priority, setPriority] = useState<Priority>(priorityFromLabel(card.fields.find((field) => field.key === "Prioridade")?.value));

  return (
    <section className="mt-3 rounded-[14px] border border-rule p-4" data-testid="ticket-card">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <span>{card.eyebrow}</span>
        {card.code ? <span>{card.code}</span> : null}
        <span className={`rounded-full px-2 py-0.5 font-medium ${badgeClass(card.badge.tone)}`}>{card.badge.label}</span>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-lg border border-rule px-2" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-lg border border-rule px-2 py-2" />
          <div className="flex gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-rule px-2">
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="h-10 rounded-lg border border-rule px-2">
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((item) => <option key={item} value={item}>{PRIORITY_LABEL[item]}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <>
          <h3 className="mt-2 text-[18px] font-semibold">{card.title}</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{card.description}</p>
          <dl className="mt-3 grid gap-2">
            {card.fields.map((field) => (
              <div key={field.key} className="grid grid-cols-[160px_1fr] gap-2">
                <dt className="text-[12.5px] text-ink-3">{field.key}</dt>
                <dd className={`text-[14.5px] font-medium ${field.tone === "warning" ? "text-warning-text" : ""}`}>
                  {field.value} {field.note ? <span className="font-normal text-ink-3">{field.note}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {card.actions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={!interactive}
              data-testid={action.id}
              onClick={() => {
                if (action.id === "edit") {
                  onEdit();
                  return;
                }
                onSend(action.label, action.id, editing ? { title, description, category, priority } : undefined);
              }}
              className={action.style === "primary" ? "rounded-lg bg-cta px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50" : action.style === "secondary" ? "rounded-lg border border-rule px-3 py-2 text-[13.5px] font-medium disabled:opacity-50" : "rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-2 disabled:opacity-50"}
            >
              {action.label} {action.hint ? <span className="ml-1 text-[11.5px] text-white/80">{action.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function priorityFromLabel(label: string | undefined): Priority {
  if (label === "Crítica") return "critica";
  if (label === "Alta") return "alta";
  if (label === "Baixa") return "baixa";
  return "media";
}

function badgeClass(tone: TicketCard["badge"]["tone"]): string {
  if (tone === "warning") return "bg-warning-soft text-warning-text";
  if (tone === "success") return "bg-success-soft text-success-text";
  if (tone === "danger") return "bg-danger-soft text-danger-text";
  if (tone === "info") return "bg-primary-soft text-primary-text";
  return "bg-desk text-ink-3";
}
