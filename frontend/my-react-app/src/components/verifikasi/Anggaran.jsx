import {useContext, useEffect, useRef, useState} from 'react';
import apiClient from "../../lib/apiClient";
// Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {AuthContext} from "../../lib/AuthContext.jsx";
import {anggaranKolomTemplate, anggaranContohBaris, anggaranModes, anggaranTanpaRincian,
    anggaranSebabKeterangan, anggaranKlaimKeterangan, anggaranAwalKeterangan} from "./head-data.js";
import {unduhExcel, selTeks} from "../../lib/excel.js";
import {formatRupiah} from "../bendahara/head-data.js";
// Import Tables
import {TableAnggaranPohon, TableSelisihAnggaran, TableRealisasiTakDikenal, TableKlaimUnitLain} from "../../ui/tables.jsx";

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
    const [isSegarkan, setIsSegarkan] = useState(false);
    const bukuRef = useRef(null);
    const [tanggalBatas, setTanggalBatas] = useState("");
    const [modeAwal, setModeAwal] = useState("perUnit");
    const [isAwal, setIsAwal] = useState(false);
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

    // The read refreshes on its own once the projection passes its TTL; this is for an admin
    // who has just edited a sheet by hand and does not want to wait it out.
    async function segarkanRealisasi() {
        try {
            setIsSegarkan(true);
            await apiClient.post('/anggaran/realisasi/segarkan', {});
            await fetchAnggaran(true);
            showAlert("success", "Realisasi disegarkan.");
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menyegarkan realisasi.");
        } finally {
            setIsSegarkan(false);
        }
    }

    async function kirimRealisasiAwal(event) {
        event.preventDefault();
        const berkas = bukuRef.current?.files?.[0];
        if (!berkas) return showAlert("warning", "Pilih berkas .xlsx terlebih dahulu.");
        if (berkas.size > ANGGARAN_MAX_MB * 1024 * 1024) {
            return showAlert("warning", `Ukuran berkas melebihi ${ANGGARAN_MAX_MB} MB.`);
        }
        const formData = new FormData();
        formData.append('berkas', berkas);
        formData.append('tanggalBatas', tanggalBatas);
        formData.append('mode', modeAwal);
        try {
            setIsAwal(true);
            const response = await apiClient.post('/anggaran/realisasi/override', formData,
                {headers: {'Content-Type': 'multipart/form-data'}});
            if (bukuRef.current) bukuRef.current.value = "";
            showAlert("success", response.data.message || "Realisasi awal disimpan.");
            await fetchAnggaran(true);
        } catch (error) {
            const body = error?.response?.data;
            showAlert("error", body?.masalah?.length
                ? `${body.message} Baris ${body.masalah[0].baris}: ${body.masalah[0].pesan}`
                : body?.message || "Gagal menyimpan realisasi awal.");
        } finally {
            setIsAwal(false);
        }
    }

    async function hapusRealisasiAwal() {
        try {
            setIsAwal(true);
            await apiClient.delete('/anggaran/realisasi/override');
            showAlert("info", "Realisasi awal dihapus.");
            await fetchAnggaran(true);
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menghapus realisasi awal.");
        } finally {
            setIsAwal(false);
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
    const takDikenal = data?.tidakDikenal || [];
    const override = data?.override;
    const klaimUnitLain = data?.klaimUnitLain || [];
    // The age of a stored number has to be visible, or nobody can tell whether it is current
    const labelSinkron = data?.sinkron?.disegarkanPada
        ? `Realisasi diperbarui ${new Date(data.sinkron.disegarkanPada).toLocaleString("id-ID", {dateStyle: "short", timeStyle: "short"})}`
        : "Realisasi belum pernah dihitung";

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
                        <span className="anggaran-sinkron">{labelSinkron}</span>
                        {override &&
                            <span className="anggaran-sinkron">
                                Realisasi s.d. {override.tanggalBatas} dari unggahan
                            </span>}
                        {canUnggah &&
                            <input className="btn-aksi btn-aksi-wide" type="button"
                                   value={isSegarkan ? "Menyegarkan..." : "Segarkan Realisasi"}
                                   disabled={isSegarkan || isLoading} onClick={segarkanRealisasi}/>}
                        <input className="btn-aksi btn-aksi-wide" type="button"
                               value={isLoading ? "Memuat..." : "Muat Ulang"} disabled={isLoading}
                               onClick={() => fetchAnggaran()}/>
                    </div>
                </div>
                <p className="anggaran-note anggaran-catatan-realisasi">{anggaranTanpaRincian}</p>
                {isLoading ? <LoadingAnimate/> : <TableAnggaranPohon anggaran={data?.anggaran || []}/>}
            </div>

            {/* Realisasi already booked before Poriku started recording it. Uploaded once,
                with a cutoff date; everything after that date is computed from pengajuan. */}
            {canUnggah &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Realisasi (Override)</h2>
                        <div className="wide-card-actions">
                            {override &&
                                <span className="anggaran-sinkron">
                                    Berlaku s.d. {override.tanggalBatas} - {override.baris} baris
                                </span>}
                            {override?.takCocok > 0 &&
                                <span className="anggaran-lencana-klaim"
                                      title="Nominal di berkas yang kode MAK-nya tidak ada di anggaran berlaku, jadi tidak mengurangi pagu mana pun">
                                    {formatRupiah(override.takCocok)} tidak cocok
                                </span>}
                            {override &&
                                <input className="btn-aksi btn-aksi-wide" type="button" value="Hapus"
                                       disabled={isAwal} onClick={hapusRealisasiAwal}/>}
                        </div>
                    </div>
                    <form className="anggaran-form" onSubmit={kirimRealisasiAwal}>
                        <p className="anggaran-intro">{anggaranAwalKeterangan}</p>

                        <label htmlFor="tanggal-batas">Realisasi Tercatat Sampai Tanggal</label>
                        <input type="date" id="tanggal-batas" name="tanggalBatas" className="type-btn"
                               value={tanggalBatas} required
                               onChange={event => setTanggalBatas(event.target.value)}/>

                        <label htmlFor="berkas-awal">Berkas Realisasi (.xlsx, maks. {ANGGARAN_MAX_MB} MB)</label>
                        <div className="anggaran-file">
                            <input type="file" id="berkas-awal" name="berkas" accept=".xlsx" ref={bukuRef} required/>
                        </div>

                        <label htmlFor="mode-awal">Cara Menerapkan</label>
                        <select id="mode-awal" name="mode" className="type-btn" value={modeAwal}
                                onChange={event => setModeAwal(event.target.value)}>
                            {anggaranModes.map(item => (
                                <option key={item.value} value={item.value}>{item.title}</option>
                            ))}
                        </select>

                        <div className="form-submit">
                            <input type="submit" className="btn-submit-wide" name="simpan-awal"
                                   value={isAwal ? "Menyimpan..." : "Simpan Realisasi"} disabled={isAwal}/>
                        </div>
                    </form>
                </div>}

            {/* The faulty claims, kept apart from the rest: a unit kerja using another unit's
                MAK is a compliance problem, not the data-entry problem the panel below holds. */}
            {klaimUnitLain.length > 0 &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Klaim MAK Unit Lain</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">{klaimUnitLain.length} pengajuan</span>
                        </div>
                    </div>
                    <p className="anggaran-note anggaran-catatan-realisasi">{anggaranKlaimKeterangan}</p>
                    <TableKlaimUnitLain baris={klaimUnitLain}/>
                </div>}

            {/* Belanja that matched no MAK in the active revisi. Reported rather than dropped,
                because money that vanishes from the report is money nobody goes looking for. */}
            {takDikenal.length > 0 &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Belanja Tanpa Anggaran</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">{takDikenal.length} kode MAK</span>
                        </div>
                    </div>
                    <p className="anggaran-note anggaran-catatan-realisasi">{anggaranSebabKeterangan}</p>
                    <TableRealisasiTakDikenal baris={takDikenal}/>
                </div>}

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
