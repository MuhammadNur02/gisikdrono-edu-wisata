// The e-certificates (docs/PRD.md FR-POST-01, FR-POST-02, FR-ADMIN-07; Task P4.5.02, P4.5.03): the words on the PDF
// and on /dashboard/certificates.

const PAIR = 2;

// '<a>', '<a> dan <b>', '<a>, <b>, dan <c>': the RWs a visit went to, as a sentence names them.
export function joinIndonesian(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === PAIR) return `${names[0] ?? ''} dan ${names[1] ?? ''}`;
  return `${names.slice(0, -1).join(', ')}, dan ${names.at(-1) ?? ''}`;
}

export const certificatesCopy = {
  pdf: {
    title: 'Sertifikat',
    subtitle: 'Kunjungan Edu Wisata',
    fileTitle: (number: string) => `Sertifikat ${number}`,
    number: (number: string) => `Nomor: ${number}`,
    givenTo: 'Diberikan kepada',
    groupVisit: (rws: readonly string[], date: string) =>
      `atas kunjungan edukasinya ke ${joinIndonesian(rws)}, Kelurahan Gisikdrono, Kota Semarang, pada ${date}.`,
    participantVisit: (rws: readonly string[], date: string) =>
      `atas partisipasinya dalam kunjungan edukasi ke ${joinIndonesian(rws)}, Kelurahan Gisikdrono, Kota Semarang, pada ${date}.`,
    placeAndDate: (date: string) => `Semarang, ${date}`,
    verify: 'Periksa keaslian sertifikat ini dengan memindai kode QR atau membuka',
  },
  dashboard: {
    title: 'Sertifikat',
    description:
      'Sertifikat terbit otomatis setelah semua tiket sebuah reservasi di-check-in. Di sini Anda menerbitkan ulang, mengunduh, dan mencabut sertifikat.',
    noun: 'reservasi',
    search: 'Cari nama instansi…',
    empty: 'Belum ada sertifikat',
    emptyHint:
      'Sertifikat muncul di sini begitu rombongan selesai check-in di semua RW yang dikunjungi.',
    facets: { status: 'Status sertifikat', rw: 'RW' },
    columns: {
      recipient: 'Rombongan',
      visitDate: 'Tanggal kunjungan',
      rws: 'RW',
      participants: 'Peserta',
      status: 'Status',
    },
    bookingCode: (code: string) => `Kode ${code}`,
    noInstitution: 'Pengunjung perorangan',
    participantCount: (issued: number, total: number) =>
      total === issued
        ? `${String(total)} sertifikat`
        : `${String(issued)} dari ${String(total)} berlaku`,
    noParticipants: 'Tanpa daftar peserta',
    held: 'Tertahan',
    heldHint: (unpaid: number) =>
      `Tertahan karena ${String(unpaid)} orang hadir melebihi jumlah yang dibayar. Superadmin dapat melepasnya dengan alasan.`,
    heldHintNoCount:
      'Tertahan karena ada orang yang hadir melebihi jumlah yang dibayar. Superadmin dapat melepasnya dengan alasan.',
    open: 'Lihat sertifikat',
    dialogDescription:
      'Nama peserta hanya tercetak di PDF. Unduhan sertifikat peserta dicatat sebagai pembukaan data pribadi.',
    group: 'Sertifikat rombongan',
    participants: 'Sertifikat peserta',
    participantNumber: (position: number) => `Peserta ${String(position)}`,
    download: 'Unduh PDF',
    downloadLabel: (number: string) => `Unduh PDF sertifikat ${number}`,
    notDownloadable: 'Belum bisa diunduh',
    issue: 'Terbitkan ulang',
    issueHint:
      'Menerbitkan sertifikat yang belum ada, misalnya setelah check-in dibatalkan lalu diulang. Sertifikat yang sudah ada tidak berubah.',
    issued: 'Sertifikat yang belum ada sudah diterbitkan.',
    rerender: 'Render ulang PDF',
    rerenderHint:
      'Membuat ulang berkas PDF yang sudah tersimpan, misalnya setelah nama atau jabatan penanda tangan diubah di Pengaturan.',
    rerendered: 'Berkas PDF sertifikat sudah dibuat ulang.',
    waive: 'Lepas penahanan',
    waiveTitle: 'Lepas sertifikat yang tertahan',
    waiveDescription:
      'Sertifikat dilepas meskipun ada orang yang hadir tanpa membayar. Alasan Anda tercatat di log audit.',
    waived: 'Sertifikat yang tertahan sudah dilepas.',
    revoke: 'Cabut',
    revokeTitle: (number: string) => `Cabut sertifikat ${number}`,
    revokeDescription:
      'Sertifikat yang dicabut tidak bisa diunduh lagi dan halaman verifikasinya menampilkan status Dicabut. Langkah ini tidak bisa dibatalkan.',
    revoked: 'Sertifikat dicabut.',
    reason: 'Alasan',
    reasonHint: 'Tiga sampai 300 karakter, tanpa nama peserta.',
    superadminOnly: 'Hanya superadmin yang dapat mencabut sertifikat atau melepas penahanan.',
  },
} as const;
