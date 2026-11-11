// Run from backend/: node scripts/backfill-pjk-spm.js [--year=2026] [--apply]
// Defaults to a dry run; fills only empty H cells in configured AJUAN spreadsheets.
import 'dotenv/config';
import { google } from 'googleapis';
import { missingPjkSpmWrites, pjkSpmFromSpp } from '../lib/pjkSpm.js';

const apply = process.argv.includes('--apply');
const year = process.argv.find(arg => arg.startsWith('--year='))?.slice(7);
if (year && !/^\d{4}$/.test(year)) throw new Error('Tahun tidak valid.');
const sheet = 'Write Antrian Verif';
const targets = new Map();
for (const [key, value] of Object.entries(process.env)) {
    if (!/^SPREADSHEET_ID_AJUAN(_\d{4})?$/.test(key) || !value?.trim()) continue;
    if (year && key !== `SPREADSHEET_ID_AJUAN_${year}`) continue;
    const id = value.trim();
    targets.set(id, [...(targets.get(id) || []), key]);
}
if (!targets.size) throw new Error('Spreadsheet AJUAN tidak dikonfigurasi.');
const auth = new google.auth.JWT({
    email: process.env.AJUAN_CLIENT_EMAIL,
    key: process.env.AJUAN_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({version: 'v4', auth});
async function retry(operation) {
    for (let attempt = 0; ; attempt++) {
        try { return await operation(); } catch (error) {
            const code = Number(error.code || error.response?.status);
            if (attempt >= 2 || !(code === 429 || code >= 500)) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
        }
    }
}
async function readRows(spreadsheetId) {
    const response = await retry(() => sheets.spreadsheets.values.get({
        spreadsheetId, range: `'${sheet}'!A3:H`, valueRenderOption: 'FORMULA',
    }, {timeout: 20000}));
    return response.data.values || [];
}
try {
    for (const [spreadsheetId, keys] of targets) {
        const metadata = await retry(() => sheets.spreadsheets.get({
            spreadsheetId, fields: 'sheets(properties(title))',
        }, {timeout: 20000}));
        if (!metadata.data.sheets?.some(item => item.properties.title === sheet)) {
            console.log(`${keys.join(', ')}: sheet ${sheet} tidak ada; dilewati.`);
            continue;
        }
        const rows = await readRows(spreadsheetId);
        if (process.argv.includes('--show-multiple')) console.log('SPP ganda:', rows.flatMap((row, index) =>
            /[,&]/.test(String(row[6] ?? ''))
                ? [{row: index + 3, spp: row[6], spm: row[7] || '', expected: pjkSpmFromSpp(row[6])}] : []));
        const data = missingPjkSpmWrites(rows, {sheet});
        const skipped = rows.filter(row => String(row[0] ?? '').trim()
            && !String(row[7] ?? '').trim() && String(row[6] ?? '').trim() && !pjkSpmFromSpp(row[6])).length;
        console.log(`${keys.join(', ')}: ${data.length} H kosong dapat diisi; ${skipped} SPP tidak valid dilewati.`);
        if (skipped) console.log('Baris SPP yang perlu diperiksa:', rows.flatMap((row, index) =>
            String(row[0] ?? '').trim() && !String(row[7] ?? '').trim() && String(row[6] ?? '').trim() && !pjkSpmFromSpp(row[6])
                ? [{row: index + 3, spp: String(row[6]).slice(0, 40)}] : []));
        if (!apply || !data.length) continue;
        // Re-read immediately before applying; row shifts or intervening edits require a new run.
        const fresh = await readRows(spreadsheetId);
        if (JSON.stringify(fresh) !== JSON.stringify(rows)) throw new Error('Data berubah sebelum disimpan. Jalankan ulang.');
        await retry(() => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId, requestBody: {valueInputOption: 'RAW', data},
        }, {timeout: 20000}));
        const verified = await readRows(spreadsheetId);
        const correct = data.every(write => {
            const index = Number(write.range.match(/H(\d+)$/)[1]) - 3;
            return verified[index]?.[7] === write.values[0][0]
                && String(verified[index]?.[0]) === String(rows[index]?.[0])
                && String(verified[index]?.[6]) === String(rows[index]?.[6]);
        });
        if (!correct) throw new Error('Verifikasi hasil pengisian gagal; periksa perubahan baris.');
        console.log(`${keys.join(', ')}: ${data.length} sel H tersimpan dan terverifikasi.`);
    }
    console.log(apply ? 'Backfill selesai.' : 'Dry run selesai; gunakan --apply untuk menyimpan.');
} catch (error) {
    const reason = error.response?.data?.error;
    console.error(`Backfill gagal (${error.code || error.response?.status || 'validasi'}).`,
        typeof reason?.message === 'string' ? reason.message.replace(/[A-Za-z0-9_-]{30,}/g, '[redacted]')
            : error.response?.data?.error_description || (error.config ? 'Tidak dapat mengakses atau memperbarui Google Sheets.' : error.message));
    process.exitCode = 1;
}
