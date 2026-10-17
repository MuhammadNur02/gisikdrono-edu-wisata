import { serializeJsonLd, type JsonLdNode } from '@/lib/seo/json-ld';

export interface JsonLdProps {
  data: JsonLdNode | readonly JsonLdNode[];
}

// React writes a script's text as it is, so the serialised JSON reaches crawlers untouched; the `<` that
// could close the tag early is already escaped by serializeJsonLd. JSON-LD is data, so CSP never runs it.
export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json">{serializeJsonLd(data)}</script>;
}
