# Nexo Assist

Service desk de TI da Nexo, para cerca de 2.000 pessoas. O funcionário descreve o problema em uma conversa. O assistente consulta os chamados dele, a central de ajuda e as regras do anexo A, mostra o que entendeu e só grava depois da confirmação. O analista assume a conversa quando a fila pede uma pessoa.

## Como rodar

Node.js 22 ou mais recente.

```bash
npm install
cp .env.example .env
npm run dev
```

Abra http://localhost:3000. Sem chave de modelo o assistente decide só pelas regras. Isso é o modo usado nos testes e na demonstração.

Contas de demonstração (qualquer senha não vazia):

| E-mail | Papel |
| --- | --- |
| ana.souza@nexo.com.br | Funcionária, Financeiro, Windows 11 |
| carla.mendes@nexo.com.br | Funcionária, conversa já na fila |
| rafael.lima@nexo.com.br | Analista N2 |

O login também lista as outras contas de demonstração.

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
```

O banco local fica em `data/nexo.sqlite` e não entra no git. Para zerar a base com o servidor no ar, `ALLOW_RESET=1` e `POST /api/dev/reset`. Sem essa variável a rota responde 404.

`TICKET_FLAKY=0.05` faz a consulta ao legado falhar de vez em quando, com três tentativas. Use `0` se quiser uma demo estável.

## Arquitetura

Uma aplicação Next.js (App Router). Quatro partes, com a política no meio e o modelo só na borda:

- **Telas.** Login, chat, perfil e console do analista, no recorte do protótipo.
- **Política (`src/domain/plan.ts`).** Função pura. Prioridade, SLA, duplicidade, confirmação, privacidade, escopo e transferência. A resposta operacional sai de modelo de texto, não do LLM.
- **Intérprete.** Botão não chama modelo. Texto livre, com chave e `AGENT_MODE=auto` ou `mastra`, passa pelo Mastra só para classificar a intenção. Sem chave, ou com `AGENT_MODE=rules`, a classificação é por regras.
- **Chamados (`src/server/tickets.ts`).** Serviço separado do agente: listar, obter, criar, atualizar, reabrir e marcar espera. A consulta filtra pelo solicitante. O legado simulado falha de vez em quando só na leitura.
- **Persistência.** SQLite do Node (`node:sqlite`), arquivo em disco, WAL. Conversas, mensagens, chamados e quem segura a conversa sobrevivem ao reinício.

O Mastra é importado só quando vai ser usado. Os testes de unidade não precisam de chave nem do pacote em tempo de execução da política.

## Como o agente decide

Cada turno do funcionário, com o assistente no controle:

1. A mensagem entra. Se um analista segura a conversa, ela é guardada e o assistente não responde.
2. Os chamados daquela pessoa são lidos. Se o legado não volta depois de três tentativas, nada é gravado e a pessoa é avisada.
3. A intenção vem do botão, das regras ou do Mastra. Intenções fortes (confirmar, cancelar, transferir, consultar, fora de escopo) não são derrubadas pelo modelo. Confiança abaixo de 0,55 vira pedido de analista, sem chamado novo.
4. A política recalcula tipo, categoria, urgência e prioridade a partir do texto e do perfil. O modelo não escolhe a prioridade.
5. Artigo que resolve o caso (VPN 809 no Windows 10) responde e não abre chamado. Windows 11 pergunta quem é afetado.
6. Chamado aberto parecido vira atualização. Resolvido há até 7 dias vira reabertura. O rascunho aparece na conversa. Criar, atualizar ou reabrir só acontece no confirmar.
7. Transferência quando a pessoa pede, a prioridade é crítica, o prazo venceu e ela aceita, ou a confiança é baixa. A conversa fica `waiting_analyst`, com resumo, e o assistente para.

Prioridade, no fuso de São Paulo (UTC−3, sem horário de verão), de segunda a sexta, 8h–18h:

| Prioridade | Quando | Primeira resposta |
| --- | --- | --- |
| Crítica | parou para um time ou a empresa | 1 hora corrida, inclusive plantão |
| Alta | uma pessoa não trabalha, ou há compromisso no dia | 4 horas úteis |
| Média | atrapalha, mas tem contorno | 3 dias úteis |
| Baixa | pedido sem urgência | 5 dias úteis |

RH, financeiro e facilities saem do escopo. Acesso à pasta Financeiro no SharePoint continua sendo TI.

Cada resposta do assistente mostra os chips do que foi feito e um “Por que esta resposta”: o que foi entendido, a ação, a confiança, o motivo, quem interpretou e quais ferramentas rodaram.

## Como a qualidade da decisão foi garantida

A política é pura e coberta por teste: SLA atravessando a noite e o fim de semana, prioridade do anexo A, VPN no Windows 11 pedindo afetados e classificando alta com reunião no dia, artigo no Windows 10 sem chamado, lista e prazo vencido, duplicidade, reabertura em 7 dias, fora de escopo, crítica com transferência e baixa confiança.

O serviço testa o que a política não alcança: um funcionário não lê chamado de outro, o chamado só existe depois do confirmar, a transferência pausa o assistente, o legado é tentado de novo e a sessão trava em 30 mensagens. O teste de ponta a ponta percorre login, rascunho, confirmação, prazo vencido, assunção do analista e a privacidade da Carla.

O modelo, quando existe, devolve um objeto com esquema. Se a saída não serve, a intenção cai para “não ficou claro”, com confiança 0,3. Ele não inventa número de chamado na resposta: o texto operacional é montado depois, com o id que o serviço devolveu.

## Modelo

`AGENT_MODE=auto` (padrão) usa Mastra só se houver chave. A ordem é `MASTRA_MODEL`, senão OpenAI `openai/gpt-6.1-sol`, senão Google `google/gemini-3.8-flash`, senão Anthropic `anthropic/claude-haiku-5-5`.

Um turno de texto livre faz uma chamada estruturada, com no máximo 4 passos de ferramenta e 20 segundos. Botão não gasta modelo. Sem chave, o custo é zero e a decisão continua a mesma nas regras que o anexo exige. A escolha privilegia um modelo rápido e barato porque o trabalho pesado (prioridade, SLA, duplicidade, confirmação) não é dele.

## Trade-offs

- Sem chave, a prosa não é livre. Os textos são modelos. Isso impede id inventado e chamado sem confirmação, e deixa a demo reproduzível.
- O teto de 30 mensagens conta funcionário e assistente enquanto o agent conduz. O atendimento humano não entra nessa conta.
- A presença “online” de algumas pessoas é semente de demonstração, ou uma sessão real.
- O legado falha só na leitura. Falhar na gravação criaria chamado duplicado no retry.
- Não há deploy. A aplicação sobe com `npm run build` e `npm start`. Chaves ficam no ambiente, nunca no código. Em produção eu colocaria o processo atrás de HTTPS, com `ALLOW_RESET` desligado, `TICKET_FLAKY=0` e o arquivo SQLite (ou um Postgres) num volume persistente.

## Com mais tempo

Login corporativo de verdade, no lugar da senha qualquer. Feriados no calendário de SLA. Streaming da resposta. Limite de taxa além do login. Mover o SQLite para um banco com mais de um processo. Métricas da confiança e do tempo até a primeira resposta do analista.
