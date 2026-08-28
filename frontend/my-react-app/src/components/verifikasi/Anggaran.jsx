import {useContext, useEffect, useRef, useState} from 'react';
import apiClient from "../../lib/apiClient";
// Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {AuthContext} from "../../lib/AuthContext.jsx";
import {anggaranKolomTemplate, anggaranContohBaris, anggaranModes} from "./head-data.js";
import {unduhExcel, selTeks} from "../../lib/excel.js";
// Import Tables
import {TableAnggaranPohon, TableSelisihAnggaran} from "../../ui/tables.jsx";

// Twin of ANGGARAN_MAX_FILE_MB in server.js - the label has to name the limit multer enforces
const ANGGARAN_MAX_MB = 10;

export default function Anggaran() {
    const {user} = useContext(AuthContext);
    // Same gate as SPM-Bend: writing is admin only, reading is not
    const canUnggah = user.role === "admin" || user.role === "master admin";

    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState(null);
    const [revisiList, setRevisiList] = useState([]);
    const [alert, setAlert] = useState(null);

    // Upload panel
    const berkasRef = useRef(null);
    const [catatan, setCatatan] = useState("");
    // Defaults to perUnit, which is what the previous single checkbox did when unticked
    const [mode, setMode] = useState("perUnit");
    const [isUnggah, setIsUnggah] = useState(false);
    const [isTerapkan, setIsTerapkan] = useState(false);
    // The diff waiting for a decision, and the blocking problems of a rejected file
    const [pratinjau, setPratinjau] = useState(null);
    const [masalah, setMasalah] = useState([]);

    function showAlert(severity, message) {
        setAlert({severity, message});
        setTimeout(() => setAlert(null), 5000);
    }

    async function fetchAnggaran(quiet = false) {
        try {
            if (!quiet) setIsLoading(true);
            const response = await apiClient.get('/anggaran');
            setData(response.data);
        } catch (error) {
            console.log("Failed fetching anggaran.", error);
            showAlert("error", error?.response?.data?.message || "Gagal memuat anggaran.");
            setData(null);
        } finally {
            if (!quiet) setIsLoading(false);
        }
    }

    async function fetchRevisi() {
        if (!canUnggah) return;
        try {
            const response = await apiClient.get('/anggaran/revisi');
            setRevisiList(response.data.revisi || []);
        } catch (error) {
            console.log("Failed fetching revisi.", error);
            setRevisiList([]);
        }
    }

    useEffect(() => {
        fetchAnggaran();
        fetchRevisi();
    }, []);

    // The template is generated rather than stored so it can never drift from the column
    // list the parser actually checks
    async function unduhTemplate() {
        const baris = anggaranContohBaris.map(row => row.map(sel => selTeks(sel, true)));
        await unduhExcel("Template Anggaran.xlsx", anggaranKolomTemplate, baris, [22, 18, 22, 28, 18, 14, 18]);
    }

    // Preview. The server persists the parsed file as a draft revisi and answers with the
    // diff; nothing is visible to anyone else until Terapkan flips it.
    async function kirimBerkas(event) {
        // The form owns the submit so `required` runs, which means stopping the reload here
        event.preventDefault();
        const berkas = berkasRef.current?.files?.[0];
        if (!berkas) return showAlert("warning", "Pilih berkas .xlsx terlebih dahulu.");
        if (berkas.size > ANGGARAN_MAX_MB * 1024 * 1024) {
            // Rejected here as well as on the server, so an oversized file is never uploaded
            return showAlert("warning", `Ukuran berkas melebihi ${ANGGARAN_MAX_MB} MB.`);
        }

        // A draft already on screen would be orphaned by a second upload
        if (pratinjau) await batalkanDraf(true);

        const formData = new FormData();
        formData.append('berkas', berkas);
        formData.append('catatan', catatan);
        formData.append('mode', mode);
        try {
            setIsUnggah(true);
            setMasalah([]);
            const response = await apiClient.post('/anggaran/unggah', formData,
                {headers: {'Content-Type': 'multipart/form-data'}});
            setPratinjau(response.data);
        } catch (error) {
            const body = error?.response?.data;
            setPratinjau(null);
            setMasalah(body?.masalah || []);
            showAlert("error", body?.message || "Gagal memproses berkas.");
        } finally {
            setIsUnggah(false);
        }
    }

    async function terapkanDraf() {
        if (!pratinjau) return;
        try {
            setIsTerapkan(true);
            const response = await apiClient.post('/anggaran/unggah/terapkan', {revisiId: pratinjau.revisiId});
            setPratinjau(null);
            setCatatan("");
            if (berkasRef.current) berkasRef.current.value = "";
            showAlert("success", response.data.message || "Revisi diterapkan.");
            await Promise.all([fetchAnggaran(true), fetchRevisi()]);
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menerapkan revisi.");
        } finally {
            setIsTerapkan(false);
        }
    }

    // diam=true when this is housekeeping before a fresh upload, not the admin pressing Batal
    async function batalkanDraf(diam = false) {
        if (!pratinjau) return;
        try {
            await apiClient.delete('/anggaran/unggah', {params: {revisiId: pratinjau.revisiId}});
            setPratinjau(null);
            if (!diam) showAlert("info", "Draf dibatalkan.");
        } catch (error) {
            if (!diam) showAlert("error", error?.response?.data?.message || "Gagal membatalkan draf.");
        }
    }

    const modeTerpilih = anggaranModes.find(item => item.value === mode) || anggaranModes[1];

    if (isLoading && !data) return <LoadingAnimate/>;

    const revisiAktif = data?.revisi;

    return (
        <div>
            {/* Upload panel - admin only */}
            {canUnggah &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Unggah Anggaran</h2>
                        <div className="wide-card-actions">
                            <input className="btn-aksi btn-aksi-wide" type="button" value="Unduh Template"
                                   onClick={unduhTemplate}/>
                        </div>
                    </div>

                    {/* Native submit so the browser runs the `required` check on the file
                        input, the same reason Kirim-Dokumen-Gaji avoids SubmitButton here */}
                    <form className="anggaran-form" onSubmit={kirimBerkas}>
                        <p className="anggaran-intro">
                            Satu baris per Akun Belanja, dengan kolom induk diulang. Nominal harus rupiah
                            bulat - pemisah ribuan (100.000.000 atau 100,000,000) boleh, pecahan ditolak.
                        </p>

                        <label htmlFor="berkas">Berkas Anggaran (.xlsx, maks. {ANGGARAN_MAX_MB} MB)</label>
                        <div className="anggaran-file">
                            <input type="file" id="berkas" name="berkas" accept=".xlsx" ref={berkasRef} required/>
                            <span className="anggaran-note">
                                Gunakan Unduh Template bila belum punya berkas dengan susunan kolom yang benar.
                            </span>
                        </div>

                        <label htmlFor="catatan">Catatan Revisi</label>
                        <input type="text" id="catatan" name="catatan" className="type-btn"
                               placeholder="mis. Revisi DIPA ke-2" value={catatan}
                               onChange={event => setCatatan(event.target.value)}/>

                        <label htmlFor="mode">Cara Menerapkan</label>
                        <select id="mode" name="mode" className="type-btn" value={mode}
                                onChange={event => setMode(event.target.value)}>
                            {anggaranModes.map(item => (
                                <option key={item.value} value={item.value}>{item.title}</option>
                            ))}
                        </select>
                        <p className={`anggaran-mode-note ${modeTerpilih.bahaya ? "anggaran-bahaya" : ""}`}>
                            {modeTerpilih.keterangan}
                        </p>

                        <div className="form-submit">
                            <input type="submit" className="btn-submit-wide" name="periksa-anggaran"
                                   value={isUnggah ? "Memproses..." : "Periksa Berkas"} disabled={isUnggah}/>
                        </div>
                    </form>

                    {/* Blocking problems. Nothing was written, so there is no draft to discard. */}
                    {masalah.length > 0 &&
                        <div className="anggaran-pesan">
                            <h3>Berkas belum dapat diproses</h3>
                            <ul>
                                {masalah.map((item, index) => (
                                    <li key={index}>Baris {item.baris}: {item.pesan}</li>
                                ))}
                            </ul>
                        </div>}
                </div>}

            {/* The diff, waiting for a decision */}
            {canUnggah && pratinjau &&
                <div className="bg-card wide-card-content anggaran-pratinjau">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Pratinjau Perubahan</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-revisi-aktif">{pratinjau.namaBerkas}</span>
                        </div>
                    </div>
                    <div className="anggaran-pratinjau-body">
                        <p className="anggaran-ringkasan">
                            <strong>{pratinjau.ringkasan.tambah}</strong> tambah,{' '}
                            <strong>{pratinjau.ringkasan.ubah}</strong> ubah,{' '}
                            <strong className={pratinjau.ringkasan.hapus > 0 ? "anggaran-hapus" : ""}>
                                {pratinjau.ringkasan.hapus}
                            </strong> hapus, dari <strong>{pratinjau.ringkasan.unitDisentuh}</strong> unit
                            kerja di dalam berkas.
                        </p>
                        <p className="anggaran-ringkasan">
                            {anggaranModes.find(item => item.value === pratinjau.mode)?.title || pratinjau.mode}
                        </p>
                        {pratinjau.peringatan?.length > 0 &&
                            <ul className="anggaran-peringatan">
                                {pratinjau.peringatan.map((item, index) => (
                                    <li key={index}>Baris {item.baris}: {item.pesan}</li>
                                ))}
                            </ul>}
                        <p className="anggaran-belum">
                            Belum ada yang berubah. Perubahan baru berlaku setelah ditekan Terapkan.
                        </p>
                        <div className="form-submit">
                            <input type="button" className="btn-submit-wide" name="terapkan-anggaran"
                                   value={isTerapkan ? "Menerapkan..." : "Terapkan"}
                                   disabled={isTerapkan} onClick={terapkanDraf}/>
                            <input type="button" className="btn-submit-wide" name="batal-anggaran" value="Batalkan"
                                   disabled={isTerapkan} onClick={() => batalkanDraf(false)}/>
                        </div>
                    </div>
                    <TableSelisihAnggaran perubahan={pratinjau.perubahan}/>
                </div>}

            {/* The budget as it currently stands */}
            <div className="bg-card wide-card-content">
                <div className="wide-card-head">
                    <h2 className="wide-card-title">
                        Anggaran {data?.tahun || ""}
                        {revisiAktif &&
                            <span className="anggaran-revisi-aktif">
                                Revisi {revisiAktif.nomorRevisi}{revisiAktif.catatan ? ` - ${revisiAktif.catatan}` : ""}
                            </span>}
                    </h2>
                    <div className="wide-card-actions">
                        <input className="btn-aksi btn-aksi-wide" type="button"
                               value={isLoading ? "Memuat..." : "Muat Ulang"} disabled={isLoading}
                               onClick={() => fetchAnggaran()}/>
                    </div>
                </div>
                {isLoading ? <LoadingAnimate/> : <TableAnggaranPohon anggaran={data?.anggaran || []}/>}
            </div>

            {/* Revisi history - the snapshot model is the audit trail, so it is worth showing */}
            {canUnggah && revisiList.length > 0 &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Riwayat Revisi</h2>
                    </div>
                    <ul className="anggaran-riwayat">
                        {revisiList.map(revisi => (
                            <li key={revisi.id}>
                                <strong>{revisi.status === 'draf' ? 'Draf' : `Revisi ${revisi.nomorRevisi}`}</strong>
                                {revisi.status === 'aktif' &&
                                    <span className="anggaran-riwayat-berlaku"> (berlaku)</span>}
                                {revisi.catatan ? ` - ${revisi.catatan}` : ""}
                                <span className="anggaran-riwayat-meta">
                                    {' '}| {revisi.namaBerkas || "tanpa berkas"} | {revisi.dibuatOleh || "-"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>}

            {alert && <PopupAlert isAlert={true} severity={alert.severity} message={alert.message}/>}
        </div>
    );
}
