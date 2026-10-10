"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Film, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { RemoteImg } from "@/components/ui/remote-img";

/** A post or story image. Instagram's links expire; a dead one becomes a plain tile. */
export function ContentImage({ src, video, alt }: { src: string | null; video?: boolean; alt: string }) {
  return (
    <RemoteImg
      src={src}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover"
      fallback={
        <div className="grid h-full w-full place-items-center bg-[var(--bg-sunken)] text-[var(--text-faint)]">
          {video ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        </div>
      }
    />
  );
}

/** Pull the latest posts from Instagram for every connected account. */
export function SyncContentButton({ accountIds }: { accountIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function sync() {
    setBusy(true);
    let synced = 0;
    for (const id of accountIds) {
      const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { media?: number; error?: string } | undefined;
      if (res?.ok) synced += data?.media ?? 0;
      else toast.error(data?.error ?? "Couldn't sync with Instagram right now.");
    }
    setBusy(false);
    if (synced) toast.success(`Synced ${synced} posts`);
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={sync} loading={busy}>
      <RefreshCw className="h-4 w-4" /> Sync posts
    </Button>
  );
}
