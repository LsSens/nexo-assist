import { normalize } from "./signals";

export type Article = {
  id: string;
  title: string;
  body: string;
  applies: (text: string, os: string | null) => boolean;
  solves: (text: string, os: string | null) => boolean;
};

export const ARTICLES: Article[] = [
  {
    id: "vpn-809",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10. No Windows 11, abra um chamado.",
    applies: (text) => /vpn/.test(text) && /809/.test(text),
    solves: (text, os) => /vpn/.test(text) && /809/.test(text) && os === "Windows 10" && !/windows 11|win 11/.test(text),
  },
  {
    id: "horario",
    title: "Horário do service desk",
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    applies: (text) => /(horario|que horas|plantao|funciona o service|expediente)/.test(text),
    solves: (text) => /(horario|que horas|plantao|expediente|quando o service)/.test(text),
  },
  {
    id: "wifi",
    title: "Senha do Wi-Fi",
    body: "A rede corporativa usa certificado e não tem senha para copiar. A rede de visitantes é NEXO-VISITANTE; a senha do dia está no portal, em Redes.",
    applies: (text) => /wifi|wi-fi/.test(text),
    solves: (text) => /wifi|wi-fi/.test(text) && !/(nao funciona|nao conecta|ja tentei)/.test(text),
  },
  {
    id: "senha-rede",
    title: "Senha da rede",
    body: "A senha da rede é redefinida no portal de identidade, em Minha conta. Se a conta bloqueou depois de várias tentativas, espere 15 minutos e tente de novo.",
    applies: (text) => /senha/.test(text) && /rede/.test(text) && !/sap/.test(text),
    solves: (text) => /senha/.test(text) && /(rede|windows)/.test(text) && !/sap/.test(text) && !/bloquead/.test(text),
  },
  {
    id: "outlook",
    title: "Outlook não sincroniza",
    body: "Feche o Outlook, confirme a data e a hora do computador e abra de novo. No celular, remova a conta e adicione outra vez.",
    applies: (text) => /outlook/.test(text),
    solves: (text) => /outlook/.test(text) && !/(nao resolveu|ja tentei|continua|nao adiantou)/.test(text),
  },
  {
    id: "notebook-lento",
    title: "Notebook lento depois do Windows",
    body: "Reinicie, rode o diagnóstico de disco no portal e aguarde a indexação terminar. Se continuar depois disso, abra um chamado de hardware.",
    applies: (text) => /notebook/.test(text) && /lent/.test(text),
    solves: (text) => /notebook/.test(text) && /lent/.test(text) && !/(nao resolveu|ja reinic|continua|diagnostico)/.test(text),
  },
  {
    id: "sap-acesso",
    title: "Acesso ao SAP",
    body: "Pedido de acesso novo precisa de chamado, com o módulo e o gestor. Senha bloqueada em conta que já existe é incidente e pode ser reaberta se voltou a ocorrer.",
    applies: (text) => /sap/.test(text),
    solves: () => false,
  },
  {
    id: "monitor",
    title: "Segundo monitor",
    body: "O segundo monitor de home office é uma requisição de hardware, prioridade baixa, salvo quando há um compromisso no mesmo dia.",
    applies: (text) => /monitor/.test(text),
    solves: () => false,
  },
  {
    id: "sharepoint",
    title: "Permissão no SharePoint",
    body: "Acesso a pasta é uma requisição. Informe o link da pasta e se a permissão é de leitura ou edição. Não compartilhe o conteúdo da pasta no chat.",
    applies: (text) => /sharepoint|pasta/.test(text),
    solves: () => false,
  },
  {
    id: "software",
    title: "Instalar software",
    body: "Softwares homologados são instalados pelo portal. O que não está na lista precisa de chamado de requisição, com o nome do programa.",
    applies: (text) => /(instalar|licenca|software)/.test(text),
    solves: (text) => /portal de software/.test(text),
  },
];

export function matchArticle(text: string, os: string | null): { article: Article; solves: boolean } | null {
  for (const article of ARTICLES) {
    if (article.applies(text, os)) return { article, solves: article.solves(text, os) };
  }
  return null;
}

export function searchArticles(query: string): { title: string; body: string }[] {
  const text = normalize(query);
  return ARTICLES.filter((article) => article.applies(text, null)).map((article) => ({
    title: article.title,
    body: article.body,
  }));
}
