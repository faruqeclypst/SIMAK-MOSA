-- SIMAK-MOSA (SMA Negeri Modal Bangsa) Database Schema
-- Compatible with PostgreSQL 16 & PostgREST

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE role_pengguna AS ENUM ('guru', 'piket', 'asrama', 'kurikulum', 'admin', 'wakil_kepala');
CREATE TYPE status_kehadiran AS ENUM ('Hadir', 'Sakit', 'Izin', 'Alpa', 'Izin Pulang', 'Izin Keluarga', 'Dinas Luar', 'Dispensasi', 'Lainnya');
CREATE TYPE status_guru AS ENUM ('Sakit', 'Izin', 'Dinas Luar', 'Titip Tugas', 'Lainnya');

-- 1. Tabel Pengguna / Guru
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    mapel VARCHAR(255) NOT NULL,
    role role_pengguna DEFAULT 'guru',
    email VARCHAR(255),
    is_first_login BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabel Mata Pelajaran
CREATE TABLE IF NOT EXISTS mata_pelajaran (
    id SERIAL PRIMARY KEY,
    nama_mapel VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabel Kelas
CREATE TABLE IF NOT EXISTS kelas (
    id SERIAL PRIMARY KEY,
    nama_kelas VARCHAR(20) UNIQUE NOT NULL,
    tingkat VARCHAR(10) NOT NULL, -- X, XI, XII
    fase VARCHAR(20) NOT NULL     -- Fase E, Fase F, Fase F-Akhir
);

-- 4. Tabel Siswa
CREATE TABLE IF NOT EXISTS siswa (
    id SERIAL PRIMARY KEY,
    pb_id VARCHAR(50) UNIQUE,
    nisn VARCHAR(50),
    nama VARCHAR(255) NOT NULL,
    kelas_id INT REFERENCES kelas(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'aktif',
    tahun_lulus VARCHAR(10),
    tinggal_di_asrama BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabel Jurnal Mengajar Harian
CREATE TABLE IF NOT EXISTS jurnal_mengajar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guru_id UUID REFERENCES users(id) ON DELETE SET NULL,
    nama_guru VARCHAR(255) NOT NULL,
    mapel VARCHAR(255),
    kelas_id INT REFERENCES kelas(id) ON DELETE CASCADE,
    nama_kelas VARCHAR(20) NOT NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    sesi VARCHAR(50) DEFAULT 'Kelas Pagi',
    jam_pelajaran TEXT[] NOT NULL, -- Contoh: ARRAY['Jam 1', 'Jam 2']
    materi TEXT NOT NULL,
    catatan TEXT,
    semester VARCHAR(20) DEFAULT 'Genap',
    tahun_ajaran VARCHAR(20) DEFAULT '2025/2026',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabel Presensi Siswa per Jurnal
CREATE TABLE IF NOT EXISTS presensi_jurnal (
    id SERIAL PRIMARY KEY,
    jurnal_id UUID REFERENCES jurnal_mengajar(id) ON DELETE CASCADE,
    siswa_id INT REFERENCES siswa(id) ON DELETE CASCADE,
    nama_siswa VARCHAR(255) NOT NULL,
    status status_kehadiran NOT NULL DEFAULT 'Hadir',
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabel Siswa Izin (Dicatat Guru Piket)
CREATE TABLE IF NOT EXISTS piket_izin_siswa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    kelas_id INT REFERENCES kelas(id) ON DELETE CASCADE,
    nama_kelas VARCHAR(20) NOT NULL,
    siswa_id INT REFERENCES siswa(id) ON DELETE CASCADE,
    nama_siswa VARCHAR(255) NOT NULL,
    status status_kehadiran DEFAULT 'Izin',
    keterangan TEXT DEFAULT 'Izin',
    semester VARCHAR(20) DEFAULT 'Genap',
    tahun_ajaran VARCHAR(20) DEFAULT '2025/2026',
    dicatat_oleh VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Tabel Matriks Pemantauan Guru Piket (Jam 1 s/d Jam 8)
CREATE TABLE IF NOT EXISTS piket_matriks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    kelas_id INT REFERENCES kelas(id) ON DELETE CASCADE,
    nama_kelas VARCHAR(20) NOT NULL,
    jam_1 VARCHAR(100),
    jam_2 VARCHAR(100),
    jam_3 VARCHAR(100),
    jam_4 VARCHAR(100),
    jam_5 VARCHAR(100),
    jam_6 VARCHAR(100),
    jam_7 VARCHAR(100),
    jam_8 VARCHAR(100),
    jam_9 VARCHAR(100),
    jam_10 VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_piket_matriks_tanggal_kelas UNIQUE (tanggal, kelas_id)
);

-- 9. Tabel Guru Berhalangan Hadir
CREATE TABLE IF NOT EXISTS guru_berhalangan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_guru VARCHAR(255) NOT NULL,
    status status_guru NOT NULL,
    catatan_tugas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Tabel Kehadiran Asrama
CREATE TABLE IF NOT EXISTS asrama_kehadiran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    kelas_id INT REFERENCES kelas(id) ON DELETE CASCADE,
    nama_kelas VARCHAR(20) NOT NULL,
    siswa_id INT REFERENCES siswa(id) ON DELETE CASCADE,
    nama_siswa VARCHAR(255) NOT NULL,
    status status_kehadiran NOT NULL DEFAULT 'Sakit',
    keterangan TEXT,
    semester VARCHAR(20) DEFAULT 'Genap',
    tahun_ajaran VARCHAR(20) DEFAULT '2025/2026',
    dicatat_oleh VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Tabel Jadwal Pelajaran Mingguan
CREATE TABLE IF NOT EXISTS jadwal_pelajaran (
    id SERIAL PRIMARY KEY,
    hari VARCHAR(20) NOT NULL,
    nama_kelas VARCHAR(20) NOT NULL,
    jam_ke VARCHAR(50) NOT NULL,
    waktu VARCHAR(50) NOT NULL,
    nama_guru VARCHAR(255) NOT NULL,
    mapel VARCHAR(255) NOT NULL,
    ruangan VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Tabel Pengaturan Sistem
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jurnal_tanggal ON jurnal_mengajar(tanggal);
CREATE INDEX IF NOT EXISTS idx_jurnal_guru ON jurnal_mengajar(nama_guru);
CREATE INDEX IF NOT EXISTS idx_piket_izin_tanggal ON piket_izin_siswa(tanggal);
CREATE INDEX IF NOT EXISTS idx_asrama_tanggal ON asrama_kehadiran(tanggal);
CREATE INDEX IF NOT EXISTS idx_siswa_kelas ON siswa(kelas_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_hari_kelas ON jadwal_pelajaran(hari, nama_kelas);

-- PostgREST Authenticator & Anonymous Role setup
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'web_anon') THEN
        CREATE ROLE web_anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'mosa_secret_postgrest_pass_2026';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticator;
GRANT web_anon TO authenticator;
