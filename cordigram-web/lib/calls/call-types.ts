// Call types and interfaces
export enum CallType {
  AUDIO = "audio",
  VIDEO = "video",
}

export enum CallStatus {
  PENDING = "pending",
  RINGING = "ringing",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  ENDED = "ended",
  MISSED = "missed",
}

export interface CallOffer {
  from: string;
  to: string;
  callId: string;
  type: CallType;
  offer: RTCSessionDescriptionInit;
  timestamp: number;
}

export interface CallAnswer {
  from: string;
  to: string;
  callId: string;
  answer: RTCSessionDescriptionInit;
  timestamp: number;
}

export interface IceCandidate {
  from: string;
  to: string;
  callId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallEndSignal {
  from: string;
  to: string;
  callId: string;
  reason?: string;
}

export interface CallNotification {
  from: {
    userId: string;
    username: string;
    avatar?: string;
  };
  to: string;
  callId: string;
  type: CallType;
  timestamp: number;
}

export interface CallState {
  callId: string;
  type: CallType;
  status: CallStatus;
  from: string;
  to: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}
