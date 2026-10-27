import { getUserByEmail, HttpError } from "@/server/store";
import { openSession, setSessionCookie, toPublicUser } from "@/server/auth";
import { handle } from "@/server/http";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  return handle(async () => {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const now = Date.now();
    const current = attempts.get(ip);
    if (current && current.resetAt > now && current.count >= 30) {
      throw new HttpError(429, "Muitas tentativas. Espere um minuto.");
    }
    if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    else current.count += 1;

    const body = (await request.json()) as { email?: string; password?: string; remember?: boolean };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!email || !password) throw new HttpError(400, "Informe o e-mail corporativo e a senha.");
    const user = getUserByEmail(email);
    if (!user) throw new HttpError(401, "Não encontramos esse e-mail corporativo.");
    const session = openSession(user.id, Boolean(body.remember));
    await setSessionCookie(session.id, session.maxAge);
    return Response.json({
      user: toPublicUser(user),
      redirect: user.role === "analyst" ? "/console" : "/atendimento",
    });
  });
}
