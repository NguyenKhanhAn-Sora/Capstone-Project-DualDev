"use client";

import { createContext, useCallback, useContext, useRef } from "react";

type GuardCallback = (destination: string) => void;

interface NavigationGuardContextValue {
  registerGuard: (cb: GuardCallback) => void;
  unregisterGuard: () => void;
  getGuard: () => GuardCallback | null;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  registerGuard: () => {},
  unregisterGuard: () => {},
  getGuard: () => null,
});

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const callbackRef = useRef<GuardCallback | null>(null);

  const registerGuard = useCallback((cb: GuardCallback) => {
    callbackRef.current = cb;
  }, []);

  const unregisterGuard = useCallback(() => {
    callbackRef.current = null;
  }, []);

  const getGuard = useCallback(() => callbackRef.current, []);

  return (
    <NavigationGuardContext.Provider value={{ registerGuard, unregisterGuard, getGuard }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}
