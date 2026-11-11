import {anggaranKolomEkspor} from '../components/verifikasi/head-data.js';
import {selTeks} from './excel.js';

// Both annual and period downloads use the same leaf rows, repeated parent columns,
// headers and widths. Only the financial values supplied by their API differ.
export function anggaranWorkbook(anggaran) {
    const baris = [];
    const amount = value => Number.isFinite(value)
        ? {value, type: Number, format: '#,##0;[Red]-#,##0'} : selTeks('-');
    const percent = row => {
        const value = row.realisasiKumulatif === undefined ? row.realisasi : row.realisasiKumulatif;
        return row.luarPagu || row.takDirinci || !(row.pagu > 0) || !Number.isFinite(value)
            ? selTeks('-') : {value: value / row.pagu, type: Number, format: '0.00%'};
    };
    const figures = row => [amount(row.realisasi), amount(row.sisa), percent(row), amount(row.outstanding)];
    for (const unit of anggaran) {
        const parent = [selTeks(unit.unitKerja), amount(unit.pagu)];
        if (!unit.mak.length) {
            baris.push([...parent, selTeks(''), selTeks(''), selTeks('-'), selTeks(''), selTeks('-'),
                ...figures(unit), selTeks('')]);
            continue;
        }
        for (const mak of unit.mak) {
            const columns = [selTeks(mak.kode, true), selTeks(mak.uraian), amount(mak.pagu)];
            const note = mak.luarPagu ? `milik ${(mak.pemilik || []).join(', ')}` : '';
            if (!mak.akun.length) {
                baris.push([...parent, ...columns, selTeks(''), selTeks('-'), ...figures(mak), selTeks(note)]);
                continue;
            }
            for (const account of mak.akun) {
                const accountNote = account.takDirinci ? 'belum dirinci di DIPA' : account.luarPagu ? note : '';
                baris.push([...parent, ...columns, selTeks(account.kode, true), amount(account.pagu),
                    ...figures(account), selTeks(accountNote)]);
            }
        }
    }
    return {head: anggaranKolomEkspor, baris, lebar: [22,16,22,26,16,12,14,14,14,16,14,24]};
}
