// What SVGR hands back for an imported .svg (next.config.ts): the drawing as a component, so the site plan is
// rendered inline and its paths can be highlighted (docs/StyleGuide.md §5.13). The import sits inside the
// block so this file stays an ambient declaration rather than an augmentation of a module that does not exist.
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';

  const SvgComponent: FC<SVGProps<SVGSVGElement>>;
  export default SvgComponent;
}
