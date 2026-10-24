// What an imported .geojson is (next.config.ts parses it as JSON): unknown until readRwAreaMap
// (src/lib/utils/rw-area-map.ts) has checked its shape, so no cast stands in for that check.
declare module '*.geojson' {
  const value: unknown;
  export default value;
}
