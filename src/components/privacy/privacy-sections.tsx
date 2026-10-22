import type { ReactNode } from 'react';

import { YOUTUBE_PLAYER_HOST, YOUTUBE_STILL_HOST } from '@/config/gallery';
import { GOOGLE_MAPS_HOST, OSM_TILE_HOST } from '@/config/map';
import {
  BACKUP_RETENTION_DAYS,
  BREACH_NOTICE_HOURS,
  DSR_ACKNOWLEDGE_WORKING_DAYS,
  DSR_FULFIL_DAYS,
  PRIVACY_DATA_INVENTORY,
  PRIVACY_NOT_COLLECTED,
  PRIVACY_PROCESSORS,
  type PrivacyDataRow,
} from '@/config/privacy';

export function NoticeSection({
  id,
  title,
  lang,
  children,
}: {
  id: string;
  title: string;
  // Only the English summary sets it, so screen readers switch voice (CLAUDE.md §12.1 no. 18).
  lang?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} lang={lang} aria-labelledby={`${id}-judul`} className="space-y-4">
      <h2 id={`${id}-judul`} className="text-h3">
        {title}
      </h2>
      <div className="space-y-4 text-body text-pretty">{children}</div>
    </section>
  );
}

function DataRowCard({ row }: { row: PrivacyDataRow }) {
  const facts: [string, string][] = [
    ['Milik', row.subject],
    ['Untuk', row.purpose],
    ['Dasar', row.basis],
    ['Disimpan', row.retention],
  ];
  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5 dark:border-white/5">
      <p className="font-medium">{row.data}</p>
      <dl className="space-y-1 text-body-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function DataInventory() {
  return (
    <NoticeSection id="data" title="Data yang kami simpan dan berapa lama">
      <ul className="space-y-3">
        {PRIVACY_DATA_INVENTORY.map((row) => (
          <DataRowCard key={row.data} row={row} />
        ))}
      </ul>
      <p>
        Cadangan basis data harian disimpan {BACKUP_RETENTION_DAYS} hari. Data yang sudah dihapus
        atau dianonimkan masih bisa ada di cadangan sampai masa itu habis.
      </p>
    </NoticeSection>
  );
}

export function NotCollected() {
  return (
    <NoticeSection id="tidak-dikumpulkan" title="Data yang tidak kami minta">
      <ul className="list-disc space-y-1 pl-5">
        {PRIVACY_NOT_COLLECTED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </NoticeSection>
  );
}

export function ChildrenData() {
  return (
    <NoticeSection id="anak" title="Data anak-anak">
      <p>
        Daftar peserta tidak wajib. Kalau diisi, isinya hanya nama dan kelas, dikirim oleh lembaga
        yang bertanggung jawab atas rombongan setelah menyatakan sudah memperoleh persetujuan orang
        tua atau wali. Nama peserta tidak pernah tampil di halaman publik dan dihapus 90 hari
        setelah kunjungan, bersama sertifikat peserta. Sertifikat hanya bisa diambil selama 90 hari
        itu.
      </p>
    </NoticeSection>
  );
}

export function Processors() {
  return (
    <NoticeSection id="pemroses" title="Pihak yang memproses data untuk kami">
      <ul className="space-y-2">
        {PRIVACY_PROCESSORS.map((processor) => (
          <li key={processor.name}>
            <span className="font-medium">{processor.name}</span>: {processor.role} (
            {processor.location})
          </li>
        ))}
      </ul>
      <p>
        Sebagian pemroses berada di luar Indonesia, sehingga data Anda dikirim ke luar negeri dengan
        perjanjian pemrosesan data dan pengamanan kontraktual.
      </p>
    </NoticeSection>
  );
}

// docs/Security.md §7.6 and §8.2 (decision of 2026-10-18): YouTube is a third party, not one of our
// processors, and Google sees the visitor's IP address at the two moments the gallery reaches it.
export function YoutubeThirdParty() {
  return (
    <NoticeSection id="pihak-ketiga" title="Pihak ketiga: video YouTube">
      <p>
        Video di galeri berasal dari YouTube milik Google, pihak ketiga di luar pemroses data kami.
        Google menerima alamat IP Anda pada dua saat:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          saat galeri dibuka, bila petugas belum mengunggah gambar sampul sendiri untuk sebuah
          video: gambar sampulnya dimuat dari {YOUTUBE_STILL_HOST};
        </li>
        <li>saat Anda menekan tombol putar: videonya diputar lewat {YOUTUBE_PLAYER_HOST}.</li>
      </ul>
      <p>Sebelum Anda menekan tombol putar, pemutar YouTube tidak dimuat.</p>
    </NoticeSection>
  );
}

// The maps of /peta-kontak (docs/PRD.md FR-PUB-18): the OpenStreetMap tiles load with the page, the Google Maps
// frame only when the visitor asks for it (click-to-load, as the YouTube player).
export function MapsThirdParty() {
  return (
    <NoticeSection id="pihak-ketiga-peta" title="Pihak ketiga: peta">
      <p>Halaman Peta &amp; kontak dan beranda memuat peta dari dua pihak ketiga:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          saat halaman Peta &amp; kontak dibuka, gambar petanya dimuat dari {OSM_TILE_HOST} milik
          OpenStreetMap Foundation, yang menerima alamat IP Anda;
        </li>
        <li>
          saat Anda menekan tombol Tampilkan Google Maps: peta Google dimuat dari {GOOGLE_MAPS_HOST},
          dan Google menerima alamat IP Anda. Sebelum tombol ditekan, peta Google tidak dimuat.
        </li>
      </ul>
      <p>Denah kampung di beranda digambar sendiri dan tidak memuat apa pun dari pihak ketiga.</p>
    </NoticeSection>
  );
}

export function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="text-primary-text underline-offset-4 hover:underline">
      {email}
    </a>
  );
}

// Until the form /privasi/permintaan exists (Task P3.12.03, go-live check #23), a request goes by email to the
// Pejabat Pelindungan Data. The booking code alone proves nothing (docs/Security.md GUEST-10), so the officer
// confirms through the contact on file before acting. Without a real address yet the sentence names the officer
// only; go-live check #19 holds the launch until the address is set.
export function Rights({ dpoEmail }: { dpoEmail: string | null }) {
  return (
    <NoticeSection id="hak" title="Hak Anda">
      <p>
        Lewat tautan kelola pemesanan yang dikirim ke WhatsApp, Anda bisa melihat data pemesanan,
        membetulkan nama peserta, menghapus daftar peserta, dan menarik persetujuan pemasaran.
      </p>
      <p>
        Untuk permintaan lain atas data pribadi Anda, kirim email ke Pejabat Pelindungan Data
        {dpoEmail ? (
          <>
            {' '}
            di <EmailLink email={dpoEmail} />
          </>
        ) : null}{' '}
        dengan menyebutkan kode pemesanan dan apa yang Anda minta. Sebelum menjalankannya, kami
        memastikan permintaan itu benar dari Anda lewat nomor WhatsApp atau email yang tercatat pada
        pemesanan; kode pemesanan saja tidak cukup.
      </p>
      <p>
        Permintaan dijawab dalam {DSR_ACKNOWLEDGE_WORKING_DAYS} hari kerja dan diselesaikan dalam{' '}
        {DSR_FULFIL_DAYS} hari. Data keuangan wajib disimpan 10 tahun, jadi permintaan hapus untuk
        data itu dijalankan dengan menganonimkannya.
      </p>
    </NoticeSection>
  );
}

export function Breach() {
  return (
    <NoticeSection id="kebocoran" title="Jika terjadi kebocoran data">
      <p>
        Kami memberi tahu Anda dan otoritas pelindungan data paling lambat {BREACH_NOTICE_HOURS} jam
        (3 × 24 jam) setelah kebocoran diketahui, dengan jenis data, waktu, penyebab, langkah
        penanganan, dan kontak yang bisa dihubungi.
      </p>
    </NoticeSection>
  );
}
