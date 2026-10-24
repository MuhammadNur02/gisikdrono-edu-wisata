import { describe, expect, it } from 'vitest';

import {
  convertRwKml,
  parseCoordinates,
  RW_AREA_SOURCE,
  rwNumberOf,
  serializeCollection,
} from './convert-rw-kml.ts';

// A tiny export in the shape Google My Maps writes: an office layer, the boundary layer that also holds the RWs
// (one RW split over two placemarks, one as a MultiGeometry, one with a hole), and a hazard layer that is left out.
const FIXTURE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Peta RW Uji</name>
    <Folder>
      <name>Kantor Kelurahan</name>
      <Placemark>
        <name>Kantor Kelurahan Gisikdrono</name>
        <description><![CDATA[Alamat contoh]]></description>
        <Point><coordinates>
            110.38972051,-6.98768649,0
        </coordinates></Point>
      </Placemark>
    </Folder>
    <Folder>
      <name>Garis Batas Wilayah</name>
      <Placemark>
        <name>Batas Wilayah</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          110.380,-6.990,0 110.400,-6.990,0 110.400,-6.970,0 110.380,-6.970,0 110.380,-6.990,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
      <Placemark>
        <name>RW.05</name>
        <description><![CDATA[RW.05<br>Jumlah Warga : 10 Orang]]></description>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          110.380,-6.990,0 110.385,-6.9900000001,0 110.390,-6.990,0 110.390,-6.980,0 110.380,-6.980,0 110.380,-6.990,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
      <Placemark>
        <name>RW05</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          110.391,-6.990,0 110.392,-6.990,0 110.392,-6.989,0 110.391,-6.990,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
      <Placemark>
        <name>RW.12</name>
        <MultiGeometry>
          <Polygon><outerBoundaryIs><LinearRing><coordinates>
            110.390,-6.980,0 110.400,-6.980,0 110.400,-6.970,0 110.390,-6.980,0
          </coordinates></LinearRing></outerBoundaryIs></Polygon>
          <Polygon><outerBoundaryIs><LinearRing><coordinates>
            110.395,-6.990,0 110.399,-6.990,0 110.399,-6.985,0 110.395,-6.990,0
          </coordinates></LinearRing></outerBoundaryIs></Polygon>
        </MultiGeometry>
      </Placemark>
      <Placemark>
        <name>RW.01</name>
        <Polygon>
          <outerBoundaryIs><LinearRing><coordinates>
            110.380,-6.980,0 110.390,-6.980,0 110.390,-6.970,0 110.380,-6.970,0 110.380,-6.980,0
          </coordinates></LinearRing></outerBoundaryIs>
          <innerBoundaryIs><LinearRing><coordinates>
            110.384,-6.976,0 110.386,-6.976,0 110.386,-6.974,0 110.384,-6.974,0 110.384,-6.976,0
          </coordinates></LinearRing></innerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
    <Folder>
      <name>Rawan Bencana</name>
      <Placemark>
        <name>RW.02</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          110.381,-6.981,0 110.382,-6.981,0 110.382,-6.982,0 110.381,-6.981,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

function rwFeature(collection, rw) {
  return collection.features.find(
    (feature) => feature.properties.kind === 'rw' && feature.properties.rw === rw,
  );
}

describe('rwNumberOf', () => {
  it('reads RW.05, RW05 and RW 5, and nothing else', () => {
    expect(rwNumberOf('RW.05')).toBe(5);
    expect(rwNumberOf('RW05')).toBe(5);
    expect(rwNumberOf('rw 13')).toBe(13);
    expect(rwNumberOf('Batas Wilayah')).toBeNull();
    expect(rwNumberOf('RW.00')).toBeNull();
    expect(rwNumberOf('RW.05 banjir')).toBeNull();
  });
});

describe('parseCoordinates', () => {
  it('rounds to six decimals and drops the altitude', () => {
    expect(parseCoordinates(' 110.38972051,-6.98768649,0\n 110.1,-6.2 ')).toEqual([
      [110.389721, -6.987686],
      [110.1, -6.2],
    ]);
  });

  it('refuses a broken tuple', () => {
    expect(() => parseCoordinates('110.1')).toThrow(/not a KML coordinate/);
  });
});

describe('convertRwKml', () => {
  const collection = convertRwKml(FIXTURE_KML);

  it('names its source', () => {
    expect(collection).toMatchObject({ type: 'FeatureCollection', ...RW_AREA_SOURCE });
  });

  it('writes the boundary first, then the RWs by number, then the office', () => {
    expect(collection.features.map((feature) => feature.properties)).toEqual([
      { kind: 'boundary', name: 'Batas Wilayah Kelurahan Gisikdrono' },
      { kind: 'rw', rw: 1, name: 'RW 01' },
      { kind: 'rw', rw: 5, name: 'RW 05' },
      { kind: 'rw', rw: 12, name: 'RW 12' },
      { kind: 'office', name: 'Kantor Kelurahan Gisikdrono' },
    ]);
  });

  it('leaves the Rawan Bencana layer out', () => {
    expect(rwFeature(collection, 2)).toBeUndefined();
  });

  it('merges the placemarks of one RW and the parts of a MultiGeometry', () => {
    expect(rwFeature(collection, 5)?.geometry.coordinates).toHaveLength(2);
    expect(rwFeature(collection, 12)?.geometry.coordinates).toHaveLength(2);
  });

  it('keeps a hole', () => {
    expect(rwFeature(collection, 1)?.geometry.coordinates[0]).toHaveLength(2);
  });

  it('drops a position on a straight edge and keeps the corners', () => {
    expect(rwFeature(collection, 5)?.geometry.coordinates[0]?.[0]).toEqual([
      [110.38, -6.99],
      [110.39, -6.99],
      [110.39, -6.98],
      [110.38, -6.98],
      [110.38, -6.99],
    ]);
  });

  it('keeps the office point, rounded', () => {
    expect(collection.features.at(-1)?.geometry).toEqual({
      type: 'Point',
      coordinates: [110.389721, -6.987686],
    });
  });

  it('refuses an export without RWs, boundary or office', () => {
    expect(() => convertRwKml('<kml></kml>')).toThrow(/no RW polygon/);
    const withoutOffice = FIXTURE_KML.replace(/<Point>[\s\S]*?<\/Point>/, '');
    expect(() => convertRwKml(withoutOffice)).toThrow(/Kantor Kelurahan/);
    const withoutBoundary = FIXTURE_KML.replace('<name>Batas Wilayah</name>', '<name>Lain</name>');
    expect(() => convertRwKml(withoutBoundary)).toThrow(/Batas Wilayah/);
  });
});

describe('serializeCollection', () => {
  it('writes valid JSON with one feature per line', () => {
    const collection = convertRwKml(FIXTURE_KML);
    const text = serializeCollection(collection);
    expect(JSON.parse(text)).toEqual(collection);
    expect(text.split('\n').filter((line) => line.startsWith('{"type":"Feature"'))).toHaveLength(5);
  });
});
