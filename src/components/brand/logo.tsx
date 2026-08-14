import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Brand assets.
 *
 * These render the owner's own PNGs from `public/brand/`. They replaced an
 * auto-traced SVG set that looked poor at size — the trace turned smooth
 * gradients into faceted path soup.
 *
 * The wordmark ink is a dark slate that vanishes on a dark background, so the
 * lockup ships as two files and the theme picks one. The mark is identical in
 * both themes: its white background was made transparent, so it sits correctly
 * on the nav, the cream footer, dark mode, and whatever colour a customer
 * chooses for their link-in-bio page.
 */

/** Intrinsic sizes of the shipped files, for correct aspect and no layout shift. */
const MARK = { w: 256, h: 256 };
const LOCKUP = { w: 837, h: 192 };

/**
 * The circular mark on its own — tight spaces, avatars, the bio badge.
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
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size static asset; next/image would add a request and a wrapper for nothing.
    <img
      src="/brand/mark.png"
      alt={title}
      width={MARK.w}
      height={MARK.h}
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
        src="/brand/logo-lockup.png"
        alt="InstaDM247"
        width={LOCKUP.w}
        height={LOCKUP.h}
        className={cn("theme-light-only", shared)}
      />
      <img
        src="/brand/logo-lockup-dark.png"
        alt=""
        aria-hidden
        width={LOCKUP.w}
        height={LOCKUP.h}
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
