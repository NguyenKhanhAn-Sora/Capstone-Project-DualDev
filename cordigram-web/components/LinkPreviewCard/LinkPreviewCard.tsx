"use client";

import React from "react";
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

interface Props {
  previews: ChatLinkPreview[];
}

/**
 * Renders pre-fetched link-preview cards (same data shape as CommentLinkPreview
 * from the social feed). Data is fetched server-side on message send.
 */
export function LinkPreviewCard({ previews }: Props) {
  if (!Array.isArray(previews) || previews.length === 0) return null;

  return (
    <div className={styles.list}>
      {previews.slice(0, 3).map((preview, index) => {
        const href = preview?.canonicalUrl?.trim() || preview?.url?.trim() || "";
        if (!href) return null;

        const title =
          preview?.title?.trim() ||
          preview?.siteName?.trim() ||
          preview?.domain?.trim() ||
          "";
        const subtitle =
          preview?.description?.trim() ||
          preview?.domain?.trim() ||
          "";
        let fallbackDomain = "";
        try {
          fallbackDomain = new URL(href).hostname;
        } catch {
          fallbackDomain = "";
        }

        return (
          <a
            key={`preview-${index}-${href}`}
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
                ) : null}
              </div>
            )}
            <div className={styles.body}>
              {title ? <span className={styles.title}>{title}</span> : null}
              {subtitle ? (
                <span className={styles.desc}>{subtitle}</span>
              ) : null}
              <span className={styles.domain}>
                {preview?.domain || fallbackDomain}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

/** Detect the first HTTP/HTTPS URL in a plain text string (kept for mobile compat) */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/(?!res\.cloudinary\.com)[^\s<>"]+/i);
  return m ? m[0] : null;
}
