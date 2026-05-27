import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../component/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { LanguageProvider } from "../component/language-provider";
import { resolveLocale } from "@/lib/i18n/locales";

const roboto = Roboto({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "700", "800"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.cordigram.com"),
  title: "Cordigram",
  description: "Connect, share, and explore with Cordigram — your social platform for posts, reels, and communities.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    storedLocale === "vi" ||
    storedLocale === "en" ||
    storedLocale === "ja" ||
    storedLocale === "zh"
      ? storedLocale
      : "en";
  const messages = (await import(`../messages/${locale}.json`)).default;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${roboto.variable} ${roboto.className} antialiased`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <LanguageProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </LanguageProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
