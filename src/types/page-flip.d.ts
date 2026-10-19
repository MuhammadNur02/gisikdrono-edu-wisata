// page-flip 2.0.7 ships JavaScript without declarations. This types the part the flipbook uses
// (src/components/booklet/flipbook-viewer.tsx), copied from the library's own TypeScript source.
declare module 'page-flip' {
  export type FlipOrientation = 'portrait' | 'landscape';

  export interface FlipSetting {
    startPage: number;
    size: 'fixed' | 'stretch';
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    drawShadow: boolean;
    flippingTime: number;
    usePortrait: boolean;
    autoSize: boolean;
    maxShadowOpacity: number;
    showCover: boolean;
    mobileScrollSupport: boolean;
    clickEventForward: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
  }

  export interface FlipEvent<Data> {
    data: Data;
  }

  export class PageFlip {
    constructor(element: HTMLElement, setting: Partial<FlipSetting>);
    loadFromHTML(items: HTMLElement[]): void;
    flipNext(corner?: 'top' | 'bottom'): void;
    flipPrev(corner?: 'top' | 'bottom'): void;
    turnToPage(page: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): FlipOrientation;
    on(event: 'flip', callback: (event: FlipEvent<number>) => void): this;
    on(event: 'changeOrientation', callback: (event: FlipEvent<FlipOrientation>) => void): this;
    on(
      event: 'init',
      callback: (event: FlipEvent<{ page: number; mode: FlipOrientation }>) => void,
    ): this;
    // Removes the book's own elements and every listener it put on the window.
    destroy(): void;
  }
}
