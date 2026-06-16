"use client";

import Sidebar from "@/ui/Sidebar/sidebar";
import MobileNav from "@/ui/MobileNav/mobile-nav";
import { usePathname } from "next/navigation";
import GlobalDmIncomingCalls from "@/components/GlobalDmIncomingCalls";
import { PostUploadProvider } from "@/context/post-upload-context";
import { GuestAuthProvider } from "@/context/guest-auth-context";
import { NavigationGuardProvider } from "@/context/navigation-guard-context";
import { AppDialogProvider } from "@/context/app-dialog-provider";
import { useEffect, useState } from "react";
import { useTheme } from "@/component/theme-provider";
import GalaxyBackground from "@/component/galaxy-background";

export default function MainLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const pathname = usePathname();
  const { appearancePreset } = useTheme();
  const isMessagesPage = pathname?.startsWith("/messages");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isGalaxy = mounted && appearancePreset === "galaxy";

  return (
    <NavigationGuardProvider>
    <AppDialogProvider>
    <PostUploadProvider>
      <GuestAuthProvider>
        {isGalaxy && <GalaxyBackground />}
        <GlobalDmIncomingCalls />
        {isMessagesPage ? (
          <>
            <MobileNav />
            <div className="messages-mobile-wrapper">
              {children}
            </div>
          </>
        ) : (
          <div className="app-shell flex">
            <Sidebar />
            <MobileNav />
            <div className="page flex-1 mobile-page" data-scroll-root>
              {children}
            </div>
            {modal}
          </div>
        )}
      </GuestAuthProvider>
    </PostUploadProvider>
    </AppDialogProvider>
    </NavigationGuardProvider>
  );
}
