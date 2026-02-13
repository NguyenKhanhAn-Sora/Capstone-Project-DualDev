"use client";

import React, { useState } from "react";
import styles from "./MessageReactions.module.css";

interface Reaction {
  emoji: string;
  userIds: string[];
  count: number;
}

interface MessageReactionsProps {
  reactions: Reaction[];
  currentUserId: string;
  onReactionClick: (emoji: string) => void;
  onAddClick: () => void;
}

export default function MessageReactions({
  reactions,
  currentUserId,
  onReactionClick,
  onAddClick,
}: MessageReactionsProps) {
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);

  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        userIds: [],
        count: 0,
      };
    }
    acc[reaction.emoji].userIds.push(...reaction.userIds);
    acc[reaction.emoji].count += reaction.count;
    return acc;
  }, {} as Record<string, Reaction>);

  const reactionArray = Object.values(groupedReactions);

  if (reactionArray.length === 0) {
    return null;
  }

  return (
    <div className={styles.reactionsContainer}>
      {reactionArray.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            className={`${styles.reactionButton} ${
              hasReacted ? styles.reacted : ""
            }`}
            onClick={() => onReactionClick(reaction.emoji)}
            onMouseEnter={() => setHoveredReaction(reaction.emoji)}
            onMouseLeave={() => setHoveredReaction(null)}
            title={`${reaction.count} người đã bày tỏ cảm xúc`}
          >
            <span className={styles.emoji}>{reaction.emoji}</span>
            {reaction.count > 1 && (
              <span className={styles.count}>{reaction.count}</span>
            )}
          </button>
        );
      })}
      <button className={styles.addReactionButton} onClick={onAddClick}>
        +
      </button>
    </div>
  );
}
