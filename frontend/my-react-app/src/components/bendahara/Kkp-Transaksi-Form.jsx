import {useContext, useEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import apiClient from "../../lib/apiClient";
import {BackgroundTaskContext} from "../../lib/BackgroundTasks";
import {SubmitButton} from "../../ui/buttons.jsx";
import {kkpTransaksiVia, kkpInputKeterangan, formatRupiah} from "./head-data.js";

const MAX_FILE_MB = 10;
const DRAFT_KEY = 'kkp-transaksi-draft';

const EMPTY = {
    tanggalTransaksi: "", namaPic: "", namaPejalan: "", unitKerja: "",
    keterangan: "", transaksiVia: "", nominal: "", kode: "",
};

// "12-02-2026" -> "2026-02-12" for the date input; anything else yields nothing
const toDateInput = (value) => {
    const parts = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || "").trim());
    return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : "";
};

// Grouped digits, with the minus kept: a refund is entered as a negative nominal and
// parseRupiah on the server reads the sign back off the leading "-".
const toRupiah = (value) => {
    const raw = String(value ?? "");
    const minus = raw.trim().startsWith("-") ? "-" : "";
    const digits = raw.replace(/\D/g, "");
    return digits === "" ? minus : minus + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const dariRecord = (record) => ({
    tanggalTransaksi: toDateInput(record.tanggalTransaksi),
    namaPic: record.namaPic || "",
    namaPejalan: record.namaPejalan || "",
    unitKerja: record.unitKerja || "",
    keterangan: record.keterangan || "",
    transaksiVia: record.transaksiVia || "",
    nominal: toRupiah(record.nominal),
    kode: record.kode || "",
});

export default function KkpTransaksiForm({data, record, onSelesai, onBatal}) {
    const isEdit = Boolean(record);
    const {runTask} = useContext(BackgroundTaskContext);

    // Seeded rather than filled by the effect below, so opening an edit never shows one
    // frame of empty fields; the effect still covers the row changing under the same mount.
    const [formData, setFormData] = useState(() => {
        if (record) return dariRecord(record);
        const saved = localStorage.getItem(DRAFT_KEY);
        return saved ? {...EMPTY, ...JSON.parse(saved).fields} : EMPTY;
    });
    // A File cannot go in localStorage, so a draft remembers only the name
    const [namaTertunda, setNamaTertunda] = useState(() => {
        if (record) return "";
        const saved = localStorage.getItem(DRAFT_KEY);
        return saved ? (JSON.parse(saved).namaBerkas || "") : "";
    });
    const [berkas, setBerkas] = useState(null);
    const [pesan, setPesan] = useState("");
    // A file input is uncontrolled, so clearing the state leaves the picked name on screen
    const berkasRef = useRef(null);

    function lupakanBerkas() {
        setBerkas(null);
        setNamaTertunda("");
        if (berkasRef.current) berkasRef.current.value = "";
    }

    useEffect(() => {
        if (!record) return;
        setFormData(dariRecord(record));
        setBerkas(null);
        setPesan("");
        if (berkasRef.current) berkasRef.current.value = "";
    }, [record]);

    const simpanDraf = (fields, namaBerkas) => {
        if (isEdit) return;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({fields, namaBerkas}));
    };
    const hapusDraf = () => localStorage.removeItem(DRAFT_KEY);

    function ubah(name, value) {
        setFormData(prev => {
            // A Kode belongs to one unit kerja, so changing the unit drops the code rather
            // than leaving the entry hanging off another unit's SPM
            const next = {...prev, [name]: value, ...(name === "unitKerja" ? {kode: ""} : {})};
            simpanDraf(next, namaTertunda);
            return next;
        });
    }

    const handleInputChange = (event) => ubah(event.target.name, event.target.value);

    function handleFileChange(event) {
        const picked = event.target.files[0];
        if (!picked) { setBerkas(null); return; }
        if (picked.type !== "application/pdf") {
            setPesan("Berkas harus berformat PDF.");
            event.target.value = "";
            return;
        }
        if (picked.size > MAX_FILE_MB * 1024 * 1024) {
            setPesan(`Ukuran berkas melebihi ${MAX_FILE_MB} MB.`);
            event.target.value = "";
            return;
        }
        setPesan("");
        setBerkas(picked);
        setNamaTertunda(picked.name);
        simpanDraf(formData, picked.name);
    }

    const unitKerja = useMemo(() => data?.unitKerja || [], [data]);
    const unitTerpilih = useMemo(
        () => unitKerja.find(item => item.nama === formData.unitKerja) || null,
        [unitKerja, formData.unitKerja]);

    // Only this unit's codes. A settled one is shown but not selectable, so a skipped
    // number reads as already paid rather than as a code that went missing.
    const opsiKode = useMemo(() => (data?.grup || [])
        .filter(item => item.kode && item.unitKerja === formData.unitKerja)
        .sort((a, b) => a.kode.localeCompare(b.kode, "id")), [data, formData.unitKerja]);

    function handleSubmit(event) {
        event.preventDefault();

        const kirim = new FormData();
        Object.entries(formData).forEach(([key, value]) => kirim.append(key, value));
        if (berkas) kirim.append('buktiTransaksi', berkas);
        if (isEdit) {
            kirim.append('rowNumber', record.rowNumber);
            kirim.append('expectedNo', record.no ?? "");
        }

        // Not awaited: the upload outlives this card, so a menu switch cannot lose it
        runTask({
            label: `Transaksi KKP ${formData.namaPejalan}`,
            tag: "kkp-transaksi",
            run: async () => {
                const response = isEdit
                    ? await apiClient.patch('/kkp/transaksi', kirim, {headers: {'Content-Type': 'multipart/form-data'}})
                    : await apiClient.post('/kkp/transaksi', kirim, {headers: {'Content-Type': 'multipart/form-data'}});
                onSelesai();
                return response.data?.message;
            },
        });
        hapusDraf();
        setFormData(EMPTY);
        lupakanBerkas();
        if (isEdit) onBatal();
    }

    function handleBatal() {
        hapusDraf();
        setFormData(EMPTY);
        lupakanBerkas();
        onBatal();
    }

    return (
        <form className="pembayaran-bp-form kkp-form" onSubmit={handleSubmit}>


            <div className="bp-form-fields">
                <div className="bp-field">
                    <label htmlFor="tanggalTransaksi">Tanggal Transaksi</label>
                    <input type="date" id="tanggalTransaksi" name="tanggalTransaksi" className="type-btn"
                           value={formData.tanggalTransaksi} onChange={handleInputChange} required/>
                </div>

                <div className="bp-field">
                    <label htmlFor="namaPic">Nama PIC</label>
                    <input type="text" id="namaPic" name="namaPic" className="type-btn"
                           value={formData.namaPic} onChange={handleInputChange} required/>
                </div>

                <div className="bp-field">
                    <label htmlFor="namaPejalan">Nama Pejalan</label>
                    <input type="text" id="namaPejalan" name="namaPejalan" className="type-btn"
                           value={formData.namaPejalan} onChange={handleInputChange} required/>
                </div>

                <div className="bp-field">
                    <label htmlFor="unitKerja">Unit Kerja</label>
                    <select id="unitKerja" name="unitKerja" className="type-btn"
                            value={formData.unitKerja} onChange={handleInputChange} required>
                        <option value="" disabled>Pilih unit kerja</option>
                        {unitKerja.map(item => <option key={item.nama} value={item.nama}>{item.nama}</option>)}
                    </select>
                </div>

                <div className="bp-field">
                    <label htmlFor="transaksiVia">Transaksi Via</label>
                    <select id="transaksiVia" name="transaksiVia" className="type-btn"
                            value={formData.transaksiVia} onChange={handleInputChange} required>
                        <option value="" disabled>Pilih kanal</option>
                        {kkpTransaksiVia.map(via => <option key={via} value={via}>{via}</option>)}
                    </select>
                </div>

                <div className="bp-field">
                    <label htmlFor="nominal">Nominal (isi minus untuk refund)</label>
                    <input type="text" id="nominal" name="nominal" className="type-btn" inputMode="numeric"
                           placeholder="1.250.000" value={formData.nominal} required
                           onChange={event => ubah("nominal", toRupiah(event.target.value))}/>
                </div>

                {/* One Kode is one SPM. Joining an open one is a choice; leaving it blank
                    lets the server mint the next number for this unit kerja. */}
                <div className="bp-field">
                    <label htmlFor="kode">Kode</label>
                    <select id="kode" name="kode" className="type-btn" disabled={isEdit || !formData.unitKerja}
                            value={formData.kode} onChange={handleInputChange}>
                        <option value="">
                            {unitTerpilih ? `Buat kode baru: ${unitTerpilih.kodeBaru}` : "Pilih unit kerja dahulu"}
                        </option>
                        {opsiKode.map(item => (
                            <option key={item.kode} value={item.kode} disabled={item.lunas}>
                                {item.kode} - {item.jumlahBaris} transaksi, {formatRupiah(item.total)}
                                {item.lunas ? " (sudah terbayarkan)" : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bp-field bp-field-note">
                    <label htmlFor="keterangan">Keterangan Penggunaan KKP</label>
                    <textarea id="keterangan" name="keterangan" className="type-btn" rows={3}
                              value={formData.keterangan} onChange={handleInputChange} required/>
                </div>

                <div className="bp-field bp-field-file">
                    <label htmlFor="buktiTransaksi">Bukti Transaksi (PDF, maks. {MAX_FILE_MB} MB)</label>
                    <input type="file" id="buktiTransaksi" name="buktiTransaksi" accept="application/pdf"
                           ref={berkasRef} onChange={handleFileChange}/>
                    {isEdit && <span className="dokumen-gaji-file-current">
                        Saat ini: {record.buktiTransaksi?.url
                            ? <a href={record.buktiTransaksi.url} target="_blank" rel="noopener noreferrer">
                                {record.buktiTransaksi.nama}</a>
                            : (record.buktiTransaksi?.nama || "tidak ada")} - kosongkan jika tidak diganti.
                    </span>}
                    {!isEdit && !berkas && namaTertunda &&
                        <span className="dokumen-gaji-file-current">Pilih ulang {namaTertunda}.</span>}
                </div>
            </div>

            <div className="bp-form-footer">
                {pesan && <span className="dokumen-gaji-file-error">{pesan}</span>}
                {/* Native submit so the browser runs the required checks; SubmitButton
                    renders type="button" and would skip them */}
                <div className="form-submit">
                    <input type="submit" name="simpan-kkp" value={isEdit ? "Simpan Perubahan" : "Simpan Transaksi"}/>
                    <SubmitButton value={isEdit ? "Batal" : "Kosongkan"} name="batal-kkp" onClick={handleBatal}/>
                </div>
            </div>
        </form>
    );
}

KkpTransaksiForm.propTypes = {
    data: PropTypes.object,
    record: PropTypes.object,
    onSelesai: PropTypes.func.isRequired,
    onBatal: PropTypes.func.isRequired,
};
