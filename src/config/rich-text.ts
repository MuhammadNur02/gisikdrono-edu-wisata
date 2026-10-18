// docs/StyleGuide.md §3.3 and Task P2.9.03: what an article body may hold. The editor offers exactly this and
// the renderer draws exactly this; anything else in articles.body_json is dropped.
export const ARTICLE_HEADING_LEVELS = [2, 3, 4] as const;

export type ArticleHeadingLevel = (typeof ARTICLE_HEADING_LEVELS)[number];

export const ARTICLE_LINK_SCHEMES = ['https:', 'http:', 'mailto:'];

// Every link in an article leaves the site without vouching for the target or handing it this page.
export const ARTICLE_LINK_REL = 'noopener noreferrer nofollow';

// Lists inside quotes inside lists: deeper than this is not writing, so it is dropped.
export const ARTICLE_MAX_DEPTH = 8;

// A caption names where or what a photo shows (docs/StyleGuide.md §1.3 G8); the alt text's bound is enough.
export const ARTICLE_IMAGE_CAPTION_MAX_LENGTH = 200;
