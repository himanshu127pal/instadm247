"use client";

import * as React from "react";

/**
 * An image from Instagram's CDN, with a fallback for when the link has died.
 * Instagram signs these links and they expire after a few days; the daily
 * profile refresh (refresh_profiles) replaces them, but a page rendered from
 * an old copy shows `fallback` instead of a broken-image icon.
 */
export function RemoteImg({
  src,
  fallback = null,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}) {
  const [broken, setBroken] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React attaches onError, so the
  // event is never seen. Catch that case once mounted.
  React.useEffect(() => {
    const img = ref.current;
    if (src && img && img.complete && img.naturalWidth === 0) setBroken(src);
  }, [src]);
  if (!src || broken === src) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} onError={() => setBroken(src)} {...props} />;
}
