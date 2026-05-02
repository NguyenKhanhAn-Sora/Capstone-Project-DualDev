"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  VideoTrack,
  isTrackReference,
} from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-react";
import { Track, RoomEvent, RemoteAudioTrack } from "livekit-client";
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
  return (
    <div className={styles.callRoomContainer}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={!isAudioOnly}
        audio={true}
        onDisconnected={() => {
          onDisconnect();
        }}
        className={styles.liveKitRoom}
      >
        <EndCallWhenRemoteDisconnects onRemoteLeft={onDisconnect} />
        <UnifiedCallView
          participantName={participantName}
          onDisconnect={onDisconnect}
          startedAsAudioOnly={isAudioOnly}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// =============================================================================
// UnifiedCallView
// -----------------------------------------------------------------------------
// Single call UI for both audio and video modes. Deliberately mirrors the
// mobile `NativeCallScreen` layout: full-bleed remote video (or avatar grid
// when no camera is publishing) + bottom controls overlaid on the stage:
//
//   1. Mic toggle
//   2. Speaker toggle (mutes all remote audio via volume)
//   3. Screen share
//   4. Camera toggle
//   5. End call
// =============================================================================
function UnifiedCallView({
  participantName: _participantName,
  onDisconnect,
  startedAsAudioOnly,
}: {
  /** Local user's LiveKit display name from the token URL — not used for UI labels (peer names come from the room). */
  participantName: string;
  onDisconnect: () => void;
  startedAsAudioOnly: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  const [isMicOn, setIsMicOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(!startedAsAudioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Subscribe to ALL tracks (camera + mic, with placeholders) so both the
  // video grid and the audio-only avatar grid can render off a single source.
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.Microphone, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const cameraTracks = allTracks.filter(
    (t) => t.source === Track.Source.Camera,
  );
  const anyVideoPublished = cameraTracks.some((t) => Boolean(t.publication));

  // Apply speaker mute across all remote audio tracks. We use setVolume(0)
  // instead of unsubscribing because (a) it preserves LiveKit's stats /
  // speaking indicators, and (b) it's reversible without re-negotiation.
  const applySpeakerState = useCallback(
    (on: boolean) => {
      if (!room) return;
      room.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          const track = pub.track;
          if (track instanceof RemoteAudioTrack) {
            try {
              track.setVolume(on ? 1 : 0);
            } catch {
              // Older livekit-client versions may throw if the track is not
              // attached yet — ignore; the effect below re-applies on new subs.
            }
          }
        });
      });
    },
    [room],
  );

  useEffect(() => {
    if (!room) return;
    const onSubscribed = () => applySpeakerState(isSpeakerOn);
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    applySpeakerState(isSpeakerOn);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
    };
  }, [room, isSpeakerOn, applySpeakerState]);

  const toggleMic = useCallback(async () => {
    if (!localParticipant) return;
    const next = !localParticipant.isMicrophoneEnabled;
    await localParticipant.setMicrophoneEnabled(next);
    setIsMicOn(next);
  }, [localParticipant]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    applySpeakerState(next);
  }, [isSpeakerOn, applySpeakerState]);

  const toggleCamera = useCallback(async () => {
    if (!localParticipant) return;
    const next = !localParticipant.isCameraEnabled;
    try {
      await localParticipant.setCameraEnabled(next);
      setIsCameraOn(next);
    } catch (err) {
      console.error("[CALL] Failed to toggle camera:", err);
    }
  }, [localParticipant]);

  const toggleScreenShare = useCallback(async () => {
    if (!localParticipant) return;
    const isCurrentlySharing = localParticipant.isScreenShareEnabled;

    if (isCurrentlySharing) {
      try {
        await localParticipant.setScreenShareEnabled(false);
        setIsScreenSharing(false);
      } catch (err) {
        console.error("[CALL] Failed to stop screen share:", err);
      }
      return;
    }

    try {
      // Do not force displaySurface: "browser" — it skews the picker and does
      // not stop full-desktop recursion. Prefer excluding the current tab when
      // the user shares a browser surface (Chrome et al.).
      await localParticipant.setScreenShareEnabled(true, {
        audio: true,
        preferCurrentTab: false,
        video: {
          cursor: "always",
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          monitorTypeSurfaces: "include",
        },
      } as any);
      setIsScreenSharing(true);
    } catch (err) {
      // User cancelling the picker is expected; keep UI state stable.
      console.error("[CALL] Failed to start screen share:", err);
      setIsScreenSharing(false);
    }
  }, [localParticipant]);

  useEffect(() => {
    if (!localParticipant) return;
    setIsScreenSharing(localParticipant.isScreenShareEnabled);
  }, [localParticipant, localParticipant?.isScreenShareEnabled]);

  // Keep control bar in sync with LiveKit (e.g. connect options, policy) so
  // mic/camera icons are not inverted vs actual capture at call start.
  useEffect(() => {
    if (!localParticipant) return;
    setIsMicOn(localParticipant.isMicrophoneEnabled);
    setIsCameraOn(localParticipant.isCameraEnabled);
  }, [
    localParticipant,
    localParticipant?.isMicrophoneEnabled,
    localParticipant?.isCameraEnabled,
  ]);

  // Decide what the main viewport renders. Prefer the remote participant's
  // video when available; otherwise fall back to the avatar grid — same
  // behaviour as the native call screen.
  //
  // We go through `isTrackReference` so TypeScript narrows from
  // `TrackReferenceOrPlaceholder` down to `TrackReference`. Without this
  // narrowing, `<VideoTrack trackRef={...} />` fails type-check because
  // placeholders have `publication: undefined`. That build break is what
  // caused the Vercel deploy to fail.
  const realCameraTracks = cameraTracks.filter(
    (t): t is TrackReference => isTrackReference(t),
  ).filter((t) => !t.publication.isMuted);
  const remoteCameraTrack = realCameraTracks.find(
    (t) => !t.participant.isLocal,
  );
  const localCameraTrack = realCameraTracks.find(
    (t) => t.participant.isLocal,
  );

  const realScreenTracks = screenShareTracks.filter(
    (t): t is TrackReference => isTrackReference(t),
  ).filter((t) => !t.publication.isMuted);
  const remoteScreenTrack = realScreenTracks.find(
    (t) => !t.participant.isLocal,
  );
  const localScreenTrack = realScreenTracks.find(
    (t) => t.participant.isLocal,
  );

  const anyScreenSharePublished = realScreenTracks.length > 0;
  const showVideoLayout = anyVideoPublished || anyScreenSharePublished;

  // `participantName` from the call URL is the *local* user's LiveKit display name,
  // not the peer. Labels for remote camera-off / avatars must come from LiveKit.
  const remoteTrackParticipant = cameraTracks.find((t) => !t.participant.isLocal)
    ?.participant;
  const remoteDisplayName =
    remoteTrackParticipant?.name?.trim() ||
    remoteTrackParticipant?.identity ||
    "";

  /** Main stage rules for 1:1:
   *  - Viewer side (B): remote screen first.
   *  - Sharer side (A): when sharing local screen and remote has camera, keep
   *    remote camera on main and local share as PiP.
   *  - Remote camera when available; if remote has no video but local does,
   *    full-bleed local + remote avatar/cam-off in PiP (receiver still sees self large).
   *  - Else avatar (remote's name, not the local URL param).
   */
  const mainScreenOrCamera:
    | { kind: "screen"; ref: TrackReference }
    | { kind: "camera"; ref: TrackReference }
    | { kind: "avatar" } = remoteScreenTrack
    ? { kind: "screen", ref: remoteScreenTrack }
    : localScreenTrack && remoteCameraTrack
      ? { kind: "camera", ref: remoteCameraTrack }
    : remoteCameraTrack
      ? { kind: "camera", ref: remoteCameraTrack }
      : localCameraTrack && !localScreenTrack
        ? { kind: "camera", ref: localCameraTrack }
        : { kind: "avatar" };

  const mainIsRemoteScreen =
    mainScreenOrCamera.kind === "screen" &&
    !mainScreenOrCamera.ref.participant.isLocal;
  const mainIsLocalCamera =
    mainScreenOrCamera.kind === "camera" &&
    mainScreenOrCamera.ref.participant.isLocal;
  // PiP rules:
  // - On B while A is sharing + camera: PiP must be A camera (remoteCameraTrack).
  // - On A while sharing: PiP should show "you are sharing" placeholder.
  // - When main is *remote* camera, PiP is local preview when available.
  // - When main is *local* camera (remote cam off), PiP shows remote cam-off card.
  const showLocalScreenPip = Boolean(localScreenTrack);
  const showRemoteAvatarPip =
    showLocalScreenPip && !remoteCameraTrack && mainScreenOrCamera.kind === "avatar";
  const showRemoteCameraOffPip =
    mainIsLocalCamera && Boolean(remoteTrackParticipant);
  const pipTrackRef: TrackReference | null =
    mainIsRemoteScreen && remoteCameraTrack
      ? remoteCameraTrack
      : !showLocalScreenPip &&
          mainScreenOrCamera.kind === "camera" &&
          !mainScreenOrCamera.ref.participant.isLocal &&
          localCameraTrack &&
          isCameraOn
        ? localCameraTrack
        : null;

  const remoteAvatarInitial =
    (remoteDisplayName.charAt(0) || "?").toUpperCase();
  const mainAvatarLabel = remoteDisplayName || "Participant";

  return (
    <div className={styles.unifiedCallContainer}>
      <div className={styles.unifiedStage}>
        {showVideoLayout ? (
          <div className={styles.unifiedVideoStage}>
            {mainScreenOrCamera.kind !== "avatar" ? (
              <VideoTrack
                trackRef={mainScreenOrCamera.ref}
                className={
                  mainScreenOrCamera.kind === "screen"
                    ? styles.unifiedMainScreenShare
                    : mainIsLocalCamera
                      ? styles.unifiedLocalMainVideo
                      : styles.unifiedRemoteVideo
                }
              />
            ) : (
              <div className={styles.unifiedAvatarMain}>
                <div className={styles.unifiedAvatar}>
                  {remoteAvatarInitial}
                </div>
                <div className={styles.unifiedAvatarLabel}>{mainAvatarLabel}</div>
              </div>
            )}
            {pipTrackRef ? (
              <div className={styles.unifiedPip}>
                <VideoTrack
                  trackRef={pipTrackRef}
                  className={styles.unifiedPipVideo}
                />
              </div>
            ) : showLocalScreenPip && localScreenTrack ? (
              <div className={`${styles.unifiedPip} ${styles.localScreenSharePip}`}>
                <LocalScreenSharePreview />
              </div>
            ) : showRemoteCameraOffPip ? (
              <div
                className={`${styles.unifiedPip} ${styles.unifiedPipRemoteCameraOff}`}
                title={remoteDisplayName || undefined}
              >
                <div className={styles.unifiedPipRemoteCameraOffTop}>
                  <div className={styles.unifiedPipAvatarLetter}>
                    {remoteAvatarInitial}
                  </div>
                </div>
                <div className={styles.unifiedPipRemoteCameraOffBottom}>
                  <CameraOffIcon />
                  {remoteDisplayName ? (
                    <span className={styles.unifiedPipRemoteCameraOffName}>
                      {remoteDisplayName}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : showRemoteAvatarPip ? (
              <div className={`${styles.unifiedPip} ${styles.unifiedPipAvatarOnly}`}>
                <div className={styles.unifiedPipAvatarLetter}>
                  {remoteAvatarInitial}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <AvatarGrid tracks={allTracks} />
        )}
      </div>

      <div className={styles.unifiedControlsBar}>
        <ControlButton
          label={isMicOn ? "Tắt mic" : "Bật mic"}
          active={isMicOn}
          onClick={toggleMic}
        >
          {isMicOn ? <MicIcon /> : <MicOffIcon />}
        </ControlButton>
        <ControlButton
          label={isSpeakerOn ? "Tắt âm" : "Bật âm"}
          active={isSpeakerOn}
          onClick={toggleSpeaker}
        >
          {isSpeakerOn ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
        </ControlButton>
        <ControlButton
          label={isScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
          active={isScreenSharing}
          onClick={toggleScreenShare}
        >
          <ScreenShareIcon />
        </ControlButton>
        <ControlButton
          label={isCameraOn ? "Tắt camera" : "Bật camera"}
          active={isCameraOn}
          onClick={toggleCamera}
        >
          {isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
        </ControlButton>
        <ControlButton
          label="Kết thúc"
          active
          danger
          onClick={onDisconnect}
        >
          <EndCallIcon />
        </ControlButton>
      </div>
    </div>
  );
}

function AvatarGrid({
  tracks,
}: {
  tracks: ReturnType<typeof useTracks>;
}) {
  // Deduplicate by participant so "mic + camera placeholder" doesn't render
  // the same avatar twice.
  const byParticipant = new Map<string, (typeof tracks)[number]>();
  for (const t of tracks) {
    byParticipant.set(t.participant.sid, t);
  }
  const participants = Array.from(byParticipant.values());

  return (
    <div className={styles.unifiedAvatarGrid}>
      {participants.map((trackRef) => (
        <div
          key={trackRef.participant.sid}
          className={styles.unifiedAvatarTile}
        >
          <div
            className={`${styles.unifiedAvatar} ${
              trackRef.participant.isSpeaking ? styles.speaking : ""
            }`}
          >
            {trackRef.participant.name?.charAt(0).toUpperCase() ||
              trackRef.participant.identity?.charAt(0).toUpperCase() ||
              "?"}
          </div>
          <p className={styles.unifiedAvatarLabel}>
            {trackRef.participant.name ||
              trackRef.participant.identity ||
              "Guest"}
          </p>
        </div>
      ))}
    </div>
  );
}

function ControlButton({
  label,
  active,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const classes = [
    styles.unifiedCtrlBtn,
    !active ? styles.unifiedCtrlBtnOff : "",
    danger ? styles.unifiedCtrlBtnDanger : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Icons — kept inline so the whole redesigned pill is self-contained and we
// don't pull in a new icon dep just for four buttons.
// =============================================================================
function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function SpeakerOnIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
function SpeakerOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
function CameraOnIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
function CameraOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function ScreenShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/** PiP while publishing screen share: do not attach the local screen track
 *  (it feeds back into the capture and creates the "hall of mirrors" for the
 *  remote viewer when sharing a full desktop). */
function LocalScreenSharePreview() {
  return (
    <div className={styles.localScreenSharePreviewInner}>
      <span className={styles.localScreenShareIconWrap} aria-hidden>
        <ScreenShareIcon />
      </span>
      <span className={styles.localScreenShareLabel}>Đang chia sẻ màn hình</span>
    </div>
  );
}

function EndCallIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}
