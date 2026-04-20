"use client";

import Sidebar from "@/ui/Sidebar/sidebar";
import { usePathname } from "next/navigation";
import { AuthGuard } from "../../component/auth-guard";

export default function MainLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isMessagesPage = pathname?.startsWith("/messages");

  if (isMessagesPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="app-shell flex">
        <Sidebar />
        <div className="page flex-1" data-scroll-root>
          {children}
        </div>
        {modal}
      </div>
    </AuthGuard>
  );
}
