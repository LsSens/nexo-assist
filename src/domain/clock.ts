/** São Paulo is UTC−3 year-round (no daylight saving). Wall-clock math uses that fixed offset. */
const SAO_OFFSET_MS = 3 * 60 * 60 * 1000;

export type Wall = {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  dow: number;
};

export function wallOf(date: Date): Wall {
  const shifted = new Date(date.getTime() - SAO_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    min: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  };
}

export function fromWall(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h, min, 0) + SAO_OFFSET_MS);
}

export function addCalendarDays(wall: Wall, days: number): Wall {
  return wallOf(fromWall(wall.y, wall.m, wall.d + days, wall.h, wall.min));
}

export function formatClock(date: Date): string {
  const w = wallOf(date);
  return `${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatDayMonth(date: Date): string {
  const w = wallOf(date);
  return `${w.d} ${MONTHS[w.m]}`;
}

export function formatDayMonthTime(date: Date): string {
  const w = wallOf(date);
  return `${w.d} ${MONTHS[w.m]}, ${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`;
}

export function sameSaoDay(a: Date, b: Date): boolean {
  const wa = wallOf(a);
  const wb = wallOf(b);
  return wa.y === wb.y && wa.m === wb.m && wa.d === wb.d;
}

export function formatRelative(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "agora";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) {
    if (hours < 1) return `há ${Math.max(1, Math.floor(diff / 60_000))} min`;
    return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  }
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return "há 1 dia";
  if (days < 7) return `há ${days} dias`;
  if (days < 14) return "há 1 semana";
  return `há ${Math.floor(days / 7)} semanas`;
}

export function formatListTime(date: Date, now: Date): string {
  if (sameSaoDay(date, now)) return formatClock(date);
  const yesterday = addCalendarDays(wallOf(now), -1);
  const w = wallOf(date);
  if (w.y === yesterday.y && w.m === yesterday.m && w.d === yesterday.d) return "ontem";
  return formatDayMonth(date);
}
