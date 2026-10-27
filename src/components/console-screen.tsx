"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NexoMark } from "./logo";

type Analyst = {
  id: string;
  name: string;
  email: string;
  level: "N1" | "N2" | null;
  initials: string;
  avatarBg: string;
  avatarFg: string;
};

type ListItem = {
  id: string;
  name: string;
  department: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  online: boolean;
  lastText: string;
  timeLabel: string;
  statusLabel: string;
  tone: "danger" | "warning" | "info" | "neutral";
  unread: number;
};

type DeskMessage = {
  id: string;
  role: "user" | "agent" | "analyst" | "system";
  text: string;
  createdAt: string;
  authorName: string | null;
  authorTag: string | null;
};

type TicketView = {
  id: string;
  title: string;
  category: string;
  priorityLabel: string;
  statusLabel: string;
  lastEvent: string;
  lastEventTime: string;
  open: boolean;
};

type Detail = {
  conversation: {
    id: string;
    status: string;
    assigneeId: string | null;
    assigneeName: string | null;
    focusTicketId: string | null;
  };
  employee: { name: string; department: string; initials: string; avatarBg: string; avatarFg: string; online: boolean };
  messages: DeskMessage[];
  tickets: TicketView[];
  openCount: number;
  closedCount: number;
  error?: string;
};

const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "para-voce", label: "Para você" },
  { id: "agent", label: "Com o agent" },
  { id: "minhas", label: "Minhas" },
] as const;

export function ConsoleScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("para-voce");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ListItem[]>([]);
  const [counts, setCounts] = useState({ todas: 0, paraVoce: 0, agent: 0, minhas: 0 });
  const [analyst, setAnalyst] = useState<Analyst | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(true);

  const loadList = useCallback(async (current = selected) => {
    const response = await fetch(`/api/console/conversations?filter=${filter}&q=${encodeURIComponent(query)}`);
    if (response.status === 401) {
      router.push("/");
      return;
    }
    const body = (await response.json()) as { items: ListItem[]; counts: typeof counts; analyst: Analyst; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Não foi possível carregar as conversas.");
      return;
    }
    setItems(body.items);
    setCounts(body.counts);
    setAnalyst(body.analyst);
    if (!current && body.items[0]) setSelected(body.items[0].id);
  }, [filter, query, router, selected]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/console/conversations/${id}`);
    const body = (await response.json()) as Detail;
    if (!response.ok) {
      setError(body.error ?? "Não foi possível abrir a conversa.");
      return;
    }
    setDetail(body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList(selected);
    }, 0);
    const poll = window.setInterval(() => {
      void loadList(selected);
      if (selected) void loadDetail(selected);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [loadDetail, loadList, selected]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      void loadDetail(selected);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail, selected]);

  async function act(action: string, text?: string) {
    if (!selected) return;
    setError(null);
    const response = await fetch(`/api/console/conversations/${selected}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, text }),
    });
    const body = (await response.json()) as Detail;
    if (!response.ok) {
      setError(body.error ?? "Não foi possível concluir a ação.");
      return;
    }
    setDetail(body);
    setDraft("");
    void loadList(selected);
  }

  const mine = Boolean(
    detail && analyst && detail.conversation.assigneeId === analyst.id && detail.conversation.status === "with_analyst",
  );
  const waiting = detail?.conversation.status === "waiting_analyst";
  const focus = detail?.tickets.find((ticket) => ticket.id === detail.conversation.focusTicketId) ?? detail?.tickets.find((ticket) => ticket.open);

  return (
    <div className="flex h-dvh min-w-[1100px] bg-paper">
      <aside className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-rule bg-desk py-3">
        <div className="grid size-10 place-items-center">
          <NexoMark size={22} color="#1B2431" />
        </div>
        <div className="relative grid size-10 place-items-center rounded-xl bg-paper">
          <ChatGlyph />
          {counts.paraVoce > 0 ? <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-cta px-1 text-[10px] font-bold text-white">{counts.paraVoce}</span> : null}
        </div>
        <div className="mt-auto mb-1">
          <span className="relative grid size-9 place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
            {analyst?.initials ?? "·"}
            <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-desk bg-success" />
          </span>
        </div>
      </aside>
      <section className="flex w-[380px] shrink-0 flex-col border-r border-rule">
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-bold">Conversas</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-1 text-[12.5px] font-semibold text-success-text">
              <span className="size-1.5 rounded-full bg-success" />
              Disponível
            </span>
          </div>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-full bg-desk px-3 text-ink-3">
            <SearchIcon />
            <input data-testid="console-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar conversa ou chamado" className="w-full bg-transparent text-[13.5px] outline-none" />
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5 pb-3">
            {FILTERS.map((item) => {
              const count = item.id === "todas" ? null : item.id === "para-voce" ? counts.paraVoce : item.id === "agent" ? counts.agent : counts.minhas;
              const active = filter === item.id;
              return (
                <button key={item.id} type="button" data-testid={`filter-${item.id}`} onClick={() => setFilter(item.id)} className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium ${active ? "bg-primary-soft text-primary-text" : "bg-desk text-ink-2"}`}>
                  {item.label} {count != null ? <span className="ml-1">{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {items.map((item) => (
            <button key={item.id} type="button" data-testid={`conv-${item.id}`} onClick={() => setSelected(item.id)} className={`flex w-full gap-3 rounded-xl px-2 py-2.5 text-left ${selected === item.id ? "bg-desk" : ""}`}>
              <Avatar initials={item.initials} bg={item.avatarBg} fg={item.avatarFg} online={item.online} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15.5px] font-semibold">{item.name}</span>
                  <span className="ml-auto shrink-0 text-[12.5px] text-ink-3">{item.timeLabel}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-[13.5px] text-ink-3">{item.lastText}</span>
                  {item.unread > 0 ? <span className="grid size-5 shrink-0 place-items-center rounded-full bg-cta text-[11.5px] font-bold text-white">{item.unread}</span> : null}
                </span>
                <span className={`mt-1 inline-block text-[11.5px] font-medium ${item.tone === "danger" ? "text-danger-text" : item.tone === "warning" ? "text-warning-text" : item.tone === "info" ? "text-primary-text" : "text-ink-3"}`}>{item.statusLabel}</span>
              </span>
            </button>
          ))}
          {items.length === 0 ? <p className="px-2 py-6 text-[13.5px] text-ink-3">Nenhuma conversa neste filtro.</p> : null}
        </div>
      </section>
      <section className="flex min-w-0 flex-1 flex-col bg-chat">
        {detail ? (
          <>
            <header className="flex h-16 items-center gap-3 border-b border-rule bg-paper px-4">
              <Avatar initials={detail.employee.initials} bg={detail.employee.avatarBg} fg={detail.employee.avatarFg} online={detail.employee.online} />
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold">{detail.employee.name}</p>
                <p className="text-[12.5px] text-ink-3">{detail.employee.online ? "online" : "offline"} · {detail.employee.department}{detail.conversation.focusTicketId ? ` · ${detail.conversation.focusTicketId}` : ""}</p>
              </div>
              {waiting ? <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[12.5px] font-semibold text-warning-text">Aguardando atendente</span> : null}
              {mine ? (
                <>
                  <button type="button" data-testid="return-agent" onClick={() => void act("return")} className="h-9 rounded-lg px-3 text-[13.5px] font-medium text-ink-2">Devolver ao agent</button>
                  <button type="button" data-testid="close-chat" onClick={() => void act("close")} className="h-9 rounded-lg bg-danger-soft px-3 text-[13.5px] font-semibold text-danger-text">Encerrar atendimento</button>
                </>
              ) : null}
              <button type="button" className="grid size-9 place-items-center rounded-full text-ink-2 xl:hidden" onClick={() => setPanel((value) => !value)}>Chamados</button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {detail.messages.map((message) => <DeskBubble key={message.id} message={message} />)}
            </div>
            <footer className="bg-paper px-4 py-3">
              {error ? <p className="mb-2 text-[13px] text-danger-text">{error}</p> : null}
              {waiting ? (
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <p className="min-w-[180px] flex-1 text-[14.5px] font-semibold">{detail.employee.name.split(" ")[0]} espera um atendente</p>
                  <button type="button" onClick={() => void act("return")} className="h-9 rounded-lg px-3 text-[13.5px] text-ink-2">Devolver ao agent</button>
                  <button type="button" data-testid="assume" onClick={() => void act("assume")} className="h-9 rounded-lg bg-cta px-3 text-[13.5px] font-semibold text-white">Assumir atendimento</button>
                </div>
              ) : null}
              {mine ? (
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void act("message", draft); }}>
                  <input data-testid="analyst-composer" value={draft} onChange={(event) => setDraft(event.target.value)} className="h-11 flex-1 rounded-xl bg-desk px-3 text-[14.5px] outline-none" placeholder="Escreva para a pessoa" />
                  <button type="submit" data-testid="analyst-send" className="grid size-11 place-items-center rounded-full bg-cta text-white">↑</button>
                </form>
              ) : (
                <div className="flex h-11 items-center rounded-xl bg-desk px-3 text-[14.5px] text-ink-3">Assuma o atendimento para responder</div>
              )}
            </footer>
          </>
        ) : <p className="p-6 text-ink-3">Selecione uma conversa.</p>}
      </section>
      {panel && detail ? (
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-rule bg-paper xl:flex">
          <header className="flex h-16 items-center justify-between px-4">
            <div>
              <p className="text-[15.5px] font-semibold">Chamados de {detail.employee.name.split(" ")[0]}</p>
              <p className="text-[12.5px] text-ink-3">{detail.openCount} abertos · {detail.closedCount} encerrados</p>
            </div>
            <button type="button" className="text-ink-3" onClick={() => setPanel(false)} aria-label="Fechar painel">✕</button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
            {focus ? (
              <div>
                <p className="text-[12.5px] font-semibold text-ink-3">Desta conversa</p>
                <div className="mt-2 rounded-xl bg-desk p-3">
                  <div className="flex justify-between text-[12.5px] text-ink-3">
                    <span>{focus.id}</span>
                    <span className="font-semibold text-warning-text">{focus.statusLabel}</span>
                  </div>
                  <p className="mt-1 text-[15.5px] font-semibold">{focus.title}</p>
                  <p className="text-[13.5px] text-ink-3">{focus.category} · prioridade {focus.priorityLabel.toLowerCase()}</p>
                  {focus.lastEvent ? <p className="mt-2 text-[13.5px] text-ink-2">{focus.lastEvent} <span className="text-ink-3">{focus.lastEventTime}</span></p> : null}
                </div>
              </div>
            ) : null}
            <div>
              <p className="text-[12.5px] font-semibold text-ink-3">Outros chamados</p>
              <ul className="mt-2 space-y-3">
                {detail.tickets.filter((ticket) => ticket.id !== focus?.id).map((ticket) => (
                  <li key={ticket.id}>
                    <p className="text-[14.5px] font-medium">{ticket.title}</p>
                    <p className="text-[12.5px] text-ink-3">{ticket.id} · {ticket.statusLabel}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function DeskBubble({ message }: { message: DeskMessage }) {
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(message.createdAt));
  if (message.role === "system") {
    return <p className="text-center text-[12px] text-ink-3">— {message.text} —</p>;
  }
  const mine = message.role === "agent" || message.role === "analyst";
  return (
    <div className={`flex ${mine ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[420px]">
        {mine ? <p className="mb-1 text-[12px] font-semibold text-ink-2">{message.authorName} {message.authorTag ? <span className={`ml-1 rounded px-1 py-0.5 text-[11px] ${message.role === "analyst" ? "bg-success-soft text-success-text" : "bg-primary-soft text-primary-text"}`}>{message.authorTag}</span> : null}</p> : null}
        <div className={`rounded-2xl px-3 py-2 text-[14.5px] ${message.role === "user" ? "bg-paper" : message.role === "analyst" ? "bg-human" : "bg-agent"}`}>
          <p>{message.text}</p>
          <p className="mt-1 text-right text-[11px] text-ink-3">{time}</p>
        </div>
      </div>
    </div>
  );
}

function Avatar({ initials, bg, fg, online }: { initials: string; bg: string; fg: string; online: boolean }) {
  return (
    <span className="relative grid size-[46px] shrink-0 place-items-center rounded-full text-[15px] font-semibold" style={{ background: bg, color: fg }}>
      {initials}
      {online ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-paper bg-success" /> : null}
    </span>
  );
}

function ChatGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1B2431" strokeWidth="1.8">
      <path d="M5 6h14v9H8l-3 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}
