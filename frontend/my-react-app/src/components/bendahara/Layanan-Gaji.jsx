import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import apiClient from "../../lib/apiClient";
import Popup, {PopupAlert} from "../../ui/Popup.jsx";
import {TableLayananGaji} from "../../ui/tables.jsx";
import {layananGajiStatus, monthNames, rowsPerPageOptions} from "./head-data.js";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import UnggahLampiranGaji from "./Unggah-Lampiran-Gaji.jsx";
import Switch from "@mui/material/Switch";

const ALERT_MS = 3000;
const MAX_FILE_MB = 10;

// Everything below runs on the rows GET /layanan-gaji/antrian has already returned, so
// filtering and paging never cost a Sheets read - the route serves a one-minute snapshot.
const cocokCari = (row, kata) => !kata
    || [row.no, row.namaLengkap, row.nip, row.jenisPermintaan, row.unitKerja]
        .some(nilai => String(nilai ?? "").toLowerCase().includes(kata));

// Timestamp is the sheet's own dd/mm/yyyy text, so the month is the second segment. Compared
// as a string against monthNames' zero padded values rather than parsed into a Date - the
// spreadsheet is already scoped to one year, so the month alone is the whole filter.
const bulanBaris = (row) => String(row.timestamp ?? "").split("/")[1] || "";

export default function LayananGaji() {
    const [baris, setBaris] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [cari, setCari] = useState("");
    const [status, setStatus] = useState("");
    const [bulan, setBulan] = useState("");
    const [halaman, setHalaman] = useState(1);
    const [barisPerHalaman, setBarisPerHalaman] = useState(rowsPerPageOptions[0]);
    const [barisSibuk, setBarisSibuk] = useState(null);
    const [memeriksa, setMemeriksa] = useState(false);
    const [hapusTarget, setHapusTarget] = useState(null);
    const [unggahTarget, setUnggahTarget] = useState(null);
    // Which system /layanan-gaji is serving. null until known, so the switch cannot flash the
    // wrong position and be flipped from it by mistake.
    const [sistemBaru, setSistemBaru] = useState(null);
    const [gantiSistem, setGantiSistem] = useState(null);
    const [isAlert, setIsAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState({message: "", severity: ""});
    const alertTimer = useRef(null);

    const showAlert = useCallback((message, severity) => {
        setAlertMessage({message, severity});
        setIsAlert(true);
        clearTimeout(alertTimer.current);
        alertTimer.current = setTimeout(() => setIsAlert(false), ALERT_MS);
    }, []);
    useEffect(() => () => clearTimeout(alertTimer.current), []);

    // quiet skips the spinner, for the resync that follows an upload
    const muatData = useCallback(async ({quiet = false} = {}) => {
        if (!quiet) setIsLoading(true);
        try {
            const {data} = await apiClient.get("/layanan-gaji/antrian");
            setBaris(data.data || []);
        } catch (error) {
            console.error("Error fetching layanan gaji.", error);
            // A failed resync leaves the rows already on screen rather than blanking them
            if (!quiet) {
                setBaris([]);
                showAlert("Gagal memuat antrian. Silakan coba lagi.", "error");
            }
        } finally {
            setIsLoading(false);
        }
    }, [showAlert]);

    useEffect(() => { muatData(); }, [muatData]);

    useEffect(() => {
        apiClient.get("/layanan-gaji/pengaturan")
            .then(({data}) => setSistemBaru(data?.sistemBaru !== false))
            .catch(error => console.error("Error reading layanan gaji setting.", error));
    }, []);

    // Changes what every Bakamla staff member sees on a public page, so it is confirmed rather
    // than toggled straight from the switch.
    const simpanSistem = useCallback(async () => {
        const tujuan = gantiSistem;
        setGantiSistem(null);
        try {
            const {data} = await apiClient.patch("/layanan-gaji/pengaturan", {sistemBaru: tujuan});
            setSistemBaru(data.sistemBaru);
            showAlert(data.message, "success");
        } catch (error) {
            console.error("Failed to change layanan gaji setting.", error);
            showAlert(error.response?.data?.message || "Pengaturan gagal diubah.", "error");
        }
    }, [gantiSistem, showAlert]);

    // Newest first: rows are only ever appended, so the sheet order reversed is chronological
    // without parsing a single timestamp
    const tersaring = useMemo(() => {
        const kata = cari.trim().toLowerCase();
        return baris.filter(row => cocokCari(row, kata)
            && (!status || row.status === status)
            && (!bulan || bulanBaris(row) === bulan)).reverse();
    }, [baris, cari, status, bulan]);

    const totalHalaman = Math.ceil(tersaring.length / barisPerHalaman);
    // A filter can shrink the list under the page being viewed, leaving it out of range
    useEffect(() => { setHalaman(1); }, [cari, status, bulan, barisPerHalaman]);

    const tampil = useMemo(() => {
        const mulai = (halaman - 1) * barisPerHalaman;
        return tersaring.slice(mulai, mulai + barisPerHalaman);
    }, [tersaring, halaman, barisPerHalaman]);

    // berkas is a Map of jenis index -> File, so each document goes up under the field name the
    // backend pairs by. Files picked but never submitted are dropped with the dialog.
    const kirimBerkas = useCallback(async (row, berkas) => {
        setUnggahTarget(null);
        setBarisSibuk(row.rowNumber);
        const formData = new FormData();
        formData.append("rowNumber", row.rowNumber);
        // The backend refuses the write if this no longer matches the row - a table left open
        // while someone else deleted an entry would otherwise address the wrong permintaan
        formData.append("timestamp", row.timestamp);
        for (const [posisi, file] of berkas) formData.append(`lampiran-${posisi}`, file);
        try {
            const {data} = await apiClient.post("/layanan-gaji/lampiran", formData);
            showAlert(data.message || "Lampiran berhasil diunggah.", "success");
        } catch (error) {
            console.error("Failed to upload lampiran.", error);
            showAlert(error.response?.data?.message || "Lampiran gagal diunggah.", "error");
        } finally {
            setBarisSibuk(null);
            // Resynced even on failure: a rejected write usually means the table is out of
            // date, which is exactly when leaving the old rows on screen helps least
            await muatData({quiet: true});
        }
    }, [muatData, showAlert]);

    // Re-sends the document already on Drive, so it costs no upload and cannot leave a second
    // copy in the folder. The row is resynced either way: a failed retry rewrites Keterangan.
    const kirimUlang = useCallback(async (row) => {
        setBarisSibuk(row.rowNumber);
        try {
            const {data} = await apiClient.post("/layanan-gaji/kirim-ulang",
                {rowNumber: row.rowNumber, timestamp: row.timestamp});
            showAlert(data.message, "success");
        } catch (error) {
            console.error("Failed to resend lampiran.", error);
            showAlert(error.response?.data?.message || "E-mail gagal dikirim ulang.", "error");
        } finally {
            setBarisSibuk(null);
            await muatData({quiet: true});
        }
    }, [muatData, showAlert]);

    // Writes column E and clears the Keterangan beside it. The row is resynced rather than
    // patched locally, so a stale snapshot cannot leave the old address on screen.
    const ubahEmail = useCallback(async (row, email) => {
        setBarisSibuk(row.rowNumber);
        try {
            const {data} = await apiClient.patch("/layanan-gaji/email",
                {rowNumber: row.rowNumber, timestamp: row.timestamp, email});
            showAlert(data.message, "success");
        } catch (error) {
            console.error("Failed to update e-mail.", error);
            showAlert(error.response?.data?.message || "Alamat e-mail gagal diubah.", "error");
        } finally {
            setBarisSibuk(null);
            await muatData({quiet: true});
        }
    }, [muatData, showAlert]);

    // The timed sweep runs at most once every five minutes, and a bounce can take a minute or
    // two to arrive - this is that sweep on demand, for the row the desk is watching right now.
    const periksaEmail = useCallback(async () => {
        setMemeriksa(true);
        try {
            const {data} = await apiClient.post("/layanan-gaji/periksa-email", {});
            setBaris(data.data || []);
            showAlert(data.message, "success");
        } catch (error) {
            console.error("Failed to check e-mail status.", error);
            showAlert(error.response?.data?.message || "Gagal memeriksa status e-mail.", "error");
        } finally {
            setMemeriksa(false);
        }
    }, [showAlert]);

    const hapus = useCallback(async () => {
        const row = hapusTarget;
        setHapusTarget(null);
        setBarisSibuk(row.rowNumber);
        try {
            const {data} = await apiClient.delete("/layanan-gaji/antrian",
                {data: {rowNumber: row.rowNumber, timestamp: row.timestamp}});
            showAlert(data.message, "success");
        } catch (error) {
            console.error("Failed to delete permintaan.", error);
            showAlert(error.response?.data?.message || "Permintaan gagal dihapus.", "error");
        } finally {
            setBarisSibuk(null);
            await muatData({quiet: true});
        }
    }, [hapusTarget, muatData, showAlert]);

    return (
        <div className="pengajuan pengajuan-layanan bg-card">
            {isAlert && <PopupAlert isAlert={isAlert} severity={alertMessage.severity} message={alertMessage.message} />}
            <div className="pengajuan-filter">
                <div className="lg-sistem">
                    <div>
                        <b>Halaman Pelayanan Gaji</b>
                        <span>{sistemBaru === null ? "Memuat pengaturan…"
                            : sistemBaru ? "Memakai formulir dan antrian baru"
                                : "Memakai Google Form dan antrian lama"}</span>
                    </div>
                    <Switch checked={Boolean(sistemBaru)} disabled={sistemBaru === null}
                            onChange={event => setGantiSistem(event.target.checked)} />
                </div>
                <form className="bar-cari lg-filter" onSubmit={event => event.preventDefault()}>
                    <div className="lg-filter-baris">
                        <label htmlFor="cari-layanan">Cari</label>
                        <input id="cari-layanan" className="type-btn lg-cari" type="text"
                               value={cari} placeholder="Nama, NIP, jenis permintaan…"
                               onChange={event => setCari(event.target.value)} />
                    </div>
                    <div className="lg-filter-baris">
                    <label htmlFor="filter-status-layanan">Status</label>
                    <select id="filter-status-layanan" className="type-btn" value={status}
                            onChange={event => setStatus(event.target.value)}>
                        <option value="">Semua Status</option>
                        {layananGajiStatus.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <label htmlFor="filter-bulan-layanan">Bulan</label>
                    <select id="filter-bulan-layanan" className="type-btn" value={bulan}
                            onChange={event => setBulan(event.target.value)}>
                        <option value="">Semua Bulan</option>
                        {monthNames.filter(item => item.value).map(item =>
                            <option key={item.value} value={item.value}>{item.title}</option>)}
                    </select>
                    {(cari || status || bulan) &&
                        <button className="spm-button" type="button"
                                onClick={() => { setCari(""); setStatus(""); setBulan(""); }}>Reset</button>}
                    <button className="spm-button lg-periksa" type="button"
                            disabled={memeriksa || isLoading} onClick={periksaEmail}>
                        <MarkEmailReadIcon fontSize="small" />
                        {memeriksa ? "Memeriksa…" : "Periksa Status E-mail"}
                    </button>
                    </div>
                </form>
            </div>
            <TableLayananGaji
                rows={tampil}
                loading={isLoading}
                page={halaman}
                totalPages={totalHalaman}
                rowsPerPage={barisPerHalaman}
                rowsPerPageOptions={rowsPerPageOptions}
                onPageChange={(event, value) => setHalaman(value)}
                onRowsPerPageChange={setBarisPerHalaman}
                onUnggah={setUnggahTarget}
                onKirimUlang={kirimUlang}
                onUbahEmail={ubahEmail}
                onHapus={setHapusTarget}
                barisSibuk={barisSibuk}
            />
            {unggahTarget &&
                <UnggahLampiranGaji row={unggahTarget} maxMb={MAX_FILE_MB}
                                    onTutup={() => setUnggahTarget(null)}
                                    onKirim={kirimBerkas} onGagal={showAlert} />}
            {gantiSistem !== null &&
                <Popup type="delete" whenCancel={() => setGantiSistem(null)} whenDel={simpanSistem}
                       message={gantiSistem
                           ? "Alihkan halaman Pelayanan Gaji ke formulir dan antrian baru?"
                           : "Kembalikan halaman Pelayanan Gaji ke Google Form dan antrian lama? "
                             + "Permintaan baru tidak akan masuk ke menu ini."} />}
            {hapusTarget &&
                <Popup type="delete" whenCancel={() => setHapusTarget(null)} whenDel={hapus}
                       message={`Hapus permintaan No. ${hapusTarget.no} atas nama `
                           + `${hapusTarget.namaLengkap || "-"}? Berkas di Google Drive tetap tersimpan.`} />}
        </div>
    );
}
