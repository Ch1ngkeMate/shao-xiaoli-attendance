import AppShell from "@/components/AppShell";
import { readSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import AnnouncementDetailClient from "./view";

type PageProps = {
  params: Promise<{ id: string } | { id: string[] }>;
};

function normalizeRouteId(p: { id: string } | { id: string[] } | undefined) {
  const raw = p && "id" in p ? p.id : undefined;
  if (raw === undefined) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || !s.trim()) return null;
  return s.trim();
}

export default async function AnnouncementDetailPage({ params }: PageProps) {
  const p = await params;
  const id = normalizeRouteId(p);
  if (!id) redirect("/messages");

  const session = await readSessionCookie();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/announcements/${id}`)}`);
  }

  return (
    <AppShell title="通知详情">
      <AnnouncementDetailClient id={id} />
    </AppShell>
  );
}

