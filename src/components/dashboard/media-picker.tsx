"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Crop, Film, ImagePlus, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  IMAGE_CROPS,
  LIMITS,
  checkMedia,
  checkPost,
  describeRatio,
  nearestImageCrop,
  type MediaFacts,
  type PostType,
} from "@/lib/media/rules";
import { cn } from "@/lib/utils";

/**
 * Pick photos and videos for a scheduled post, from the device or by link.
 * See docs/SCHEDULER.md.
 *
 * Every file is measured in the browser and checked against Instagram's
 * publishing rules (src/lib/media/rules.ts) before it's uploaded, so problems
 * show while the customer is still here to fix them, not as a failed post
 * later. Photos are converted to JPEG here, the only image format Instagram
 * publishes, and one too tall or too wide can be cropped to an allowed shape.
 */

export type PickedMedia = {
  id: string;
  name: string;
  source: "file" | "link";
  /** Object URL for files, the link itself for links. */
  preview: string;
  status: "reading" | "needs-crop" | "uploading" | "ready" | "error";
  progress: number;
  facts?: MediaFacts;
  /** The URL Instagram will fetch: our upload, or the customer's link. */
  url?: string;
  token?: string;
  error?: string;
  /** Kept so a photo can be re-cropped without asking for the file again. */
  original?: Blob;
};

const newId = () => Math.random().toString(36).slice(2, 10);
const MB = 1024 * 1024;
const fileSize = (bytes: number) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`);

export function MediaPicker({
  postType,
  items,
  setItems,
}: {
  postType: PostType;
  items: PickedMedia[];
  setItems: React.Dispatch<React.SetStateAction<PickedMedia[]>>;
}) {
  const [link, setLink] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const update = React.useCallback(
    (id: string, change: Partial<PickedMedia>) => setItems((all) => all.map((m) => (m.id === id ? { ...m, ...change } : m))),
    [setItems],
  );

  const many = postType === "CAROUSEL";
  const accept =
    postType === "IMAGE" ? "image/*" : postType === "CAROUSEL" ? "image/*,video/mp4,video/quicktime" : "video/mp4,video/quicktime";

  async function upload(id: string, blob: Blob, facts: MediaFacts) {
    update(id, { status: "uploading", progress: 0, facts, error: undefined });
    const q = facts.kind === "video" ? `?w=${facts.width}&h=${facts.height}&d=${facts.durationSec ?? 0}` : "";
    try {
      const result = await new Promise<{ token: string; url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/uploads${q}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = (e) => e.lengthComputable && update(id, { progress: e.loaded / e.total });
        xhr.onload = () => {
          let data: { upload?: { token: string; url: string }; error?: string } = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            // Fall through to the generic message.
          }
          if (xhr.status >= 200 && xhr.status < 300 && data.upload) resolve(data.upload);
          else reject(new Error(data.error ?? "The upload didn't finish. Please try again."));
        };
        xhr.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
        xhr.send(blob);
      });
      update(id, { status: "ready", progress: 1, url: result.url, token: result.token });
    } catch (error) {
      update(id, { status: "error", error: (error as Error).message });
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const room = many ? LIMITS.carouselItems - items.length : 1;
    if (!many) {
      // A single-file post: a new pick replaces the old one.
      items.forEach((m) => void forget(m));
      setItems([]);
    }
    for (const file of list.slice(0, Math.max(room, 0))) {
      const id = newId();
      const preview = URL.createObjectURL(file);
      setItems((all) => [...all, { id, name: file.name, source: "file", preview, status: "reading", progress: 0 }]);
      void readFile(id, file);
    }
  }

  async function readFile(id: string, file: File) {
    try {
      if (file.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(file.name)) {
        const meta = await videoMeta(file);
        const facts: MediaFacts = {
          kind: "video",
          mime: file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4",
          width: meta.width,
          height: meta.height,
          sizeBytes: file.size,
          durationSec: meta.duration,
        };
        const errors = checkMedia(facts, postType).errors;
        if (errors.length) return update(id, { status: "error", facts, error: errors.join(" ") });
        return upload(id, file, facts);
      }
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
        return update(id, { status: "error", error: "Choose a photo or a video." });
      }
      const bitmap = await decodeImage(file);
      const facts: MediaFacts = { kind: "image", mime: "image/jpeg", width: bitmap.width, height: bitmap.height, sizeBytes: file.size };
      bitmap.close();
      update(id, { facts, original: file });
      const shapeErrors = checkMedia(facts, postType).errors.filter((e) => e.includes("allows"));
      if (shapeErrors.length) return update(id, { status: "needs-crop", error: shapeErrors[0] });
      // A JPEG that already fits goes up untouched, at full quality. Anything
      // else is converted, and scaled to Instagram's 1440 px maximum.
      const ready = file.type === "image/jpeg" && file.size <= LIMITS.image.maxBytes ? file : await toJpeg(file);
      return upload(id, ready, { ...facts, sizeBytes: ready.size, ...(await dims(ready)) });
    } catch (error) {
      update(id, { status: "error", error: (error as Error).message });
    }
  }

  async function crop(item: PickedMedia, ratio: number) {
    if (!item.original || !item.facts) return;
    update(item.id, { status: "reading", error: undefined });
    try {
      const cropped = await toJpeg(item.original, ratio);
      URL.revokeObjectURL(item.preview);
      const d = await dims(cropped);
      update(item.id, { preview: URL.createObjectURL(cropped) });
      await upload(item.id, cropped, { kind: "image", mime: "image/jpeg", sizeBytes: cropped.size, ...d });
    } catch (error) {
      update(item.id, { status: "error", error: (error as Error).message });
    }
  }

  async function forget(item: PickedMedia) {
    if (item.source === "file") URL.revokeObjectURL(item.preview);
    if (item.token) {
      await fetch("/api/uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: item.token }),
      }).catch(() => undefined);
    }
  }

  function remove(item: PickedMedia) {
    void forget(item);
    setItems((all) => all.filter((m) => m.id !== item.id));
  }

  function move(index: number, by: number) {
    setItems((all) => {
      const next = [...all];
      const [it] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, it);
      return next;
    });
  }

  function addLink() {
    const url = link.trim();
    if (!/^https:\/\/\S+$/i.test(url)) return;
    if (!many) {
      items.forEach((m) => void forget(m));
      setItems([{ id: newId(), name: url, source: "link", preview: url, status: "ready", progress: 1, url }]);
    } else if (items.length < LIMITS.carouselItems) {
      setItems((all) => [...all, { id: newId(), name: url, source: "link", preview: url, status: "ready", progress: 1, url }]);
    }
    setLink("");
  }

  // Re-check what's picked against the post type, which can change after.
  const measured = items.flatMap((m) => (m.facts && m.source === "file" ? [m.facts] : []));
  const postCheck = checkPost(
    items.map((m) => m.facts ?? { kind: "image", mime: "image/jpeg", width: 1, height: 1, sizeBytes: 0 }),
    postType,
  );
  const typeErrors = (m: PickedMedia) => (m.facts && m.status === "ready" ? checkMedia(m.facts, postType).errors : []);
  const warnings = (m: PickedMedia) => (m.facts ? checkMedia(m.facts, postType).warnings : []);

  const full = many ? items.length >= LIMITS.carouselItems : false;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!full) void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-[2.5px] border-dashed p-5 text-center transition-colors",
          dragging ? "border-[var(--accent)] bg-[var(--accent)]/8" : "border-[var(--border)] bg-[var(--bg-sunken)]",
        )}
      >
        <Upload className="h-5 w-5 text-[var(--text-muted)]" />
        <p className="text-[13px] font-bold">
          {postType === "IMAGE" ? "Drop a photo here" : postType === "CAROUSEL" ? "Drop up to 10 photos or videos here" : "Drop a video here"}
        </p>
        <p className="text-[11.5px] text-[var(--text-muted)]">
          {postType === "IMAGE"
            ? "Any photo works; it's converted to JPEG. Shape must be between 4:5 and 1.91:1."
            : postType === "CAROUSEL"
              ? "Photos and MP4/MOV videos, all ideally the same shape."
              : "MP4 or MOV, 3 seconds to 15 minutes, up to 300 MB. 9:16 fills the screen."}
        </p>
        <Button variant="secondary" size="sm" type="button" disabled={full} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" /> Choose from your device
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={many}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((m, i) => {
            const errs = [...(m.status === "error" && m.error ? [m.error] : []), ...typeErrors(m)];
            const warns = errs.length ? [] : warnings(m);
            return (
              <li key={m.id} className="flex gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] p-2.5">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-sunken)]">
                  {m.facts?.kind === "video" ? (
                    <video src={m.preview} muted className="h-full w-full object-cover" />
                  ) : m.source === "link" ? (
                    <div className="grid h-full w-full place-items-center text-[var(--text-faint)]">
                      <Link2 className="h-5 w-5" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.preview} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[12.5px] font-bold">
                      {m.facts?.kind === "video" && <Film className="mr-1 inline h-3.5 w-3.5" />}
                      {m.name}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {many && items.length > 1 && (
                        <>
                          <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 disabled:opacity-30">
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label="Move later" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded p-1 disabled:opacity-30">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button type="button" aria-label="Remove" onClick={() => remove(m)} className="rounded p-1 text-[var(--text-muted)]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11.5px] text-[var(--text-muted)]">
                    {m.source === "link"
                      ? "Linked file. We can't check it here; Instagram checks it when it publishes."
                      : m.facts
                        ? `${describeRatio(m.facts.width, m.facts.height)} · ${fileSize(m.facts.sizeBytes)}${
                            m.facts.durationSec ? ` · ${Math.round(m.facts.durationSec)}s` : ""
                          }`
                        : "Reading…"}
                  </p>
                  {m.status === "uploading" && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                      <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(m.progress * 100)}%` }} />
                    </div>
                  )}
                  {(m.status === "reading" || m.status === "uploading") && (
                    <p className="flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {m.status === "reading" ? "Checking…" : `Uploading ${Math.round(m.progress * 100)}%`}
                    </p>
                  )}
                  {m.status === "needs-crop" && m.facts && (
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-semibold text-[var(--color-zap-500)]">{m.error}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[nearestImageCrop(m.facts.width, m.facts.height), ...IMAGE_CROPS.filter((c) => c !== nearestImageCrop(m.facts!.width, m.facts!.height))].map((c) => (
                          <Button key={c.label} type="button" size="sm" variant={c === nearestImageCrop(m.facts!.width, m.facts!.height) ? "primary" : "secondary"} onClick={() => void crop(m, c.ratio)}>
                            <Crop className="h-3.5 w-3.5" /> Crop to {c.label}
                          </Button>
                        ))}
                      </div>
                      <p className="text-[11px] text-[var(--text-faint)]">Crops from the centre. Or edit it yourself and choose it again.</p>
                    </div>
                  )}
                  {errs.map((e) => (
                    <p key={e} className="text-[12px] font-semibold text-[var(--color-zap-500)]">
                      {e}
                    </p>
                  ))}
                  {warns.map((w) => (
                    <p key={w} className="text-[12px] text-[var(--color-zonk-500)]">
                      {w}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {measured.length === items.length && items.length > 0 && (
        <>
          {postCheck.errors.map((e) => (
            <p key={e} className="text-[12px] font-semibold text-[var(--color-zap-500)]">
              {e}
            </p>
          ))}
          {postCheck.warnings.map((w) => (
            <p key={w} className="text-[12px] text-[var(--color-zonk-500)]">
              {w}
            </p>
          ))}
        </>
      )}

      <details className="text-[12px] text-[var(--text-muted)]">
        <summary className="cursor-pointer font-semibold">Or paste a link to a file</summary>
        <div className="mt-2 flex gap-2">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/photo.jpg" className="font-mono text-[12px]" />
          <Button type="button" size="sm" variant="secondary" onClick={addLink} disabled={!/^https:\/\/\S+$/i.test(link.trim())}>
            Add
          </Button>
        </div>
        <p className="mt-1">It must be a public HTTPS link that opens without signing in.</p>
      </details>
    </div>
  );
}

/** Whether the picked files are ready to schedule, and if not, why not. */
export function pickerBlocker(items: PickedMedia[], postType: PostType): string | null {
  if (items.length === 0) return "Add a photo or video.";
  if (items.some((m) => m.status === "reading" || m.status === "uploading")) return "Wait for the upload to finish.";
  if (items.some((m) => m.status === "needs-crop")) return "Crop or remove the photo that doesn't fit.";
  if (items.some((m) => m.status === "error")) return "Remove the file that can't be used.";
  const facts = items.flatMap((m) => (m.facts ? [m.facts] : []));
  const fileErrors = facts.flatMap((f) => checkMedia(f, postType).errors);
  if (fileErrors.length) return fileErrors[0];
  if (facts.length === items.length) {
    const post = checkPost(facts, postType);
    if (post.errors.length) return post.errors[0];
  } else if (postType === "CAROUSEL" && items.length < 2) {
    return "A carousel needs at least two files.";
  }
  return null;
}

// --- Browser helpers ----------------------------------------------------------

function videoMeta(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      URL.revokeObjectURL(url);
      if (!result.width || !result.height || !Number.isFinite(result.duration)) {
        reject(new Error("Your browser couldn't read this video. Try exporting it as MP4 (H.264)."));
      } else resolve(result);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Your browser couldn't read this video. Try exporting it as MP4 (H.264)."));
    };
    video.src = url;
  });
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  try {
    // Applies the photo's EXIF rotation, so the shape is what people see.
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      /heic|heif/i.test(blob.type) || /heic|heif/i.test((blob as File).name ?? "")
        ? "This browser can't read HEIC photos. On iPhone, set Camera > Formats to Most Compatible, or export the photo as JPEG."
        : "That photo couldn't be read. Try saving it as a JPEG.",
    );
  }
}

async function dims(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await decodeImage(blob);
  const d = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return d;
}

/**
 * Re-encode as JPEG: optionally centre-cropped to `ratio`, scaled to at most
 * 1440 px wide (Instagram's maximum), and brought under 8 MB.
 */
async function toJpeg(blob: Blob, ratio?: number): Promise<Blob> {
  const bitmap = await decodeImage(blob);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (ratio) {
    if (sw / sh > ratio) {
      sw = Math.round(sh * ratio);
      sx = Math.round((bitmap.width - sw) / 2);
    } else {
      sh = Math.round(sw / ratio);
      sy = Math.round((bitmap.height - sh) / 2);
    }
  }
  const scale = Math.min(1, 1440 / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare this photo.");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.92, 0.85, 0.75, 0.6]) {
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (out && out.size <= LIMITS.image.maxBytes) return out;
  }
  throw new Error("This photo is too large even after compressing. Try a smaller one.");
}
