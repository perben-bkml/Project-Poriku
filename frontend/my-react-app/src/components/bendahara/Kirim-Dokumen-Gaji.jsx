import {useEffect, useState} from 'react';
import apiClient from "../../lib/apiClient";
//Import Components
import LoadingAnimate, {LoadingScreen} from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {SubmitButton} from "../../ui/buttons.jsx";
import {statusPegawaiOptions} from "./head-data.js";

const MAX_FILE_MB = 10;

// type="buat" writes a new row, type="edit" rewrites the row Monitor-Perubahan-Gaji
// handed over in passedData ({rowNumber, no, nomorSurat})
export default function KirimDokumenGaji(props) {
    const isEdit = props.type === "edit";
    const passedData = props.passedData;

    //State
    const [formData, setFormData] = useState({
        tanggalSurat: "",
        nomorSurat: "",
        namaTercantum: "",
        statusPegawai: "",
        keteranganSurat: "",
    });
    const [file, setFile] = useState(null);
    const [fileError, setFileError] = useState("");
    const [currentFileLink, setCurrentFileLink] = useState("");
    const [isFetching, setIsFetching] = useState(isEdit);
    const [loadError, setLoadError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    function backToMonitor() {
        props.changeComponent("monitor-data-gaji");
    }

    // Pull the row fresh instead of reusing the monitor's copy: the sheet stores
    // Tanggal Surat in whatever format the spreadsheet displays, and only the server
    // can hand it back as the yyyy-mm-dd the date input needs
    useEffect(() => {
        if (!isEdit) return;
        if (!passedData?.rowNumber) {
            backToMonitor();
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const response = await apiClient.get(`/dokumen-gaji/${passedData.rowNumber}`, {
                    params: {expectedNo: passedData.no, expectedNomorSurat: passedData.nomorSurat}
                });
                if (cancelled) return;
                const {tanggalSurat, nomorSurat, namaTercantum, statusPegawai, keteranganSurat, fileLink} = response.data;
                setFormData({tanggalSurat, nomorSurat, namaTercantum, statusPegawai, keteranganSurat});
                setCurrentFileLink(fileLink || "");
            } catch (error) {
                if (cancelled) return;
                console.log("Gagal memuat data dokumen.", error);
                setLoadError(error.response?.data?.message || "Gagal memuat data, coba lagi.");
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    //Handle text/select changes
    function handleInputChange(event) {
        const {name, value} = event.target;
        setFormData(prev => ({...prev, [name]: value}));
    }

    //Handle file selection
    function handleFileChange(event) {
        const selected = event.target.files[0];
        if (!selected) {
            setFile(null);
            setFileError("");
            return;
        }
        if (selected.type !== "application/pdf") {
            setFile(null);
            setFileError("Berkas harus berformat PDF.");
            event.target.value = "";
            return;
        }
        if (selected.size > MAX_FILE_MB * 1024 * 1024) {
            setFile(null);
            setFileError(`Ukuran berkas melebihi ${MAX_FILE_MB} MB.`);
            event.target.value = "";
            return;
        }
        setFile(selected);
        setFileError("");
    }

    //Handle submit
    async function handleSubmit(event) {
        event.preventDefault();
        // On an edit the existing file stays in place unless a new one is picked
        if (!file && !isEdit) {
            setFileError("Berkas PDF wajib diunggah.");
            return;
        }

        const sendData = new FormData();
        Object.entries(formData).forEach(([key, value]) => sendData.append(key, value));
        if (file) sendData.append('file', file);
        if (isEdit) {
            // Re-checked server side, so a row that shifted under us is refused
            sendData.append('expectedNo', passedData.no ?? "");
            sendData.append('expectedNomorSurat', passedData.nomorSurat ?? "");
        }

        try {
            setIsLoading(true);
            const response = isEdit
                ? await apiClient.put(`/dokumen-gaji/${passedData.rowNumber}`, sendData, {
                    headers: {'Content-Type': 'multipart/form-data'},
                })
                : await apiClient.post('/dokumen-gaji/kirim', sendData, {
                    headers: {'Content-Type': 'multipart/form-data'},
                });
            if (response.status === 200) {
                // Hand the message to Bendahara-Page so it survives this unmount,
                // then go straight back to the monitor
                props.alertMessage(isEdit ? "Dokumen Berhasil Diperbarui" : "Dokumen Berhasil Dikirim");
                backToMonitor();
            }
        } catch (error) {
            console.log("Gagal mengirim dokumen.", error);
            // Form state left untouched so the user does not retype anything
            setErrorMessage(error.response?.data?.message
                || (isEdit ? "Perubahan Gagal, Coba Lagi" : "Pengiriman Gagal, Coba Lagi"));
            setTimeout(() => setErrorMessage(""), 5000);
        } finally {
            setIsLoading(false);
        }
    }

    // Nothing to edit - the row was deleted or renumbered while the monitor was open
    if (loadError) {
        return (
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Ubah Dokumen Perubahan Data Penghasilan Pegawai</h2>
                <p style={{textAlign: "center", margin: "30px 0"}}>{loadError}</p>
                <div className="form-submit">
                    <SubmitButton value="Kembali" name="kembali-dokumen-gaji" onClick={backToMonitor}/>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">
                    {isEdit ? "Ubah" : "Pengiriman"} Dokumen Perubahan Data Penghasilan Pegawai
                </h2>
                {isFetching ? <LoadingAnimate/> :
                <form className="dokumen-gaji-form" onSubmit={handleSubmit}>
                    <label htmlFor="tanggalSurat">Tanggal Surat</label>
                    <input type="date" id="tanggalSurat" name="tanggalSurat" className="type-btn"
                           value={formData.tanggalSurat} onChange={handleInputChange} required/>

                    <label htmlFor="nomorSurat">Nomor Surat</label>
                    <input type="text" id="nomorSurat" name="nomorSurat" className="type-btn"
                           value={formData.nomorSurat} onChange={handleInputChange} required/>

                    <label htmlFor="namaTercantum">Nama Tercantum</label>
                    <input type="text" id="namaTercantum" name="namaTercantum" className="type-btn"
                           value={formData.namaTercantum} onChange={handleInputChange} required/>

                    <label htmlFor="statusPegawai">Status Pegawai</label>
                    <select id="statusPegawai" name="statusPegawai" className="type-btn"
                            value={formData.statusPegawai} onChange={handleInputChange} required>
                        <option value="" disabled>Pilih status pegawai</option>
                        {statusPegawaiOptions.map((status, index) => (
                            <option key={index} value={status}>{status}</option>
                        ))}
                    </select>

                    <label htmlFor="keteranganSurat">Keterangan Surat</label>
                    <input type="text" id="keteranganSurat" name="keteranganSurat" className="type-btn"
                           value={formData.keteranganSurat} onChange={handleInputChange} required/>

                    <label htmlFor="berkas">
                        {isEdit ? "Ganti Berkas" : "Upload Berkas"} (PDF, maks. {MAX_FILE_MB} MB)
                    </label>
                    <div className="dokumen-gaji-file">
                        <input type="file" id="berkas" name="berkas" accept="application/pdf"
                               onChange={handleFileChange} required={!isEdit}/>
                        {isEdit &&
                            <span className="dokumen-gaji-file-current">
                                Berkas saat ini: {currentFileLink
                                    ? <a href={currentFileLink} target="_blank" rel="noopener noreferrer">Lihat Berkas</a>
                                    : "tidak ada"}
                                {" - "}kosongkan jika tidak diganti.
                            </span>}
                        {fileError && <span className="dokumen-gaji-file-error">{fileError}</span>}
                    </div>

                    {/* Native submit, not SubmitButton (type="button"), so the browser
                        runs the `required` validation */}
                    <div className="form-submit">
                        <input type="submit" value={isEdit ? "Simpan Perubahan" : "Kirim Dokumen"}
                               name="submit-dokumen-gaji"/>
                        <SubmitButton value="Kembali" name="kembali-dokumen-gaji" onClick={backToMonitor}/>
                    </div>
                </form>}
            </div>
            {isLoading && <LoadingScreen/>}
            {/* Success is reported by Monitor-Perubahan-Gaji after the redirect */}
            {errorMessage && <PopupAlert isAlert={!!errorMessage} severity="error" message={errorMessage}/>}
        </div>
    );
}
