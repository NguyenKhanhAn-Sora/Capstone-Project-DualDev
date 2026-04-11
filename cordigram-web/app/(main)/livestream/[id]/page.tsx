"use client";

import { useParams } from "next/navigation";
import LivestreamStudio from "@/components/livestream/LivestreamStudio";

export default function LivestreamStudioPage() {
  const params = useParams<{ id: string }>();
  const streamId = typeof params?.id === "string" ? params.id : "";

  if (!streamId) {
    return <div style={{ padding: 20 }}>Invalid livestream id.</div>;
  }

  return <LivestreamStudio streamId={streamId} />;
}
