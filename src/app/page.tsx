import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getCurrentUser } from "@/server/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user?.role === "analyst") redirect("/console");
  if (user) redirect("/atendimento");
  return <LoginScreen />;
}
