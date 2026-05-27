import type { Metadata } from "next";
import ReelPage from "../page";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999").replace(/\/$/, "");
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/reels/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const reel = await res.json();

    const title = reel.authorDisplayName
      ? `${reel.authorDisplayName}'s Reel on Cordigram`
      : "Reel • Cordigram";
    const description = (reel.content as string | undefined)?.slice(0, 200) || "Watch this reel on Cordigram";
    const pageUrl = `${APP_URL}/reels/${id}`;

    const firstMedia = Array.isArray(reel.media) ? reel.media[0] : null;
    const thumbnailUrl = firstMedia?.type === "video"
      ? buildCloudinaryThumbnail(firstMedia.url as string)
      : firstMedia?.url || reel.authorAvatarUrl || undefined;

    return {
      title,
      description,
      openGraph: {
        type: "video.other",
        url: pageUrl,
        title,
        description,
        siteName: "Cordigram",
        ...(thumbnailUrl ? { images: [{ url: thumbnailUrl, width: 1280, height: 720, alt: title }] } : {}),
        ...(firstMedia?.type === "video" ? { videos: [{ url: firstMedia.url as string, type: "video/mp4" }] } : {}),
      },
      twitter: {
        card: thumbnailUrl ? "summary_large_image" : "summary",
        title,
        description,
        ...(thumbnailUrl ? { images: [thumbnailUrl] } : {}),
      },
    };
  } catch {
    return { title: "Reel • Cordigram" };
  }
}

function buildCloudinaryThumbnail(videoUrl: string): string | undefined {
  try {
    const url = new URL(videoUrl);
    if (!url.hostname.includes("cloudinary.com")) return undefined;
    // Replace /video/upload/ with /video/upload/so_auto,w_1280,h_720,c_fill/
    return videoUrl.replace(
      /\/video\/upload\//,
      "/video/upload/so_auto,w_1280,h_720,c_fill/",
    ).replace(/\.[^.]+$/, ".jpg");
  } catch {
    return undefined;
  }
}

export default function ReelDetailPage() {
  return <ReelPage />;
}
