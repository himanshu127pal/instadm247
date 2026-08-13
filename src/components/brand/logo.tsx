import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Brand assets.
 *
 * Drawn as SVG rather than shipped as a raster so the mark stays sharp from a
 * 16px favicon up to a hero lockup, and so the wordmark can pick up the page's
 * own ink colour in dark mode.
 *
 * The gradient ids are fixed rather than generated per instance: several logos
 * on one page emit duplicate `<defs>`, but the definitions are byte-identical
 * so the browser resolving to the first is exactly the right answer. Generating
 * ids would instead risk a server/client hydration mismatch.
 */

const BRAND = {
  violet: "#4C2A86",
  violetLight: "#6B3AA0",
  purple: "#5B2D91",
  magenta: "#8E2A93",
  pink: "#D01C7B",
  orange: "#F26B2A",
  amber: "#F7941E",
} as const;

/**
 * The circular mark on its own — favicon, avatar, tight spaces.
 *
 * Pass `title=""` where the mark sits next to the name already, so screen
 * readers don't announce the brand twice.
 */
export function LogoMark({
  className,
  title = "InstaDM247",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={cn("h-9 w-9", className)}
      {...(title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true })}
    >
      <defs>
        {/* Top of the ring: violet → magenta → pink, sweeping clockwise. */}
        <linearGradient id="idmRingTop" x1="10%" y1="6%" x2="94%" y2="66%">
          <stop offset="0%" stopColor={BRAND.purple} />
          <stop offset="48%" stopColor={BRAND.magenta} />
          <stop offset="100%" stopColor={BRAND.pink} />
        </linearGradient>
        {/* Bottom of the ring: pink → orange → amber, continuing the sweep. */}
        <linearGradient id="idmRingBottom" x1="94%" y1="44%" x2="10%" y2="96%">
          <stop offset="0%" stopColor={BRAND.pink} />
          <stop offset="55%" stopColor={BRAND.orange} />
          <stop offset="100%" stopColor={BRAND.amber} />
        </linearGradient>
        {/* Themed — see `--brand-plane-*` in globals.css. */}
        <linearGradient id="idmPlane" x1="16%" y1="92%" x2="88%" y2="12%">
          <stop offset="0%" stopColor={`var(--brand-plane-from, ${BRAND.violet})`} />
          <stop offset="100%" stopColor={`var(--brand-plane-to, ${BRAND.violetLight})`} />
        </linearGradient>
        {/*
          The original artwork separates the plane from the ring with a sliver of
          the page behind it. Punching that sliver out with a mask — rather than
          painting it in a background colour — means the mark is correct on every
          surface it lands on: nav, cream footer, dark theme, a user's own
          link-in-bio colour.
        */}
        <mask id="idmPlaneCut">
          <rect x="0" y="0" width="200" height="200" fill="#fff" />
          <g fill="#000" stroke="#000" strokeWidth="14" strokeLinejoin="round">
            <path d="M152 55 L56 96 L97 114 Z" />
            <path d="M159 59 L104 118 L119 152 Z" />
          </g>
        </mask>
      </defs>

      {/* Ring, drawn as two arcs so the gradient can travel around it. */}
      <g fill="none" strokeWidth="17" strokeLinecap="round" mask="url(#idmPlaneCut)">
        <path d="M100 26 A74 74 0 0 1 170 122" stroke="url(#idmRingTop)" />
        <path d="M170 122 A74 74 0 1 1 100 26" stroke="url(#idmRingBottom)" />
      </g>

      <g fill="url(#idmPlane)" stroke="url(#idmPlane)" strokeWidth="3" strokeLinejoin="round">
        <path d="M152 55 L56 96 L97 114 Z" />
        <path d="M159 59 L104 118 L119 152 Z" />
      </g>
    </svg>
  );
}

/**
 * The wordmark. "insta" and "47" take the page's ink colour so it stays legible
 * on either theme; "dm2" carries the brand gradient.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-sans text-[19px] font-extrabold lowercase leading-none tracking-[-0.02em]",
        className,
      )}
    >
      <span className="text-[var(--text)]">insta</span>
      <span className="bg-[linear-gradient(95deg,#B8228C_0%,#D91E6E_45%,#F7941E_100%)] bg-clip-text text-transparent">
        dm2
      </span>
      <span className="text-[var(--text)]">47</span>
    </span>
  );
}

/** Mark + wordmark. The default lockup for headers and footers. */
export function Logo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      {showWordmark && <LogoWordmark className={wordmarkClassName} />}
    </span>
  );
}

/**
 * The clickable lockup used in the nav, footer, auth pages and dashboard rail.
 * On hover the plane banks and lifts — CSS only, so this stays a server
 * component and the logo costs nothing on the client.
 */
export function LogoLink({
  className,
  href = "/",
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark
        className={cn(
          "transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-6 group-hover:scale-105",
          markClassName,
        )}
      />
      {showWordmark && <LogoWordmark className={wordmarkClassName} />}
    </Link>
  );
}
