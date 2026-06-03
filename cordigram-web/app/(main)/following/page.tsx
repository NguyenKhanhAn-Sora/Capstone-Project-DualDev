"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { fetchReelsFeed, type FeedItem } from "@/lib/api";
import HomePage from "../page";

export default function FollowingPage() {
  const canRender = useRequireAuth();
  const [reels, setReels] = useState<FeedItem[]>([]);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    fetchReelsFeed({ token, scope: "following", limit: 30 })
      .then(setReels)
      .catch(() => {});
  }, []);

  if (!canRender) return null;

  return (
    <HomePage
      scopeOverride="following"
      kindsOverride={["post"]}
      showReels
      extraReelItems={reels}
    />
  );
}
