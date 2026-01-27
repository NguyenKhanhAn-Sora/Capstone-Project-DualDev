"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./following.module.css";

export default function FollowingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isReels = pathname?.startsWith("/following/reels");

  return (
    <>
      <header className={styles.header}>
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
      </header>
      {children}
    </>
  );
}
