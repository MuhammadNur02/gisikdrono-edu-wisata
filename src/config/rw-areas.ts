import { readRwAreaMap } from '@/lib/utils/rw-area-map';

import rawRwAreas from '../../public/map/gisikdrono-rw.geojson';

// The kelurahan's own "Peta RW Wilayah Gisikdrono 2024" (scripts/convert-rw-kml.ts) as the RW area map draws it,
// checked once when the module loads. /peta-kontak lists the RWs from it on the server; only the lazy map chunk
// (src/components/map/rw-area-leaflet.tsx) brings the shapes to the browser, never the page's first load.
export const RW_AREA_MAP = readRwAreaMap(rawRwAreas);
