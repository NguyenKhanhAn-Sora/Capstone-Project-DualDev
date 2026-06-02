"use client";

import React, { useEffect, useState } from "react";
import styles from "./LinkPreviewCard.module.css";

export interface ChatLinkPreview {
  url: string;
  canonicalUrl?: string | null;
  domain?: string | null;
  siteName?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
}

// ─── In-memory cache shared across all card instances ──────────────────────
const cache = new Map<string, ChatLinkPreview | null>();

// ─── Pre-fetched mode ────────────────────────────────────────────────────────
interface PreFetchedProps {
  previews: ChatLinkPreview[];
  /** Fallback: if previews is empty, try fetching this URL on-the-fly */
  fallbackUrl?: string;
  apiBase?: string;
  token?: string;
}

export function LinkPreviewCard({
  previews,
  fallbackUrl,
  apiBase,
  token,
}: PreFetchedProps) {
  const [fetched, setFetched] = useState<ChatLinkPreview | null | undefined>(
    undefined, // undefined = not tried yet
  );

  const shouldFetch =
    (!Array.isArray(previews) || previews.length === 0) &&
    !!fallbackUrl &&
    !!apiBase &&
    !!token;

  useEffect(() => {
    if (!shouldFetch || !fallbackUrl || !apiBase || !token) return;

    if (cache.has(fallbackUrl)) {
      setFetched(cache.get(fallbackUrl) ?? null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/link-preview?url=${encodeURIComponent(fallbackUrl)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error("not ok");
        const data = (await res.json()) as ChatLinkPreview;
        if (!cancelled) {
          const preview: ChatLinkPreview = {
            url: fallbackUrl,
            canonicalUrl: (data as any).canonicalUrl ?? null,
            domain:
              (data as any).domain ??
              (() => {
                try {
                  return new URL(fallbackUrl).hostname;
                } catch {
                  return null;
                }
              })(),
            siteName: data.siteName ?? null,
            title: data.title ?? null,
            description: data.description ?? null,
            image: data.image ?? null,
            favicon: data.favicon ?? null,
          };
          cache.set(fallbackUrl, preview);
          setFetched(preview);
        }
      } catch {
        if (!cancelled) {
          cache.set(fallbackUrl, null);
          setFetched(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [shouldFetch, fallbackUrl, apiBase, token]);

  // Determine which previews to render
  const activePreviews: ChatLinkPreview[] =
    Array.isArray(previews) && previews.length > 0
      ? previews
      : fetched
        ? [fetched]
        : [];

  if (activePreviews.length === 0) return null;

  return (
    <div className={styles.list}>
      {activePreviews.slice(0, 3).map((preview, index) => (
        <PreviewCard key={`${index}-${preview.url}`} preview={preview} />
      ))}
    </div>
  );
}

function PreviewCard({ preview }: { preview: ChatLinkPreview }) {
  const href = preview?.canonicalUrl?.trim() || preview?.url?.trim() || "";
  if (!href) return null;

  const title =
    preview?.title?.trim() ||
    preview?.siteName?.trim() ||
    preview?.domain?.trim() ||
    "";
  const subtitle = preview?.description?.trim() || preview?.domain?.trim() || "";
  let fallbackDomain = "";
  try {
    fallbackDomain = new URL(href).hostname;
  } catch {
    fallbackDomain = "";
  }

  return (
    <a
      className={styles.card}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
    >
      {preview?.image ? (
        <img
          className={styles.image}
          src={preview.image}
          alt={title}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className={styles.imageFallback}>
          {preview?.favicon ? (
            <img
              className={styles.favicon}
              src={preview.favicon}
              alt=""
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "#4B5563" }}
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </div>
      )}
      <div className={styles.body}>
        {title ? <span className={styles.title}>{title}</span> : null}
        {subtitle ? <span className={styles.desc}>{subtitle}</span> : null}
        <span className={styles.domain}>
          {preview?.domain || fallbackDomain}
        </span>
      </div>
    </a>
  );
}

/** Detect the first HTTP/HTTPS URL in a plain text string */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/(?!res\.cloudinary\.com)[^\s<>"]+/i);
  return m ? m[0] : null;
}
