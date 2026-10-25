// The home page's fixed facts (DESIGN-SPEC §3.1).

// Gisikdrono dalam angka: the dances and the children's games the arts kampung (the RW that runs performances, RW 13
// Kampung Budaya & Seni) lists in its own profile (rw_units.description_md). The figures count these lists, so a
// figure and its label can never disagree; they show only while that RW is online.
export const ARTS_KAMPUNG_HERITAGE = {
  dances: ['Golek', 'Semarangan', 'Jatilan'],
  games: ['gobak sodor', 'egrang', 'bentik', 'dakon'],
} as const;

// The street the arts kampung lies on, from the same profile; the contact block names it.
export const ARTS_KAMPUNG_STREET = 'Jl. Jatisari';

// What the WhatsApp greeting asks about (DESIGN-SPEC §2.2): `Halo, saya ingin bertanya tentang kunjungan edukasi di
// Gisikdrono.`
export const VISIT_CHAT_TOPIC = 'kunjungan edukasi di Gisikdrono.';

// The figures of the forest band count up 120 ms apart (DESIGN-SPEC §4, Home figures).
export const FIGURE_STAGGER_MS = 120;

// A band of one figure says little about the place, so it shows from two (docs/StyleGuide.md §1.3 G5).
export const MIN_FIGURES_SHOWN = 2;
