import { redirect } from "next/navigation";
import { ProfileScreen } from "@/components/profile-screen";
import { getCurrentUser, toPublicUser } from "@/server/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role === "analyst") redirect("/console");
  // A página é um Server Component: a data é o instante do pedido, não um render do cliente.
  // eslint-disable-next-line react-hooks/purity
  const passwordAgeDays = Math.max(0, Math.floor((Date.now() - new Date(user.passwordChangedAt).getTime()) / 86_400_000));
  return <ProfileScreen user={toPublicUser(user)} passwordAgeDays={passwordAgeDays} />;
}
