import type { Metadata } from "next";
import type React from "react";
import ProfileLayoutClient from "./_ProfileLayoutClient";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999").replace(/\/$/, "");
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/profiles/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const profile = await res.json();

    const name: string = profile.displayName || profile.username || "User";
    const title = `${name} (@${profile.username || id}) • Cordigram`;
    const description = profile.bio
      ? (profile.bio as string).slice(0, 200)
      : `View ${name}'s profile on Cordigram`;
    const pageUrl = `${APP_URL}/profile/${id}`;
    const image: string | undefined = profile.avatarUrl || undefined;

    return {
      title,
      description,
      openGraph: {
        type: "profile",
        url: pageUrl,
        title,
        description,
        siteName: "Cordigram",
        ...(image ? { images: [{ url: image, width: 400, height: 400, alt: name }] } : {}),
      },
      twitter: {
        card: image ? "summary" : "summary",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return { title: "Profile • Cordigram" };
  }
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfileLayoutClient>{children}</ProfileLayoutClient>;
}
