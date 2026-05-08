"use client";

import { useRequireAuth } from "@/hooks/use-require-auth";
import ReelPage from "../../reels/page";

export default function FollowingReelsPage() {
  const canRender = useRequireAuth();
  if (!canRender) return null;
  return <ReelPage scopeOverride="following" />;
}
