import type { Metadata, Viewport } from "next";
import { Baloo_2, Bangers, Nunito } from "next/font/google";
import { Toaster } from "sonner";
import { env } from "@/lib/env";
import "./globals.css";

/** Bangers for comic display type, Nunito for the rounded body face. */
const display = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
});

/**
 * Baloo 2 for headings that sit inside content rather than above it.
 *
 * Bangers is a condensed poster face — it is excellent at hero sizes and
 * genuinely hard to read below ~2rem, where the letterforms run together. Baloo
 * keeps the rounded, friendly character at card and section-heading sizes.
 */
const heading = Baloo_2({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-heading-loaded",
  display: "swap",
});

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  /**
   * Without this the `opengraph-image` / `twitter-image` file conventions emit
   * localhost URLs, which no crawler can fetch. `APP_URL` is set at deploy time.
   */
  metadataBase: new URL(env.appUrl),
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
    siteName: "InstaDM247",
  },
  twitter: {
    card: "summary_large_image",
    title: "InstaDM247 — Instagram DM automation that never risks your account",
    description:
      "Comment-to-DM, story replies, mentions, Lives and keyword DMs — automated on Meta's official API.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf7" },
    { media: "(prefers-color-scheme: dark)", color: "#14131a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${heading.variable} ${body.variable}`}
      suppressHydrationWarning
    >
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
