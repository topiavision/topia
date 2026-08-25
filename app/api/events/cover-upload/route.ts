import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';

/**
 * POST /api/events/cover-upload
 *
 * Multipart form upload for event cover media. Pushes the file to Vercel
 * Blob and returns the public URL — the client then stores that URL in
 * `events.image_url` instead of a base64 data URL.
 *
 * Why a separate route: Vercel serverless functions cap JSON request bodies
 * at ~4.5 MB. A 5 MB MP4 encoded as base64 (~7 MB) silently 413s. Multipart
 * uploads stream straight through without that limit, and the resulting
 * blob URL is range-requestable and CDN-cached — `<video preload="metadata">`
 * can paint the first frame after fetching just the moov atom.
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — set this in Vercel project settings.
 *
 * Constraints (mirrored on the client; double-checked here):
 *   - images: up to 8 MB
 *   - video:  up to 25 MB raw bytes (still cheap; CDN absorbs it)
 *   - gif:    up to 8 MB
 *   - allowed mime: image/jpeg|png|gif|webp, video/mp4|quicktime|webm
 */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN in your Vercel project.' },
        { status: 500 },
      );
    }

    const form = await request.formData();

    // Uploads write to shared blob storage — signed-in users only. Same
    // body-privyId bar as every other write route (identify, then act).
    const privyId = form.get('privyId');
    if (!privyId || typeof privyId !== 'string') {
      return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 });
    }
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 });
    }

    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const mime = file.type;
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: `Unsupported file type (${mime || 'unknown'})` }, { status: 400 });
    }

    const isVideo = mime.startsWith('video/');
    const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > cap) {
      return NextResponse.json(
        { error: `File too large — max ${Math.round(cap / 1024 / 1024)} MB.` },
        { status: 413 },
      );
    }

    // Generate a stable-ish path: event-covers/<timestamp>-<random>.<ext>
    const ext = (mime.split('/')[1] || 'bin').replace('quicktime', 'mov');
    const key = `event-covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const blob = await put(key, file, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false,
      // 1 year — covers are addressed by hashed key so they're effectively
      // immutable. Browsers can cache forever.
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      mime,
      size: file.size,
      isVideo,
    });
  } catch (error) {
    console.error('cover-upload error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
