import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import UsersManagement from "./users-management";

export const instant = false;

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/dashboard");
  return <UsersManagement />;
}
