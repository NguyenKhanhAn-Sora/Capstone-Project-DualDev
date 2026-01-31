"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { FeedItem, ProfileDetailResponse } from "@/lib/api";

export type ProfileTabKey = "posts" | "reels" | "repost" | "saved";

export type ProfileTabState = {
  items: FeedItem[];
  loading: boolean;
  loaded: boolean;
  error: string;
};

export type ProfileTabsState = Record<ProfileTabKey, ProfileTabState>;

type ProfileContextValue = {
  profile: ProfileDetailResponse;
  viewerId?: string;
  tabs?: ProfileTabsState;
  prefetchTab?: (key: ProfileTabKey) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  value,
  children,
}: {
  value: ProfileContextValue;
  children: ReactNode;
}) {
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfileContext() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfileContext must be used within ProfileProvider");
  }
  return ctx;
}
