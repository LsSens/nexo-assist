import { redirect } from "next/navigation";
import { ChatScreen } from "@/components/chat-screen";
import { getCurrentUser, toPublicUser } from "@/server/auth";

export default async function AtendimentoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role === "analyst") redirect("/console");
  return <ChatScreen user={toPublicUser(user)} />;
}
