import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../component/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { LanguageProvider } from "../component/language-provider";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Cordigram",
  description: "Connect and share with friends",
};

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    storedLocale === "vi" || storedLocale === "en" ? storedLocale : "en";
  const messages = (await import(`../messages/${locale}.json`)).default;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${roboto.variable} antialiased`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <LanguageProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </LanguageProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
