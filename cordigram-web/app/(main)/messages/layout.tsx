import type { Metadata } from "next";
import "./messages-shell-theme.css";

export const metadata: Metadata = {
  title: "Messages - Cordigram",
  description: "Chat with your friends on Cordigram",
};

export default function MessagesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
