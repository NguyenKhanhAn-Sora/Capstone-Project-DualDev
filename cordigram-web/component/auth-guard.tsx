"use client";

import type { ReactNode } from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const canRender = useRequireAuth();

  if (!canRender) return null;

  return <>{children}</>;
}
