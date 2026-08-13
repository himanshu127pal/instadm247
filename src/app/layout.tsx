import type { Metadata, Viewport } from "next";
import { Bangers, Nunito } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/** Bangers for comic display type, Nunito for the rounded body face. */
const display = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
});

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "InstaDM247 — Instagram DM automation that never risks your account",
    template: "%s · InstaDM247",
  },
  description:
    "Turn every comment, story reply, mention and DM into a conversation. Build automation flows on Instagram's official API — so your account stays safe while you sleep.",
  keywords: [
    "Instagram DM automation",
    "comment to DM",
    "Instagram automation for creators",
    "Instagram chatbot",
    "story reply automation",
  ],
  openGraph: {
    title: "InstaDM247 — Instagram DM automation that never risks your account",
    description:
      "Comment-to-DM, story replies, mentions, Lives and keyword DMs — automated on Meta's official API.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e1a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the stored theme before paint so there's no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("idm-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            },
          }}
        />
      </body>
    </html>
  );
}
