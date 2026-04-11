let pendingScreenShareStream: MediaStream | null = null;

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
