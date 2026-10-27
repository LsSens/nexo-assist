"use client";

import { useEffect, useState } from "react";
import { NexoMark } from "./logo";

export function LoginScreen() {
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });
    const body = (await response.json()) as { error?: string; redirect?: string };
    setBusy(false);
    if (!response.ok || !body.redirect) {
      setError(body.error ?? "Não foi possível entrar.");
      return;
    }
    window.location.assign(body.redirect);
  }

  return (
    <main className="flex min-h-dvh bg-paper">
      <section className="hidden w-[800px] shrink-0 flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} color="#ffffff" />
          <span className="text-[17px] font-bold">Nexo Assist</span>
        </div>
        <div>
          <p className="text-[13.5px] text-white/55">Service desk de TI da Nexo</p>
          <h1 className="mt-3 max-w-[640px] font-display text-[54px] leading-[1.05] tracking-[-0.03em]">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
          </p>
          <div className="mt-8 max-w-[500px] rounded-2xl bg-white/6 p-4">
            <div className="ml-auto w-fit max-w-[320px] rounded-2xl bg-white px-3 py-2 text-[13.5px] text-ink">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <div className="mt-3">
              <p className="text-[12.5px] font-semibold text-white/80">Nexo Assist</p>
              <p className="text-[12.5px] text-white/45">consultou seus chamados · criou um chamado</p>
              <p className="mt-1 text-[13.5px] leading-relaxed">
                Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
              </p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] text-ink">
                <span className="font-semibold">INC-20517</span>
                <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
              </div>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-6">
          <Stat value="8 s" label="primeira resposta, em média" />
          <Stat value="72%" label="resolvidos sem fila" />
          <Stat value="6" label="analistas online agora" live />
        </dl>
      </section>
      <section className="flex min-w-0 flex-1 flex-col px-8 py-6">
        <div className="flex justify-end gap-3 text-[13.5px]">
          <span className="text-ink-3">Problema para entrar?</span>
          <button type="button" className="font-semibold text-primary-text" onClick={() => setHelp((value) => !value)}>
            Ligue no ramal 4000
          </button>
        </div>
        {help ? <p className="mt-2 text-right text-[13px] text-ink-3">Service desk, de segunda a sexta, das 8h às 18h. Crítico tem plantão.</p> : null}
        <div className="flex flex-1 items-center justify-center">
          <form onSubmit={submit} data-testid="login-form" data-ready={ready ? "1" : "0"} className="w-full max-w-[380px]">
            <h2 className="font-display text-[40px] tracking-[-0.03em]">Entrar</h2>
            <p className="mt-2 text-[15.5px] leading-relaxed text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
            <label className="mt-8 block text-[13.5px] font-medium" htmlFor="email">E-mail corporativo</label>
            <input
              id="email"
              data-testid="login-email"
              className="mt-1.5 h-11 w-full rounded-[10px] border border-rule px-3 text-[14.5px] outline-none focus:border-cta"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="mt-4 flex items-center justify-between">
              <label className="text-[13.5px] font-medium" htmlFor="password">Senha</label>
              <button type="button" className="text-[13.5px] font-medium text-primary-text" onClick={() => setHint("Neste protótipo, qualquer senha entra para um e-mail cadastrado.")}>
                Esqueci minha senha
              </button>
            </div>
            <input
              id="password"
              data-testid="login-password"
              type="password"
              className="mt-1.5 h-11 w-full rounded-[10px] border border-rule px-3 text-[14.5px] outline-none focus:border-cta"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label className="mt-4 flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Manter conectado neste computador
            </label>
            {hint ? <p className="mt-3 text-[13px] text-ink-3">{hint}</p> : null}
            {error ? <p className="mt-3 text-[13.5px] text-danger-text" role="alert">{error}</p> : null}
            <button
              type="submit"
              data-testid="login-submit"
              disabled={busy}
              className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-cta text-[15.5px] font-semibold text-white hover:bg-[#0071d6] disabled:opacity-60"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
            <details className="mt-6 text-[13px] text-ink-3">
              <summary className="cursor-pointer">Contas de demonstração</summary>
              <p className="mt-2 leading-relaxed">
                Ana Souza, funcionária: ana.souza@nexo.com.br. Rafael Lima, analista N2: rafael.lima@nexo.com.br. Qualquer senha.
              </p>
            </details>
          </form>
        </div>
        <footer className="flex justify-between text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <a href="/privacidade">Privacidade e uso de dados</a>
        </footer>
      </section>
    </main>
  );
}

function Stat({ value, label, live = false }: { value: string; label: string; live?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 font-display text-[34px] leading-none">
        {value}
        {live ? <span className="mt-1 size-2 rounded-full bg-success" /> : null}
      </div>
      <p className="mt-2 text-[13.5px] text-white/55">{label}</p>
    </div>
  );
}
