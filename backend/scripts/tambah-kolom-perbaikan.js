// One-off: adds the 'Tanggal Perbaikan' column to both antrian sheets of every AJUAN
// spreadsheet. There is no migration runner for sheets, so this is applied by hand the way
// migrations/ is: `node scripts/tambah-kolom-perbaikan.js` from backend/.
//
// The column is what tells Daftar Pengajuan, Kelola Pengajuan and Pengujian PJK that a satker has
// responded to a problem. It sits past every column the write paths know about, so nothing shifts.
// Re-running is safe: a sheet whose header already reads the label is skipped.
import 'dotenv/config';
import { google } from "googleapis";

const JUDUL = "Tanggal Perbaikan";

// Twin of AJUAN_FLOWS in server.js - keep the letters in step with perbaikanColumn there
const SHEETS = [
    { title: "Write Antrian", column: "U" },
    { title: "Write Antrian Verif", column: "S" },
];

const auth = new google.auth.JWT(
    process.env.AJUAN_CLIENT_EMAIL,
    null,
    process.env.AJUAN_PRIVATE_KEY,
    ["https://www.googleapis.com/auth/spreadsheets"],
);
const sheets = google.sheets({ version: "v4", auth });

const columnIndex = (letter) => letter.charCodeAt(0) - 65;
const columnLetter = (index) => String.fromCharCode(index + 65);

async function patch(spreadsheetId) {
    const info = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title,gridProperties/columnCount))",
    });
    const byTitle = new Map((info.data.sheets || [])
        .map(sheet => [sheet.properties.title, sheet.properties]));

    // 'Write Antrian Verif' postdates the older year files, so a sheet that is simply not there
    // is skipped rather than fatal - the rest of the spreadsheets still have to be patched
    const present = SHEETS.filter(({ title }) => {
        if (byTitle.has(title)) return true;
        console.log(`- ${title}: tidak ada di spreadsheet ini, dilewati.`);
        return false;
    });
    if (present.length === 0) return;

    // Widen the grid first: a write past the last column fails with "exceeds grid limits"
    const widen = [];
    for (const { title, column } of present) {
        const properties = byTitle.get(title);
        const needed = columnIndex(column) + 1;
        const current = properties.gridProperties?.columnCount ?? 0;
        if (current < needed) {
            widen.push({ appendDimension: {
                sheetId: properties.sheetId, dimension: "COLUMNS", length: needed - current,
            }});
        }
    }
    if (widen.length > 0) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: widen } });
    }

    // Rows 1-2 are header on both sheets, and which of the two carries the labels differs, so the
    // label goes wherever the neighbouring column put its own rather than on a guessed row
    const heads = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: present.map(({ title, column }) => `'${title}'!A1:${column}2`),
    });

    const writes = [];
    present.forEach(({ title, column }, index) => {
        const rows = heads.data.valueRanges?.[index]?.values || [];
        const at = columnIndex(column);
        if (rows.some(row => String(row?.[at] ?? "").trim() === JUDUL)) {
            console.log(`- ${title}: sudah ada, dilewati.`);
            return;
        }
        const neighbour = columnLetter(at - 1);
        const headerRow = rows.findIndex(row => String(row?.[at - 1] ?? "").trim() !== "") + 1;
        if (headerRow === 0) {
            console.warn(`- ${title}: kolom ${neighbour} tidak berjudul, memakai baris 2.`);
        }
        const target = headerRow || 2;
        writes.push({ range: `'${title}'!${column}${target}`, values: [[JUDUL]] });
        console.log(`- ${title}: menulis "${JUDUL}" di ${column}${target}.`);
    });

    if (writes.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: { valueInputOption: "RAW", data: writes },
        });
    }
}

const ids = [...new Set(Object.entries(process.env)
    .filter(([key, value]) => /^SPREADSHEET_ID_AJUAN(_\d{4})?$/.test(key) && value)
    .map(([, value]) => value.trim()))];

if (ids.length === 0) {
    console.error("Tidak ada SPREADSHEET_ID_AJUAN di .env.");
    process.exit(1);
}

for (const id of ids) {
    console.log(`\nSpreadsheet ${id}`);
    await patch(id);
}
console.log("\nSelesai.");
