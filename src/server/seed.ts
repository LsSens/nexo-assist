import type { DatabaseSync } from "node:sqlite";
import { dueDate } from "../domain/sla";

type UserSeed = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
  department: string;
  level?: "N1" | "N2";
  os?: string;
  avatarBg: string;
  avatarFg: string;
  demoOnline?: boolean;
};

const USERS: UserSeed[] = [
  ["u-ana", "Ana Souza", "ana.souza@nexo.com.br", "employee", "Financeiro", undefined, "Windows 11", "#DCE9F7", "#0062C4", true],
  ["u-carla", "Carla Mendes", "carla.mendes@nexo.com.br", "employee", "Comercial", undefined, "Windows 11", "#F6E3D3", "#9A4A12", true],
  ["u-bruno", "Bruno Tavares", "bruno.tavares@nexo.com.br", "employee", "Produto", undefined, "macOS", "#E6E1F7", "#5B3FC4", false],
  ["u-diego", "Diego Ramos", "diego.ramos@nexo.com.br", "employee", "Operações", undefined, "Windows 10", "#DDF0E6", "#1E7A4C", true],
  ["u-elisa", "Elisa Prado", "elisa.prado@nexo.com.br", "employee", "Jurídico", undefined, "Windows 11", "#F7E1E6", "#A3324F", false],
  ["u-fabio", "Fábio Nunes", "fabio.nunes@nexo.com.br", "employee", "Marketing", undefined, "Windows 10", "#E5E8EC", "#3D4656", false],
  ["u-gabriela", "Gabriela Rocha", "gabriela.rocha@nexo.com.br", "employee", "Gente", undefined, "Windows 11", "#FBEFD0", "#8A6100", false],
  ["u-rafael", "Rafael Lima", "rafael.lima@nexo.com.br", "analyst", "Service desk", "N2", undefined, "#DCE9F7", "#0062C4", true],
  ["u-marina", "Marina Costa", "marina.costa@nexo.com.br", "analyst", "Service desk", "N1", undefined, "#E6E1F7", "#5B3FC4", true],
].map(([id, name, email, role, department, level, os, avatarBg, avatarFg, demoOnline]) => ({
  id: String(id),
  name: String(name),
  email: String(email),
  role: role as UserSeed["role"],
  department: String(department),
  level: level as UserSeed["level"],
  os: os ? String(os) : undefined,
  avatarBg: String(avatarBg),
  avatarFg: String(avatarFg),
  demoOnline: Boolean(demoOnline),
}));

export function seedDatabase(db: DatabaseSync): void {
  const now = new Date();
  const passwordChanged = new Date(now.getTime() - 42 * 86_400_000).toISOString();
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role, department, level, os, avatar_bg, avatar_fg, password_changed_at, demo_online)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const user of USERS) {
    insertUser.run(
      user.id,
      user.name,
      user.email,
      user.role,
      user.department,
      user.level ?? null,
      user.os ?? null,
      user.avatarBg,
      user.avatarFg,
      passwordChanged,
      user.demoOnline ? 1 : 0,
    );
  }

  const overdueAt = new Date(now.getTime() - (5 * 24 + 6) * 3_600_000);
  insertTicket(db, {
    id: "INC-20311",
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
    category: "Hardware",
    subcategory: "Notebook",
    priority: "media",
    status: "aguardando_analista",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date(now.getTime() - 11 * 86_400_000),
    updatedAt: overdueAt,
    dueAt: dueDate(overdueAt, "media"),
    events: [
      ["Chamado aberto: lentidão depois da atualização do Windows.", "Ana Souza"],
      ["Encaminhado ao Suporte N2. Sem retorno dentro do prazo.", "Nexo Assist"],
    ],
  }, now);
  insertTicket(db, {
    id: "INC-20298",
    type: "INC",
    title: "Acesso à pasta Financeiro no SharePoint",
    description: "Ana não consegue editar a pasta Financeiro. O link foi informado e a permissão pedida é de edição.",
    category: "Acesso",
    subcategory: "SharePoint",
    priority: "media",
    status: "em_andamento",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date(now.getTime() - 13 * 86_400_000),
    updatedAt: new Date(now.getTime() - 2 * 86_400_000),
    dueAt: dueDate(new Date(now.getTime() - 2 * 86_400_000), "media"),
    events: [["Acesso em análise com o dono da pasta.", "Service desk"]],
  }, now);
  insertTicket(db, {
    id: "REQ-10442",
    type: "REQ",
    title: "Segundo monitor para home office",
    description: "Pedido de segundo monitor para a estação de home office. Sem compromisso no mesmo dia.",
    category: "Hardware",
    subcategory: "Monitor",
    priority: "baixa",
    status: "aprovado",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date(now.getTime() - 18 * 86_400_000),
    updatedAt: new Date(now.getTime() - 7 * 86_400_000),
    dueAt: dueDate(new Date(now.getTime() - 7 * 86_400_000), "baixa"),
    events: [["Pedido aprovado. Entrega do monitor em andamento.", "Service desk"]],
  }, now);
  const sapResolved = new Date(now.getTime() - 4 * 86_400_000);
  insertTicket(db, {
    id: "INC-20150",
    type: "INC",
    title: "Senha do SAP bloqueada",
    description: "A senha do SAP bloqueou depois de várias tentativas. A conta foi desbloqueada.",
    category: "Acesso",
    subcategory: "SAP",
    priority: "media",
    status: "resolvido",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date(now.getTime() - 6 * 86_400_000),
    updatedAt: sapResolved,
    resolvedAt: sapResolved,
    dueAt: dueDate(new Date(now.getTime() - 6 * 86_400_000), "media"),
    events: [["Senha desbloqueada e orientada a redefinir no próximo acesso.", "Service desk"]],
  }, now);
  insertTicket(db, {
    id: "INC-19877",
    type: "INC",
    title: "Outlook não sincroniza no celular",
    description: "A caixa não atualizava no celular. A conta foi recriada e a sincronização voltou.",
    category: "E-mail",
    subcategory: "Outlook",
    priority: "media",
    status: "resolvido",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date("2026-09-01T14:00:00-03:00"),
    updatedAt: new Date("2026-09-02T11:00:00-03:00"),
    resolvedAt: new Date("2026-09-02T11:00:00-03:00"),
    dueAt: new Date("2026-09-05T14:00:00-03:00"),
    events: [["Conta recriada no celular. Sincronização ok.", "Service desk"]],
  }, now);
  insertTicket(db, {
    id: "INC-19410",
    type: "INC",
    title: "Troca de senha da rede",
    description: "Senha da rede expirada. Redefinida no portal de identidade.",
    category: "Acesso",
    subcategory: null,
    priority: "baixa",
    status: "resolvido",
    requesterId: "u-ana",
    affected: "self",
    createdAt: new Date("2026-07-10T10:00:00-03:00"),
    updatedAt: new Date("2026-07-11T16:00:00-03:00"),
    resolvedAt: new Date("2026-07-11T16:00:00-03:00"),
    dueAt: new Date("2026-07-17T10:00:00-03:00"),
    events: [["Senha redefinida.", "Service desk"]],
  }, now);
  insertTicket(db, {
    id: "REQ-10480",
    type: "REQ",
    title: "Acesso ao SAP ainda hoje",
    description: "Carla precisa do módulo de vendas do SAP para uma reunião de hoje.",
    category: "Acesso",
    subcategory: "SAP",
    priority: "alta",
    status: "aguardando_analista",
    requesterId: "u-carla",
    affected: "self",
    createdAt: new Date(now.getTime() - 2 * 3_600_000),
    updatedAt: new Date(now.getTime() - 20 * 60_000),
    dueAt: dueDate(new Date(now.getTime() - 2 * 3_600_000), "alta"),
    events: [["Pedido transferido para um analista por causa do compromisso de hoje.", "Nexo Assist"]],
  }, now);
  insertTicket(db, {
    id: "INC-20519",
    type: "INC",
    title: "Excel não abre arquivos da rede",
    description: "O Excel fecha ao abrir planilhas na pasta de rede. Já reiniciou o computador.",
    category: "Software",
    subcategory: null,
    priority: "media",
    status: "em_andamento",
    requesterId: "u-elisa",
    affected: "self",
    createdAt: new Date(now.getTime() - 30 * 60_000),
    updatedAt: new Date(now.getTime() - 20 * 60_000),
    dueAt: dueDate(now, "media"),
    events: [["Chamado aberto pelo Nexo Assist.", "Nexo Assist"]],
  }, now);

  seedConversation(db, now, {
    id: "c-carla",
    employeeId: "u-carla",
    status: "waiting_analyst",
    focus: "REQ-10480",
    reason: "user",
    confidence: 0.9,
    queue: "N1",
    respondBy: new Date(now.getTime() + 25 * 60_000),
    summary: "Carla Mendes precisa de acesso ao SAP para uma reunião de hoje.",
    minutesAgo: 7,
    messages: [
      ["user", "Preciso de acesso ao SAP ainda hoje.", "Carla Mendes", null],
      ["agent", "O acesso ao SAP é uma requisição e há compromisso hoje. Encaminhei para o Suporte N1.", "Nexo Assist", "IA"],
      ["system", "Transferida para Suporte N1", null, null],
    ],
  });
  seedConversation(db, now, {
    id: "c-bruno",
    employeeId: "u-bruno",
    status: "waiting_analyst",
    reason: "low_confidence",
    confidence: 0.41,
    queue: "N2",
    respondBy: new Date(now.getTime() + 2 * 3_600_000),
    summary: "Bruno descreveu um comportamento estranho no computador, sem detalhe suficiente.",
    minutesAgo: 14,
    messages: [
      ["user", "Tem uma coisa estranha acontecendo aqui e eu não sei explicar direito.", "Bruno Tavares", null],
      ["agent", "Vou chamar um analista para isso.", "Nexo Assist", "IA"],
      ["system", "Transferida para Suporte N2 · confiança baixa", null, null],
    ],
  });
  seedConversation(db, now, {
    id: "c-diego",
    employeeId: "u-diego",
    status: "with_agent",
    minutesAgo: 2,
    messages: [
      ["user", "O Wi-Fi da sala de reunião cai toda hora.", "Diego Ramos", null],
      ["agent", "Estou vendo se já existe chamado seu sobre a rede da sala.", "Nexo Assist", "IA"],
    ],
  });
  seedConversation(db, now, {
    id: "c-elisa",
    employeeId: "u-elisa",
    status: "with_agent",
    focus: "INC-20519",
    minutesAgo: 20,
    messages: [
      ["user", "O Excel fecha quando abro arquivo da rede.", "Elisa Prado", null],
      ["agent", "Chamado INC-20519 criado.", "Nexo Assist", "IA"],
    ],
  });
  seedConversation(db, now, {
    id: "c-fabio",
    employeeId: "u-fabio",
    status: "resolved",
    minutesAgo: 40,
    messages: [
      ["agent", "Reinstalei a orientação da VPN para Windows 10. Reinicie e teste.", "Nexo Assist", "IA"],
      ["user", "Isso resolveu, obrigado!", "Fábio Nunes", null],
    ],
  });
  seedConversation(db, now, {
    id: "c-gabriela",
    employeeId: "u-gabriela",
    status: "resolved",
    minutesAgo: 26 * 60,
    messages: [
      ["user", "Qual é a senha do Wi-Fi de visitantes?", "Gabriela Rocha", null],
      ["agent", "A senha do Wi-Fi foi enviada pelo portal, em Redes. A rede é NEXO-VISITANTE.", "Nexo Assist", "IA"],
    ],
  });
}

type TicketSeed = {
  id: string;
  type: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  priority: "critica" | "alta" | "media" | "baixa";
  status: string;
  requesterId: string;
  affected: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  dueAt: Date;
  events: [string, string][];
};

function insertTicket(db: DatabaseSync, ticket: TicketSeed, now: Date): void {
  db.prepare(`
    INSERT INTO tickets (
      id, type, title, description, category, subcategory, priority, status,
      requester_id, affected, created_at, updated_at, resolved_at, due_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id,
    ticket.type,
    ticket.title,
    ticket.description,
    ticket.category,
    ticket.subcategory,
    ticket.priority,
    ticket.status,
    ticket.requesterId,
    ticket.affected,
    ticket.createdAt.toISOString(),
    ticket.updatedAt.toISOString(),
    ticket.resolvedAt?.toISOString() ?? null,
    ticket.dueAt.toISOString(),
  );
  ticket.events.forEach((event, index) => {
    const at = index === ticket.events.length - 1 ? ticket.updatedAt : ticket.createdAt;
    db.prepare("INSERT INTO ticket_events (id, ticket_id, at, text, author) VALUES (?, ?, ?, ?, ?)").run(
      `${ticket.id}-e${index}`,
      ticket.id,
      at.toISOString(),
      event[0],
      event[1],
    );
  });
  void now;
}

type ConvSeed = {
  id: string;
  employeeId: string;
  status: string;
  focus?: string;
  reason?: string;
  confidence?: number;
  queue?: string;
  respondBy?: Date;
  summary?: string;
  minutesAgo: number;
  messages: [role: string, text: string, author: string | null, tag: string | null][];
};

function seedConversation(db: DatabaseSync, now: Date, conv: ConvSeed): void {
  const updated = new Date(now.getTime() - conv.minutesAgo * 60_000);
  db.prepare(`
    INSERT INTO conversations (
      id, employee_id, status, assignee_id, pending_json, transfer_summary, transfer_reason,
      confidence, focus_ticket_id, queue, respond_by, message_count, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conv.id,
    conv.employeeId,
    conv.status,
    conv.summary ?? null,
    conv.reason ?? null,
    conv.confidence ?? null,
    conv.focus ?? null,
    conv.queue ?? null,
    conv.respondBy?.toISOString() ?? null,
    conv.messages.filter((message) => message[0] !== "system").length,
    new Date(updated.getTime() - 10 * 60_000).toISOString(),
    updated.toISOString(),
  );
  conv.messages.forEach((message, index) => {
    const at = new Date(updated.getTime() - (conv.messages.length - index) * 60_000);
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, text, created_at, author_name, author_tag, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(conv.id + "-m" + index, conv.id, message[0], message[1], at.toISOString(), message[2], message[3]);
  });
}
