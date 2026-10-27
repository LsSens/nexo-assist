"use client";

import { useState } from "react";
import { EmployeeShell, TopBar, type SessionUser } from "./employee-shell";

export function ProfileScreen({ user, passwordAgeDays }: { user: SessionUser; passwordAgeDays: number }) {
  const [note, setNote] = useState<string | null>(null);

  return (
    <EmployeeShell user={user}>
      <TopBar here="Meu perfil" />
      <div className="mx-auto w-full max-w-[600px] px-6 py-10">
        <h1 className="text-[24px] font-bold">Meu perfil</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
        <section className="mt-8 rounded-2xl border border-rule">
          <Row label="Nome" value={user.name} />
          <Row label="E-mail corporativo" value={user.email} hint="Gerenciado pela TI" />
          <Row label="Área" value={user.department} />
          <Row label="Equipamento" value={user.os ?? "Não informado"} />
        </section>
        <section className="mt-4 rounded-2xl border border-rule p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14.5px] font-semibold">Senha</p>
              <p className="text-[13.5px] text-ink-3">Alterada há {passwordAgeDays} dias</p>
            </div>
            <button type="button" className="rounded-lg border border-rule px-3 py-2 text-[13.5px] font-medium text-ink-2" onClick={() => setNote(`Neste protótipo a senha não fica gravada. Qualquer senha entra para ${user.email}.`)}>
              Redefinir senha
            </button>
          </div>
          <p className="mt-3 text-[13px] text-ink-3">{note ?? `Enviaremos um link de redefinição para ${user.email}.`}</p>
        </section>
      </div>
    </EmployeeShell>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-rule px-4 py-3 last:border-0">
      <p className="text-[13.5px] text-ink-3">{label}</p>
      <p>
        <span className="text-[14.5px] font-medium">{value}</span>
        {hint ? <span className="mt-0.5 block text-[12.5px] text-ink-3">{hint}</span> : null}
      </p>
    </div>
  );
}
