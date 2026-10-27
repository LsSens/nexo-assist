import { getCurrentUser } from "@/server/auth";
import { listDesk, type DeskFilter } from "@/server/console";
import { handle } from "@/server/http";
import { HttpError } from "@/server/store";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Entre para continuar.");
    const url = new URL(request.url);
    const filter = (url.searchParams.get("filter") ?? "todas") as DeskFilter;
    const allowed: DeskFilter[] = ["todas", "para-voce", "agent", "minhas"];
    return Response.json(await listDesk(user.id, allowed.includes(filter) ? filter : "todas", url.searchParams.get("q") ?? ""));
  });
}
