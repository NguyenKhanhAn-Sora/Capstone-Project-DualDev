"use client";

import { useRequireAuth } from "@/hooks/use-require-auth";

export default function Home() {
  const canRender = useRequireAuth();
  if (!canRender) return null;
  return <>Hello world!</>;
}
