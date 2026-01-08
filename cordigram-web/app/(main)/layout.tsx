"use client";

import Sidebar from "@/ui/Sidebar/sidebar";
import { usePathname } from "next/navigation";

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
    <div className="app-shell">
      <Sidebar />
      <div className="page">{children}</div>
    </div>
  );
}
