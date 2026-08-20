import React, { useState, useEffect, useContext } from 'react';
// Import Head Data
import { monthNames } from './head-data.js';
// Import Made UI
import { TableRekKoran, TableSpmBendahara } from '../../ui/tables.jsx';
import LoadingAnimate from '../../ui/loading.jsx';
import Popup, { PopupAlert } from '../../ui/Popup.jsx';
// Import Functions
import { fetchNotPaidSPM, fetchRekKoran } from '../../lib/fetches.js';
import apiClient from '../../lib/apiClient';
import { AuthContext } from '../../lib/AuthContext.jsx';
import { BackgroundTaskContext } from '../../lib/BackgroundTasks.jsx';

const SPM_HEAD = ["Tanggal SP2D", "SPM", "Jenis SPM", "Unit Kerja", "Nilai SP2D",
    "Bukti Bayar", "Tanggal Bayar", "Status"];
const BELUM_BAYAR_HEAD = ["Tanggal SP2D", "SPM", "Jenis", "VA", "Unit Kerja", "Nilai SP2D",
    "Status Bayar Penerima", "Status Pajak"];
const MAX_FILE_MB = 10;

function InfoSPMBendahara() {
    // Use Context
    const { user } = useContext(AuthContext);
    const { runTask } = useContext(BackgroundTaskContext);

    // State
    const selectedYear = localStorage.getItem('poriku-selected-year') || new Date().getFullYear().toString();
    const [spmQuery, setSpmQuery] = useState("");
    const [spmResult, setSpmResult] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [notPaidSPM, setNotPaidSPM] = useState([]);
    const [rekKoran, setRekKoran] = useState([]);
    const [isLoading1, setIsLoading1] = useState(false);
    const [isLoading2, setIsLoading2] = useState(false);
    // "<baris>-<bulan>" of the cell being saved, and the pending replace awaiting confirmation
    const [uploading, setUploading] = useState(null);
    const [replaceTarget, setReplaceTarget] = useState(null);
    const [alert, setAlert] = useState(null);

    const canUpload = user.role === "admin" || user.role === "master admin";
    const rekKoranMonths = monthNames.slice(1).map(month => `${month.title.toUpperCase()} ${selectedYear}`);

    // Fetch data SPM yang belum selesai dibayarkan on page load
    useEffect(() => {
        fetchNotPaidSPM(setNotPaidSPM, setIsLoading1);
        fetchRekKoran(setRekKoran, setIsLoading2);
    }, []);

    function showAlert(severity, message) {
        setAlert({severity, message});
        setTimeout(() => setAlert(null), 5000);
    }

    // Picking straight from the cell, so the checks the server makes are mirrored here
    // rather than letting a wrong file travel
    function handleRekKoranPick(row, month, file) {
        if (file.type !== "application/pdf") return showAlert("error", "Berkas harus berformat PDF.");
        if (file.size > MAX_FILE_MB * 1024 * 1024) return showAlert("error", `Ukuran berkas melebihi ${MAX_FILE_MB} MB.`);
        if (row.berkas[month].nama) return setReplaceTarget({row, month, file});
        uploadRekKoran(row, month, file);
    }

    function uploadRekKoran(row, month, file) {
        const cell = `${row.rowNumber}-${month}`;
        const sendData = new FormData();
        sendData.append('berkas', file);
        sendData.append('rowNumber', row.rowNumber);
        sendData.append('bulan', month);
        // Re-checked server side: rows are addressed by position
        sendData.append('expectedSatker', row.satker);
        sendData.append('expectedNamaRekening', row.namaRekening);

        setUploading(cell);
        runTask({
            label: `Rekening Koran ${row.satker} ${rekKoranMonths[month]}`,
            tag: "rek-koran",
            run: async () => {
                try {
                    const response = await apiClient.patch('/bendahara/pembayaran-bp/rek-koran', sendData,
                        {headers: {'Content-Type': 'multipart/form-data'}});
                    // The response carries the new cell, so the table needs no refetch
                    setRekKoran(prev => prev.map(item => item.rowNumber === row.rowNumber
                        ? {...item, berkas: item.berkas.map((berkas, index) =>
                            index === month ? {...berkas, ...response.data.berkas} : berkas)}
                        : item));
                    return response.data?.message;
                } finally {
                    setUploading(current => current === cell ? null : current);
                }
            },
        });
    }

    function handleReplace() {
        const {row, month, file} = replaceTarget;
        setReplaceTarget(null);
        uploadRekKoran(row, month, file);
    }

    async function handleCariSpm() {
        if (!spmQuery.trim()) return;
        try {
            setIsSearching(true);
            const response = await apiClient.get('/bendahara/pembayaran-bp/cari', {params: {spm: spmQuery}});
            setSpmResult(response.data.data);
        } catch (error) {
            console.error("Gagal mencari SPM.", error);
            setSpmResult([]);
        } finally {
            setIsSearching(false);
        }
    }

    return (
        <div className='spm-bend-container'>
            <div className='bg-card spm-bend'>
                <div className='cari spm-container'>
                    <h2 className='spm-titles'>Cari SPM </h2>
                    <label className='cari-label'>Masukkan Nomor SPM: </label>
                    <input className='cari-input' name='cari-input' type="number" placeholder='Tulis disini'
                           value={spmQuery} onChange={e => setSpmQuery(e.target.value)}
                           onKeyDown={e => e.key === 'Enter' && handleCariSpm()}/>
                    <button className='cari spm-button' onClick={handleCariSpm}>Cari</button>
                </div>
                {isSearching ? <LoadingAnimate/> : spmResult && (
                    spmResult.length === 0
                        ? <p style={{textAlign: "center", margin: "20px 0", color: "#5A6472"}}>Nomor SPM tidak ditemukan.</p>
                        : <TableSpmBendahara tableData={[SPM_HEAD, ...spmResult.map(row => [
                            row.tanggalSp2d, row.nomorSpm, row.jenis, row.unitKerja,
                            row.nilaiSp2d, row.buktiBayar, row.tanggalBayarPenerima, row.statusBayarPenerima,
                          ])]}/>
                )}
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>SPM Yang Belum Selesai Dibayarkan</h2>
                {isLoading1 ? <LoadingAnimate /> : notPaidSPM.length === 0
                    ? <p style={{textAlign: "center", margin: "20px 0", color: "#5A6472"}}>Tidak ada SPM yang belum selesai dibayarkan.</p>
                    : <TableSpmBendahara tableData={[BELUM_BAYAR_HEAD, ...notPaidSPM.map(row => [
                        row.tanggalSp2d, row.nomorSpm, row.jenis, row.va, row.unitKerja,
                        row.nilaiSp2d, row.statusBayarPenerima, row.statusPajak,
                      ])]}/>
                }
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>Informasi Rekening Koran</h2>
                {isLoading2 ? <LoadingAnimate /> : rekKoran.length === 0
                    ? <p style={{textAlign: "center", margin: "20px 0", color: "#5A6472"}}>Data Rekening Koran tidak tersedia.</p>
                    : <TableRekKoran rows={rekKoran} months={rekKoranMonths} uploading={uploading}
                                     onUpload={canUpload ? handleRekKoranPick : undefined}/>
                }
            </div>
            {replaceTarget &&
                <Popup message={`Ganti berkas ${replaceTarget.row.berkas[replaceTarget.month].nama}?`}
                       whenClick={handleReplace} cancel={() => setReplaceTarget(null)}/>}
            {alert && <PopupAlert isAlert={!!alert} severity={alert.severity} message={alert.message}/>}
        </div>
    )
}

export default InfoSPMBendahara;
