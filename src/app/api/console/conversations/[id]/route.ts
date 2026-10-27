import { getCurrentUser } from "@/server/auth";
import {
  analystMessage,
  assumeConversation,
  closeConversation,
  getDeskConversation,
  returnConversation,
} from "@/server/console";
import { handle } from "@/server/http";
import { HttpError } from "@/server/store";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Entre para continuar.");
    const { id } = await context.params;
    return Response.json(await getDeskConversation(user.id, id));
  });
}

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Entre para continuar.");
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string; text?: string };
    if (body.action === "assume") return Response.json(await assumeConversation(user.id, id));
    if (body.action === "return") return Response.json(await returnConversation(user.id, id));
    if (body.action === "close") return Response.json(await closeConversation(user.id, id));
    if (body.action === "message") return Response.json(await analystMessage(user.id, id, body.text ?? ""));
    throw new HttpError(400, "Ação desconhecida.");
  });
}
