import 'dotenv/config';
import { google } from 'googleapis';

const BULAN = {
  januari: '01', februari: '02', maret: '03', april: '04',
  mei: '05', juni: '06', juli: '07', agustus: '08',
  september: '09', oktober: '10', november: '11', desember: '12',
};

function convertDate(text) {
  const str = String(text || '').trim();
  if (!str || /^\d{4}-\d{2}-\d{2}/.test(str)) return null; // already ISO or empty
  const parts = str.split(/\s+/);
  if (parts.length < 3) return null;
  const [day, monthName, year] = parts;
  const mm = BULAN[monthName.toLowerCase()];
  if (!mm) return null;
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

const auth = new google.auth.JWT(
  process.env.VERIF_CLIENT_EMAIL, null,
  process.env.VERIF_PRIVATE_KEY, ['https://www.googleapis.com/auth/spreadsheets'],
);
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID_LAYANAN_GAJI_2026;
const SHEET = 'Surat Masuk';
const FIRST_ROW = 2;

const response = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID,
  range: `'${SHEET}'!A${FIRST_ROW}:H`,
});
const rows = response.data.values || [];

const updates = [];
for (let i = 0; i < rows.length; i++) {
  const rowNum = FIRST_ROW + i;
  const tanggalTerima = convertDate(rows[i][1]);
  const tanggalSurat = convertDate(rows[i][2]);
  if (tanggalTerima) updates.push({ range: `'${SHEET}'!B${rowNum}`, values: [[tanggalTerima]] });
  if (tanggalSurat) updates.push({ range: `'${SHEET}'!C${rowNum}`, values: [[tanggalSurat]] });
}

if (updates.length === 0) {
  console.log('No dates to convert.');
} else {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: updates },
  });
  console.log(`Converted ${updates.length} date cells.`);
}
