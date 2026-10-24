# Content from the official site of Kelurahan Gisikdrono

| Field | Value |
|---|---|
| Document | `docs/content/konten-situs-kelurahan.md` |
| Status | **Belum dikonfirmasi kelurahan.** Every fact below is retold in our own words from the kelurahan's site and waits for the kelurahan's check before it is published on staging or production |
| Source | https://gisikdrono.semarangkota.go.id, pages `/zero-wastreme`, `/seni-budaya`, `/potensi` (tabs RW 05, RW 08 and RW 13) and `/umkm` |
| Read | 21 October 2026 (first reading) and 22 October 2026 (photos, directory and this document) |
| Permission | Received through the user on 21 October 2026: UMKM products may be taken from `/umkm` with their photos and addresses, and photos from the official site, since the kelurahan holds no originals (section 4 of the working notes the user keeps beside the photos) |
| Used by | `pnpm db:seed` on the local stack: the RW profiles and activity points in `scripts/seed-demo-content.sql`, the photos through `pnpm db:seed --official-media <folder>` (`scripts/official-media.ts`). The Free-plan staging project gets the same file, without photos, through the `seed_demo` input of `.github/workflows/staging-db.yml` (decision of 2026-10-23, so the kelurahan can follow progress on a site with content). Production gets its content through the CMS once the kelurahan has checked it |
| Companion | `docs/Task.md` P2.10.04, `docs/StyleGuide.md` §1.3 and §6.9 |

The Indonesian text below is what the site would say. Section 7 lists what the kelurahan still has to give, and section 6 lists the demo rows that are **not** the kelurahan's data.

Rules this content keeps (decisions of 2026-10-22):

- No invented price, capacity, schedule or number. What the source does not say stays out; a public section without data is hidden whole (`docs/StyleGuide.md` §6.9).
- No personal phone number of a business owner is stored or shown, and no owner name: the directory holds them, our copy does not.
- An address only as the kelurahan published it, and an RW only where the source names it. No RW is guessed from a map pin.
- A photo of children is never the photo of an RW page or an activity point.
- The source address of every photo and product is kept: section 4 and section 5, and the manifest beside the photos.

## 1. RW 05: Kampung Wisata Edukasi Ecowastreme

Source: `/zero-wastreme` and the RW 05 tab of `/potensi`.

**Cerita (ditulis ulang).** RW 05 dulu menghadapi sampah rumah tangga yang banyak, tercampur, dan langsung dibuang ke TPA. Warga lalu mengelolanya dari sumbernya: sampah anorganik dipilah dan ditabung di bank sampah, sedangkan sampah organik diolah menjadi pakan maggot dan dikubur dengan sistem teba modern. Kini kampung ini menjadi tujuan wisata edukasi lingkungan di Kota Semarang, digerakkan ibu-ibu PKK, pengurus RT/RW, dan kader wilayah.

Kebun TOGA dan tanaman pangan warga diolah menjadi minuman herbal untuk tamu, seperti senikir, wedang rosuwuh, suwun, dan kombucha buah lokal. Ibu-ibu PKK membuat tas dan pakaian dari kain perca serta miniatur mainan dari logam bekas.

| Titik aktivitas (seed) | Tipe | Isi | Sumber |
|---|---|---|---|
| Bank Sampah Sumber Rejeki | `bank_sampah` | Belajar memilah sampah dan menabung sampah yang masih bernilai | `/zero-wastreme` ("Bank Sampah Edukasi"); the name from the banner in the development photos and in photo 6 below |
| Taman TOGA Sumber Saras | `urban_farming` | Tanaman pangan dan obat keluarga; hasil kebun diolah menjadi minuman herbal | `/zero-wastreme`; the name from the sign in photo 1 |
| Komposter dan Eco-Enzyme | `composter` | Pelatihan membuat komposter dan eco-enzyme | `/zero-wastreme` ("Pelatihan & Pengolahan") |
| Budidaya Maggot | `maggot` | Sampah organik diolah menjadi pakan maggot | `/zero-wastreme` ("Pengelolaan Terintegrasi") |
| Sistem Teba Modern | `other` | Sampah organik dikubur di lubang yang dikelola | `/zero-wastreme` |
| Kreasi Daur Ulang PKK | `pkk_craft` | Tas dan pakaian dari kain perca, kerajinan dari plastik bekas, miniatur mainan dari logam bekas | `/zero-wastreme` ("Kreativitas Hebat PKK", "Pelatihan & Pengolahan") |

Not taken over yet:

- **Olahan minyak jelantah.** The site says used cooking oil becomes "setrika uap ramah lingkungan", which reads like a typo. Left out until the kelurahan says what the product is.
- **Prestasi.** Juara 1 Lomba Kampung Hebat Kota Semarang 2025 (kategori Kampung Pilah Sampah dan Pro Lingkungan) and Juara 1 Lomba Bank Sampah tingkat Kota Semarang 2025, with their photos. They wait for the kelurahan's permission to show them (section 7, request 12).
- **Tamu studi banding.** Pemerintah Kota Pekalongan, Universitas Muhammadiyah Sidoarjo, SMPN 25 Kota Surakarta, Pemerintah Kabupaten Tulungagung, SMPN 8 Kota Surakarta, Guimaras State University (Filipina), and the photos of their visits. They wait for the same permission.
- **Dokumen "Materi & Data Berkas Zero Wastreme".** A candidate for the first e-booklet; the PDF is requested from the kelurahan (request 3).
- The RW 05 tab of `/potensi` also tells of the Sopo Tonggo neighbourhood watch and of solar street lights. They belong to the RW, not to a visit, so they are not on the RW page.

## 2. RW 13: Kampung Budaya & Seni

Source: `/seni-budaya` (Jl. Jatisari, RW 13) and the RW 13 tab of `/potensi`. The user confirmed on 21 October 2026 that the arts programme is RW 13's.

**Cerita (ditulis ulang).** Kampung Budaya & Seni di Jl. Jatisari, RW 13, diresmikan Wali Kota Semarang pada 26 Juni 2020. Warganya memegang semangat nguri-nguri budaya: tradisi Jawa dirawat dalam kegiatan sehari-hari. Di sini warga mementaskan Tari Golek, Tari Semarangan, dan Tari Jatilan, menghidupkan dolanan seperti gobak sodor, egrang, bentik, dan dakon, dan mendidik anak-anak kampung di sekolah seni.

Kampung ini menjadi rumah Kelompok Seni Kartika Sari, binaan Disbudpar Kota Semarang, yang pernah tampil di puncak Dugderan, Pawai Ogoh-ogoh, dan penyambutan kapal pesiar di Pelabuhan Tanjung Emas. RW 13 juga dikenal sebagai Kampung Pancasila dan menjadi Pilot Project Nasional Kampung Siaga Tangguh Bencana Kebakaran.

| Titik aktivitas (seed) | Tipe | Isi | Sumber |
|---|---|---|---|
| Pentas Tari Tradisional | `stage` | Tari Golek, Tari Semarangan, Tari Jatilan | `/seni-budaya` ("Pagelaran Tari Tradisional") |
| Dolanan Anak | `dolanan_area` | Gobak sodor, egrang, bentik, dakon | `/seni-budaya` ("Wahana Dolanan Anak") |
| Sekolah Seni Anak | `sanggar` | Anak-anak kampung belajar mencintai dan melestarikan keseniannya | `/seni-budaya` ("Sekolah Seni Anak-anak") |
| Upacara Serah Tampi Lurah | `other` | Upacara adat penyambutan atau pergantian lurah; dapat disaksikan bila waktunya bertepatan | `/seni-budaya` ("Menyaksikan Langsung Upacara Adat") |
| Mural dan Spot Foto | `other` | Mural dan spot foto bernuansa Jawa di sepanjang jalan kampung | `/seni-budaya` ("Estetika & Spot Foto") |
| Kampung Siaga Tangguh Bencana Kebakaran | `other` | Pilot Project Nasional: latihan rutin, alat pemadam api ringan, relawan pemadam warga | `/potensi`, tab RW 13. An activity point, not a package: a second study-visit package (community disaster mitigation) waits for the kelurahan |

Not taken over yet:

- **Jadwal pentas dan sesi dolanan.** The site names the dances and the games but gives no day or time, so no `performance_schedules` row is written and the RW 13 schedule page stays empty (request 10).
- The site mentions a partnership with Insan Pariwisata Indonesia. Left out until the kelurahan says what it covers.

## 3. RW 08: Pusat Pelayanan, Semar Cakep, dan Kampung Ramah Anak

Source: the RW 08 tab of `/potensi`. The page `/semar-cakep` has not been read yet.

**Cerita (ditulis ulang), sudah ada di seed sejak Task P2.10.03.** RW 08 adalah pusat pelayanan publik Kelurahan Gisikdrono: Kantor Kecamatan Semarang Barat, Polsek, dan Koramil ada di sini. Di RW ini pula lahir Semar Cakep, singkatan dari Semarang Barat Cinta Kelompok Rentan & Penyandang Disabilitas, layanan publik yang dirancang inklusif, lengkap dengan Rumah Pemberdayaan Semar Cakep.

Lewat program Ketan Ronggolawe, balai warga RW 08 dijadikan tempat anak-anak bermain dan belajar dengan aman: membaca bersama, permainan tradisional, dan pendampingan relawan warga. Program ini menjadikan RW 08 contoh Kampung Ramah Anak di Kota Semarang.

| Titik aktivitas (seed) | Tipe | Isi |
|---|---|---|
| Rumah Pemberdayaan Semar Cakep | `inclusion_center` | Layanan pemberdayaan bagi kelompok rentan dan penyandang disabilitas |
| Ketan Ronggolawe | `child_friendly_space` | Balai warga tempat anak bermain dan belajar, didampingi relawan warga |

Not taken over yet:

- **Kantor Kecamatan Semarang Barat as a meeting point.** The working notes mark it as a candidate that needs confirmation.
- **The RW 08 page photo.** Every photo of the programme shows children, so the page keeps its wordless placeholder until the kelurahan gives a photo without children or confirms parental consent.
- The other photos of the RW 08 tab show the buildings of other institutions (police, Koramil, schools, the military court, the KUA). They are not part of a visit.

The population figures of every RW tab on `/potensi` are not taken over: they describe the RW, not a visit.

## 4. Foto

19 photos from the official site, downloaded on 22 October 2026 into `C:\Users\Mucha\Foto-Gisikdrono\situs-kelurahan\` with `manifest.md` beside them (file, source URL, every page and caption it appeared with, our alt text). They are **never committed**. `pnpm db:seed --official-media <that folder>` re-encodes them through the same step as `api/uploads/finalize` (WebP, at most 1600 px, metadata removed) into the local `public-media` bucket. The alt text of each photo lives in `scripts/official-media.ts` and says only what the photo shows.

| No | File | RW | URL sumber | Halaman | Keterangan foto (kita) | Ada anak | Dipakai untuk |
|---|---|---|---|---|---|---|---|
| 1 | `galeri_1781352833_628.jpg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781352833_628.jpg | /zero-wastreme | Ibu-ibu PKK RW 05 di Taman TOGA Sumber Saras | tidak | galeri, foto halaman RW, titik `taman-toga-sumber-saras` |
| 2 | `galeri_1781167605_244.jpeg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781167605_244.jpeg | /zero-wastreme | Kolam ikan di antara tanaman kampung | tidak | galeri |
| 3 | `galeri_1781167894_327.jpg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781167894_327.jpg | /zero-wastreme | Melihat kolam ikan bersama ibu-ibu PKK | tidak | galeri |
| 4 | `galeri_1781167894_502.jpg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781167894_502.jpg | /zero-wastreme | Tas dari kemasan plastik bekas buatan PKK | tidak | galeri, titik `kreasi-daur-ulang-pkk` |
| 5 | `galeri_1787050840_168.jpeg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1787050840_168.jpeg | /zero-wastreme | Sajian minuman dan hasil kebun untuk tamu | tidak | galeri |
| 6 | `galeri_1781167605_929.jpeg` | RW 05 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781167605_929.jpeg | /zero-wastreme | Pemaparan Kampung Pilah Sampah dan Pro Lingkungan RW 05 | tidak | galeri |
| 7 | `galeri_1781247857_902.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247857_902.jpg | /potensi | Pojok gamelan dan wayang Kampung Seni Budaya | tidak | galeri, foto halaman RW |
| 8 | `galeri_1781247857_264.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247857_264.jpg | /seni-budaya | Wayang kulit di kampung seni | tidak | galeri |
| 9 | `galeri_1781247833_423.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247833_423.jpg | /seni-budaya, /potensi | Pentas tari tradisional di panggung kampung | ya | galeri |
| 10 | `galeri_1781849168_349.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781849168_349.jpg | /potensi | Kelompok Seni Kartika Sari berparade di jalan kampung | ya | galeri |
| 11 | `galeri_1781247873_519.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247873_519.jpg | /potensi | Para penampil berkostum dan bertopeng | tidak | galeri |
| 12 | `galeri_1781247902_365.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247902_365.jpg | /seni-budaya, /potensi | Pertunjukan seni di jalan kampung | tidak | galeri |
| 13 | `galeri_1781247902_610.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247902_610.jpg | /seni-budaya, /potensi | Pertunjukan dengan daun pisang | tidak | galeri |
| 14 | `galeri_1781247873_602.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247873_602.jpg | /seni-budaya | Mural di sepanjang jalan kampung | tidak | galeri, titik `mural-dan-spot-foto` |
| 15 | `galeri_1781247857_102.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781247857_102.jpg | /seni-budaya, /potensi | Kartu lambang sila-sila Pancasila | tidak | galeri |
| 16 | `galeri_1781849168_160.jpg` | RW 13 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781849168_160.jpg | /potensi | Penari anak dengan kuda kepang | ya | galeri |
| 17 | `galeri_1781753877_131.jpeg` | RW 08 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781753877_131.jpeg | /potensi | Kegiatan bersama di ruang Komunitas Semar Cakep | ya | galeri |
| 18 | `galeri_1781753821_731.jpg` | RW 08 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781753821_731.jpg | /potensi | Milad Rumah Difabel Semar Cakep | ya | galeri |
| 19 | `galeri_1781753821_372.jpg` | RW 08 | https://gisikdrono.semarangkota.go.id/uploads/galeri_1781753821_372.jpg | /potensi | Foto bersama di ruangan dengan rak produk | ya | galeri |

"Foto halaman RW" applies only while the RW page has no photo: on a stack seeded with `--media` as well, RW 05 keeps the development photo, and the Taman TOGA point keeps its own.

Left out of the 71 photos on those pages:

- the group photos of the study-visit guests (their names wait for permission, request 12), the award photos (same request), and a press clipping of Jawa Pos;
- close-ups of children, and a school assembly;
- the buildings of other institutions on the RW 08 tab;
- photos whose subject could not be told from the picture, small duplicates, and a 2020 photo with health-protocol signs.

The parental consent for children in the published photos is still asked of the kelurahan (request 2); until then photos of children appear in the gallery only.

## 5. Produk UMKM

No product is seeded: the schema requires a price and an RW for every product and vendor (`products_umkm.price`, `products_umkm.rw_id`, `umkm_vendors.rw_id`), and neither source gives a price. A product without a price cannot be an add-on either. Whether catalogue-only products without a price are wanted is a separate decision for the user (decision of 2026-10-22).

### 5.1 Products of RW 05 (from `/zero-wastreme`): need a price, a unit and a vendor

| Kategori | Produk | RW |
|---|---|---|
| `snack` (minuman) | Minuman herbal dari kebun TOGA: senikir, wedang rosuwuh, suwun, kombucha buah lokal | RW 05 |
| `snack` | Bolu terong cokelat | RW 05 |
| `snack` | Pepes mangga ikan kakap; olahan pindang kreasi warga | RW 05 |
| `recycled_craft` | Tas dan pakaian dari kain perca | RW 05 |
| `recycled_craft` | Miniatur mainan dari logam bekas | RW 05 |
| `other` | Olahan minyak jelantah (what it is needs checking, section 1) | RW 05 |

### 5.2 Directory `/umkm`: need a price, a unit and an RW

The directory lists 442 businesses. Every entry gives its address as "Gisikdrono, Semarang Barat" only, so none can be placed in an RW from its address, and every card shows the same placeholder picture, so the directory has **no product photos**. The table keeps the 159 businesses in the categories a visit can use: makanan dan minuman (151), herbal dan madu (3), tanaman (3), kerajinan (1: rajut boneka) and pakaian buatan warga (1: B86 Clothing). Retail shops (pakaian, hijab, tas impor), workshops (mebel, aluminium) and services (bengkel, laundry, konter, permak) are left out. Source of every row: https://gisikdrono.semarangkota.go.id/umkm; the map link is the pin the directory publishes. The owner's name and WhatsApp number are left out on purpose.

| No | Kategori | Nama usaha | Produk/jasa (dari direktori) | Peta | RW (diisi kelurahan) |
|---|---|---|---|---|---|
| 1 | Makanan dan minuman | Abon Kopi Katering Puspo | Abon dan Kopi | [peta](https://maps.google.com/?q=-6.98461983,110.38845568) |  |
| 2 | Makanan dan minuman | All Hail Dessert, Mentai.co, Ayam Taliwang | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99228331,110.38925707) |  |
| 3 | Makanan dan minuman | Alvina | Aneka Jajanan dan Minuman | [peta](https://maps.google.com/?q=-6.99755123,110.38829617) |  |
| 4 | Makanan dan minuman | Aneka Nasi dan Jajanan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99652652,110.38892414) |  |
| 5 | Makanan dan minuman | Angkringan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98528637,110.38537132) |  |
| 6 | Makanan dan minuman | Angkringan Berkah | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99807819,110.38493717) |  |
| 7 | Makanan dan minuman | Angkringan D'List | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99408591,110.39208873) |  |
| 8 | Makanan dan minuman | Angkringan Mbak Iin | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.9925584,110.38986916) |  |
| 9 | Makanan dan minuman | Angkringan Mbak Sri | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98290716,110.38957205) |  |
| 10 | Makanan dan minuman | Angkringan Pojok | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99282234,110.39251403) |  |
| 11 | Makanan dan minuman | Angkringan Totok | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99204155,110.38565935) |  |
| 12 | Makanan dan minuman | Ayam Buldak Korea | Ayam Goreng Buldak | [peta](https://maps.google.com/?q=-6.99527985,110.38824478) |  |
| 13 | Makanan dan minuman | Ayam Geprek dan Soto Sapi Naura | Ayam Geprek dan Soto Sapi | [peta](https://maps.google.com/?q=-6.99795855,110.38596399) |  |
| 14 | Makanan dan minuman | Ayam Geprek Jannah | Ayam Geprek | [peta](https://maps.google.com/?q=-6.99556824,110.38518131) |  |
| 15 | Makanan dan minuman | Ayam Geprek Lesehan - Prasmanan | Aneka Makanan Ayam Geprek dan Minuman | [peta](https://maps.google.com/?q=-6.99603109,110.38937744) |  |
| 16 | Makanan dan minuman | Ayam Geprek Selera Kita | Ayam Geprek | [peta](https://maps.google.com/?q=-6.99847566,110.38969243) |  |
| 17 | Makanan dan minuman | Ayam Goreng Panas | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99352359,110.384039) |  |
| 18 | Makanan dan minuman | Ayam Goreng Panas | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98464409,110.38506153) |  |
| 19 | Makanan dan minuman | Ayam Gureme Pak Eko | Ayam Gureme dan Bebek Goreng | [peta](https://maps.google.com/?q=-6.98914395,110.38947814) |  |
| 20 | Makanan dan minuman | Ayam Kremes Amelsa | Ayam Kremes | [peta](https://maps.google.com/?q=-6.99249811,110.3867216) |  |
| 21 | Makanan dan minuman | Bake Up | Bakery & Café | [peta](https://maps.google.com/?q=-6.99214804,110.38556816) |  |
| 22 | Makanan dan minuman | Bakso | Aneka Bakso Daging dan Minuman | [peta](https://maps.google.com/?q=-6.98690518,110.38725573) |  |
| 23 | Makanan dan minuman | Bakso Pak Geger | Bakso Daging Sapi | [peta](https://maps.google.com/?q=-6.98831886,110.38938584) |  |
| 24 | Makanan dan minuman | Bawang Goreng Bu Lastri | Bawang Goreng | [peta](https://maps.google.com/?q=-6.97765729,110.38814387) |  |
| 25 | Makanan dan minuman | Beranda Ungu Violet | Aneka Makana dan Minuman | [peta](https://maps.google.com/?q=-6.98401909,110.39004367) |  |
| 26 | Makanan dan minuman | BFC Ayam Geprek | Ayam Geprek dan Fried Chicken | [peta](https://maps.google.com/?q=-6.98867566,110.38951226) |  |
| 27 | Makanan dan minuman | Bubur Kacang Ijo | Bubur Kacang Ijo | [peta](https://maps.google.com/?q=-6.99191775,110.38551988) |  |
| 28 | Makanan dan minuman | Cafe Haselin | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99767877,110.38593826) |  |
| 29 | Makanan dan minuman | Elbarr Pizza | Pizza | [peta](https://maps.google.com/?q=-6.99426237,110.38493486) |  |
| 30 | Makanan dan minuman | Es Campur 45 | Es Campur | [peta](https://maps.google.com/?q=-6.99839034,110.38581579) |  |
| 31 | Makanan dan minuman | Es Dawet | Es Dawet | [peta](https://maps.google.com/?q=-6.99285245,110.38729412) |  |
| 32 | Makanan dan minuman | Es Krim Dilan | Es Krim | [peta](https://maps.google.com/?q=-6.99487294,110.38781597) |  |
| 33 | Makanan dan minuman | Extreme Kuliner Semarang | Soto Bathok, Tengkleng Solo, Aneka Menu Prasmanan | [peta](https://maps.google.com/?q=-6.98740752,110.38964599) |  |
| 34 | Makanan dan minuman | Geprek Halona | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99335228,110.3906575) |  |
| 35 | Makanan dan minuman | Geprek Mbak Windy | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98996885,110.3864468) |  |
| 36 | Makanan dan minuman | HIK Setya Rasa | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99811146,110.3851095) |  |
| 37 | Makanan dan minuman | Ice Cream Cemara | Ice Cream | [peta](https://maps.google.com/?q=-6.99375808,110.38666895) |  |
| 38 | Makanan dan minuman | Ikhsan Juice | Aneka Jajanan dan Minuman | [peta](https://maps.google.com/?q=-6.9983712,110.38707577) |  |
| 39 | Makanan dan minuman | Jepun Coffee | Coffee Shop | [peta](https://maps.google.com/?q=-6.99169953,110.38971984) |  |
| 40 | Makanan dan minuman | Jesslyn Special Ayam Katsu | Ayam Katsu, Penyet, Swike | [peta](https://maps.google.com/?q=-6.98929408,110.3861173) |  |
| 41 | Makanan dan minuman | Juss Q | Jus Buah | [peta](https://maps.google.com/?q=-6.98928372,110.38932391) |  |
| 42 | Makanan dan minuman | Kedai MJ | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98845033,110.3883853) |  |
| 43 | Makanan dan minuman | Kedai Nafisa Salsabila | Aneka Paket Ayam Geprek | [peta](https://maps.google.com/?q=-6.99594316,110.38796618) |  |
| 44 | Makanan dan minuman | Ketan Semarang | Ketan Susu | [peta](https://maps.google.com/?q=-6.98064564,110.38847088) |  |
| 45 | Makanan dan minuman | Kinay Juice | Jus Buah dan Aneka Minuman | [peta](https://maps.google.com/?q=-6.99687427,110.38987807) |  |
| 46 | Makanan dan minuman | Kremes Bang Ayib | Ayam Kremes dan Bakar | [peta](https://maps.google.com/?q=-6.99040412,110.3862585) |  |
| 47 | Makanan dan minuman | Kurma Tea 99 | Kurma Tea | [peta](https://maps.google.com/?q=-6.98568547,110.38836418) |  |
| 48 | Makanan dan minuman | Man Donat | Donat | [peta](https://maps.google.com/?q=-6.97802619,110.38824437) |  |
| 49 | Makanan dan minuman | Mango Thai | Aneka Minuman dan Jus | [peta](https://maps.google.com/?q=-6.98520517,110.38528549) |  |
| 50 | Makanan dan minuman | Mangut Kepala Manyung | Kepala Manyung, Mangut Belut, dan Aneka Makanan Minuman | [peta](https://maps.google.com/?q=-6.99334876,110.3864527) |  |
| 51 | Makanan dan minuman | Mas Iwan | Coffee Shop | [peta](https://maps.google.com/?q=-6.98515131,110.38614512) |  |
| 52 | Makanan dan minuman | Mawar Jus | Aneka Jus Buah | [peta](https://maps.google.com/?q=-6.98606041,110.39008189) |  |
| 53 | Makanan dan minuman | Mie Ayam | Mie Ayam | [peta](https://maps.google.com/?q=-6.98637256,110.38872164) |  |
| 54 | Makanan dan minuman | Mie Ayam Bakso Seger | Mi Ayam dan Bakson Beranak | [peta](https://maps.google.com/?q=-6.99818018,110.38714685) |  |
| 55 | Makanan dan minuman | Mie Ayam Berkah | Aneka Mie Ayam dan Minuman | [peta](https://maps.google.com/?q=-6.99217092,110.38674678) |  |
| 56 | Makanan dan minuman | Mie Ayam D | Mie Ayam dan Bakso | [peta](https://maps.google.com/?q=-6.99766901,110.38994992) |  |
| 57 | Makanan dan minuman | Mie Ayam dan Bakso | Mie Ayam dan Bakso | [peta](https://maps.google.com/?q=-6.99655314,110.3891642) |  |
| 58 | Makanan dan minuman | Mie Ayam dan Bakso Bang DJ | Mie Ayam dan Bakso | [peta](https://maps.google.com/?q=-6.99277766,110.38590947) |  |
| 59 | Makanan dan minuman | Mie Ayam dan Bakso Bang Djas | Mie Ayam dan Bakso | [peta](https://maps.google.com/?q=-6.99193639,110.38562314) |  |
| 60 | Makanan dan minuman | Mie Ayam dan Ceker Pak Jon | Mie Ayam dan Ceker | [peta](https://maps.google.com/?q=-6.99529905,110.38616323) |  |
| 61 | Makanan dan minuman | Mie Ayam Jamur Sinoni | Aneka Mie Ayam dan Minuman | [peta](https://maps.google.com/?q=-6.98559451,110.39019186) |  |
| 62 | Makanan dan minuman | Mie Ayam Pak Lorek | Mie Ayam | [peta](https://maps.google.com/?q=-6.98818876,110.38973245) |  |
| 63 | Makanan dan minuman | Mie Kopyok | Mie Kopyok | [peta](https://maps.google.com/?q=-6.9896324,110.38871821) |  |
| 64 | Makanan dan minuman | Nasi Goreng | Nasi Goreng | [peta](https://maps.google.com/?q=-6.99628317,110.38954259) |  |
| 65 | Makanan dan minuman | Nasi Goreng Babat dan Es Cleguk | Nasi Goreng dan Es Cleguk | [peta](https://maps.google.com/?q=-6.9871967,110.38706931) |  |
| 66 | Makanan dan minuman | Nasi Goreng Bude Warti | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99645597,110.38889196) |  |
| 67 | Makanan dan minuman | Nasi Goreng dan Ayam Geprek | Nasi Goreng dan Ayam Geprek | [peta](https://maps.google.com/?q=-6.9973806,110.38667385) |  |
| 68 | Makanan dan minuman | Nasi Goreng Tegal | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98567637,110.39019119) |  |
| 69 | Makanan dan minuman | Nasi Kucing Ariesta Ksatrian | Nasi Kucing | [peta](https://maps.google.com/?q=-6.98734629,110.38808763) |  |
| 70 | Makanan dan minuman | Ngopit Garage | Kopi dan Nobar | [peta](https://maps.google.com/?q=-6.98625101,110.38634956) |  |
| 71 | Makanan dan minuman | Nisa Kitchen | Aneka Masakan Ayam | [peta](https://maps.google.com/?q=-6.98926347,110.38613071) |  |
| 72 | Makanan dan minuman | Pandanjowo | Es Pisang Ijo, Coklat, Keju, Es Campur dan Cendol | [peta](https://maps.google.com/?q=-6.98961932,110.38659687) |  |
| 73 | Makanan dan minuman | Pecel Lele Ayam Goreng Berkah | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98432725,110.39009664) |  |
| 74 | Makanan dan minuman | Pecel Lele Mbak Eni | Pecel Lele Lamongan | [peta](https://maps.google.com/?q=-6.99692752,110.3898727) |  |
| 75 | Makanan dan minuman | Pelipur Lapar | Aneka Jajanan dan Minuman | [peta](https://maps.google.com/?q=-6.9943107,110.38658232) |  |
| 76 | Makanan dan minuman | PIA Queen Khas Semarang | Pia | [peta](https://maps.google.com/?q=-6.99136808,110.38911366) |  |
| 77 | Makanan dan minuman | Pisang Crispy Vea | Pisang Crispy | [peta](https://maps.google.com/?q=-6.98936347,110.38610601) |  |
| 78 | Makanan dan minuman | Pondok Makan Mi Jowo Pak Bagong | Mi Jowo, Aneka Nasi dan Mi Goreng | [peta](https://maps.google.com/?q=-6.99666071,110.38979586) |  |
| 79 | Makanan dan minuman | Pondok Makan Mie Ayam | Mie Ayam dan Bakso | [peta](https://maps.google.com/?q=-6.99280433,110.38585591) |  |
| 80 | Makanan dan minuman | Pondok Taman Jepun | Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99212017,110.39029383) |  |
| 81 | Makanan dan minuman | Q $ C Rujak Aceh Salad Buah | Rujak dan Salad Buah, Bakso Sapi | [peta](https://maps.google.com/?q=-6.99385126,110.38679501) |  |
| 82 | Makanan dan minuman | Rambo Juice | Jus dan Aneka Minuman | [peta](https://maps.google.com/?q=-6.99789932,110.38566023) |  |
| 83 | Makanan dan minuman | Redjo Bae | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.9989158,110.38848299) |  |
| 84 | Makanan dan minuman | Roti Hajatan | Aneka Roti Keperluan Hajatan | [peta](https://maps.google.com/?q=-6.99658775,110.38833473) |  |
| 85 | Makanan dan minuman | Salad MOI | Salad Buah | [peta](https://maps.google.com/?q=-6.99832003,110.38577318) |  |
| 86 | Makanan dan minuman | Salad Mr. D | Salad Buah | [peta](https://maps.google.com/?q=-6.99828265,110.38978363) |  |
| 87 | Makanan dan minuman | Sate Ayam Qu Madura | Sate Ayam Qu Madura | [peta](https://maps.google.com/?q=-6.99407801,110.39144467) |  |
| 88 | Makanan dan minuman | Sop Iga dan Penyetan Markel | Sop Iga dan Penyetan | [peta](https://maps.google.com/?q=-6.98554254,110.38458501) |  |
| 89 | Makanan dan minuman | Soto Ayam Khas Sokaraja | Soto Ayam | [peta](https://maps.google.com/?q=-6.98556921,110.39019723) |  |
| 90 | Makanan dan minuman | Soto Ayam Lamongan Surabaya | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98427334,110.39007385) |  |
| 91 | Makanan dan minuman | Soto Ayam Pak Pur | Soto Ayam dan Ayam Goreng | [peta](https://maps.google.com/?q=-6.99189778,110.38547964) |  |
| 92 | Makanan dan minuman | Soto Ayam Putra Pak Raan | Soto dan Aneka Minuman | [peta](https://maps.google.com/?q=-6.98353887,110.38676731) |  |
| 93 | Makanan dan minuman | Soto Pak Ujang | Soto | [peta](https://maps.google.com/?q=-6.98631732,110.39009262) |  |
| 94 | Makanan dan minuman | Soup Buah Gila | Aneka Minuman Es dan Soup Buah | [peta](https://maps.google.com/?q=-6.99330877,110.38613067) |  |
| 95 | Makanan dan minuman | Spesial Soto Ayam Pak Met | Soto Ayam dan Gado Gado Pecel | [peta](https://maps.google.com/?q=-6.99887387,110.38766558) |  |
| 96 | Makanan dan minuman | Surya Masakan Padang | Aneka Masakan Padang dan Minuman | [peta](https://maps.google.com/?q=-6.99818359,110.38531117) |  |
| 97 | Makanan dan minuman | Tahu Gimbal Bang Toyob | Tahu Gimbal | [peta](https://maps.google.com/?q=-6.99861896,110.38669261) |  |
| 98 | Makanan dan minuman | Tahu Gimbal Bu Yetno | Tahu Gimbal | [peta](https://maps.google.com/?q=-6.98834079,110.38961113) |  |
| 99 | Makanan dan minuman | Tahu Gimbal dan Es Kelapa Muda | Tahu Gimbal dan Es Kelapa Muda | [peta](https://maps.google.com/?q=-6.98489033,110.39015833) |  |
| 100 | Makanan dan minuman | Tahu Gimbal Mak'e | Tahu Gembol, Tahu Campur, Tahu Kopyok Dll | [peta](https://maps.google.com/?q=-6.99719973,110.38993372) |  |
| 101 | Makanan dan minuman | Tahu Gimbal Nasi Goreng Bakmi Jawa | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99346052,110.38629898) |  |
| 102 | Makanan dan minuman | Tela Crispy Hosana | Tela Crispy | [peta](https://maps.google.com/?q=-6.99363091,110.39251713) |  |
| 103 | Makanan dan minuman | Warmindo Burjo GP | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98458283,110.39011274) |  |
| 104 | Makanan dan minuman | Warmindo Burjo Rizky | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98681916,110.39006442) |  |
| 105 | Makanan dan minuman | Warteg Dewi | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98639625,110.39020515) |  |
| 106 | Makanan dan minuman | Warteg Mamah | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98491828,110.39016906) |  |
| 107 | Makanan dan minuman | Warung Bakar Mbak Lin | Aneka Bakaran dan Minuman | [peta](https://maps.google.com/?q=-6.99175369,110.38816994) |  |
| 108 | Makanan dan minuman | Warung Bu Ramelan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99058673,110.38769248) |  |
| 109 | Makanan dan minuman | Warung Bu Supardi | Aneka Snack dan Minuman | [peta](https://maps.google.com/?q=-6.99132654,110.38856202) |  |
| 110 | Makanan dan minuman | Warung Bu Suyatmi | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99412959,110.39199829) |  |
| 111 | Makanan dan minuman | Warung Gaya Baru | Aneka Masakan Padang dan Minuman | [peta](https://maps.google.com/?q=-6.99254471,110.3857083) |  |
| 112 | Makanan dan minuman | Warung Gendhis | Aneka Jajanan dan Minuman SD | [peta](https://maps.google.com/?q=-6.99260536,110.38841151) |  |
| 113 | Makanan dan minuman | Warung Ibu Septi | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.984397,110.38805603) |  |
| 114 | Makanan dan minuman | Warung Jajanan | Jajanan Snack dan Minum | [peta](https://maps.google.com/?q=-6.98825998,110.38721142) |  |
| 115 | Makanan dan minuman | Warung Jajanan | Jajanan Snack dan Minum | [peta](https://maps.google.com/?q=-6.98836415,110.38621378) |  |
| 116 | Makanan dan minuman | Warung Kak Devi | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99118663,110.38749134) |  |
| 117 | Makanan dan minuman | Warung Kelontong Bu Robert | Warung, Indomie dan Aneka Minuman, Permark | [peta](https://maps.google.com/?q=-6.99166567,110.38913914) |  |
| 118 | Makanan dan minuman | Warung Kopi Gulo | Kopi Klothok, Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99405588,110.39089117) |  |
| 119 | Makanan dan minuman | Warung Kopi Penitian | Coffee Shop | [peta](https://maps.google.com/?q=-6.98470369,110.38918524) |  |
| 120 | Makanan dan minuman | Warung Makan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99839234,110.38590162) |  |
| 121 | Makanan dan minuman | Warung Makan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99591595,110.38928155) |  |
| 122 | Makanan dan minuman | Warung Makan | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99210447,110.38502625) |  |
| 123 | Makanan dan minuman | Warung Makan | Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98710352,110.38726243) |  |
| 124 | Makanan dan minuman | Warung Makan | Soto dan Lontong Sayur, Rujak, Mie Gule Ayam dan Aneka Minuman, Ayam Geprek | [peta](https://maps.google.com/?q=-6.99609233,110.38944986) |  |
| 125 | Makanan dan minuman | Warung Makan Adem Ayem | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.9939914,110.3927561) |  |
| 126 | Makanan dan minuman | Warung Makan Berkah | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98722865,110.3872906) |  |
| 127 | Makanan dan minuman | Warung Makan Berkat | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98846882,110.38863922) |  |
| 128 | Makanan dan minuman | Warung Makan Bu Bekti | Prasmanan | [peta](https://maps.google.com/?q=-6.98607397,110.38599551) |  |
| 129 | Makanan dan minuman | Warung Makan Bu Deni | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98415021,110.3899907) |  |
| 130 | Makanan dan minuman | Warung Makan Bu Mus | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99598176,110.38813717) |  |
| 131 | Makanan dan minuman | Warung Makan Bu Narti | Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99267858,110.38798772) |  |
| 132 | Makanan dan minuman | Warung Makan Bu Roso | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.97991493,110.3888937) |  |
| 133 | Makanan dan minuman | Warung Makan Bu Sum | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98688655,110.38732949) |  |
| 134 | Makanan dan minuman | Warung Makan Bu Sum | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98468533,110.39014224) |  |
| 135 | Makanan dan minuman | Warung Makan Bu Sum | Aneka Menu Masakan Jawa | [peta](https://maps.google.com/?q=-6.98791088,110.38978747) |  |
| 136 | Makanan dan minuman | Warung Makan Jumiatun | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98831969,110.38782142) |  |
| 137 | Makanan dan minuman | Warung Makan Maharani | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99247585,110.38459441) |  |
| 138 | Makanan dan minuman | Warung Makan Pak Dar | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98489893,110.38447236) |  |
| 139 | Makanan dan minuman | Warung Makan Ramesan Kecil | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.9972197,110.38990824) |  |
| 140 | Makanan dan minuman | Warung Makan Sederhana | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98269259,110.38593147) |  |
| 141 | Makanan dan minuman | Warung Mbak Susi | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98433843,110.38819416) |  |
| 142 | Makanan dan minuman | Warung Mie Ayam Pak No | Mie Ayam | [peta](https://maps.google.com/?q=-6.97931651,110.38862373) |  |
| 143 | Makanan dan minuman | Warung Pecel | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.98425603,110.38999137) |  |
| 144 | Makanan dan minuman | Warung Pecel Kanthi | Pecel Lele Lamongan | [peta](https://maps.google.com/?q=-6.99529557,110.38538991) |  |
| 145 | Makanan dan minuman | Warung Pecel Mak Pon | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99216684,110.38900972) |  |
| 146 | Makanan dan minuman | Warung Pojok Nasi Kuning | Nasi Kuning, Rames, Uduk, Tumpeng, Catering | [peta](https://maps.google.com/?q=-6.98580861,110.38874304) |  |
| 147 | Makanan dan minuman | Warung Sate dan Es Campur | Sate Ayam, Lontong, Es Campur, Es Capucino | [peta](https://maps.google.com/?q=-6.99404489,110.39236894) |  |
| 148 | Makanan dan minuman | Warung Sayur dan Buah | Sayur dan Buah | [peta](https://maps.google.com/?q=-6.99192308,110.38557352) |  |
| 149 | Makanan dan minuman | Warung Sorlem | Penyetan Makanan dan Aneka Minuman | [peta](https://maps.google.com/?q=-6.99169429,110.38919547) |  |
| 150 | Makanan dan minuman | Warung Spesial Sambel Gecek | Aneka Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.99489718,110.38517871) |  |
| 151 | Makanan dan minuman | Warung Makan Bismillah | Makanan dan Minuman | [peta](https://maps.google.com/?q=-6.993427,110.39092147) |  |
| 152 | Herbal dan madu | BT Propolis Seto Adhi | Toko Jamu | [peta](https://maps.google.com/?q=-6.99020115,110.38883388) |  |
| 153 | Herbal dan madu | Madu Gana | Madu | [peta](https://maps.google.com/?q=-6.98918419,110.38828604) |  |
| 154 | Herbal dan madu | Toko Herbal Lestar | Obat Herbal dan Aneka Madu | [peta](https://maps.google.com/?q=-6.99659549,110.38976904) |  |
| 155 | Tanaman | Kaktusria | Jasa Tanaman Interior | [peta](https://maps.google.com/?q=-6.98911829,110.38803458) |  |
| 156 | Tanaman | Mandiri Barokah | Aneka Tanaman | [peta](https://maps.google.com/?q=-6.99666678,110.38667955) |  |
| 157 | Tanaman | UD Tani Sehat Sejahtera | Pupuk Organik | [peta](https://maps.google.com/?q=-6.99787519,110.38427265) |  |
| 158 | Kerajinan | Nov Rajut | Rajut Boneka | [peta](https://maps.google.com/?q=-6.98604318,110.3873092) |  |
| 159 | Pakaian buatan warga | B86 Clothing | Kaos Oblong/Kerah, Kemeja, Celana, Jaket, Dll | [peta](https://maps.google.com/?q=-6.99254297,110.38801764) |  |

## 6. Data contoh, bukan data kelurahan

`scripts/seed-demo-content.sql` also writes rows that are **invented** so the booking flow can be built on the local stack. They are marked `DATA CONTOH` in the file and live only in that seed (never in a migration). The file refuses any database whose Vault secret `environment` is not `local` or `staging`, so they can reach the local stack and, through the `seed_demo` input of the staging release, the demo-only staging site (decision of 2026-10-23), but never production:

| Rows | Invented values |
|---|---|
| `session_templates` RW 05 and RW 13 | Sesi Pagi 08:30–10:30 and Sesi Siang 13:30–15:30, Tuesday to Saturday, capacity 40 |
| `tour_packages` | Eduwisata Ecowastreme Rp35.000 per orang, Eduwisata Seni Budaya Rp40.000 per orang, Paket Kombinasi Gisikdrono Rp70.000 per orang, durations 120 and 240 minutes |
| `umkm_vendors` | Bank Sampah Lestari (RW 05), Kriya Sanggar Kampung (RW 13) |
| `products_umkm` | Pupuk Kompos 1 kg Rp15.000, Bibit Cabai Rp5.000, Gantungan Kunci Batik Rp20.000 |
| `articles` | "Cara memesan kunjungan edukasi" restates the booking flow of `docs/PRD.md`; the RW 05 article says only what the development photos show |

## 7. Still needed from the kelurahan

1. ~~Lokasi Kampung Budaya & Seni~~: RW 13 (done).
2. Izin orang tua untuk foto anak yang sudah dipublikasikan.
3. PDF "Materi & Data Berkas Zero Wastreme".
4. ~~Ekspor KML dari Google My Maps "Peta Wilayah RW"~~: received as "Peta RW Wilayah Gisikdrono 2024" (section 8). Placing the businesses of section 5.2 in an RW with it is still to do.
5. Logo resolusi tinggi dan izin pemakaiannya.
6. Nomor WhatsApp resmi untuk tombol chat.
7. Nama dan jabatan penandatangan sertifikat.
8. Harga, satuan, dan pelaku UMKM untuk produk di bagian 5.1, dan RW serta harga untuk usaha di bagian 5.2.
9. Paket kunjungan: nama, isi, durasi, kapasitas, harga (RW 05, RW 13, and the study visits of RW 08 and RW 13).
10. Jadwal rutin pentas tari dan sesi dolanan.
11. Koordinat Google Maps setiap titik aktivitas. Until then the demo seed places them by estimate (section 8).
12. Izin menampilkan daftar tamu studi banding dan prestasi.
13. Apa produk olahan minyak jelantah RW 05 (section 1).
14. A photo of RW 08's programme without children, for its page (section 3).
15. Syarat & Ketentuan kunjungan: pembatalan, jadwal ulang (reschedule), dan pengembalian dana (refund). The booking summary shows them beside the privacy notice once the kelurahan has written them; until then the site states no terms of its own (decision of 2026-10-22 on P3.5, Q3).

## 8. Peta RW dan letak titik aktivitas

The RW area map of `/peta-kontak` draws the kelurahan's own Google My Maps **"Peta RW Wilayah Gisikdrono 2024"** (embedded on https://gisikdrono.semarangkota.go.id/peta-wilayah-rw; reuse of the site's content allowed by the kelurahan). Its KML export stays outside the repository; `scripts/convert-rw-kml.ts` turns it into `public/map/gisikdrono-rw.geojson` (13 RW areas, RW 05 from two placemarks and RW 12 from three parts, the kelurahan boundary and the point "Kantor Kelurahan Gisikdrono"), coordinates rounded to six decimals and simplified by about half a metre. The placemark descriptions (population, households, potensi) are not copied. The "Rawan Bencana" layer is empty in the 2024 export, so nothing of it is used. The map credits the source as "Batas RW: Peta RW Wilayah Gisikdrono 2024, Kelurahan Gisikdrono".

**Every activity point position is an estimate (perkiraan) and must be confirmed by the kelurahan** (request 11 of section 7). On 2026-10-24 each seeded point was looked up on OpenStreetMap Nominatim by its name plus "Gisikdrono, Semarang Barat" (one request per second, a descriptive User-Agent, names only). None had a hit, so `scripts/seed-demo-content.sql` places each inside its RW polygon and the map says the positions are estimates:

| RW | Points | Surveyed in OSM | Placed at |
|---|---|---|---|
| RW 05 | Bank Sampah Sumber Rejeki, Taman TOGA Sumber Saras, Komposter dan Eco-Enzyme, Budidaya Maggot, Sistem Teba Modern, Kreasi Daur Ulang PKK | none (no hit) | perkiraan: a ring of about 55 m around the polygon's point-on-surface |
| RW 13 | Pentas Tari Tradisional, Dolanan Anak, Sekolah Seni Anak, Upacara Serah Tampi Lurah, Mural dan Spot Foto, Kampung Siaga Tangguh Bencana Kebakaran | none (no hit); the street **Jalan Jatisari** is in OSM inside RW 13 | perkiraan: a ring around Jalan Jatisari, where `/seni-budaya` places the Kampung Budaya & Seni |
| RW 08 | Rumah Pemberdayaan Semar Cakep, Ketan Ronggolawe | none (no hit); Kantor Kecamatan Semarang Barat is in OSM inside RW 08 but is not a point | perkiraan: around the polygon's point-on-surface |

The RW centres (`rw_units.map_lat` / `map_lng` of RW 05, RW 08 and RW 13) get the point-on-surface of their polygon in the demo seed only, also as estimates. The office marker uses the kelurahan's own point from the KML (OSM's "Kantor Kelurahan Gisikdrono" lies about 30 m from it). No coordinate is written by a migration; production keeps NULL until the kelurahan enters the exact spots in `/dashboard/activity-points`, and a point without coordinates is left off the map, never guessed there.
