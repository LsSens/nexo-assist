import { redirect } from "next/navigation";
import { ConsoleScreen } from "@/components/console-screen";
import { getCurrentUser } from "@/server/auth";

export default async function ConsolePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "analyst") redirect("/atendimento");
  return <ConsoleScreen />;
}
