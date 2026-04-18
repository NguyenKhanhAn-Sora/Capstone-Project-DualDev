"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  CallType,
  CallStatus,
  CallOffer,
  CallAnswer,
  IceCandidate,
  CallNotification,
  CallState,
  CallEndSignal,
} from "@/lib/calls/call-types";
import {
  PEER_CONNECTION_CONFIG,
  MEDIA_CONSTRAINTS,
} from "@/lib/calls/webrtc-config";
import { useDirectMessages } from "../use-direct-messages";
import { isIncomingRingEvent } from "@/lib/call-event-guards";

type UseDirectMessagesReturn = ReturnType<typeof useDirectMessages>;

interface UseCallsOptions {
  userId: string;
  token: string;
}

export const useCalls = ({ userId, token }: UseCallsOptions) => {
  const {
    callEvent,
    callEnded,
    initiateCall,
    answerCall,
    rejectCall,
    sendIceCandidate,
    endCall,
  } = useDirectMessages({ userId, token });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(
    null,
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Set connection status based on direct messages hook
  useEffect(() => {
    if (callEvent) {
      setIsConnected(true);
    }
  }, [callEvent]);

  // Handle incoming call (ignore ICE / reject / answer noise on shared callEvent)
  useEffect(() => {
    if (!callEvent || !isIncomingRingEvent(callEvent) || callState) return;
    setIncomingCall({
      callId: `call-${Date.now()}`,
      type: callEvent.type === "video" ? CallType.VIDEO : CallType.AUDIO,
      from: {
        userId: callEvent.from,
        username: callEvent.from,
      },
      to: userId,
      timestamp: Date.now(),
    });
  }, [callEvent, callState, userId]);

  // Handle call ended
  useEffect(() => {
    if (callEnded) {
      hangUp();
    }
  }, [callEnded]);

  // Get local media stream
  const getLocalStream = useCallback(async (type: CallType) => {
    try {
      const constraints =
        type === CallType.VIDEO
          ? MEDIA_CONSTRAINTS.AUDIO_VIDEO
          : MEDIA_CONSTRAINTS.AUDIO_ONLY;

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw error;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);

    // Add local stream tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
        setRemoteStream(remoteStreamRef.current);
      }
      remoteStreamRef.current.addTrack(event.track);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && callState) {
        sendIceCandidate(callState.to, event.candidate.toJSON());
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "disconnected"
      ) {
        hangUp();
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [callState, sendIceCandidate]);

  // Handle receive offer
  const handleReceiveOffer = useCallback(
    async (offerData: CallOffer) => {
      try {
        if (!peerConnectionRef.current) {
          createPeerConnection();
        }

        const peerConnection = peerConnectionRef.current!;
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offerData.offer),
        );

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    },
    [createPeerConnection],
  );

  // Handle receive answer
  const handleReceiveAnswer = useCallback(async (answerData: CallAnswer) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answerData.answer),
        );
      }
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }, []);

  // Handle receive ICE candidate
  const handleReceiveIceCandidate = useCallback(
    async (iceData: IceCandidate) => {
      try {
        if (peerConnectionRef.current && iceData.candidate) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(iceData.candidate),
          );
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    },
    [],
  );

  // Initiate call
  const initiateNewCall = useCallback(
    async (recipientId: string, type: CallType) => {
      try {
        // Get local stream
        await getLocalStream(type);

        // Create peer connection
        createPeerConnection();

        // Create offer
        const peerConnection = peerConnectionRef.current!;
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Create call state
        const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newCallState: CallState = {
          callId,
          type,
          status: CallStatus.RINGING,
          from: userId,
          to: recipientId,
          startTime: Date.now(),
        };
        setCallState(newCallState);

        // Send offer via direct messages
        initiateCall(recipientId, type === CallType.VIDEO ? "video" : "audio");
      } catch (error) {
        console.error("Error initiating call:", error);
        setCallState(null);
        throw error;
      }
    },
    [userId, getLocalStream, createPeerConnection, initiateCall],
  );

  // Answer incoming call
  const answerIncomingCall = useCallback(
    async (type: CallType) => {
      try {
        if (!incomingCall) return;

        // Get local stream
        await getLocalStream(type);

        // Create peer connection
        createPeerConnection();

        // Update call state
        const newCallState: CallState = {
          callId: incomingCall.callId,
          type,
          status: CallStatus.ACCEPTED,
          from: incomingCall.from.userId,
          to: userId,
          startTime: Date.now(),
        };
        setCallState(newCallState);

        // Create answer
        const peerConnection = peerConnectionRef.current!;
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Notify acceptance
        answerCall(incomingCall.from.userId, answer);
        setIncomingCall(null);
      } catch (error) {
        console.error("Error answering call:", error);
        throw error;
      }
    },
    [userId, incomingCall, getLocalStream, createPeerConnection, answerCall],
  );

  // Reject incoming call
  const rejectIncomingCall = useCallback(
    async (reason?: string) => {
      try {
        if (!incomingCall) return;

        rejectCall(incomingCall.from.userId);
        setIncomingCall(null);
      } catch (error) {
        console.error("Error rejecting call:", error);
      }
    },
    [incomingCall, rejectCall],
  );

  // Hang up call
  const hangUp = useCallback(() => {
    if (callState) {
      endCall(callState.to);
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Clear remote stream
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
      setRemoteStream(null);
    }

    setCallState(null);
  }, [callState, endCall]);

  // Toggle audio
  const toggleAudio = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, []);

  return {
    isConnected,
    callState,
    incomingCall,
    localStream,
    remoteStream,
    initiateCall: initiateNewCall,
    answerCall: answerIncomingCall,
    rejectCall: rejectIncomingCall,
    hangUp,
    toggleAudio,
    toggleVideo,
    handleReceiveIceCandidate,
    handleReceiveAnswer,
  };
};
