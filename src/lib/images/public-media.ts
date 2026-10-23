// The inlined literal, not publicEnv: the image loader and the article editor pull this file into the browser
// (Task P5.6.01).
import { PUBLIC_SUPABASE_URL } from '@/lib/public-literals';

// public-media is a public bucket, so a file has a plain URL anyone may fetch (0006_storage.sql). Pages use it
// where a full-size absolute address is needed, such as JSON-LD; on the page itself next/image goes through
// the resizing loader instead.
const OBJECT_PATH = '/storage/v1/object/public/public-media/';

export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function publicMediaUrl(path: string): string {
  return new URL(
    OBJECT_PATH + encodeStoragePath(path),
    PUBLIC_SUPABASE_URL,
  ).toString();
}

// The bucket path behind one of these URLs, or null for any other address: the article editor shows an image
// by its URL and reads a pasted one back to the path it stores (src/components/forms/rich-text-editor.tsx).
export function publicMediaPathOf(url: string): string | null {
  const prefix = new URL(OBJECT_PATH, PUBLIC_SUPABASE_URL).toString();
  if (!url.startsWith(prefix)) return null;
  try {
    return url.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}
