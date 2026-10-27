import { clearSessionCookie } from "@/server/auth";
import { handle } from "@/server/http";

export async function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return Response.json({ ok: true });
  });
}
