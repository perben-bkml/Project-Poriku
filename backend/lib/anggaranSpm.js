import {createHash} from 'node:crypto';

export const SPM_DETAIL_VERSION = 1;
const key = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
export const spmDetailError = (message, statusCode = 400) => Object.assign(new Error(message), {statusCode});

export function anggaranSpmSnapshot(tahun, revisi, sinkron, override) {
    if (!revisi || !sinkron?.disegarkan_pada || sinkron.detail_versi !== SPM_DETAIL_VERSION) return null;
    return createHash('sha256').update(JSON.stringify([tahun, revisi.id,
        sinkron.disegarkan_pada, sinkron.detail_versi,
        override?.tanggal_batas, override?.dibuat_pada])).digest('hex');
}

// Resolve the row against the same classified tree as the main table, never against
// client-provided ownership flags. Claims and undetailed accounts have separate scopes.
export function pilihLingkupSpm({anggaran, belanja, unitKerja, kodeMak, kodeAkun, viewer, normalizeMak}) {
    const unitKey = key(unitKerja);
    if (!unitKey) throw spmDetailError('Unit Kerja wajib diisi.');
    if (viewer.role === 'user' && key(viewer.name) !== unitKey) throw spmDetailError('Akses Unit Kerja ditolak.', 403);
    const unit = anggaran.find(item => key(item.unitKerja) === unitKey);
    if (!unit) throw spmDetailError('Unit Kerja tidak ditemukan pada revisi ini.', 404);
    if (kodeAkun && !kodeMak) throw spmDetailError('Kode MAK wajib diisi untuk rincian Akun.');
    const mak = kodeMak ? unit.mak.find(item => normalizeMak(item.kode) === kodeMak) : null;
    if (kodeMak && !mak) throw spmDetailError('MAK tidak ditemukan pada Unit Kerja ini.', 404);
    const akun = kodeAkun ? mak.akun.find(item => item.kode === kodeAkun) : null;
    if (kodeAkun && !akun) throw spmDetailError('Akun tidak ditemukan pada MAK ini.', 404);
    const mode = mak?.luarPagu ? 'klaim' : akun?.takDirinci ? 'akun-belum-dirinci' : 'anggaran';
    const rows = [...belanja.values()].filter(row => {
        if (kodeMak && row.kodeMak !== kodeMak || kodeAkun && row.kodeAkun !== kodeAkun) return false;
        if (mode === 'klaim') return row.unitKerjaKunci === unitKey && row.sebab === 'klaim-unit-lain';
        if (mode === 'akun-belum-dirinci') return row.unitKerjaKunci === unitKey && row.sebab === 'akun-belum-dirinci';
        return row.dibebankanKe === unitKey;
    });
    const target = akun || mak || unit;
    return {
        unitKerja: unit.unitKerja, kodeMak, kodeAkun, mode,
        keys: rows.map(row => ({unit: row.unitKerjaKunci, mak: row.kodeMak, akun: row.kodeAkun})),
        totals: {realisasi: number(target.realisasi), outstanding: number(target.outstanding),
            saldoAwal: number(rows.reduce((sum, row) => sum + (row.dariAwal || 0), 0))},
    };
}

export function parseSpmDetailQuery(query) {
    const page = Number(query.page || 1), limit = Number(query.limit || 25);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
        || !Number.isInteger(limit) || limit < 1 || limit > 100) throw spmDetailError('Halaman atau batas baris tidak valid.');
    const kategori = String(query.kategori || 'semua');
    if (!['semua', 'realisasi', 'outstanding'].includes(kategori)) throw spmDetailError('Kategori rincian tidak valid.');
    const search = String(query.search || '').trim();
    if (search.length > 100 || String(query.unitKerja || '').length > 200 || String(query.kodeMak || '').length > 200)
        throw spmDetailError('Pencarian terlalu panjang.');
    const kodeAkun = String(query.kodeAkun || '').trim();
    if (kodeAkun && !/^\d{6}$/.test(kodeAkun)) throw spmDetailError('Kode Akun tidak valid.');
    if (!/^[a-f0-9]{64}$/.test(String(query.snapshot || ''))) throw spmDetailError('Snapshot anggaran wajib diisi. Muat ulang anggaran.');
    return {page, limit, kategori, search, kodeAkun};
}

const number = value => {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) throw spmDetailError('Nilai nominal melebihi batas ketelitian aplikasi.', 422);
    return result;
};

// One SQL statement supplies rows, count and filtered total from the same snapshot.
// The transaction provided by the route is REPEATABLE READ and read-only.
export async function bacaRincianSpm(db, {tahun, keys, cutoff, page, limit, kategori, search}) {
    if (!keys.length) return {rows: [], total: 0, totalNominal: 0, page: 1, pages: 0};
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const numericSearch = /^\d+[AT]?$/i.test(search) ? search.replace(/^0+/, '').toUpperCase() || null : null;
    const [result] = await db`
        WITH scoped AS (
            SELECT r.* FROM anggaran_realisasi_baris r
            JOIN jsonb_to_recordset(${db.json(keys)}::jsonb) AS k(unit text, mak text, akun text)
              ON r.unit_kerja_kunci=k.unit AND r.kode_mak=k.mak AND r.kode_akun=k.akun
            WHERE r.tahun=${tahun}
              AND (${cutoff}::text IS NULL OR NOT r.sudah_sp2d OR r.tanggal='' OR r.tanggal>${cutoff})
        ), grouped AS (
            SELECT alur, trans_id, unit_kerja_kunci,
                   MAX(nomor_spm) AS nomor_spm, MAX(nomor_spp) AS nomor_spp,
                   MAX(jenis_pengajuan) AS jenis_pengajuan, MAX(status_pengajuan) AS status_pengajuan,
                   MAX(tanggal) AS tanggal, BOOL_OR(sumber_ambigu) AS sumber_ambigu,
                   SUM(nominal) AS nominal,
                   COALESCE(SUM(nominal) FILTER (WHERE sudah_sp2d),0) AS realisasi,
                   COALESCE(SUM(nominal) FILTER (WHERE NOT sudah_sp2d),0) AS outstanding
            FROM scoped GROUP BY alur, trans_id, unit_kerja_kunci
        ), filtered AS (
            SELECT * FROM grouped
            WHERE (${kategori}='semua' OR ${kategori}='realisasi' AND realisasi>0
                   OR ${kategori}='outstanding' AND outstanding>0)
              AND (${search}='' OR nomor_spm ILIKE ${pattern} OR nomor_spp ILIKE ${pattern} OR trans_id ILIKE ${pattern}
                   OR ${numericSearch}::text IS NOT NULL AND EXISTS (
                       SELECT 1 FROM regexp_split_to_table(nomor_spm || ',' || nomor_spp || ',' || trans_id, '[,&]') AS token
                       WHERE regexp_replace(regexp_replace(UPPER(token), '[^0-9A-Z]', '', 'g'), '^0+', '')
                           LIKE ${numericSearch ? `${numericSearch}%` : null}))
        )
        SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
               (SELECT COALESCE(SUM(nominal),0)::text FROM filtered) AS total_nominal,
               COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
                   SELECT alur,trans_id,unit_kerja_kunci,nomor_spm,nomor_spp,jenis_pengajuan,
                          status_pengajuan,tanggal,sumber_ambigu,nominal::text,realisasi::text,outstanding::text
                   FROM filtered ORDER BY tanggal DESC,alur,trans_id,unit_kerja_kunci
                   LIMIT ${limit} OFFSET LEAST(${(page - 1) * limit},
                       (SELECT GREATEST(CEIL(COUNT(*)::numeric/${limit})-1,0)::int*${limit} FROM filtered))
               ) p),'[]'::jsonb) AS rows`;
    const pages = Math.ceil(result.total / limit);
    return {rows: result.rows.map(row => ({...row, nominal: number(row.nominal),
        realisasi: number(row.realisasi), outstanding: number(row.outstanding)})),
    total: result.total, totalNominal: number(result.total_nominal), page: Math.min(page, pages || 1), pages};
}
