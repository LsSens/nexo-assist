import { getCurrentUser } from "@/server/auth";
import { handle } from "@/server/http";
import { getEmployeeChat, sendEmployeeMessage } from "@/server/chat";
import { HttpError } from "@/server/store";
import type { DraftOverride } from "@/domain/types";

export async function GET() {
  return handle(async () => {
    const user = await requireEmployee();
    return Response.json(await getEmployeeChat(user.id));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireEmployee();
    const body = (await request.json()) as {
      text?: string;
      optionId?: string;
      draft?: DraftOverride;
    };
    if (body.draft) assertDraft(body.draft);
    return Response.json(
      await sendEmployeeMessage(user.id, {
        text: body.text ?? "",
        optionId: body.optionId,
        draft: body.draft,
      }),
    );
  });
}

async function requireEmployee() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Entre para continuar.");
  if (user.role !== "employee") throw new HttpError(403, "O console do analista fica em outra entrada.");
  return user;
}

const CATEGORIES = new Set(["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"]);
const PRIORITIES = new Set(["critica", "alta", "media", "baixa"]);

function assertDraft(draft: DraftOverride): void {
  if (draft.category && !CATEGORIES.has(draft.category)) throw new HttpError(400, "Categoria inválida.");
  if (draft.priority && !PRIORITIES.has(draft.priority)) throw new HttpError(400, "Prioridade inválida.");
  if (draft.title && draft.title.length > 140) throw new HttpError(400, "Título longo demais.");
  if (draft.description && draft.description.length > 2000) throw new HttpError(400, "Descrição longa demais.");
}
