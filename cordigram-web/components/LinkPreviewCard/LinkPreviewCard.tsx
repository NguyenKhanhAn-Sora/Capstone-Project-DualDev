"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./LinkPreviewCard.module.css";
import { useLanguage } from "@/component/language-provider";

interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

interface Props {
  url: string;
  /** API base URL — typically process.env.NEXT_PUBLIC_API_URL */
  apiBase?: string;
  token?: string;
}

const CACHE = new Map<string, LinkPreviewData | null>();

async function fetchPreview(
  url: string,
  apiBase: string,
  token: string,
): Promise<LinkPreviewData | null> {
  if (CACHE.has(url)) return CACHE.get(url)!;
  try {
    const res = await fetch(
      `${apiBase}/link-preview?url=${encodeURIComponent(url)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) {
      CACHE.set(url, null);
      return null;
    }
    const data = (await res.json()) as LinkPreviewData;
    CACHE.set(url, data);
    return data;
  } catch {
    CACHE.set(url, null);
    return null;
  }
}

export function LinkPreviewCard({ url, apiBase = "", token = "" }: Props) {
  const { t } = useLanguage();
  const [data, setData] = useState<LinkPreviewData | null | undefined>(
    CACHE.has(url) ? CACHE.get(url) : undefined,
  );
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (CACHE.has(url)) {
      setData(CACHE.get(url));
      return;
    }
    if (!apiBase || !token) return;
    fetchPreview(url, apiBase, token).then((d) => {
      if (mounted.current) setData(d);
    });
    return () => {
      mounted.current = false;
    };
  }, [url, apiBase, token]);

  if (data === undefined) return null; // loading — render nothing to avoid layout shift
  if (!data) return null; // failed — render nothing
  if (!data.title && !data.description && !data.image) return null;

  const noDesc = (t as unknown as (k: string) => string)(
    "chat.linkPreview.noDescription",
  );

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.card}
      onClick={(e) => e.stopPropagation()}
    >
      {data.image && (
        <img
          src={data.image}
          alt={data.title ?? "preview"}
          className={styles.image}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className={styles.content}>
        <div className={styles.siteRow}>
          {data.favicon && (
            <img
              src={data.favicon}
              alt=""
              className={styles.favicon}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span className={styles.siteName}>
            {data.siteName ?? new URL(url).hostname.replace(/^www\./, "")}
          </span>
        </div>
        {data.title && <p className={styles.title}>{data.title}</p>}
        {data.description && (
          <p className={styles.description}>
            {data.description || noDesc}
          </p>
        )}
      </div>
    </a>
  );
}

/** Detect the first HTTP/HTTPS URL in a plain text string */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(
    /https?:\/\/(?!res\.cloudinary\.com)[^\s<>"]+/i,
  );
  return m ? m[0] : null;
}
