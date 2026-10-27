import { cookies } from "next/headers";
import { initials } from "../domain/labels";
import type { User } from "../domain/types";
import { createSession, deleteSession, getUserBySession } from "./store";

const COOKIE = "nexo_session";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (!sessionId) return null;
  return getUserBySession(sessionId);
}

export async function setSessionCookie(sessionId: string, maxAge: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (sessionId) deleteSession(sessionId);
  jar.delete(COOKIE);
}

export function openSession(userId: string, remember: boolean): { id: string; maxAge: number } {
  return createSession(userId, remember);
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    level: user.level,
    os: user.os,
    initials: initials(user.name),
    avatarBg: user.avatarBg,
    avatarFg: user.avatarFg,
    passwordChangedAt: user.passwordChangedAt,
  };
}
