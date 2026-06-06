"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchStoryFeed, type StoryFeedGroup } from "@/lib/api";
import styles from "./story-bar.module.css";

type Props = {
  token: string | null;
  viewerId?: string;
  viewerAvatarUrl?: string;
  viewerUsername?: string;
  onOpenStory: (groups: StoryFeedGroup[], groupIndex: number) => void;
  onCreateStory: () => void;
  refreshKey?: number;
};

export default function StoryBar({
  token,
  viewerId,
  viewerAvatarUrl,
  viewerUsername,
  onOpenStory,
  onCreateStory,
  refreshKey,
}: Props) {
  const [groups, setGroups] = useState<StoryFeedGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchStoryFeed({ token });
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const myGroup = viewerId ? groups.find((g) => g.userId === viewerId) : undefined;
  const friendGroups = viewerId ? groups.filter((g) => g.userId !== viewerId) : groups;

  const handleMyStoryClick = () => {
    if (myGroup) {
      const myIdx = groups.findIndex((g) => g.userId === viewerId);
      onOpenStory(groups, myIdx);
    } else {
      onCreateStory();
    }
  };

  if (!token) return null;

  return (
    <div className={styles.bar} role="list" aria-label="Stories">
      {/* Card tạo story / story của mình */}
      <div
        className={styles.card}
        role="listitem"
        onClick={handleMyStoryClick}
        title={myGroup ? "Xem story của bạn" : "Tạo story"}
      >
        <div className={`${styles.ring} ${myGroup ? (myGroup.hasUnviewed ? "" : styles.viewed) : styles.mine}`}>
          <div className={styles.avatarInner}>
            {viewerAvatarUrl ? (
              <img src={viewerAvatarUrl} alt="avatar" className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(viewerUsername ?? "U")[0].toUpperCase()}
              </div>
            )}
            {!myGroup && (
              <div className={styles.addBtn}>+</div>
            )}
          </div>
        </div>
        <span className={`${styles.label} ${styles.mine}`}>
          {myGroup ? "Story của bạn" : "Tạo story"}
        </span>
      </div>

      {/* Skeleton khi loading */}
      {loading && !groups.length &&
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.card} role="listitem" aria-hidden>
            <div className={styles.skeleton} />
            <div className={styles.skeletonLabel} />
          </div>
        ))}

      {/* Stories của bạn bè */}
      {friendGroups.map((group, idx) => {
        const globalIdx = groups.findIndex((g) => g.userId === group.userId);
        return (
          <div
            key={group.userId}
            className={styles.card}
            role="listitem"
            onClick={() => onOpenStory(groups, globalIdx)}
            title={group.displayName || group.username}
          >
            <div className={`${styles.ring} ${group.hasUnviewed ? "" : styles.viewed}`}>
              <div className={styles.avatarInner}>
                {group.avatarUrl ? (
                  <img src={group.avatarUrl} alt={group.username} className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {(group.displayName || group.username || "U")[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <span className={styles.label}>
              {group.displayName || group.username || "User"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
