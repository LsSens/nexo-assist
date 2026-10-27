import { addCalendarDays, fromWall, wallOf, type Wall } from "./clock";
import type { Priority } from "./types";

const OPEN = 8;
const CLOSE = 18;

function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

function snapToBusiness(date: Date): Date {
  let wall = wallOf(date);
  for (let guard = 0; guard < 14; guard += 1) {
    if (isWeekend(wall.dow)) {
      const skip = wall.dow === 6 ? 2 : 1;
      wall = { ...addCalendarDays(wall, skip), h: OPEN, min: 0 };
      continue;
    }
    if (wall.h < OPEN) return fromWall(wall.y, wall.m, wall.d, OPEN, 0);
    if (wall.h > CLOSE || (wall.h === CLOSE && wall.min > 0)) {
      wall = { ...addCalendarDays(wall, 1), h: OPEN, min: 0 };
      continue;
    }
    return fromWall(wall.y, wall.m, wall.d, wall.h, wall.min);
  }
  return date;
}

/** Critical incidents use the 24h on-call clock, not the desk window. */
export function addClockHours(start: Date, hours: number): Date {
  return new Date(start.getTime() + hours * 3_600_000);
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = snapToBusiness(start);
  let left = hours;
  while (left > 1e-9) {
    const wall = wallOf(cursor);
    const end = fromWall(wall.y, wall.m, wall.d, CLOSE, 0);
    const available = (end.getTime() - cursor.getTime()) / 3_600_000;
    if (left <= available + 1e-9) return new Date(cursor.getTime() + left * 3_600_000);
    left -= Math.max(available, 0);
    const next = addCalendarDays(wall, 1);
    cursor = snapToBusiness(fromWall(next.y, next.m, next.d, OPEN, 0));
  }
  return cursor;
}

export function addBusinessDays(start: Date, days: number): Date {
  let wall: Wall = wallOf(start);
  let left = days;
  while (left > 0) {
    wall = addCalendarDays(wall, 1);
    if (!isWeekend(wall.dow)) left -= 1;
  }
  let h = wall.h;
  let min = wall.min;
  if (h < OPEN) {
    h = OPEN;
    min = 0;
  }
  if (h > CLOSE || (h === CLOSE && min > 0)) {
    h = CLOSE;
    min = 0;
  }
  return fromWall(wall.y, wall.m, wall.d, h, min);
}

export function dueDate(from: Date, priority: Priority): Date {
  if (priority === "critica") return addClockHours(from, 1);
  if (priority === "alta") return addBusinessHours(from, 4);
  if (priority === "media") return addBusinessDays(from, 3);
  return addBusinessDays(from, 5);
}

export function slaLabel(priority: Priority): string {
  if (priority === "critica") return "1 hora";
  if (priority === "alta") return "4 horas úteis";
  if (priority === "media") return "3 dias úteis";
  return "5 dias úteis";
}

export function slaSpoken(priority: Priority): string {
  if (priority === "alta") return "4 h úteis";
  return slaLabel(priority);
}

export function isOverdue(dueAt: string, status: string, now: Date): boolean {
  if (status === "resolvido" || status === "encerrado" || status === "aprovado") return false;
  return new Date(dueAt).getTime() < now.getTime();
}
