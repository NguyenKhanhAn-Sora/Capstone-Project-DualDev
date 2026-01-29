'use client';

import React from 'react';
import { useCallSound } from '@/hooks/use-call-sound';
import styles from './OutgoingCallPopup.module.css';

interface OutgoingCallPopupProps {
  receiverName: string;
  receiverAvatar?: string;
  callType: 'audio' | 'video';
  onCancel: () => void;
  status: 'calling' | 'rejected' | 'no-answer';
}

export default function OutgoingCallPopup({
  receiverName,
  receiverAvatar,
  callType,
  onCancel,
  status,
}: OutgoingCallPopupProps) {
  const callTypeText = callType === 'video' ? 'Video' : 'Voice';
  
  // ✅ Play outgoing call dialing tone (only when status is 'calling')
  useCallSound('outgoing', status === 'calling');
  
  const getStatusText = () => {
    switch (status) {
      case 'calling':
        return 'Đang gọi...';
      case 'rejected':
        return 'Người nhận không liên hệ được';
      case 'no-answer':
        return 'Không có phản hồi';
      default:
        return 'Đang gọi...';
    }
  };

  const getStatusColor = () => {
    return status === 'calling' ? '#43b581' : '#ed4245';
  };
  
  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        {/* Avatar */}
        <div className={styles.avatarWrapper}>
          {receiverAvatar ? (
            <img src={receiverAvatar} alt={receiverName} className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {receiverName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Pulsing animation only when calling */}
          {status === 'calling' && (
            <>
              <div className={styles.pulseRing}></div>
              <div className={styles.pulseRing} style={{ animationDelay: '1s' }}></div>
            </>
          )}
        </div>

        {/* Receiver info */}
        <h2 className={styles.receiverName}>{receiverName}</h2>
        <p className={styles.callType}>{callTypeText} call</p>
        <p 
          className={styles.statusText}
          style={{ color: getStatusColor() }}
        >
          {getStatusText()}
        </p>

        {/* Cancel button */}
        <div className={styles.actions}>
          <button
            onClick={onCancel}
            className={`${styles.button} ${styles.cancelButton}`}
            aria-label={status === 'calling' ? 'Hủy cuộc gọi' : 'Đóng'}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 1L1 23M1 1l22 22" />
            </svg>
            <span>{status === 'calling' ? 'Hủy cuộc gọi' : 'Đóng'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
