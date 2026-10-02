# Scheduler: uploads and media checks

The Scheduler publishes posts through Instagram's Content Publishing API
(`instagram_business_content_publish`). That API never receives a file: it
takes a **public URL** and Instagram's servers fetch the media from it. Most
creators don't have a place to host a file, so we host it for them.

## Flow

1. **Browser** (`src/components/dashboard/media-picker.tsx`). The customer
   drops files or picks them from their device. Each file is measured in the
   browser and checked against `src/lib/media/rules.ts` before upload:
   - photos are decoded with their EXIF rotation applied, so the shape checked
     is the shape people see. Anything that isn't already a JPEG under 8 MB is
     re-encoded to JPEG (scaled to at most 1440 px wide, transparency on
     white). A photo outside 4:5 to 1.91:1 isn't uploaded until the customer
     crops it (centre crop to 4:5, 1:1 or 1.91:1) or removes it;
   - videos are read with a `<video>` element for width, height and length.
     Videos are never re-encoded.
2. **Upload** (`POST /api/uploads`). The raw file is the request body, not
   multipart, so it streams to disk without being held in memory. Videos pass
   `?w=&h=&d=` from step 1. `src/lib/media/store.ts`:
   - decides the type from the file's first bytes (JPEG, or an MP4/MOV
     `ftyp` box), never from the name or `Content-Type`. Nothing else is
     kept, so nothing served back can run as a page;
   - stops reading the moment the file passes 8 MB (photo) or 300 MB (video),
     or the workspace's 2 GB quota of unpublished files;
   - reads a JPEG's width and height from its frame header (honouring EXIF
     orientation). A video's numbers come from the browser, because checking
     them server-side would need a video decoder;
   - stores the file under a random 32-character token in `UPLOAD_DIR` and a
     `MediaUpload` row.
3. **Schedule** (`POST /api/scheduler`). Media URLs that are ours are matched
   to the workspace's own uploads (another workspace's token is "no longer
   available"), and `checkMedia` / `checkPost` run again on the stored facts.
   A post Instagram would reject is refused here with the reason, not at
   publish time. Uploads are linked to the post.
4. **Serve** (`GET /m/<token>.<ext>`). Public, because Instagram fetches with
   no credentials; the token is what keeps it unguessable. Range requests are
   supported. `noindex`, `nosniff`, and `/m/` is disallowed in `robots.txt`.
   The extension must match the stored type, and is there because the
   publisher guesses a carousel child's type from it.
5. **Sweep** (`purge_uploads`, daily at 05:15 by the worker). Deletes the file
   and row for: uploads never put in a post after 24 hours; posts published or
   cancelled more than 7 days ago; failed posts after 30 days (they can be
   retried until then).

Pasting a link is still possible ("Or paste a link to a file"). Those can't be
measured, so they're checked only by Instagram at publish time.

## The rules

`src/lib/media/rules.ts` is the one copy, shared by browser and server.
**Errors** block scheduling because Instagram would reject the post.
**Warnings** don't: Instagram accepts the file but crops it or adds bars.

| | Rule | Kind |
|---|---|---|
| Photo | JPEG only (others are converted in the browser) | error |
| Photo | Up to 8 MB | error |
| Photo | Width ÷ height between 0.8 (4:5) and 1.91 (1.91:1) | error, with crop buttons |
| Video | MP4 or MOV, up to 300 MB | error |
| Video | 3 seconds to 15 minutes (60 seconds inside a carousel) | error |
| Video | Width ÷ height between 0.01 and 10 | error |
| Reel / video | Not 9:16 | warning |
| Carousel | 2 to 10 files | error |
| Carousel | Files not all the same shape (Instagram crops to the first) | warning |
| Any | Photo in a Reel/video post, video in an Image post, several files outside a carousel | error |

These numbers are from Meta's published media specifications for the
Instagram API. **Re-check them against Meta's current docs before changing
them**; they were encoded from the published specs, not measured.

## Operations

- `UPLOAD_DIR` (default `storage/uploads`, relative to the working directory)
  must be writable by the web process and readable by the worker (the sweep
  deletes from it). Both run as the same user in `docs/DEPLOY.md`.
- It's scratch space, not data: files live days, and losing the directory only
  fails posts that haven't published yet. It doesn't need backing up.
- A reverse proxy in front must allow 300 MB request bodies. Caddy's default
  has no limit; nginx needs `client_max_body_size 300m;`.
- `APP_URL` must be the public HTTPS origin: it's the start of every media URL
  handed to Instagram.
