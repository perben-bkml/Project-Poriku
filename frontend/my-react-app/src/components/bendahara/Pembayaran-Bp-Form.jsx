import { useContext, useEffect, useState } from 'react';
import apiClient from "../../lib/apiClient";
import { BackgroundTaskContext } from "../../lib/BackgroundTasks";
import LoadingAnimate from "../../ui/loading.jsx";
import { SubmitButton } from "../../ui/buttons.jsx";

const MAX_FILE_MB = 10;

const DRAFT_KEY = 'pembayaran-bp-draft';

const EMPTY = {
    tanggalSp2d: "", nomorSpm: "", jenis: "", va: "", nilaiSp2d: "",
    statusBayarPenerima: "", tanggalBayarPenerima: "", statusPajak: "", tanggalTrxPajak: "",
};

// Column O holds "WITHDRAWAL" on one row, so anything unparseable yields nothing
const toDateInput = (value) => {
    const parts = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || "").trim());
    return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : "";
};
// "12345678" -> "12.345.678". Whole rupiah only, and parseRupiah strips the dots again.
const toRupiah = (value) =>
    String(value ?? "").replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export default function PembayaranBpForm(props) {
    const isEdit = props.mode === "edit";
    const record = props.record;
    const { runTask } = useContext(BackgroundTaskContext);

    const [options, setOptions] = useState(null);
    // A new row is drafted to localStorage until saved or cancelled, so clicking outside
    // cannot throw away typing. Edits always start from the row as it stands.
    const [formData, setFormData] = useState(() => {
        if (props.mode === "edit") return EMPTY;
        const saved = localStorage.getItem(DRAFT_KEY);
        return saved ? { ...EMPTY, ...JSON.parse(saved).fields } : EMPTY;
    });
    // A File cannot go in localStorage, so a draft remembers only the name
    const [pendingFileNames, setPendingFileNames] = useState(() => {
        if (props.mode === "edit") return {};
        const saved = localStorage.getItem(DRAFT_KEY);
        return saved ? (JSON.parse(saved).fileNames || {}) : {};
    });
    const [files, setFiles] = useState({ buktiBayar: null, buktiBayarDepositPajak: null });
    const [fileError, setFileError] = useState("");
    const [formError, setFormError] = useState("");

    // The lists the sheet enforces, wider than the values already in use
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await apiClient.get('/bendahara/pembayaran-bp/options');
                if (!cancelled) setOptions(response.data);
            } catch (error) {
                console.error("Gagal memuat pilihan Pembayaran BP.", error);
                if (!cancelled) setFormError("Gagal memuat pilihan, tutup dan coba lagi.");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!isEdit || !record) return;
        setFormData({
            tanggalSp2d: toDateInput(record.tanggalSp2d),
            nomorSpm: record.nomorSpm || "",
            jenis: record.jenis || "",
            va: record.va || "",
            nilaiSp2d: toRupiah(record.nilaiSp2d),
            statusBayarPenerima: record.statusBayarPenerima || "",
            tanggalBayarPenerima: toDateInput(record.tanggalBayarPenerima),
            statusPajak: record.statusPajak || "",
            tanggalTrxPajak: toDateInput(record.tanggalTrxPajak),
        });
    }, [isEdit, record]);

    const saveDraft = (fields, fileNames) => {
        if (isEdit) return;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, fileNames }));
    };
    const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

    function handleInputChange(event) {
        const { name, value } = event.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            saveDraft(next, pendingFileNames);
            return next;
        });
    }

    function handleFileChange(event) {
        const { name } = event.target;
        const picked = event.target.files[0];
        if (!picked) { setFiles(prev => ({ ...prev, [name]: null })); return; }
        if (picked.type !== "application/pdf") {
            setFileError("Berkas harus berformat PDF.");
            event.target.value = "";
            return;
        }
        if (picked.size > MAX_FILE_MB * 1024 * 1024) {
            setFileError(`Ukuran berkas melebihi ${MAX_FILE_MB} MB.`);
            event.target.value = "";
            return;
        }
        setFileError("");
        setFiles(prev => ({ ...prev, [name]: picked }));
        const names = { ...pendingFileNames, [name]: picked.name };
        setPendingFileNames(names);
        saveDraft(formData, names);
    }

    function handleSubmit(event) {
        event.preventDefault();

        const sendData = new FormData();
        Object.entries(formData).forEach(([key, value]) => sendData.append(key, value));
        Object.entries(files).forEach(([key, file]) => { if (file) sendData.append(key, file); });
        if (isEdit) {
            sendData.append('rowNumber', record.rowNumber);
            // Re-checked server side: B is positional, so a row inserted above would
            // make this row number point at a different payment
            sendData.append('expectedNo', record.no ?? "");
            sendData.append('expectedNomorSpm', record.nomorSpm ?? "");
        }

        // Not awaited, so the panel closes at once and the user can carry on
        runTask({
            label: `SPM ${formData.nomorSpm}`,
            tag: "pembayaran-bp",
            run: async () => {
                const response = isEdit
                    ? await apiClient.patch('/bendahara/pembayaran-bp', sendData, {
                        headers: { 'Content-Type': 'multipart/form-data' } })
                    : await apiClient.post('/bendahara/pembayaran-bp', sendData, {
                        headers: { 'Content-Type': 'multipart/form-data' } });
                return response.data?.message;
            },
        });
        clearDraft();
        props.onClose();
    }

    // Batal discards the draft; clicking outside or the x keeps it
    function handleCancel() {
        clearDraft();
        props.onClose();
    }

    const currentLink = (key) => record?.[key]?.url
        ? <a href={record[key].url} target="_blank" rel="noopener noreferrer">{record[key].nama}</a>
        : (record?.[key]?.nama || "tidak ada");

    return (
        <>
            <div className="side-panel-backdrop" onClick={props.onClose}/>
            <div className="side-panel">
                <button type="button" className="side-panel-close" onClick={props.onClose}>&times;</button>
                <h2 className="side-panel-title">{isEdit ? "Ubah Data" : "Tambah Data"} Pembayaran BP</h2>

                {!options ? <LoadingAnimate/> :
                <form className="pembayaran-bp-form" onSubmit={handleSubmit}>
                    <div className="bp-field">
                        <label htmlFor="tanggalSp2d">Tanggal SP2D</label>
                        <input type="date" id="tanggalSp2d" name="tanggalSp2d" className="type-btn"
                               value={formData.tanggalSp2d} onChange={handleInputChange} required/>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="nomorSpm">Nomor SPM</label>
                        <input type="text" id="nomorSpm" name="nomorSpm" className="type-btn" inputMode="numeric"
                               placeholder="00571" value={formData.nomorSpm} onChange={handleInputChange} required/>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="jenis">Jenis</label>
                        <select id="jenis" name="jenis" className="type-btn"
                                value={formData.jenis} onChange={handleInputChange} required>
                            <option value="" disabled>Pilih jenis</option>
                            {options.jenis.map(jenis => <option key={jenis} value={jenis}>{jenis}</option>)}
                        </select>
                    </div>

                    {/* Unit Kerja is a formula derived from this code, so pick by name
                        and send back only the VA */}
                    <div className="bp-field">
                        <label htmlFor="va">Unit Kerja</label>
                        <select id="va" name="va" className="type-btn"
                                value={formData.va} onChange={handleInputChange} required>
                            <option value="" disabled>Pilih unit kerja</option>
                            {options.va.map(item => (
                                <option key={item.kode} value={item.kode}>{item.kode} — {item.unitKerja}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="nilaiSp2d">Nilai SP2D</label>
                        <input type="text" id="nilaiSp2d" name="nilaiSp2d" className="type-btn" inputMode="numeric"
                               placeholder="12.345.678" value={formData.nilaiSp2d} required
                               onChange={e => handleInputChange({target: {name: "nilaiSp2d", value: toRupiah(e.target.value)}})}/>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="statusBayarPenerima">Status Bayar Penerima</label>
                        <select id="statusBayarPenerima" name="statusBayarPenerima" className="type-btn"
                                value={formData.statusBayarPenerima} onChange={handleInputChange}>
                            <option value=""></option>
                            {options.statusBayar.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="tanggalBayarPenerima">Tanggal Bayar Penerima</label>
                        <input type="date" id="tanggalBayarPenerima" name="tanggalBayarPenerima" className="type-btn"
                               value={formData.tanggalBayarPenerima} onChange={handleInputChange}
                               onDoubleClick={() => setFormData(prev => ({...prev, tanggalBayarPenerima: ""}))}/>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="statusPajak">Status Pajak</label>
                        <select id="statusPajak" name="statusPajak" className="type-btn"
                                value={formData.statusPajak} onChange={handleInputChange}>
                            <option value=""></option>
                            {options.statusPajak.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="tanggalTrxPajak">Tanggal Trx Pajak</label>
                        <input type="date" id="tanggalTrxPajak" name="tanggalTrxPajak" className="type-btn"
                               value={formData.tanggalTrxPajak} onChange={handleInputChange}
                               onDoubleClick={() => setFormData(prev => ({...prev, tanggalTrxPajak: ""}))}/>
                    </div>

                    <div className="bp-field">
                        <label htmlFor="buktiBayar">Bukti Bayar (PDF, maks. {MAX_FILE_MB} MB)</label>
                        <input type="file" id="buktiBayar" name="buktiBayar" accept="application/pdf"
                               onChange={handleFileChange}/>
                        {isEdit && <span className="dokumen-gaji-file-current">
                            Saat ini: {currentLink("buktiBayar")} - kosongkan jika tidak diganti.
                        </span>}
                        {!isEdit && !files.buktiBayar && pendingFileNames.buktiBayar &&
                            <span className="dokumen-gaji-file-current">
                                Pilih ulang {pendingFileNames.buktiBayar}.
                            </span>}
                    </div>

                    <div className="bp-field">
                        <label htmlFor="buktiBayarDepositPajak">Bukti Deposit Pajak (PDF, maks. {MAX_FILE_MB} MB)</label>
                        <input type="file" id="buktiBayarDepositPajak" name="buktiBayarDepositPajak"
                               accept="application/pdf" onChange={handleFileChange}/>
                        {isEdit && <span className="dokumen-gaji-file-current">
                            Saat ini: {currentLink("buktiBayarDepositPajak")} - kosongkan jika tidak diganti.
                        </span>}
                        {!isEdit && !files.buktiBayarDepositPajak && pendingFileNames.buktiBayarDepositPajak &&
                            <span className="dokumen-gaji-file-current">
                                Pilih ulang {pendingFileNames.buktiBayarDepositPajak}.
                            </span>}
                    </div>

                    {(fileError || formError) &&
                        <span className="dokumen-gaji-file-error">{fileError || formError}</span>}

                    {/* Native submit so the browser runs the required checks;
                        SubmitButton renders type="button" and would skip them */}
                    <div className="form-submit">
                        <input type="submit" value={isEdit ? "Simpan Perubahan" : "Simpan"} name="submit-pembayaran-bp"/>
                        <SubmitButton value="Batal" name="batal-pembayaran-bp" onClick={handleCancel}/>
                    </div>
                </form>}
            </div>
        </>
    );
}
