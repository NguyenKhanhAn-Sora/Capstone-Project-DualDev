'use client';

import React, { useEffect, useRef } from 'react';
import styles from './call-modal.module.css';
import { CallType, CallStatus } from '@/lib/calls/call-types';

interface CallModalProps {
  isVisible: boolean;
  callStatus: string;
  callType: CallType;
  remoteUserName: string;
  remoteUserAvatar?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onHangUp?: () => void;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  isLocalAudioEnabled?: boolean;
  isLocalVideoEnabled?: boolean;
  onToggleAudio?: (enabled: boolean) => void;
  onToggleVideo?: (enabled: boolean) => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  isVisible,
  callStatus,
  callType,
  remoteUserName,
  remoteUserAvatar,
  onAccept,
  onReject,
  onHangUp,
  localStream,
  remoteStream,
  isLocalAudioEnabled = true,
  isLocalVideoEnabled = true,
  onToggleAudio,
  onToggleVideo,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Set up local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Set up remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (!isVisible) return null;

  const isIncoming = callStatus === 'ringing' && !remoteStream;
  const isOngoing = callStatus === 'accepted' || remoteStream;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            {isIncoming ? 'Incoming Call' : 'In Call'}
          </h3>
          {isOngoing && (
            <div className={styles.callDuration}>
              {remoteUserName}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          {isIncoming ? (
            // Incoming call view
            <div className={styles.incomingCall}>
              <div className={styles.remoteUserInfo}>
                {remoteUserAvatar ? (
                  <img 
                    src={remoteUserAvatar} 
                    alt={remoteUserName}
                    className={styles.avatar}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {remoteUserName.charAt(0).toUpperCase()}
                  </div>
                )}
                <h2 className={styles.userName}>{remoteUserName}</h2>
                <p className={styles.callType}>
                  {callType === CallType.VIDEO ? 'Video Call' : 'Audio Call'}
                </p>
              </div>
            </div>
          ) : (
            // Ongoing call view
            <div className={styles.ongoingCall}>
              {callType === CallType.VIDEO ? (
                <>
                  {/* Remote Video */}
                  <div className={styles.remoteVideoContainer}>
                    {remoteStream ? (
                      <video
                        ref={remoteVideoRef}
                        className={styles.remoteVideo}
                        autoPlay
                        playsInline
                      />
                    ) : (
                      <div className={styles.videoPlaceholder}>
                        {remoteUserAvatar ? (
                          <img src={remoteUserAvatar} alt={remoteUserName} />
                        ) : (
                          <div>{remoteUserName.charAt(0).toUpperCase()}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Local Video - Picture in Picture */}
                  {localStream && (
                    <div className={styles.localVideoContainer}>
                      <video
                        ref={localVideoRef}
                        className={styles.localVideo}
                        autoPlay
                        playsInline
                        muted
                      />
                    </div>
                  )}
                </>
              ) : (
                // Audio only
                <div className={styles.audioOnlyContainer}>
                  {remoteUserAvatar ? (
                    <img 
                      src={remoteUserAvatar} 
                      alt={remoteUserName}
                      className={styles.audioAvatar}
                    />
                  ) : (
                    <div className={styles.audioAvatarPlaceholder}>
                      {remoteUserName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h3 className={styles.audioUserName}>{remoteUserName}</h3>
                  <p className={styles.audioStatus}>Connected</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {isIncoming ? (
            <>
              <button
                className={`${styles.button} ${styles.rejectButton}`}
                onClick={onReject}
                title="Reject call"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
              <button
                className={`${styles.button} ${styles.acceptButton}`}
                onClick={onAccept}
                title="Accept call"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </button>
            </>
          ) : (
            <>
              {callType === CallType.VIDEO && (
                <button
                  className={`${styles.button} ${!isLocalVideoEnabled ? styles.disabled : ''}`}
                  onClick={() => onToggleVideo?.(!isLocalVideoEnabled)}
                  title={isLocalVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </button>
              )}
              <button
                className={`${styles.button} ${!isLocalAudioEnabled ? styles.disabled : ''}`}
                onClick={() => onToggleAudio?.(!isLocalAudioEnabled)}
                title={isLocalAudioEnabled ? 'Mute' : 'Unmute'}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>
              <button
                className={`${styles.button} ${styles.endButton}`}
                onClick={onHangUp}
                title="End call"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
