"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  VideoTrack,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import styles from "./CallRoom.module.css";

/** In a 1:1 call, when the remote participant leaves, end this session too */
function EndCallWhenRemoteDisconnects({
  onRemoteLeft,
}: {
  onRemoteLeft: () => void;
}) {
  const room = useRoomContext();
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!room) return;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onRemoteLeft();
    };

    const onParticipantDisconnected = () => {
      finish();
    };

    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room, onRemoteLeft]);

  return null;
}

interface CallRoomProps {
  token: string;
  serverUrl: string;
  onDisconnect: () => void;
  participantName: string;
  isAudioOnly?: boolean;
}

export default function CallRoom({
  token,
  serverUrl,
  onDisconnect,
  participantName,
  isAudioOnly = false,
}: CallRoomProps) {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <div className={styles.callRoomContainer}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={!isAudioOnly}
        audio={true}
        onConnected={() => {
          setIsConnected(true);
        }}
        onDisconnected={() => {
          setIsConnected(false);
          onDisconnect();
        }}
        className={styles.liveKitRoom}
      >
        <EndCallWhenRemoteDisconnects onRemoteLeft={onDisconnect} />
        {isAudioOnly ? (
          <AudioOnlyView
            participantName={participantName}
            onDisconnect={onDisconnect}
          />
        ) : (
          <CustomVideoConference onDisconnect={onDisconnect} />
        )}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// Custom Video Conference Component
function CustomVideoConference({ onDisconnect }: { onDisconnect: () => void }) {
  // Get camera tracks
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  // Get screen share tracks
  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const hasScreenShare = screenShareTracks.length > 0;

  return (
    <div className={styles.videoConferenceContainer}>
      {/* Main Video Area */}
      <div className={styles.videoArea}>
        {hasScreenShare ? (
          // Screen share is active - show it prominently
          <div className={styles.screenShareLayout}>
            <div className={styles.screenShareMain}>
              <div className={styles.screenShareTile}>
                {screenShareTracks[0].publication && (
                  <VideoTrack
                    trackRef={screenShareTracks[0]}
                    className={styles.videoElement}
                  />
                )}
              </div>
            </div>
            {/* Camera feeds in sidebar */}
            <div className={styles.screenShareSidebar}>
              {cameraTracks.map((track) => (
                <div key={track.participant.sid} className={styles.sidebarTile}>
                  {track.publication && (
                    <VideoTrack
                      trackRef={track}
                      className={styles.videoElement}
                    />
                  )}
                  <div className={styles.participantInfo}>
                    <span className={styles.participantName}>
                      {track.participant.name || "Guest"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // No screen share - show camera grid
          <div
            className={styles.videoGrid}
            data-participant-count={cameraTracks.length}
          >
            {cameraTracks.map((track) => {
              const isSpeaking = track.participant.isSpeaking;
              const isMicEnabled = track.participant.isMicrophoneEnabled;

              return (
                <div
                  key={track.participant.sid}
                  className={`${styles.videoTileWrapper} ${isSpeaking ? styles.speaking : ""}`}
                >
                  <div className={styles.videoTile}>
                    {track.publication ? (
                      <VideoTrack
                        trackRef={track}
                        className={styles.videoElement}
                      />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {track.participant.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className={styles.participantInfo}>
                    <span className={styles.participantName}>
                      {track.participant.name || "Guest"}
                    </span>
                    {isMicEnabled ? (
                      <span className={styles.micOn}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path
                            d="M19 10v2a7 7 0 0 1-14 0v-2"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                          />
                        </svg>
                      </span>
                    ) : (
                      <span className={styles.micOff}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <line
                            x1="1"
                            y1="1"
                            x2="23"
                            y2="23"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Controls */}
      <CustomControls onDisconnect={onDisconnect} />
    </div>
  );
}

// Custom Controls Component for Video Call
function CustomControls({ onDisconnect }: { onDisconnect: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const toggleMicrophone = async () => {
    if (localParticipant) {
      const enabled = localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(!enabled);
      setIsMuted(enabled);
    }
  };

  const toggleVideo = async () => {
    if (localParticipant) {
      const enabled = localParticipant.isCameraEnabled;
      await localParticipant.setCameraEnabled(!enabled);
      setIsVideoOff(enabled);
    }
  };

  const toggleScreenShare = async () => {
    if (localParticipant) {
      const enabled = localParticipant.isScreenShareEnabled;
      await localParticipant.setScreenShareEnabled(!enabled);
      setIsScreenSharing(!enabled);
    }
  };

  return (
    <div className={styles.customControls}>
      <div className={styles.controlButtons}>
        {/* Microphone */}
        <button
          onClick={toggleMicrophone}
          className={`${styles.controlButton} ${isMuted ? styles.controlButtonOff : ""}`}
          title={isMuted ? "Bật microphone" : "Tắt microphone"}
        >
          {isMuted ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Video */}
        <button
          onClick={toggleVideo}
          className={`${styles.controlButton} ${isVideoOff ? styles.controlButtonOff : ""}`}
          title={isVideoOff ? "Bật camera" : "Tắt camera"}
        >
          {isVideoOff ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleScreenShare}
          className={`${styles.controlButton} ${isScreenSharing ? styles.controlButtonActive : ""}`}
          title={isScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
            {isScreenSharing && <path d="M7 10l5 5 5-5" strokeWidth="2.5" />}
          </svg>
        </button>

        {/* Leave Button */}
        <button
          onClick={onDisconnect}
          className={`${styles.controlButton} ${styles.endCallButton}`}
          title="Rời khỏi cuộc gọi"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Audio Only View
function AudioOnlyView({
  participantName,
  onDisconnect,
}: {
  participantName: string;
  onDisconnect: () => void;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.Microphone, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);

  const toggleMicrophone = async () => {
    if (localParticipant) {
      const enabled = localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(!enabled);
      setIsMuted(enabled);
    }
  };

  return (
    <div className={styles.audioOnlyContainer}>
      <div className={styles.audioOnlyContent}>
        <div className={styles.participantGrid}>
          {tracks.map((trackRef) => {
            const isMicEnabled = trackRef.participant.isMicrophoneEnabled;
            return (
              <div
                key={trackRef.participant.sid}
                className={styles.audioParticipant}
              >
                <div
                  className={`${styles.avatarPlaceholder} ${trackRef.participant.isSpeaking ? styles.speaking : ""}`}
                >
                  {trackRef.participant.name?.charAt(0).toUpperCase() || "?"}
                </div>
                <p className={styles.participantName}>
                  {trackRef.participant.name || "Unknown"}
                </p>
                <div className={styles.audioIndicator}>
                  {isMicEnabled ? (
                    <span className={styles.unmuted}>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                    </span>
                  ) : (
                    <span className={styles.muted}>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <line
                          x1="1"
                          y1="1"
                          x2="23"
                          y2="23"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      </svg>
                      Muted
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className={styles.audioControls}>
        {/* Microphone Toggle */}
        <button
          onClick={toggleMicrophone}
          className={`${styles.microphoneButton} ${isMuted ? styles.microphoneMuted : ""}`}
        >
          {isMuted ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          )}
          <span>Microphone</span>
        </button>

        {/* Leave Button */}
        <div className={styles.callActionButtons}>
          <button onClick={onDisconnect} className={styles.endCallButtonAudio}>
            <span>Rời khỏi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
