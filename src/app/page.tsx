import { readSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await readSessionCookie();
  if (!session) {
    redirect("/login");
  }
  redirect("/tasks");
}
