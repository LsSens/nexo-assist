import { getCurrentUser } from "@/server/auth";
import { startEmployeeSession } from "@/server/chat";
import { handle } from "@/server/http";
import { HttpError } from "@/server/store";

export async function POST() {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Entre para continuar.");
    if (user.role !== "employee") throw new HttpError(403, "Acesso negado.");
    return Response.json(await startEmployeeSession(user.id));
  });
}
