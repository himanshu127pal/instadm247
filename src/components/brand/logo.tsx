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
  violet: "#46307F",
  violetLight: "#5C3F9E",
  purple: "#5E2C8F",
  magenta: "#8D2490",
  pink: "#C21C86",
  crimson: "#D01C6E",
  orange: "#EE5C2B",
  amber: "#F7941E",
} as const;

/**
 * The plane, as one dart rather than two loose triangles.
 *
 * `WING` and `BODY` share the tip and the notch; BODY is nudged ~2.4 units
 * perpendicular to that shared edge so the fold reads as a hairline of the page
 * showing through, which is what the original artwork does.
 */
const PLANE_WING = "M155 51 L56 91 L98 109 Z";
const PLANE_BODY = "M156.7 52.7 L99.7 110.7 L121 138 Z";

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
        {/* Under-layer: crimson at 2 o'clock, sweeping clockwise to orange at 8. */}
        <linearGradient id="idmRingOuter" x1="92%" y1="14%" x2="14%" y2="82%">
          <stop offset="0%" stopColor={BRAND.crimson} />
          <stop offset="50%" stopColor={BRAND.orange} />
          <stop offset="100%" stopColor={BRAND.amber} />
        </linearGradient>
        {/* Over-layer: purple at 7:30, up the left and over the top to magenta. */}
        <linearGradient id="idmRingInner" x1="8%" y1="90%" x2="86%" y2="10%">
          <stop offset="0%" stopColor={BRAND.purple} />
          <stop offset="55%" stopColor={BRAND.magenta} />
          <stop offset="100%" stopColor={BRAND.pink} />
        </linearGradient>
        {/* Themed — see `--brand-plane-*` in globals.css. */}
        <linearGradient id="idmPlane" x1="16%" y1="92%" x2="88%" y2="12%">
          <stop offset="0%" stopColor={`var(--brand-plane-from, ${BRAND.violet})`} />
          <stop offset="100%" stopColor={`var(--brand-plane-to, ${BRAND.violetLight})`} />
        </linearGradient>
        {/*
          The artwork separates the plane from the ring with a sliver of the page
          behind it. Punching that sliver out with a mask — rather than painting
          it in a background colour — means the mark is correct on every surface
          it lands on: nav, cream footer, dark theme, a customer's own
          link-in-bio colour.
        */}
        <mask id="idmPlaneCut">
          <rect x="0" y="0" width="200" height="200" fill="#fff" />
          <g fill="#000" stroke="#000" strokeWidth="9" strokeLinejoin="round">
            <path d={PLANE_WING} />
            <path d={PLANE_BODY} />
          </g>
        </mask>
      </defs>

      {/*
        The ring is a spiral, not a circle: two arcs that overlap by about 35°
        at the lower left, the inner one drawn over the outer, which is what
        gives the mark its wrapped-ribbon tail. They stop short of each other at
        1–2 o'clock, and the plane flies out through that gap.
      */}
      <g fill="none" strokeWidth="15" strokeLinecap="round" mask="url(#idmPlaneCut)">
        <path d="M164.1 63 A76 76 0 1 1 28.5 119.2" stroke="url(#idmRingOuter)" />
        <path d="M47.7 152.3 A71 71 0 0 1 152.3 47.7" stroke="url(#idmRingInner)" />
      </g>

      <g fill="url(#idmPlane)">
        <path d={PLANE_WING} />
        <path d={PLANE_BODY} />
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
        "font-sans text-[19px] font-extrabold lowercase leading-none tracking-[-0.015em]",
        className,
      )}
    >
      <span className="text-[var(--brand-word,var(--text))]">insta</span>
      <span className="bg-[linear-gradient(95deg,#B8228C_0%,#D91E6E_45%,#F7941E_100%)] bg-clip-text text-transparent">
        dm2
      </span>
      <span className="text-[var(--brand-word,var(--text))]">47</span>
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
