import {useState} from 'react';
import apiClient from "../../lib/apiClient";
//Import Components
import {LoadingScreen} from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {SubmitButton} from "../../ui/buttons.jsx";
import {statusPegawaiOptions} from "./head-data.js";

const MAX_FILE_MB = 10;

export default function KirimDokumenGaji(props) {
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
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    function backToMonitor() {
        props.changeComponent("monitor-data-gaji");
    }

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
        if (!file) {
            setFileError("Berkas PDF wajib diunggah.");
            return;
        }

        const sendData = new FormData();
        Object.entries(formData).forEach(([key, value]) => sendData.append(key, value));
        sendData.append('file', file);

        try {
            setIsLoading(true);
            const response = await apiClient.post('/dokumen-gaji/kirim', sendData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            if (response.status === 200) {
                // Hand the message to Bendahara-Page so it survives this unmount,
                // then go straight back to the monitor
                props.alertMessage("Dokumen Berhasil Dikirim");
                backToMonitor();
            }
        } catch (error) {
            console.log("Gagal mengirim dokumen.", error);
            // Form state left untouched so the user does not retype anything
            setErrorMessage("Pengiriman Gagal, Coba Lagi");
            setTimeout(() => setErrorMessage(""), 5000);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Pengiriman Dokumen Perubahan Data Penghasilan Pegawai</h2>
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

                    <label htmlFor="berkas">Upload Berkas (PDF, maks. {MAX_FILE_MB} MB)</label>
                    <div className="dokumen-gaji-file">
                        <input type="file" id="berkas" name="berkas" accept="application/pdf"
                               onChange={handleFileChange} required/>
                        {fileError && <span className="dokumen-gaji-file-error">{fileError}</span>}
                    </div>

                    {/* Native submit, not SubmitButton (type="button"), so the browser
                        runs the `required` validation */}
                    <div className="form-submit">
                        <input type="submit" value="Kirim Dokumen" name="submit-dokumen-gaji"/>
                        <SubmitButton value="Kembali" name="kembali-dokumen-gaji" onClick={backToMonitor}/>
                    </div>
                </form>
            </div>
            {isLoading && <LoadingScreen/>}
            {/* Success is reported by Monitor-Perubahan-Gaji after the redirect */}
            {errorMessage && <PopupAlert isAlert={!!errorMessage} severity="error" message={errorMessage}/>}
        </div>
    );
}
