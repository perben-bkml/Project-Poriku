import {useEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import apiClient from '../../lib/apiClient';
import {unduhExcel} from '../../lib/excel.js';
import {initialPeriod, periodError, periodTotals} from '../../lib/anggaranPeriod.js';
import {formatRupiah} from '../bendahara/head-data.js';
import {anggaranWorkbook} from '../../lib/anggaranExport.js';
import AnggaranSearch from './Anggaran-Search.jsx';

const dateLabel = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

export default function AnggaranPeriod({tahun, canManage, units, children}) {
    const [dates, setDates] = useState(() => initialPeriod(tahun));
    const [unit, setUnit] = useState('');
    const [report, setReport] = useState(null);
    const [applied, setApplied] = useState(null);
    const [operation, setOperation] = useState('');
    const [error, setError] = useState('');
    const request = useRef(null);
    const mounted = useRef(false);
    const pending = useRef(false);
    const maxDate = initialPeriod(tahun).akhir;

    useEffect(() => {
        mounted.current = true;
        return () => {mounted.current = false;request.current?.abort();};
    }, [tahun]);

    async function run(name, action) {
        if (pending.current) return;
        pending.current = true;
        setOperation(name);setError('');
        try {await action();} catch (err) {
            if (mounted.current && err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || err.message || 'Gagal memproses laporan.');
        } finally {
            pending.current = false;
            if (mounted.current) setOperation('');
        }
    }

    async function loadReport(params) {
        const invalid = periodError(params, tahun);
        if (invalid) throw new Error(invalid);
        request.current?.abort();
        const controller = new AbortController();request.current = controller;
        const {data} = await apiClient.get('/anggaran/periode', {
            signal: controller.signal, params: {year: tahun, ...params},
        });
        if (mounted.current && !controller.signal.aborted) {setReport(data);setApplied(params);}
    }

    const totals = useMemo(() => report ? periodTotals(report.anggaran) : null, [report]);
    const changed = report && (dates.mulai !== applied.mulai || dates.akhir !== applied.akhir || unit !== (applied.unitKerja || ''));
    const busy = Boolean(operation);
    const refreshReport = () => run('report', () => loadReport(applied));
    return <section className="anggaran-period" aria-label="Laporan anggaran berdasarkan periode">
        <div className="anggaran-period-filter">
            <div className="anggaran-period-topline">
                <div><h3>Periode Realisasi</h3><p>Filter Realisasi berdasarkan tanggal. Pagu selalu menggunakan revisi aktif terbaru.</p></div>
                <span className={`anggaran-period-mode${report ? ' is-period' : ''}`}>{report ? 'Tampilan periode' : 'Tampilan tahunan'}</span>
            </div>
            <form onSubmit={event => {event.preventDefault();run('report', () => loadReport({...dates, unitKerja: unit}));}}>
                <fieldset disabled={busy} className="anggaran-period-controls">
                    <legend className="visually-hidden">Filter periode anggaran</legend>
                    <label>Tanggal mulai<input aria-label="Laporan dari" type="date" min={`${tahun}-01-01`} max={dates.akhir || maxDate}
                        required value={dates.mulai} onChange={e => setDates({...dates, mulai: e.target.value})}/></label>
                    <label>Tanggal akhir<input aria-label="Laporan sampai" type="date" min={dates.mulai || `${tahun}-01-01`} max={maxDate}
                        required value={dates.akhir} onChange={e => setDates({...dates, akhir: e.target.value})}/></label>
                    {canManage && <label className="anggaran-period-unit">Unit Kerja<select value={unit}
                        onChange={e => setUnit(e.target.value)}><option value="">Semua Unit Kerja</option>
                        {units.map(name => <option key={name} value={name}>{name}</option>)}
                    </select></label>}
                    <div className="anggaran-period-actions">
                        <button type="submit" className="anggaran-period-button is-primary">
                            {operation === 'report' ? 'Memuat periode…' : 'Tampilkan Periode'}</button>
                        {report && <button type="button" className="anggaran-period-button" onClick={() => {
                            setReport(null);setApplied(null);setError('');
                        }}>Kembali ke Tahunan</button>}
                    </div>
                </fieldset>
            </form>
            <div className="anggaran-period-footer">
                <p>{changed ? 'Filter berubah. Klik Tampilkan Periode untuk memperbarui hasil.' : report
                    ? `${dateLabel(report.mulai)} – ${dateLabel(report.akhir)} · ${applied.unitKerja || 'Seluruh unit yang dapat diakses'}`
                    : 'Belum ada filter diterapkan. Tabel di bawah menampilkan anggaran tahunan.'}</p>
            </div>
        </div>
        {error && <div className="anggaran-period-alert is-warning" role="alert"><strong>Permintaan belum dapat diproses</strong><p>{error}</p>
            {report && <p>Hasil di bawah tetap menggunakan periode {dateLabel(report.mulai)}–{dateLabel(report.akhir)}.</p>}</div>}
        {report ? <>
            <div className="anggaran-period-result-heading">
                <div><h3>Realisasi {dateLabel(report.mulai)} – {dateLabel(report.akhir)}</h3>
                    <p>Pagu menggunakan Revisi {report.revisi.nomor_revisi} terbaru, terlepas dari tanggal yang dipilih.</p></div>
                <button className="anggaran-period-button" disabled={busy} onClick={() => run('export', () => {
                    const {head, baris, lebar} = anggaranWorkbook(report.anggaran);
                    return unduhExcel(`Anggaran Periode ${report.mulai} sd ${report.akhir}.xlsx`, head, baris, lebar);
                })}>
                    {operation === 'export' ? 'Menyiapkan Excel…' : 'Unduh Excel Periode'}</button>
            </div>
            <div className="anggaran-period-summary" aria-label="Ringkasan periode">
                {[['Pagu terbaru', 'pagu'], ['Realisasi periode', 'realisasi'], ['Realisasi kumulatif', 'realisasiKumulatif'],
                    ['Sisa', 'sisa'], ['Outstanding saat ini', 'outstanding']].map(([label, key]) =>
                    <div key={key} className={key === 'realisasi' ? 'is-emphasis' : ''}><span>{label}</span>
                        <strong className={totals[key] < 0 ? 'is-negative' : ''}>{totals[key] === null ? '—' : formatRupiah(totals[key])}</strong>
                        <small>{key === 'realisasiKumulatif' ? '1 Januari sampai tanggal akhir' : key === 'sisa' ? 'Pagu terbaru − Realisasi kumulatif'
                            : key === 'outstanding' ? 'Tidak difilter berdasarkan tanggal'
                                : totals[key] === null ? 'Data belum tersedia lengkap' : '\u00a0'}</small></div>)}
            </div>
            {report.periodPartial && <p className="anggaran-period-alert is-warning" role="status">Realisasi periode berdasarkan transaksi bertanggal yang tersedia. Saldo override, tanggal pengakuan yang belum lengkap, atau catatan sumber dapat membuat nilai periode belum mencakup seluruh Realisasi. Lihat dasar perhitungan di bawah.</p>}
            <details className="anggaran-period-explanation"><summary>Dasar perhitungan dan ketersediaan data</summary><p>{report.note}</p></details>
            <div aria-busy={operation === 'report'} className={operation === 'report' ? 'anggaran-period-result is-loading' : 'anggaran-period-result'}>
                <AnggaranSearch anggaran={report.anggaran} canSearch={canManage} loading={false} kosong="Tidak ada anggaran pada periode ini."
                    tahun={tahun} snapshot={report.snapshot} period={applied} onRefresh={refreshReport}/>
            </div>
        </> : children}
    </section>;
}
AnggaranPeriod.propTypes = {tahun: PropTypes.number.isRequired, canManage: PropTypes.bool.isRequired,
    units: PropTypes.arrayOf(PropTypes.string).isRequired, children: PropTypes.node};
