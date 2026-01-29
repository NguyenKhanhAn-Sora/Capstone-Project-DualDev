'use client';

import React, { useState, useEffect } from 'react';
import styles from './incoming-call-notification.module.css';
import { CallType } from '@/lib/calls/call-types';

interface IncomingCallNotificationProps {
  isVisible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallNotification: React.FC<IncomingCallNotificationProps> = ({
  isVisible,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onReject,
}) => {
  const [ringing, setRinging] = useState(true);

  useEffect(() => {
    if (!isVisible) {
      setRinging(false);
      return;
    }

    setRinging(true);
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj==');
    audio.loop = true;
    audio.play().catch(e => console.log('Audio play failed:', e));

    return () => {
      audio.pause();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className={styles.notification}>
      <div className={`${styles.container} ${ringing ? styles.ringing : ''}`}>
        {/* Caller Info */}
        <div className={styles.callerInfo}>
          {callerAvatar ? (
            <img 
              src={callerAvatar} 
              alt={callerName}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
          <h3 className={styles.callerName}>{callerName}</h3>
          <p className={styles.callType}>
            {callType === CallType.VIDEO ? '📹 Video call' : '📱 Audio call'}
          </p>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={`${styles.button} ${styles.rejectButton}`}
            onClick={onReject}
            title="Reject call"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
          <button
            className={`${styles.button} ${styles.acceptButton}`}
            onClick={onAccept}
            title="Accept call"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
