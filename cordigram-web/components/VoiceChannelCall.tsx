"use client";

import React, { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import styles from "./VoiceChannelCall.module.css";

const MAX_PARTICIPANTS = 15;
const LIVEKIT_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
};

export interface VoiceChannelCallProps {
  token: string;
  serverUrl: string;
  participantName: string;
  onDisconnect: () => void;
  micMuted?: boolean;
  soundMuted?: boolean;
}

export default function VoiceChannelCall({
  token,
  serverUrl,
  participantName,
  onDisconnect,
  micMuted,
  soundMuted,
}: VoiceChannelCallProps) {
  return (
    <div className={styles.embedContainer}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={true}
        audio={true}
        options={LIVEKIT_ROOM_OPTIONS}
        onDisconnected={onDisconnect}
        className={styles.liveKitRoom}
      >
        <VoiceChannelGrid onDisconnect={onDisconnect} micMuted={micMuted} />
        {!soundMuted ? <RoomAudioRenderer /> : null}
      </LiveKitRoom>
    </div>
  );
}

function VoiceChannelGrid({
  onDisconnect,
  micMuted,
}: {
  onDisconnect: () => void;
  micMuted?: boolean;
}) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const hasScreenShare = screenShareTracks.length > 0;
  const count = Math.min(cameraTracks.length, MAX_PARTICIPANTS);

  return (
    <div className={styles.wrapper}>
      <div className={styles.videoArea}>
        {hasScreenShare ? (
          <div className={styles.screenShareLayout}>
            <div className={styles.screenShareMain}>
              {screenShareTracks[0].publication && (
                <VideoTrack
                  trackRef={screenShareTracks[0]}
                  className={styles.videoElement}
                />
              )}
            </div>
            <div className={styles.screenShareSidebar}>
              {cameraTracks.slice(0, MAX_PARTICIPANTS).map((track) => (
                <div key={track.participant.sid} className={styles.sidebarTile}>
                  {track.publication ? (
                    <VideoTrack trackRef={track} className={styles.videoElement} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {track.participant.name?.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className={styles.participantName}>
                    {track.participant.name || "Khách"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={styles.videoGrid}
            data-participant-count={count || 1}
          >
            {cameraTracks.slice(0, MAX_PARTICIPANTS).map((track) => {
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
                      {track.participant.name || "Khách"}
                    </span>
                    {isMicEnabled ? (
                      <span className={styles.micOn} title="Đang bật mic">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        </svg>
                      </span>
                    ) : (
                      <span className={styles.micOff} title="Đã tắt tiếng">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" />
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
      <VoiceChannelControls onDisconnect={onDisconnect} micMuted={micMuted} />
    </div>
  );
}

function VoiceChannelControls({
  onDisconnect,
  micMuted,
}: {
  onDisconnect: () => void;
  micMuted?: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const isVideoOff = localParticipant ? !localParticipant.isCameraEnabled : false;
  const isScreenSharing = localParticipant ? localParticipant.isScreenShareEnabled : false;

  useEffect(() => {
    if (!localParticipant) return;
    if (typeof micMuted !== "boolean") return;
    const shouldEnableMic = !micMuted;
    if (localParticipant.isMicrophoneEnabled !== shouldEnableMic) {
      localParticipant.setMicrophoneEnabled(shouldEnableMic).catch(() => {});
    }
  }, [localParticipant, micMuted]);

  const toggleVideo = async () => {
    if (localParticipant) {
      await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
    }
  };

  const toggleScreenShare = async () => {
    if (localParticipant) {
      try {
        await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled);
      } catch {
        // Keep UI stable when browser blocks or user cancels share picker.
      }
    }
  };

  return (
    <div className={styles.controls}>
      {/* Mic do thanh footer Messages điều khiển (đồng bộ với micMuted). */}
      <button
        type="button"
        onClick={toggleVideo}
        className={`${styles.controlBtn} ${isVideoOff ? styles.controlBtnOff : ""}`}
        title={isVideoOff ? "Bật camera" : "Tắt camera"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={toggleScreenShare}
        className={`${styles.controlBtn} ${isScreenSharing ? styles.controlBtnActive : ""}`}
        title={isScreenSharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        className={styles.leaveBtn}
        title="Rời kênh"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
          <line x1="22" y1="2" x2="16" y2="8" />
          <line x1="16" y1="2" x2="22" y2="8" />
        </svg>
      </button>
    </div>
  );
}
