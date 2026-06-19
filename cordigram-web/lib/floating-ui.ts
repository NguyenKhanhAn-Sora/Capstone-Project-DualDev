/** Keep floating popovers (reactions, emoji picker, menus) inside the viewport. */
export function clampFloatingPosition(input: {
  anchorRect: DOMRect;
  width: number;
  height: number;
  /** Preferred anchor corner for horizontal placement */
  alignRight?: boolean;
  gap?: number;
  padding?: number;
  /** When set, clamp within this rect instead of the full viewport */
  containerRect?: DOMRect | null;
}): { top: number; left: number } {
  const gap = input.gap ?? 8;
  const pad = input.padding ?? 8;
  const w = input.width;
  const h = input.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const bounds = input.containerRect
    ? {
        left: Math.max(pad, input.containerRect.left + pad),
        right: Math.min(vw - pad, input.containerRect.right - pad),
        top: Math.max(pad, input.containerRect.top + pad),
        bottom: Math.min(vh - pad, input.containerRect.bottom - pad),
      }
    : { left: pad, right: vw - pad, top: pad, bottom: vh - pad };

  const maxLeft = Math.max(bounds.left, bounds.right - w);

  let left = input.alignRight
    ? input.anchorRect.right - w
    : input.anchorRect.left;

  if (left + w > bounds.right) {
    left = input.alignRight
      ? input.anchorRect.left
      : input.anchorRect.right - w;
  }
  left = Math.min(Math.max(left, bounds.left), maxLeft);

  let top = input.anchorRect.top - h - gap;
  if (top < bounds.top) {
    top = input.anchorRect.bottom + gap;
  }
  if (top + h > bounds.bottom) {
    top = Math.max(bounds.top, input.anchorRect.top - h - gap);
  }
  top = Math.min(Math.max(top, bounds.top), Math.max(bounds.top, bounds.bottom - h));

  return { top, left };
}
