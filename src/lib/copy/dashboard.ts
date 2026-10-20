// The provisional dashboard shell of Task P2.8.03, read through copy.dashboard in src/lib/copy/id.ts.
export const dashboardCopy = {
  navLabel: 'Menu dasbor',
  openMenu: 'Buka menu dasbor',
  menuDescription: 'Semua halaman dasbor yang bisa Anda buka.',
  homeLink: 'Edu Wisata Gisikdrono, ke dasbor',
  kelurahan: 'Kelurahan',
  roles: {
    superadmin: 'Superadmin Kelurahan',
    adminRw: (rw: string) => `Admin ${rw}`,
  },
  rwSwitcher: {
    label: 'Tampilkan data',
    all: 'Semua',
  },
  home: {
    title: 'Dasbor',
    signedInAs: (role: string) => `Anda masuk sebagai ${role}.`,
    profileTitle: 'Profil Anda',
    profileDescription: 'Periksa nama yang tampil di dasbor dan pada catatan aktivitas.',
    profileLink: 'Buka profil',
  },
  profile: {
    title: 'Profil',
    description: 'Nama ini tampil di dasbor dan pada catatan aktivitas Anda.',
    fullName: 'Nama lengkap',
    email: 'Email',
    emailHint: 'Email dipakai untuk masuk dan hanya bisa diganti oleh Superadmin Kelurahan.',
    role: 'Peran',
    save: 'Simpan profil',
    saved: 'Profil tersimpan.',
  },
} as const;
