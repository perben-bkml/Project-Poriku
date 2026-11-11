import {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import Drawer from '@mui/material/Drawer';
import Pagination from '@mui/material/Pagination';
import apiClient from '../../lib/apiClient';
import {formatRupiah, daftarStatusStyle} from '../bendahara/head-data.js';
import {PopupAlert} from '../../ui/Popup.jsx';
import LoadingAnimate from '../../ui/loading.jsx';

const WARNING_LABELS = {tanpaInduk: 'baris tanpa pengajuan asal', makKosong: 'baris tanpa MAK',
    nominalTidakValid: 'baris bernominal tidak valid/nonpositif', identitasGanda: 'identitas pengajuan ganda'};

export default function AnggaranSpmDrawer({scope, tahun, snapshot, onClose, onRefresh, period}) {
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    const [kategori, setKategori] = useState('semua');
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retry, setRetry] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const cache = useRef(new Map());

    useEffect(() => {
        const timer = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300);
        return () => clearTimeout(timer);
    }, [input]);

    useEffect(() => {
        const controller = new AbortController();
        const key = JSON.stringify([tahun, snapshot, period, scope.unitKerja, scope.kodeMak, scope.kodeAkun, kategori, search, page]);
        setError(null);
        setResult(null);
        if (!snapshot) {
            setError({status: 409, message: 'Rincian belum siap. Muat ulang Anggaran untuk menyelaraskan data.'});
            setLoading(false);
            return () => controller.abort();
        }
        const cached = cache.current.get(key);
        if (cached) {
            setResult(cached);
            setLoading(false);
            return () => controller.abort();
        }
        setLoading(true);
        apiClient.get(period ? '/anggaran/periode/rincian' : '/anggaran/rincian-spm', {signal: controller.signal, params: {
            year: tahun, snapshot, unitKerja: scope.unitKerja, kodeMak: scope.kodeMak || '',
            kodeAkun: scope.kodeAkun || '', kategori, search, page, limit: 25,
            ...(period ? {mulai: period.mulai, akhir: period.akhir} : {}),
        }}).then(({data}) => {
            if (controller.signal.aborted) return;
            if (cache.current.size >= 40) cache.current.clear();
            cache.current.set(key, data);
            setResult(data);
        }).catch(err => {
            if (!controller.signal.aborted) setError({status: err.response?.status,
                message: err.response?.data?.message || 'Gagal memuat rincian SPM.'});
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [scope.unitKerja, scope.kodeMak, scope.kodeAkun, tahun, snapshot, kategori, search, page, retry, period]);

    async function refresh() {
        setRefreshing(true);
        try { await onRefresh(); } finally { setRefreshing(false); }
    }
    const warnings = Object.entries(result?.warnings || {}).filter(([, count]) => count > 0);

    return <Drawer anchor="right" open onClose={onClose}
        sx={{'& .MuiDrawer-paper': {width: 'min(100vw, 1080px)', boxSizing: 'border-box'}}}>
        <section className="anggaran-spm-panel" aria-labelledby="anggaran-spm-title">
            <div className="anggaran-spm-header">
                <div><h2 id="anggaran-spm-title">Rincian SPM · {tahun}</h2>
                    <p>{[scope.unitKerja, scope.kodeMak, scope.kodeAkun].filter(Boolean).join(' / ')}</p>
                    {scope.uraian && <p>{scope.uraian}</p>}
                </div>
                <button type="button" className="anggaran-spm-close" aria-label="Tutup rincian SPM" onClick={onClose}>×</button>
            </div>
            <p className="anggaran-spm-note">{period
                ? `Realisasi ${period.mulai}–${period.akhir} menggunakan Pagu revisi terbaru. Outstanding tetap menunjukkan posisi saat ini.`
                : 'Nominal hanya mencakup alokasi pada lingkup yang dipilih. Nomor SPM pada antrian dapat berasal dari SPP; lihat status proses pengajuannya.'}</p>
            <form className="anggaran-spm-filters" onSubmit={event => event.preventDefault()}>
                <label>Cari SPM / SPP / ID
                    <input type="search" value={input} maxLength={100} placeholder="Contoh: 00561A"
                           onChange={event => setInput(event.target.value)}/></label>
                <label>Kategori
                    <select value={kategori} onChange={event => {setKategori(event.target.value); setPage(1);}}>
                        <option value="semua">Semua</option><option value="realisasi">Realisasi</option>
                        <option value="outstanding">Outstanding</option>
                    </select></label>
            </form>
            {error && <div className="anggaran-spm-error">
                <PopupAlert severity="warning" message={error.message}/>
                <button type="button" className="anggaran-period-button" disabled={refreshing} onClick={refresh}>
                    {refreshing ? 'Memuat…' : 'Muat ulang Anggaran'}</button>
                {error.status !== 409 && <button type="button" className="anggaran-period-button" onClick={() => setRetry(value => value + 1)}>Coba lagi</button>}
            </div>}
            <div aria-busy={loading}>
                {loading ? <LoadingAnimate/> : result && <>
                    <div className="anggaran-spm-totals" aria-label="Total lingkup anggaran">
                        {[['Realisasi', result.totals.realisasi], [period ? 'Outstanding saat ini' : 'Outstanding', result.totals.outstanding],
                            ...(!period || result.totals.saldoAwal > 0 ? [['Saldo awal—tanpa rincian SPM', result.totals.saldoAwal]] : [])].map(([label, value]) =>
                            <div key={label}><span>{label}</span><strong>{value === null ? '—' : formatRupiah(value)}</strong></div>)}
                    </div>
                    {period && <p className="anggaran-spm-note">{result.outstandingNote}</p>}
                    {period && result.periodPartial && <p className="anggaran-spm-source-warning">Realisasi periode dapat belum lengkap karena saldo override tidak memiliki rincian tanggal atau ada tanggal pengakuan yang belum terisi.</p>}
                    {result.scope.mode !== 'anggaran' && <p className="anggaran-spm-note">
                        {result.scope.mode === 'klaim' ? 'MAK ini memakai anggaran unit lain. Nominal ditampilkan sebagai klaim dan tidak dijumlahkan ulang ke unit pengaju.'
                            : 'Akun ini belum dirinci di DIPA. Nominal tidak termasuk total MAK dan Unit Kerja induk.'}</p>}
                    {warnings.length > 0 && <p className="anggaran-spm-source-warning">Catatan sumber untuk tahun ini: {warnings
                        .map(([name, count]) => `${count} ${WARNING_LABELS[name] || name}`).join('; ')}. Baris tanpa alokasi valid tidak masuk perhitungan.</p>}
                    <p className="anggaran-spm-note">{result.total} pengajuan · Total sesuai filter: {formatRupiah(result.totalNominal)}.
                        {' '}Ringkasan lingkup di atas tetap mencakup semua kategori dan saldo awal.</p>
                    {result.rows.length ? <div className="dp-scroll"><table className="dp-table anggaran-spm-table">
                        <thead><tr>{['SPM / SPP', 'Jenis', 'Unit Kerja Pengaju', 'Nominal pada Lingkup Ini', 'Kategori', 'Status Pengajuan']
                            .map(label => <th key={label}>{label}</th>)}</tr></thead>
                        <tbody>{result.rows.map(row => {
                            const realized = row.realisasi !== 0;
                            const style = daftarStatusStyle(realized ? 'sudah' : 'belum');
                            return <tr key={row.key}>
                                <td><strong>{row.sumber_ambigu ? 'Nomor SPM tidak dapat dipastikan' : row.nomor_spm || 'Belum ada SPM'}</strong>
                                    <small>SPP: {row.nomor_spp || '—'} · ID: {row.trans_id} ({row.alur === 'gup' ? 'GUP/PTUP' : 'Verifikasi'})</small>
                                    {row.sumber_ambigu && <small className="anggaran-spm-source-warning">Identitas pengajuan ganda di sumber</small>}</td>
                                <td>{row.jenis_pengajuan || '—'}</td><td>{row.unitKerjaPengaju}</td>
                                <td className="dp-num">{formatRupiah(row.nominal)}</td>
                                <td><span className="dp-status" style={{backgroundColor: style.bg, color: style.fg}}>{realized ? 'Realisasi' : 'Outstanding'}</span></td>
                                <td>{row.status_pengajuan || '—'}</td>
                            </tr>;
                        })}</tbody>
                    </table></div> : <p className="kelola-empty">Tidak ada pengajuan yang cocok. Saldo awal tidak memiliki rincian SPM.</p>}
                    {result.pages > 1 && <Pagination className="dp-pagination" count={result.pages} page={result.page}
                        onChange={(_, value) => setPage(value)}/>}
                    {result.disegarkanPada && <p className="anggaran-spm-note">Data diperbarui: {new Date(result.disegarkanPada).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}.</p>}
                </>}
            </div>
        </section>
    </Drawer>;
}

AnggaranSpmDrawer.propTypes = {
    scope: PropTypes.object.isRequired, tahun: PropTypes.number, snapshot: PropTypes.string,
    onClose: PropTypes.func.isRequired, onRefresh: PropTypes.func.isRequired,
    period: PropTypes.object,
};
