'use client';

import { Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { PhotoFrame } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { galleryUiCopy } from '@/lib/copy/catalogue-ui';
import { cn } from '@/lib/utils/cn';
import { youtubeEmbedUrl, youtubeStillUrl, type YoutubeVideoId } from '@/lib/utils/youtube';
import type { PublicImage } from '@/types/media';

export interface VideoTileProps {
  youtubeId: YoutubeVideoId;
  alt: string;
  // The still a staff member uploaded; without one, YouTube's own.
  image: PublicImage | null;
}

// The player shares the video's 16:9 frame, so pressing play swaps one for the other without a jump.
const FRAME_CLASS = 'relative aspect-video overflow-hidden rounded-lg bg-night';
// The YouTube player needs its scripts, its own origin (allow-same-origin keeps it on youtube-nocookie.com,
// never ours), fullscreen and the link that opens the video on YouTube; nothing else, so the frame can neither
// navigate this page nor submit forms.
const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
const PLAYER_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';

function VideoStill({ youtubeId, alt, image }: VideoTileProps) {
  if (image) {
    return <PhotoFrame image={image} sizes={IMAGE_SIZES.thumb} aspectClassName="aspect-video" />;
  }
  // YouTube's still comes straight from i.ytimg.com (docs/Security.md §8.2); the 4:3 file letterboxes the
  // 16:9 picture, which the 16:9 crop removes.
  return (
    <Image
      src={youtubeStillUrl(youtubeId)}
      alt={alt}
      fill
      unoptimized
      sizes={IMAGE_SIZES.thumb}
      className="object-cover"
    />
  );
}

// Mounted only after the visitor presses play; it takes the focus the play button had.
function VideoPlayer({ youtubeId, alt }: Pick<VideoTileProps, 'youtubeId' | 'alt'>) {
  const playerRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    playerRef.current?.focus();
  }, []);
  return (
    <div className={FRAME_CLASS}>
      <iframe
        ref={playerRef}
        src={youtubeEmbedUrl(youtubeId)}
        title={alt}
        allow={PLAYER_ALLOW}
        sandbox={PLAYER_SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}

// docs/StyleGuide.md §5.11, decision of 2026-10-18: nothing from YouTube loads until the visitor presses
// play; then the privacy-enhanced player replaces the still.
export function VideoTile(props: VideoTileProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  if (isPlaying) return <VideoPlayer youtubeId={props.youtubeId} alt={props.alt} />;
  return (
    <button
      type="button"
      onClick={() => {
        setIsPlaying(true);
      }}
      aria-label={galleryUiCopy.playVideo(props.alt)}
      className={cn(
        FRAME_CLASS,
        'group block w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
      )}
    >
      <VideoStill {...props} />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-transform motion-safe:group-hover:scale-105 md:size-14">
          <Play aria-hidden className="ml-0.5 size-5 fill-current md:size-6" />
        </span>
      </span>
      <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-caption font-medium text-foreground">
        {galleryUiCopy.videoSource}
      </span>
    </button>
  );
}
