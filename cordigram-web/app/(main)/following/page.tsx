"use client";

import { useRequireAuth } from "@/hooks/use-require-auth";
import HomePage from "../page";

export default function FollowingPostsPage() {
  const canRender = useRequireAuth();
  if (!canRender) return null;
  return <HomePage scopeOverride="following" kindsOverride={["post"]} />;
}
