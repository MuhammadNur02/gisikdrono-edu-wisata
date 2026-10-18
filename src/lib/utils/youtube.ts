import { YOUTUBE_EMBED_ORIGIN, YOUTUBE_STILL_ORIGIN } from '@/config/gallery';

// galleries.video_url passed the column CHECK `^https://(www\.)?youtube\.com/`, but the CHECK says nothing
// about the rest of the address. Only the 11-character video id is taken from it, and the player and still
// addresses are built from that id alone, so no stored URL ever reaches an iframe or img (decision of
// 2026-10-18).

declare const youtubeVideoIdBrand: unique symbol;
export type YoutubeVideoId = string & { readonly [youtubeVideoIdBrand]: true };

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com']);
// youtube.com/embed/<id>, /shorts/<id>, /live/<id> and the old /v/<id>.
const ID_PATH_PATTERN = /^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/;

function isVideoId(candidate: string): candidate is YoutubeVideoId {
  return VIDEO_ID_PATTERN.test(candidate);
}

function asVideoId(candidate: string | null | undefined): YoutubeVideoId | null {
  return candidate && isVideoId(candidate) ? candidate : null;
}

function parseYoutubeUrl(videoUrl: string): URL | null {
  if (!URL.canParse(videoUrl)) return null;
  const url = new URL(videoUrl);
  const isPlainYoutube =
    url.protocol === 'https:' &&
    YOUTUBE_HOSTS.has(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '';
  return isPlainYoutube ? url : null;
}

export function youtubeVideoId(videoUrl: string | null): YoutubeVideoId | null {
  if (videoUrl === null) return null;
  const url = parseYoutubeUrl(videoUrl);
  if (!url) return null;
  if (url.pathname === '/watch') return asVideoId(url.searchParams.get('v'));
  return asVideoId(ID_PATH_PATTERN.exec(url.pathname)?.[1]);
}

// Pressing play is what loads the player, so it starts at once; `rel=0` keeps the end screen to the same
// channel instead of other people's videos.
export function youtubeEmbedUrl(videoId: YoutubeVideoId): string {
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?autoplay=1&rel=0`;
}

export function youtubeStillUrl(videoId: YoutubeVideoId): string {
  return `${YOUTUBE_STILL_ORIGIN}/vi/${videoId}/hqdefault.jpg`;
}
