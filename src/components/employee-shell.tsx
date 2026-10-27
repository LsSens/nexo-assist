"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NexoMark } from "./logo";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
  department: string;
  level: "N1" | "N2" | null;
  os: string | null;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  passwordChangedAt: string;
};

export function EmployeeShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const atendimento = pathname.startsWith("/atendimento");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex h-dvh bg-paper">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-rule px-3 py-4">
        <div className="flex items-center gap-2 px-2">
          <NexoMark size={20} color="#1B2431" />
          <span className="text-[16px] font-bold">Nexo Assist</span>
        </div>
        <nav className="mt-7 space-y-1">
          <NavLink href="/atendimento" active={atendimento} icon="chat" label="Atendimento" />
          <NavLink href="/perfil" active={!atendimento} icon="user" label="Meu perfil" />
        </nav>
        <div className="mt-auto">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <span className="grid size-[34px] place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
              {user.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">{user.name}</span>
              <span className="block truncate text-[11.5px] text-ink-3">{user.email}</span>
            </span>
          </div>
          <button type="button" onClick={logout} className="mt-1 flex h-[34px] w-full items-center gap-2 rounded-lg px-2 text-[13.5px] font-medium text-ink-2 hover:bg-desk" data-testid="logout">
            <LogoutIcon />
            Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function NavLink({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: "chat" | "user" }) {
  return (
    <Link
      href={href}
      className={`flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] ${active ? "bg-primary-soft font-semibold text-primary-text" : "font-medium text-ink-2"}`}
    >
      {icon === "chat" ? <ChatIcon active={active} /> : <UserIcon active={active} />}
      {label}
    </Link>
  );
}

export function TopBar({ here, status }: { here: string; status?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-rule px-6">
      <p className="flex items-center gap-2 text-[13.5px]">
        <span className="text-ink-3">Service desk de TI</span>
        <span className="text-ink-3">/</span>
        <span className="font-semibold">{here}</span>
      </p>
      {status}
    </header>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "#0069C7" : "#5B6472"} strokeWidth="1.8">
      <path d="M5 6.5h14v9H8l-3 2.5z" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "#0069C7" : "#5B6472"} strokeWidth="1.8">
      <circle cx="12" cy="8" r="3" />
      <path d="M6 19c1.2-2.4 3.2-3.5 6-3.5S16.8 16.6 18 19" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6472" strokeWidth="1.8">
      <path d="M10 7V5H5v14h5v-2" />
      <path d="M10 12h9M15 8l4 4-4 4" />
    </svg>
  );
}
