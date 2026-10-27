import type { Intent } from "./types";

export type Facts = {
  intent: Intent;
  confidence: number;
  why: string;
  source: "rules" | "model" | "button";
  ticketId: string | null;
  understood: string;
};
