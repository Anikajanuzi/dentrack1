import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { getLang } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DENTRACK", template: "%s · DENTRACK" },
  description: "Dental laboratory management: numbered trays, cases, production and real cost accounting.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#08121f" },
  ],
};

// Applies the saved theme before paint to avoid a flash. The signed-in user's saved
// preference (from the database) is synced into localStorage by the app shell.
const themeScript = `(function(){try{var t=localStorage.getItem('dt-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);if(localStorage.getItem('dt-motion')==='reduced')document.documentElement.dataset.motion='reduced'}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <I18nProvider lang={lang}>{children}</I18nProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border-line !bg-surface !text-ink !shadow-lift",
              description: "!text-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
