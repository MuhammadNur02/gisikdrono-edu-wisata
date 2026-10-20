// The staff sign-in pages (/login, /forgot-password, /reset-password, /mfa/*), read through copy.auth in
// src/lib/copy/id.ts. No message here says whether an address belongs to an account (docs/Security.md AUTH-06).
export const authCopy = {
  validation: {
    email: 'Tulis alamat email yang benar, ya.',
    password: 'Tulis kata sandi Anda.',
    passwordTooLong: 'Kata sandi paling panjang 72 karakter.',
    newPassword:
      'Kata sandi minimal 12 karakter dan memuat huruf besar, huruf kecil, angka, serta simbol.',
    passwordMismatch: 'Kedua kata sandi belum sama.',
    totpCode: 'Tulis 6 angka dari aplikasi autentikator.',
    captcha: 'Tunggu verifikasi keamanan selesai, lalu coba lagi.',
  },
  turnstile: {
    label: 'Verifikasi keamanan',
    failed: 'Verifikasi keamanan tidak bisa dimuat. Muat ulang halaman, lalu coba lagi.',
    expired: 'Verifikasi keamanan kedaluwarsa dan sedang diulang. Tunggu sebentar, ya.',
  },
  layout: {
    staffOnly: 'Halaman ini khusus petugas kelurahan dan RW.',
  },
  signIn: {
    title: 'Masuk ke dasbor',
    description:
      'Khusus petugas kelurahan dan RW. Pengunjung tidak perlu akun untuk memesan kunjungan.',
    email: 'Email',
    password: 'Kata sandi',
    submit: 'Masuk',
    forgot: 'Lupa kata sandi?',
    // One message for a wrong address, a wrong password and a locked account alike.
    failed:
      'Email atau kata sandi tidak cocok. Setelah beberapa kali gagal, akun dikunci sementara selama 15 menit.',
    captchaFailed:
      'Verifikasi keamanan gagal. Tunggu sampai verifikasi selesai, lalu tekan Masuk lagi.',
    notices: {
      'password-changed': 'Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru.',
      'link-expired':
        'Tautan itu sudah tidak berlaku atau sudah dipakai. Minta tautan baru bila masih perlu.',
    },
  },
  forgot: {
    title: 'Lupa kata sandi',
    description: 'Tulis email akun petugas Anda. Kami kirim tautan untuk membuat kata sandi baru.',
    submit: 'Kirim tautan',
    sentTitle: 'Cek email Anda',
    sent: 'Kalau email itu milik akun petugas yang aktif, tautannya sudah kami kirim. Tautan itu berlaku 10 menit dan hanya bisa dipakai sekali.',
    back: 'Kembali ke halaman masuk',
  },
  reset: {
    title: 'Buat kata sandi baru',
    description:
      'Setelah tersimpan, Anda keluar dari semua perangkat, lalu masuk lagi dengan kata sandi baru.',
    password: 'Kata sandi baru',
    passwordHint: 'Minimal 12 karakter dengan huruf besar, huruf kecil, angka, dan simbol.',
    confirmPassword: 'Ulangi kata sandi baru',
    totpHint: 'Akun petugas memakai verifikasi dua langkah, jadi penggantian juga butuh kodenya.',
    submit: 'Simpan kata sandi',
    weak: 'Kata sandi ini terlalu mudah ditebak atau pernah bocor. Pilih kata sandi lain, ya.',
    same: 'Kata sandi baru harus berbeda dari yang lama.',
    // An account without an authenticator: the mailbox alone never sets a password (docs/Security.md R24).
    noFactorTitle: 'Kata sandi belum bisa diganti di sini',
    noFactorReason:
      'Akun ini belum memasang aplikasi autentikator, jadi tautan dari email saja tidak cukup untuk membuat kata sandi baru.',
    noFactor: 'Hubungi superadmin untuk memulihkan akun.',
  },
  mfa: {
    code: 'Kode autentikator',
    codeHint:
      'Buka aplikasi autentikator di ponsel Anda dan lihat kode untuk Edu Wisata Gisikdrono.',
    failed:
      'Kode tidak cocok atau sudah berganti. Tulis kode yang sedang tampil di aplikasi autentikator.',
    verifyTitle: 'Verifikasi dua langkah',
    verifyDescription: 'Satu langkah lagi: tulis 6 angka dari aplikasi autentikator Anda.',
    verifySubmit: 'Verifikasi',
    enrollTitle: 'Pasang verifikasi dua langkah',
    enrollDescription:
      'Akun petugas wajib memakai aplikasi autentikator, misalnya Google Authenticator atau Microsoft Authenticator. Siapkan aplikasinya di ponsel Anda dulu.',
    enrollStart: 'Tampilkan kode QR',
    enrollScan: 'Pindai kode QR ini dengan aplikasi autentikator, lalu tulis 6 angka yang muncul.',
    qrLabel: 'Kode QR untuk aplikasi autentikator',
    secretLabel: 'Tidak bisa memindai? Masukkan kunci ini secara manual:',
    enrollSubmit: 'Aktifkan',
    enrollExpired: 'Kode QR ini sudah tidak berlaku. Tampilkan kode QR baru, lalu coba lagi.',
    signOut: 'Keluar',
  },
  noAccess: {
    title: 'Akun ini belum punya akses',
    description:
      'Akun Anda belum aktif atau aksesnya sudah dicabut. Hubungi Superadmin Kelurahan bila ini keliru.',
  },
} as const;
