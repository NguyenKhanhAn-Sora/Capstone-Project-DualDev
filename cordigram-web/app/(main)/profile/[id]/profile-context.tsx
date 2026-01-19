"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ProfileDetailResponse } from "@/lib/api";

type ProfileContextValue = {
  profile: ProfileDetailResponse;
  viewerId?: string;
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
