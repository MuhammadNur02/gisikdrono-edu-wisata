import { publicEnv } from '@/lib/public-env';

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
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  ).toString();
}
