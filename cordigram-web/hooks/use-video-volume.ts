"use client";

import { useEffect, useState } from "react";

export type VolumeState = { volume: number; muted: boolean };
type Listener = (s: VolumeState) => void;

// Module-level singleton — persists across all renders and navigation
let state: VolumeState = { volume: 1, muted: true };
const listeners = new Set<Listener>();

export const videoVolumeStore = {
  get: (): VolumeState => state,
  set: (patch: Partial<VolumeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  },
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useVideoVolume() {
  const [vol, setVol] = useState<VolumeState>(() => videoVolumeStore.get());
  useEffect(() => videoVolumeStore.subscribe(setVol), []);
  return [vol, videoVolumeStore.set] as const;
}
