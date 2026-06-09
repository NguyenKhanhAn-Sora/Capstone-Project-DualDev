"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchStoryFeed, type StoryFeedGroup, type StoryItem } from "@/lib/api";
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

function getPreviewStyle(story: StoryItem | undefined): React.CSSProperties {
  if (!story) return {};
  if (story.type === "text" && story.backgroundStyle) {
    return { background: story.backgroundStyle };
  }
  if (story.type === "media" && story.mediaType === "image" && story.mediaUrl) {
    return { backgroundImage: `url(${story.mediaUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  return {};
}

function hasUnviewedStories(group: StoryFeedGroup): boolean {
  // backend flag takes precedence; fall back to per-story viewed flag
  if (group.hasUnviewed) return true;
  return group.stories.some((s) => !s.viewed);
}

function StoryPreview({ story }: { story: StoryItem | undefined }) {
  if (!story) return null;
  if (story.type === "media" && story.mediaType === "video" && story.mediaUrl) {
    return (
      <video
        className={styles.cardVideoPreview}
        src={`${story.mediaUrl}#t=0.1`}
        preload="metadata"
        muted
        playsInline
      />
    );
  }
  return null;
}

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

  useEffect(() => { void load(); }, [load, refreshKey]);

  const myGroup = viewerId ? groups.find((g) => g.userId === viewerId) : undefined;
  const friendGroups = viewerId ? groups.filter((g) => g.userId !== viewerId) : groups;

  if (!token) return null;

  return (
    <div className={styles.bar} role="list" aria-label="Stories">

      {/* ── Create Story card ── */}
      <div
        className={`${styles.card} ${styles.createCard}`}
        role="listitem"
        onClick={onCreateStory}
        title="Tạo story"
      >
        {/* Blurred bg */}
        {viewerAvatarUrl && (
          <img src={viewerAvatarUrl} alt="" className={styles.createBgImg} />
        )}
        <div className={styles.createOverlay} />

        {/* Avatar */}
        <div className={styles.createAvatarWrap}>
          {viewerAvatarUrl ? (
            <img src={viewerAvatarUrl} alt="avatar" className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {(viewerUsername ?? "U")[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* + button */}
        <div className={styles.addIconBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Label */}
        <div className={styles.createFooter}>
          <span className={styles.createLabel}>Tạo story</span>
        </div>
      </div>

      {/* ── Skeleton ── */}
      {loading && !groups.length &&
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${styles.card} ${styles.skeleton}`} role="listitem" aria-hidden />
        ))}

      {/* ── My story card ── */}
      {myGroup && (
        <div
          className={`${styles.card} ${styles.storyCard}`}
          role="listitem"
          onClick={() => {
            const myIdx = groups.findIndex((g) => g.userId === viewerId);
            onOpenStory(groups, myIdx);
          }}
          title="Story của bạn"
        >
          <div className={styles.cardPreview} style={getPreviewStyle(myGroup.stories[0])} />
          <StoryPreview story={myGroup.stories[0]} />
          <div className={styles.cardGradient} />
          <div className={`${styles.ringWrap} ${hasUnviewedStories(myGroup) ? styles.ringUnviewed : styles.ringViewed}`}>
            <div className={styles.avatarInner}>
              {viewerAvatarUrl ? (
                <img src={viewerAvatarUrl} alt="avatar" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {(viewerUsername ?? "U")[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className={styles.cardFooter}>
            <span className={styles.cardLabel}>Story của bạn</span>
          </div>
        </div>
      )}

      {/* ── Friend story cards ── */}
      {friendGroups.map((group) => {
        const globalIdx = groups.findIndex((g) => g.userId === group.userId);
        return (
          <div
            key={group.userId}
            className={`${styles.card} ${styles.storyCard}`}
            role="listitem"
            onClick={() => onOpenStory(groups, globalIdx)}
            title={`@${group.username}`}
          >
            <div className={styles.cardPreview} style={getPreviewStyle(group.stories[0])} />
            <StoryPreview story={group.stories[0]} />
            <div className={styles.cardGradient} />
            <div className={`${styles.ringWrap} ${hasUnviewedStories(group) ? styles.ringUnviewed : styles.ringViewed}`}>
              <div className={styles.avatarInner}>
                {group.avatarUrl ? (
                  <img src={group.avatarUrl} alt={group.username} className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {(group.username || "U")[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.cardLabel}>@{group.username}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
