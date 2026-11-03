import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/chat/theme-provider";

export const metadata: Metadata = {
  title: "دستیار هوشمند کمیته امداد",
  description:
    "چت‌بات هوشمند فارسی مبتنی بر Ollama با پایگاه دانش کمیته امداد امام خمینی (ره)، جستجوی اینترنت، آمار و عملکرد و میز خدمت",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground font-vazir">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
