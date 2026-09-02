import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import apiClient from "../../lib/apiClient";
import Popup, {PopupAlert} from "../../ui/Popup.jsx";
import {TableLayananGaji} from "../../ui/tables.jsx";
import {layananGajiStatus, monthNames, rowsPerPageOptions} from "./head-data.js";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";

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
    const [isAlert, setIsAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState({message: "", severity: ""});
    const alertTimer = useRef(null);
    // A file input is uncontrolled, so the picked row has to be remembered beside it
    const berkasRef = useRef(null);
    const tujuanRef = useRef(null);

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

    const mintaBerkas = useCallback((row) => {
        tujuanRef.current = row;
        if (berkasRef.current) berkasRef.current.click();
    }, []);

    async function kirimBerkas(event) {
        const berkas = event.target.files?.[0];
        const row = tujuanRef.current;
        // Clear at once: picking the same file twice in a row fires no change event otherwise
        event.target.value = "";
        if (!berkas || !row) return;

        if (berkas.type !== "application/pdf") return showAlert("Berkas harus berformat PDF.", "error");
        if (berkas.size > MAX_FILE_MB * 1024 * 1024) {
            return showAlert(`Ukuran berkas melebihi ${MAX_FILE_MB} MB.`, "error");
        }

        setBarisSibuk(row.rowNumber);
        const formData = new FormData();
        formData.append("rowNumber", row.rowNumber);
        // The backend refuses the write if this no longer matches the row - a table left open
        // while someone else deleted an entry would otherwise address the wrong permintaan
        formData.append("timestamp", row.timestamp);
        formData.append("lampiran", berkas);
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
    }

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
            <input ref={berkasRef} type="file" accept="application/pdf" hidden onChange={kirimBerkas} />
            <TableLayananGaji
                rows={tampil}
                loading={isLoading}
                page={halaman}
                totalPages={totalHalaman}
                rowsPerPage={barisPerHalaman}
                rowsPerPageOptions={rowsPerPageOptions}
                onPageChange={(event, value) => setHalaman(value)}
                onRowsPerPageChange={setBarisPerHalaman}
                onUnggah={mintaBerkas}
                onKirimUlang={kirimUlang}
                onUbahEmail={ubahEmail}
                onHapus={setHapusTarget}
                barisSibuk={barisSibuk}
            />
            {hapusTarget &&
                <Popup type="delete" whenCancel={() => setHapusTarget(null)} whenDel={hapus}
                       message={`Hapus permintaan No. ${hapusTarget.no} atas nama `
                           + `${hapusTarget.namaLengkap || "-"}? Berkas di Google Drive tetap tersimpan.`} />}
        </div>
    );
}
