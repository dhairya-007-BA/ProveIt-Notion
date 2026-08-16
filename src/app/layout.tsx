import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { GlobalSearch } from "@/components/global-search";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { KaneoControlledBusinessSyncTest } from "@/components/kaneo-controlled-business-sync-test";
import { MobileShell } from "@/components/mobile-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProveIt Workspace",
  description: "The internal workspace for ProveIt Hiring Innovations",
};

const themeInitializer = `(()=>{try{const theme=localStorage.getItem("proveit-theme")==="dark"?"dark":"light";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializer }} /></head>
      <body className="flex min-h-screen flex-col bg-[var(--background)] font-sans text-[var(--text)]">
        <ThemeProvider><AuthProvider><GlobalSearch /><MobileShell /><div className="fixed right-5 top-5 z-40 hidden md:block lg:right-6 lg:top-6"><NotificationBell /></div>{children}<KaneoControlledBusinessSyncTest /></AuthProvider></ThemeProvider>
      </body>
    </html>
  );
}
