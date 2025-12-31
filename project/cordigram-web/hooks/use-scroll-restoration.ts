import { useEffect, useRef, useState } from "react";

type ScrollTarget = Window | HTMLElement;

const isWindow = (t: ScrollTarget): t is Window => "scrollY" in t;

export function useScrollRestoration(
  key: string,
  ready: boolean,
  getTarget?: () => HTMLElement | null,
  saveEnabled = true
) {
  const restoredRef = useRef(false);
  const [target, setTarget] = useState<ScrollTarget | null>(null);
  const lastSavedRef = useRef<number | null>(null);

  // Resolve target after mount; retry via rAF until found to avoid null on first render
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const resolve = () => {
      if (getTarget) {
        const el = getTarget();
        if (el) {
          setTarget((prev) => (prev === el ? prev : el));
          return;
        }
        raf = requestAnimationFrame(resolve);
        return;
      }
      setTarget((prev) => (prev === window ? prev : window));
    };
    resolve();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [getTarget]);

  const scrollTo = (top: number) => {
    if (!target) return;
    if (isWindow(target)) {
      target.scrollTo({ top, behavior: "auto" });
    } else {
      target.scrollTo({ top, behavior: "auto" });
    }
  };

  const readScroll = () => {
    if (!target) return 0;
    return isWindow(target) ? target.scrollY : target.scrollTop;
  };

  useEffect(() => {
    if (!target) return;
    if (!ready || restoredRef.current) return;

    const saved = sessionStorage.getItem(key);
    if (saved) {
      const top = Number(saved) || 0;
      lastSavedRef.current = top;
      requestAnimationFrame(() => scrollTo(top));
    }
    restoredRef.current = true;
  }, [key, ready, target]);

  useEffect(() => {
    if (!target) return;

    let raf = 0;
    const save = () => {
      if (!saveEnabled) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          const current = readScroll() || 0;
          if (current === 0 && (lastSavedRef.current ?? 0) > 0) {
            return;
          }
          lastSavedRef.current = current;
          sessionStorage.setItem(key, String(current));
        } catch {
          // ignore persistence failures
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };

    target.addEventListener("scroll", save, { passive: true } as any);
    if (isWindow(target)) {
      target.addEventListener("beforeunload", save as any);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      save();
      target.removeEventListener("scroll", save as any);
      if (isWindow(target)) {
        target.removeEventListener("beforeunload", save as any);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, target, saveEnabled]);
}
