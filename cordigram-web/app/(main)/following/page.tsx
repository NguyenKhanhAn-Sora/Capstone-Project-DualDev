"use client";

import HomePage from "../page";

export default function FollowingPostsPage() {
  return <HomePage scopeOverride="following" kindsOverride={["post"]} />;
}
