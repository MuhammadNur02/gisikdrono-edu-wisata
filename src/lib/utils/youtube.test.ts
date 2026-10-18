import { describe, expect, it } from 'vitest';

import { youtubeEmbedUrl, youtubeStillUrl, youtubeVideoId } from '@/lib/utils/youtube';

const ID = 'aqz-KE-bpKQ';

describe('youtubeVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}/`,
    `https://www.youtube.com/v/${ID}`,
  ])('reads the id from %s', (url) => {
    expect(youtubeVideoId(url)).toBe(ID);
  });

  it.each([
    null,
    'not a url',
    `http://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtube.com.example.org/watch?v=${ID}`,
    `https://user:pass@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    `https://www.youtube.com/watch?v=${ID}"><script>`,
    `https://www.youtube.com/embed/${ID}/extra`,
    'https://www.youtube.com/channel/UCabcdefghijk',
    'https://www.youtube.com/',
  ])('refuses %s', (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});

describe('the addresses built from an id', () => {
  it('plays from the privacy-enhanced domain and shows the still from i.ytimg.com', () => {
    const videoId = youtubeVideoId(`https://www.youtube.com/watch?v=${ID}`);
    if (videoId === null) throw new Error('the id should parse');
    expect(youtubeEmbedUrl(videoId)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`,
    );
    expect(youtubeStillUrl(videoId)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
