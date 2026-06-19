/** Keep floating popovers (reactions, emoji picker, menus) inside the viewport. */
export function clampFloatingPosition(input: {
  anchorRect: DOMRect;
  width: number;
  height: number;
  /** Preferred anchor corner for horizontal placement */
  alignRight?: boolean;
  gap?: number;
  padding?: number;
}): { top: number; left: number } {
  const gap = input.gap ?? 8;
  const pad = input.padding ?? 8;
  const w = input.width;
  const h = input.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = input.alignRight
    ? input.anchorRect.right - w - 10
    : input.anchorRect.left + 50;
  left = Math.min(Math.max(left, pad), Math.max(pad, vw - pad - w));

  let top = input.anchorRect.top - h - gap;
  if (top < pad) {
    top = input.anchorRect.bottom + gap;
  }
  if (top + h > vh - pad) {
    top = Math.max(pad, input.anchorRect.top - h - gap);
  }
  top = Math.min(Math.max(top, pad), Math.max(pad, vh - h - pad));

  return { top, left };
}
