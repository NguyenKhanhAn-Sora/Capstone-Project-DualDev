"use client";

import Sidebar from "@/ui/Sidebar/sidebar";
import { usePathname } from "next/navigation";
import { AuthGuard } from "../../component/auth-guard";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
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
      </div>
    </AuthGuard>
  );
}
