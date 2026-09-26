import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { env } from "@/lib/env";
import "./globals.css";

/*
  Fonts are self-hosted rather than fetched through `next/font/google`.

  That loader downloads from Google at *build* time, which quietly makes every
  build — CI and the production server's release step alike — depend on
  reaching fonts.googleapis.com. It failed exactly that way once, and a deploy
  that can fail because someone else's CDN blipped is not a deploy.

  These are the same files the loader would have fetched (latin subset, OFL
  licensed, so redistribution is fine). Nunito and Baloo 2 are variable, so one
  file covers every weight.
*/

/** Bangers for comic display type — hero and section headlines only. */
const display = localFont({
  src: "./fonts/Bangers-Latin.woff2",
  weight: "400",
  variable: "--font-display-loaded",
  display: "swap",
});

/** Baloo 2 for headings inside content. See the h1..h4 rule in globals.css. */
const heading = localFont({
  src: "./fonts/Baloo2-Latin-Variable.woff2",
  weight: "400 800",
  variable: "--font-heading-loaded",
  display: "swap",
});

/** Nunito, the rounded body face. */
const body = localFont({
  src: "./fonts/Nunito-Latin-Variable.woff2",
  weight: "400 900",
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
    default: "InstaDM247 · Instagram DM automation that never risks your account",
    template: "%s · InstaDM247",
  },
  description:
    "Turn every comment, story reply, mention and DM into a conversation. Build automation flows on Instagram's official API, so your account stays safe while you sleep.",
  keywords: [
    "Instagram DM automation",
    "comment to DM",
    "Instagram automation for creators",
    "Instagram chatbot",
    "story reply automation",
  ],
  openGraph: {
    title: "InstaDM247 · Instagram DM automation that never risks your account",
    description:
      "Comment-to-DM, story replies, mentions, Lives and keyword DMs, automated on Meta's official API.",
    type: "website",
    siteName: "InstaDM247",
  },
  twitter: {
    card: "summary_large_image",
    title: "InstaDM247 · Instagram DM automation that never risks your account",
    description:
      "Comment-to-DM, story replies, mentions, Lives and keyword DMs, automated on Meta's official API.",
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
