"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import GuestLoginOverlay from "@/component/guest-login-overlay";

type GuestAuthContextValue = {
  showLoginOverlay: () => void;
};

const GuestAuthContext = createContext<GuestAuthContextValue>({
  showLoginOverlay: () => {},
});

export function GuestAuthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const closedAtRef = useRef(0);

  const showLoginOverlay = useCallback(() => {
    // Don't reopen if already open, or if the user dismissed it within the last 30 s
    if (openRef.current) return;
    if (Date.now() - closedAtRef.current < 30_000) return;
    openRef.current = true;
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    openRef.current = false;
    closedAtRef.current = Date.now();
    setOpen(false);
  }, []);

  useEffect(() => {
    const handler = () => showLoginOverlay();
    window.addEventListener("cordigram:session-expired", handler);
    return () => window.removeEventListener("cordigram:session-expired", handler);
  }, [showLoginOverlay]);

  return (
    <GuestAuthContext.Provider value={{ showLoginOverlay }}>
      {children}
      <GuestLoginOverlay open={open} onClose={handleClose} />
    </GuestAuthContext.Provider>
  );
}

export function useGuestAuth() {
  return useContext(GuestAuthContext);
}
