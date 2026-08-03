import {useEffect, useState} from 'react';
import apiClient from "../lib/apiClient";
//Import Material UI
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
//Import Components
import {LoadingScreen} from "../ui/loading.jsx";
import {PopupAlert} from "../ui/Popup.jsx";
import {statusPegawaiOptions} from "../components/bendahara/head-data.js";

const MAX_FILE_MB = 10;

// Public page, reached by private link only - deliberately not linked from the navbar
export default function KirimDokumenGaji() {
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
    const [isSuccess, setIsSuccess] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");

    // Enable scrolling for this page
    useEffect(() => {
        document.body.classList.add('scrollable-page');
        return () => {
            document.body.classList.remove('scrollable-page');
        };
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
                setIsSuccess(true);
            }
        } catch (error) {
            console.log("Gagal mengirim dokumen.", error);
            // Form state left untouched so the user does not retype anything
            setAlertMessage("Pengiriman Gagal, Coba Lagi");
            setTimeout(() => setAlertMessage(""), 5000);
        } finally {
            setIsLoading(false);
        }
    }

    // Success view replaces the form entirely
    if (isSuccess) {
        return (
            <div className="dokumen-gaji-page">
                <div className="bg-card dokumen-gaji-card dokumen-gaji-success">
                    <CheckCircleIcon sx={{color: "green", height: "80px", width: "80px"}}/>
                    <h1>Dokumen Berhasil Dikirim</h1>
                    <p>Terima kasih. Dokumen anda telah kami terima dan akan segera diproses.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dokumen-gaji-page">
            <div className="bg-card dokumen-gaji-card">
                <h1 className="dokumen-gaji-title">Pengiriman Dokumen Perubahan Data Penghasilan Pegawai</h1>
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
                    <div className="form-submit dokumen-gaji-submit">
                        <input type="submit" value="Kirim Dokumen" name="submit-dokumen-gaji"/>
                    </div>
                </form>
            </div>
            {isLoading && <LoadingScreen/>}
            <PopupAlert isAlert={!!alertMessage} severity="error" message={alertMessage}/>
        </div>
    );
}
