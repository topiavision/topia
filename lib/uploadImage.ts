/**
 * Shared image-upload helpers.
 *
 * Most images on TOPIA are canvas-compressed to inline JPEG data URLs (cheap,
 * no network round-trip). That path FLATTENS animated GIFs to a single frame
 * and would also balloon a multi-MB GIF into an even larger base64 string.
 *
 * So GIFs take a different route: upload the raw file to Vercel Blob (via the
 * existing cover-upload endpoint) and store the returned public URL. Animation
 * survives, and the DB stores a short URL instead of a giant data URL. The
 * display side needs no changes — an `<img>` plays a GIF URL automatically.
 */

const UPLOAD_ENDPOINT = '/api/events/cover-upload';

export function isGif(file: File): boolean {
  return file.type === 'image/gif';
}

/** Upload a raw file to Vercel Blob; resolves to the public URL. The
 * caller's privyId is required — the upload route rejects anonymous
 * uploads (blob storage is not a public drop box). */
export async function uploadToBlob(file: File, privyId: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('privyId', privyId);
  const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: fd });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.url) throw new Error('Upload succeeded but no URL was returned');
  return data.url as string;
}

/**
 * Avatar pipeline: resize a non-GIF image to max 256×256 and upload it to Blob,
 * returning the public URL (GIFs are uploaded raw to keep animation). Avatars
 * used to be stored as inline base64 data URLs, which bloated every people-list
 * API response and the DB; Blob URLs are browser-cacheable and tiny to store.
 * Browser-only (canvas) — call from client components on a user action.
 */
export async function resizeAndUploadAvatar(file: File, privyId: string): Promise<string> {
  if (isGif(file)) return uploadToBlob(file, privyId);
  const blob = await resizeToJpeg(file, 256, 0.85);
  return uploadToBlob(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }), privyId);
}

/**
 * General image pipeline (world images, headers): resize a non-GIF to `max`
 * px on the long edge and upload to Blob, returning the public URL. Replaces
 * the old compressImage→data-URL path that bloated world rows with base64
 * (cleaned up once already by scripts/migrate-world-images-to-blob.mjs;
 * don't re-bloat).
 */
export async function resizeAndUploadImage(file: File, max: number, privyId: string): Promise<string> {
  if (isGif(file)) return uploadToBlob(file, privyId);
  const blob = await resizeToJpeg(file, max, 0.85);
  return uploadToBlob(new File([blob], 'image.jpg', { type: 'image/jpeg' }), privyId);
}

function resizeToJpeg(file: File, max: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(max / img.width, max / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}
