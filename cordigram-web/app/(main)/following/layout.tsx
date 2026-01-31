"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect } from "react";
import styles from "./following.module.css";

export default function FollowingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const isReels = segment === "reels";

  useEffect(() => {
    if (isReels) return;

    const scrollRoot =
      document.querySelector<HTMLElement>("[data-scroll-root]");
    if (!scrollRoot) return;

    scrollRoot.scrollTo({ top: 0, behavior: "auto" });
  }, [isReels, segment]);

  return (
    <div
      className={`${styles.layout} ${isReels ? styles.layoutReels : styles.layoutPosts}`}
    >
      <nav className={styles.nav} aria-label="Following">
        <div className={styles.tabs} role="tablist" aria-label="Following tabs">
          <Link
            href="/following"
            role="tab"
            aria-selected={!isReels}
            className={`${styles.tabBtn} ${!isReels ? styles.tabBtnActive : ""}`}
          >
            Posts
          </Link>
          <Link
            href="/following/reels"
            role="tab"
            aria-selected={isReels}
            className={`${styles.tabBtn} ${isReels ? styles.tabBtnActive : ""}`}
          >
            Reels
          </Link>
        </div>
      </nav>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
