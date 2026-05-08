"use client";

import Sidebar from "@/ui/Sidebar/sidebar";
import { usePathname } from "next/navigation";
import GlobalDmIncomingCalls from "@/components/GlobalDmIncomingCalls";
import { PostUploadProvider } from "@/context/post-upload-context";
import { GuestAuthProvider } from "@/context/guest-auth-context";

export default function MainLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isMessagesPage = pathname?.startsWith("/messages");

  return (
    <PostUploadProvider>
      <GuestAuthProvider>
        <GlobalDmIncomingCalls />
        {isMessagesPage ? (
          <>{children}</>
        ) : (
          <div className="app-shell flex">
            <Sidebar />
            <div className="page flex-1" data-scroll-root>
              {children}
            </div>
            {modal}
          </div>
        )}
      </GuestAuthProvider>
    </PostUploadProvider>
  );
}
