// The words of the site's shell, kept apart from the full copy (src/lib/copy/id.ts) so that the client islands of
// every public page (header, menu, WhatsApp button, carousels) ship these few strings instead of the whole site's
// copy (first-load budget, docs/StyleGuide.md §10.1). copy.ui and copy.layout are these same objects.

// Labels the base components read out to screen readers and show on their own controls.
export const uiCopy = {
  close: 'Tutup',
  loading: 'Sedang diproses',
  previousSlide: 'Slide sebelumnya',
  nextSlide: 'Slide berikutnya',
  goToSlide: (slide: number, total: number) => `Slide ${String(slide)} dari ${String(total)}`,
  commandTitle: 'Cari menu',
  commandDescription: 'Ketik nama menu atau tindakan yang Anda cari.',
  commandPlaceholder: 'Cari menu atau tindakan...',
  commandEmpty: 'Tidak ada yang cocok.',
};

export const layoutCopy = {
  skipToContent: 'Lewati ke konten',
  mainNav: 'Navigasi utama',
  openMenu: 'Buka menu',
  menuTitle: 'Menu',
  menuDescription: 'Semua halaman Edu Wisata Gisikdrono.',
  breadcrumb: 'Lokasi halaman',
  footerNav: 'Navigasi bawah',
  // DESIGN-SPEC §2.8: what the platform is, in the footer's brand column.
  footerAbout:
    'Platform edu wisata digital Kelurahan Gisikdrono. Belajar langsung dari warga kampung, dipesan tanpa membuat akun.',
  footerEmail: 'Email',
  footerRights: (year: number) =>
    `© ${String(year)} Kelurahan Gisikdrono · Situs resmi edu wisata kelurahan`,
  footerRightsShort: (year: number) => `© ${String(year)} Kelurahan Gisikdrono`,
  paymentMethods: 'QRIS · Virtual Account · Midtrans',
  whatsAppChat: 'Chat WhatsApp',
  scrollCue: 'Gulir',
  // docs/StyleGuide.md §9.2: the fixed trust line, reused word for word wherever payment is mentioned.
  paymentTrust:
    'Pembayaran hanya melalui sistem (QRIS/VA); kelurahan tidak pernah meminta transfer ke rekening pribadi.',
  // The same promise where room is short: the menu drawer.
  paymentTrustShort: 'Pembayaran hanya melalui sistem (QRIS/VA), tidak pernah ke rekening pribadi.',
  whatsAppFab: 'Chat WhatsApp kelurahan',
  whatsAppGreeting: (pageTopic: string) => `Halo, saya ingin bertanya tentang ${pageTopic}`,
};
