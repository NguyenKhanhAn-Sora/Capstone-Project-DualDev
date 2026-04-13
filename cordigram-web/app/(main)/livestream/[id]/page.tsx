"use client";

import { useParams, useSearchParams } from "next/navigation";
import LivestreamHub from "@/components/livestream/LivestreamHub";

export default function LivestreamStudioPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const streamId = typeof params?.id === "string" ? params.id : "";

  if (!streamId) {
    return <div style={{ padding: 20 }}>Invalid livestream id.</div>;
  }

  const hostMode = searchParams.get("host") === "1";
  return <LivestreamHub streamId={streamId} forceHost={hostMode} />;
}
