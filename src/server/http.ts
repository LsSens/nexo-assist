import { HttpError } from "./store";
import { LegacyUnavailableError } from "./tickets";

export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof LegacyUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error(error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
