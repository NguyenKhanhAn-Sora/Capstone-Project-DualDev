export type LivestreamHostVideoMode =
  | "screen-only"
  | "screen-camera"
  | "camera-only";

export type LivestreamCameraPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type LivestreamCameraSize = "small" | "medium" | "large";

export type LivestreamHostVideoConfig = {
  mode: LivestreamHostVideoMode;
  cameraPosition: LivestreamCameraPosition;
  cameraSize: LivestreamCameraSize;
};

const DEFAULT_HOST_VIDEO_CONFIG: LivestreamHostVideoConfig = {
  mode: "screen-camera",
  cameraPosition: "bottom-right",
  cameraSize: "medium",
};

let pendingScreenShareStream: MediaStream | null = null;
let pendingCameraStream: MediaStream | null = null;
let pendingHostVideoConfig: LivestreamHostVideoConfig = {
  ...DEFAULT_HOST_VIDEO_CONFIG,
};

export function setPendingScreenShareStream(stream: MediaStream | null): void {
  pendingScreenShareStream = stream;
}

export function getPendingScreenShareStream(): MediaStream | null {
  return pendingScreenShareStream;
}

export function takePendingScreenShareStream(): MediaStream | null {
  const stream = pendingScreenShareStream;
  pendingScreenShareStream = null;
  return stream;
}

export function clearPendingScreenShareStream(): void {
  pendingScreenShareStream = null;
}

export function setPendingCameraStream(stream: MediaStream | null): void {
  pendingCameraStream = stream;
}

export function getPendingCameraStream(): MediaStream | null {
  return pendingCameraStream;
}

export function clearPendingCameraStream(): void {
  pendingCameraStream = null;
}

export function setPendingHostVideoConfig(
  config: LivestreamHostVideoConfig,
): void {
  pendingHostVideoConfig = { ...config };
}

export function getPendingHostVideoConfig(): LivestreamHostVideoConfig {
  return { ...pendingHostVideoConfig };
}

export function clearPendingLivestreamMedia(): void {
  pendingScreenShareStream = null;
  pendingCameraStream = null;
  pendingHostVideoConfig = { ...DEFAULT_HOST_VIDEO_CONFIG };
}
