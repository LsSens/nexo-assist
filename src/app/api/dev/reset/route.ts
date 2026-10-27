import { resetDatabase } from "@/server/db";
import { handle } from "@/server/http";
import { HttpError } from "@/server/store";
import { resetLegacyOutage } from "@/server/tickets";

export async function POST() {
  return handle(() => {
    if (process.env.ALLOW_RESET !== "1") throw new HttpError(404, "Não encontrado.");
    resetDatabase();
    resetLegacyOutage();
    return Response.json({ ok: true });
  });
}
