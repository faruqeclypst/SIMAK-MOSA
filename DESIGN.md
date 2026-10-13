# Panduan Desain SIMAK-MOSA (SMAN Modal Bangsa)

Dokumen ini adalah acuan resmi desain antarmuka dan pengalaman pengguna untuk Sistem Informasi Manajemen Aktivitas & Kehadiran (SIMAK) SMAN Modal Bangsa.

---

## 1. Identitas Brand & Arah Karakter
- **Produk:** SIMAK-MOSA (Sistem Manajemen Aktivitas & Kehadiran Sekolah)
- **Instansi:** SMAN Modal Bangsa (Sekolah Berasrama Unggulan, Aceh)
- **Audiens:** Guru mata pelajaran, guru piket harian, pembina asrama, tim kurikulum, dan pimpinan sekolah.
- **Karakter Visual:** Berwibawa, akademis, presisi, bersih, tenang, dan cepat untuk tugas produktivitas harian.
- **Dials (Sesuai antislop.md Part 3):**
  - **ENERGY: 1 (Calm)**: Desain tenang dan profesional tanpa elemen dekoratif yang mengganggu.
  - **RHYTHM: 2 (Balanced)**: Komposisi terstruktur dengan hierarki jelas antara sidebar, kartu metrik, dan tabel data.
  - **MOTION: 1 (Functional)**: Animasi subtil dan fungsional (transisi drawer/modal < 200ms, feedback sentuhan instan).

---

## 2. Palet Warna (Color System)
Palet dibatasi secara ketat pada warna identitas sekolah dan neutral tokens yang memenuhi standar WCAG AA (kontras rasio minimal 4.5:1):

### Core Palette:
- **Navy Modal Bangsa (Primary):**
  - Dark Navy: #0f2b5c (Background sidebar & aksen utama)
  - Royal Navy: #1e3a8a (Primary button & active state)
  - Navy Light: #e0e7ff (Hover & background badge lembut)
- **Gold Obor Prestasi (Accent):**
  - Warm Amber: #d97706 (Aksen logo & penanda penting)
  - Amber Dark: #b45309 (Teks status penting di atas latar terang)
  - Amber Light: #fef3c7 (Background badge perhatian)
- **Neutral Surface:**
  - Background Utama: #f8fafc (Slate 50)
  - Card & Container: #ffffff (Pure White)
  - Border Subtil: #e2e8f0 (Slate 200)
  - Teks Utama: #0f172a (Slate 900, rasio kontras 14:1)
  - Teks Sekunder: #475569 (Slate 600, rasio kontras 5.8:1)

### Status Kehadiran Siswa:
- **Hadir:** Teks #047857 (Emerald 700), Background #ecfdf5 (Emerald 50), Border #a7f3d0
- **Sakit:** Teks #b45309 (Amber 700), Background #fffbeb (Amber 50), Border #fde68a
- **Izin:** Teks #0369a1 (Sky 700), Background #f0f9ff (Sky 50), Border #bae6fd
- **Alpa:** Teks #be123c (Rose 700), Background #fff1f2 (Rose 50), Border #fecdd3
- **Dispensasi:** Teks #4338ca (Indigo 700), Background #eef2ff (Indigo 50), Border #c7d2fe

---

## 3. Tipografi
- **Font Utama:** Sans-serif sistem berkecepatan tinggi (Inter, system-ui, Plus Jakarta Sans, -apple-system, BlinkMacSystemFont).
- **Heading 1:** 20px / 24px (Font Extrabold, tracking tight).
- **Heading 2:** 16px / 20px (Font Bold).
- **Body Text:** 14px / 20px (Font Normal & Medium).
- **Caption / Meta:** 12px / 16px (Font Medium).
- **Aturan Copywriting:** Dilarang menggunakan karakter em dash. Gunakan tanda koma, titik dua, atau kurung.

---

## 4. Komponen & Aksesibilitas
- **Target Sentuh Mobile:** Minimal 44px tinggi/lebar untuk semua tombol, tab, dan chip filter.
- **Focus Ring:** Indikator fokus yang jelas (focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none).
- **UI States Wajib:**
  1. Loading: Komponen skeleton loader yang menyerupai tata letak data sebenarnya.
  2. Empty: Pesan deskriptif dengan ikon konteks dan tombol aksi pembuatan baru.
  3. Error: Notifikasi dengan penyebab yang jelas dan tombol aksi coba lagi.
