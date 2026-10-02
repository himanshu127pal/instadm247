/**
 * What Instagram's Content Publishing API accepts, checked before a post is
 * scheduled rather than discovered when it fails at publish time.
 *
 * Shared by the browser (to warn while picking files) and the server (to
 * refuse a post that would fail). Numbers are from Meta's published media
 * specifications for the Instagram API (image, Reels and carousel); re-verify
 * them there before changing any. See docs/SCHEDULER.md.
 *
 * Errors block scheduling: Instagram would reject the post. Warnings don't:
 * Instagram accepts the file but will crop it or add bars.
 */

export type PostType = "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL";

export type MediaFacts = {
  kind: "image" | "video";
  /** The type we stored it as, e.g. image/jpeg, video/mp4. */
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
  /** Videos only. */
  durationSec?: number;
};

export type MediaCheck = { errors: string[]; warnings: string[] };

const MB = 1024 * 1024;

export const LIMITS = {
  image: {
    mimes: ["image/jpeg"],
    maxBytes: 8 * MB,
    /** Width ÷ height. 4:5 portrait up to 1.91:1 landscape. */
    minRatio: 4 / 5,
    maxRatio: 1.91,
  },
  reel: {
    mimes: ["video/mp4", "video/quicktime"],
    maxBytes: 300 * MB,
    minSec: 3,
    maxSec: 15 * 60,
    /** Instagram's hard bounds; anything inside is accepted. */
    minRatio: 0.01,
    maxRatio: 10,
    /** 9:16 fills the screen; other shapes get cropped or bars. */
    ideal: 9 / 16,
  },
  carouselVideo: { maxSec: 60 },
  carouselItems: 10,
} as const;

/** The allowed image shapes, for "crop to fit" choices. */
export const IMAGE_CROPS = [
  { label: "4:5 portrait", ratio: 4 / 5 },
  { label: "1:1 square", ratio: 1 },
  { label: "1.91:1 landscape", ratio: 1.91 },
] as const;

/** "1080 × 1350 (4:5)" style description of a shape, for messages. */
export function describeRatio(width: number, height: number): string {
  const ratio = width / height;
  const known: Array<[number, string]> = [
    [9 / 16, "9:16"], [4 / 5, "4:5"], [1, "1:1"], [16 / 9, "16:9"], [1.91, "1.91:1"], [3 / 4, "3:4"], [4 / 3, "4:3"], [2 / 3, "2:3"], [3 / 2, "3:2"],
  ];
  const match = known.find(([r]) => Math.abs(r - ratio) < 0.01);
  return `${width} × ${height} (${match ? match[1] : `${ratio.toFixed(2)}:1`})`;
}

/** The allowed crop nearest to a too-tall or too-wide image. */
export function nearestImageCrop(width: number, height: number): (typeof IMAGE_CROPS)[number] {
  const ratio = width / height;
  return ratio < LIMITS.image.minRatio ? IMAGE_CROPS[0] : IMAGE_CROPS[2];
}

const sizeText = (bytes: number) => `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;

/** Check one file against the post type it's going into. */
export function checkMedia(media: MediaFacts, postType: PostType): MediaCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shape = describeRatio(media.width, media.height);
  const ratio = media.width / media.height;

  if (media.kind === "image") {
    if (postType === "REELS" || postType === "VIDEO") {
      errors.push("A Reel or video post needs a video file, not an image.");
      return { errors, warnings };
    }
    if (!(LIMITS.image.mimes as readonly string[]).includes(media.mime)) {
      errors.push("Instagram only publishes JPEG images.");
    }
    if (media.sizeBytes > LIMITS.image.maxBytes) {
      errors.push(`Images can be up to 8 MB; this one is ${sizeText(media.sizeBytes)}.`);
    }
    if (ratio < LIMITS.image.minRatio - 0.005) {
      errors.push(`This image is ${shape}, taller than Instagram allows. Images must be between 4:5 (portrait) and 1.91:1 (landscape).`);
    } else if (ratio > LIMITS.image.maxRatio + 0.005) {
      errors.push(`This image is ${shape}, wider than Instagram allows. Images must be between 4:5 (portrait) and 1.91:1 (landscape).`);
    }
    return { errors, warnings };
  }

  // Video.
  if (postType === "IMAGE") {
    errors.push("An image post needs an image file. Choose Reel for a video.");
    return { errors, warnings };
  }
  if (!(LIMITS.reel.mimes as readonly string[]).includes(media.mime)) {
    errors.push("Instagram publishes MP4 or MOV videos.");
  }
  if (media.sizeBytes > LIMITS.reel.maxBytes) {
    errors.push(`Videos can be up to 300 MB; this one is ${sizeText(media.sizeBytes)}.`);
  }
  if (media.durationSec !== undefined) {
    const max = postType === "CAROUSEL" ? LIMITS.carouselVideo.maxSec : LIMITS.reel.maxSec;
    if (media.durationSec < LIMITS.reel.minSec) {
      errors.push(`Videos must be at least 3 seconds; this one is ${media.durationSec.toFixed(1)} seconds.`);
    } else if (media.durationSec > max) {
      const limit = postType === "CAROUSEL" ? "60 seconds in a carousel" : "15 minutes";
      errors.push(`Videos can be up to ${limit}; this one is ${Math.round(media.durationSec)} seconds.`);
    }
  }
  if (ratio < LIMITS.reel.minRatio || ratio > LIMITS.reel.maxRatio) {
    errors.push(`This video is ${shape}, outside the shapes Instagram accepts.`);
  } else if (postType === "CAROUSEL") {
    if (ratio < LIMITS.image.minRatio - 0.005 || ratio > LIMITS.image.maxRatio + 0.005) {
      warnings.push(`This video is ${shape}. In a carousel, Instagram crops it to the first slide's shape.`);
    }
  } else if (Math.abs(ratio - LIMITS.reel.ideal) > 0.02) {
    warnings.push(`This video is ${shape}. Reels fill the screen at 9:16 (e.g. 1080 × 1920); other shapes get cropped or bars.`);
  }
  return { errors, warnings };
}

/** Checks that span the whole post, not one file. */
export function checkPost(items: MediaFacts[], postType: PostType): MediaCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (items.length === 0) errors.push("Add a photo or video.");
  if (postType === "CAROUSEL") {
    if (items.length === 1) errors.push("A carousel needs at least two files.");
    if (items.length > LIMITS.carouselItems) errors.push("A carousel can have up to 10 files.");
    const first = items[0];
    if (first && items.some((m) => Math.abs(m.width / m.height - first.width / first.height) > 0.02)) {
      warnings.push("Your files aren't all the same shape. Instagram crops every slide to the first one's shape.");
    }
  } else if (items.length > 1) {
    errors.push("Only a carousel can have more than one file.");
  }
  return { errors, warnings };
}
