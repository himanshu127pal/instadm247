import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Brand assets.
 *
 * These render the owner's own artwork from `public/brand/` rather than a
 * hand-drawn approximation. The files are auto-traced vectors, so they are path
 * soup — optimised at precision=1 and cropped to their content, which is the
 * difference between ~44KB and the 206KB that was uploaded.
 *
 * The wordmark ink is a dark slate that vanishes on a dark background, so the
 * lockup ships as two files and the theme picks one. The mark itself is
 * identical in both themes: its background was stripped, so it sits correctly on
 * the nav, the cream footer, dark mode, and whatever colour a customer chooses
 * for their link-in-bio page.
 */

/** Natural aspect ratios, from each file's viewBox. */
const MARK_RATIO = 1;
const LOCKUP_RATIO = 1335 / 312;

/**
 * The circular mark on its own — favicon-adjacent spots, avatars, tight places.
 *
 * Pass `title=""` where the brand name is already adjacent in text, so screen
 * readers don't announce it twice.
 */
export function LogoMark({
  className,
  title = "InstaDM247",
}: {
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image would only add a wrapper and a request.
    <img
      src="/brand/mark.svg"
      alt={title}
      width={36}
      height={36 * MARK_RATIO}
      className={cn("h-9 w-9", className)}
      {...(title ? {} : { "aria-hidden": true })}
    />
  );
}

/**
 * Mark + wordmark. The default lockup.
 *
 * Both theme variants sit in the DOM and CSS picks one — the theme is only
 * known on the client (localStorage, applied before paint), so choosing during
 * render would mean a hydration mismatch or a flash of the wrong logo.
 */
export function Logo({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  const shared = cn("h-9 w-auto", imgClassName);
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src="/brand/logo-lockup.svg"
        alt="InstaDM247"
        width={Math.round(36 * LOCKUP_RATIO)}
        height={36}
        className={cn("theme-light-only", shared)}
      />
      <img
        src="/brand/logo-lockup-dark.svg"
        alt=""
        aria-hidden
        width={Math.round(36 * LOCKUP_RATIO)}
        height={36}
        className={cn("theme-dark-only", shared)}
      />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}

/**
 * The clickable lockup used in the nav, footer, auth pages and dashboard rail.
 * Lifts very slightly on hover — CSS only, so this stays a server component.
 */
export function LogoLink({
  className,
  href = "/",
  imgClassName,
}: {
  className?: string;
  href?: string;
  imgClassName?: string;
}) {
  return (
    <Link href={href} className={cn("group inline-flex items-center", className)}>
      <Logo
        imgClassName={cn(
          "transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.03]",
          imgClassName,
        )}
      />
    </Link>
  );
}
