"use client";

import React from "react";
import { normalizeServerBanner, type ServerBannerFields } from "@/lib/server-banner";
import styles from "./ServerBannerStrip.module.css";

type Props = {
  server: ServerBannerFields | null | undefined;
  className?: string;
  /** Chiều cao vùng biểu ngữ (px), mặc định theo context */
  height?: number;
};

export default function ServerBannerStrip({ server, className, height = 88 }: Props) {
  const { bannerColor, bannerImageUrl } = normalizeServerBanner(server);
  return (
    <div
      className={`${styles.strip} ${className ?? ""}`}
      style={{ height, background: bannerColor }}
      role="img"
      aria-label="Biểu ngữ máy chủ"
    >
      {bannerImageUrl ? (
        <div
          className={styles.image}
          style={{ backgroundImage: `url(${bannerImageUrl})` }}
        />
      ) : null}
    </div>
  );
}
