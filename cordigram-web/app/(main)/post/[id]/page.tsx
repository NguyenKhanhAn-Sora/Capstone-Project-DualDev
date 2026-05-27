import type { Metadata } from "next";
import PostView from "../PostView";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999").replace(/\/$/, "");
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const post = await res.json();

    const title = post.authorDisplayName
      ? `${post.authorDisplayName} on Cordigram`
      : "Post • Cordigram";
    const description = (post.content as string | undefined)?.slice(0, 200) || "View this post on Cordigram";
    const pageUrl = `${APP_URL}/post/${id}`;

    const firstMedia = Array.isArray(post.media) ? post.media[0] : null;
    const ogImage = firstMedia?.type === "image"
      ? firstMedia.url
      : firstMedia?.type === "video"
        ? (firstMedia.url as string).replace(/\.[^.]+$/, ".jpg")
        : post.authorAvatarUrl || undefined;

    return {
      title,
      description,
      openGraph: {
        type: "article",
        url: pageUrl,
        title,
        description,
        siteName: "Cordigram",
        ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
      },
      twitter: {
        card: ogImage ? "summary_large_image" : "summary",
        title,
        description,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
    };
  } catch {
    return { title: "Post • Cordigram" };
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostView postId={id} />;
}
