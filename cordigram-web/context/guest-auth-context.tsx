"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const showLoginOverlay = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const handler = () => showLoginOverlay();
    window.addEventListener("cordigram:session-expired", handler);
    return () => window.removeEventListener("cordigram:session-expired", handler);
  }, [showLoginOverlay]);

  return (
    <GuestAuthContext.Provider value={{ showLoginOverlay }}>
      {children}
      <GuestLoginOverlay open={open} onClose={() => setOpen(false)} />
    </GuestAuthContext.Provider>
  );
}

export function useGuestAuth() {
  return useContext(GuestAuthContext);
}
