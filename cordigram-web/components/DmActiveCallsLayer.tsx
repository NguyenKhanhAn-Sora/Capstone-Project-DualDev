"use client";

import dynamic from "next/dynamic";
import styles from "./DmActiveCallsLayer.module.css";

const CallRoom = dynamic(() => import("@/components/CallRoom"), { ssr: false });

export type ActiveDmCallSession = {
  peerId: string;
  peerName: string;
  peerAvatarUrl?: string;
  roomName: string;
  callToken: string;
  serverUrl: string;
  isAudioOnly: boolean;
  minimized: boolean;
};

type DmActiveCallsLayerProps = {
  activeCallsByPeer: Record<string, ActiveDmCallSession>;
  focusedPeerId: string | null;
  participantName: string;
  onEndCall: (peerId: string) => void;
  onFocusCall: (peerId: string) => void;
  onMinimizeCall: (peerId: string) => void;
};

export default function DmActiveCallsLayer({
  activeCallsByPeer,
  focusedPeerId,
  participantName,
  onEndCall,
  onFocusCall,
  onMinimizeCall,
}: DmActiveCallsLayerProps) {
  const entries = Object.values(activeCallsByPeer);
  if (entries.length === 0) return null;

  const focused =
    (focusedPeerId && activeCallsByPeer[focusedPeerId]) || entries[0];

  return (
    <>
      {entries.map((session) => {
        const isFocused =
          session.peerId === focused.peerId && !session.minimized;
        return (
          <div
            key={session.peerId}
            className={
              isFocused ? styles.fullscreenLayer : styles.hiddenLayer
            }
            aria-hidden={!isFocused}
          >
            <CallRoom
              token={session.callToken}
              serverUrl={session.serverUrl}
              participantName={participantName}
              isAudioOnly={session.isAudioOnly}
              onDisconnect={() => onEndCall(session.peerId)}
            />
            {isFocused ? (
              <button
                type="button"
                className={styles.minimizeBtn}
                onClick={() => onMinimizeCall(session.peerId)}
                title="Thu nhỏ cuộc gọi"
              >
                −
              </button>
            ) : null}
          </div>
        );
      })}

      {entries
        .filter((s) => s.minimized || s.peerId !== focused.peerId)
        .map((session, index) => (
          <div
            key={`mini-${session.peerId}`}
            className={styles.miniBar}
            style={{ bottom: `${24 + index * 72}px` }}
          >
            <button
              type="button"
              className={styles.miniRestore}
              onClick={() => onFocusCall(session.peerId)}
            >
              {session.isAudioOnly ? "🎧" : "📹"}{" "}
              {session.peerName || "Cuộc gọi"}
            </button>
            <button
              type="button"
              className={styles.miniEnd}
              onClick={() => onEndCall(session.peerId)}
              title="Kết thúc"
            >
              ✕
            </button>
          </div>
        ))}
    </>
  );
}
