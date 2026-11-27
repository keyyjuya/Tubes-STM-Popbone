# PopBone

**URL aplikasi:** https://[username-github].github.io/popbone/

> Game pemecah gelembung dengan rangka neon tangan (MediaPipe Hand Landmarker). Berjalan di browser, tanpa login.

![GIF demo](assets/demo.gif)

## Anggota dan pembagian tugas

| Nama | NIM | ID GitHub | Tugas |
|------|-----|-----------|-------|
| [nama] | [NIM] | [github-id] | [tugas] |
| [nama] | [NIM] | [github-id] | [tugas] |
| [nama] | [NIM] | [github-id] | [tugas] |

## Cara pakai

1. Buka URL aplikasi, lalu klik **Mulai Bermain**.
2. Izinkan akses **kamera** (dan **mikrofon** bila muncul permintaan). Mikrofon dipakai untuk mendeteksi tepuk; bila ditolak, game tetap jalan tanpa bonus tepuk.
3. Berdiri ±1 meter dari kamera dengan telapak tangan terlihat.
4. Sentuhkan telapak ke gelembung untuk memecahkannya. Tahan kepalan ±0,5 detik untuk skor ×2, tepuk tangan untuk gelombang emas, dan buka telapak lebar untuk bom.
5. Tekan **● Rekam** untuk merekam sesi (canvas + audio) lalu **■ Stop & Unduh** untuk menyimpan file video.

Cadangan pemicu lewat keyboard (mis. mikrofon tidak tersedia): **B** = gelombang bonus, **X** = bom. Gunakan headphone agar suara musik tidak ikut terdeteksi sebagai tepuk.

## Cara menjalankan lokal

Aplikasi memakai ES module dan `getUserMedia`, jadi harus dibuka lewat server lokal (bukan `file://`):

```bash
# pilihan 1 (Python)
python -m http.server 8000

# pilihan 2 (Node)
npx serve .
```

Lalu buka `http://localhost:8000`. Koneksi internet dibutuhkan saat pertama kali memuat MediaPipe Tasks Vision, model Hand Landmarker, dan font dari CDN.

## Tabel efek dan pemicunya

| Efek | Jenis | Pemicu |
|------|-------|--------|
| Rangka neon tangan | Visual landmark | Kamera mendeteksi tangan (MediaPipe Hand Landmarker) |
| Pecah gelembung + partikel + SFX pop | Visual + audio | Telapak/tangan menyentuh gelembung |
| Gelombang gelembung emas bonus | Visual + audio | Bunyi tepuk terdeteksi mikrofon |
| Skor ×2 + beat makin ramai | Visual + audio | Kepalan tangan ditahan ±0,5 detik |
| Bom memecahkan semua gelembung | Visual + audio | Telapak tangan dibuka lebar |


## Rancangan pipeline

[Wajib ditulis sendiri oleh kelompok: diagram dan alasan tiap tahap.]

## Evaluasi FPS dan latensi

| Perangkat | Browser | FPS rata-rata | Latensi |
|-----------|---------|---------------|---------|
| [isi] | [isi] | [isi] | [isi] |

## Logbook mingguan

- Minggu 1: [isi]
- Minggu 2: [isi]

## Keterbatasan

[isi]

## Bagian yang dibantu AI

[Sebutkan bagian kode atau teks yang dibantu AI.]

## Sumber aset dan kode pihak lain

- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) + model Hand Landmarker dari Google MediaPipe.
- Font Orbitron & Space Grotesk dari Google Fonts.
- Seluruh suara (SFX pop, bom, bonus, beat) disintesis dengan Web Audio API, tanpa file audio eksternal.


## Privasi

Semua pemrosesan video berjalan di browser pengguna. Video tidak diunggah ke server.
