// Date validation and top-level report summaries, independent of component state.
function jakartaToday() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function initialPeriod(tahun, today = jakartaToday()) {
    return {mulai: `${tahun}-01-01`, akhir: `${tahun}-12-31` < today ? `${tahun}-12-31` : today};
}

export function periodError({mulai, akhir}, tahun, today = jakartaToday()) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
        && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!valid(mulai) || !valid(akhir)) return 'Lengkapi tanggal mulai dan tanggal akhir.';
    if (!mulai.startsWith(`${tahun}-`) || !akhir.startsWith(`${tahun}-`)) return 'Tanggal harus berada dalam tahun anggaran terpilih.';
    if (mulai > akhir) return 'Tanggal akhir tidak boleh mendahului tanggal mulai.';
    if (akhir > today) return 'Tanggal akhir tidak boleh melewati hari ini.';
    return '';
}

export function periodTotals(anggaran) {
    // Child MAK/Akun repeat the parent: only sum Unit Kerja rows.
    const sum = field => anggaran.some(row => !Number.isFinite(row[field]))
        ? null : anggaran.reduce((total, row) => total + row[field], 0);
    return Object.fromEntries(['pagu', 'realisasi', 'realisasiKumulatif', 'sisa', 'outstanding'].map(field => [field, sum(field)]));
}
