import {useMemo, useRef, useState} from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import Button from "@mui/material/Button";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

// One permintaan may ask for several documents, and the desk answers each with its own file(s).
// The dialog lists the jenis the pemohon actually asked for, so a missing document is visible
// rather than something the admin has to remember - which is the whole reason files are paired
// to a jenis instead of being a loose set.
export default function UnggahLampiranGaji({row, maxMb, onTutup, onKirim, onGagal}) {
    // jenis index -> Array of File. A Map because the index is what the backend pairs on.
    const [berkas, setBerkas] = useState(new Map());
    const inputRef = useRef(null);
    const posisiRef = useRef(null);

    // A stored file carries its jenis in its own name, which is also how the backend matches it
    const sudahAda = useMemo(() => row.daftarJenis.map(jenis =>
        row.lampiran.filter(item => item.nama.includes(` - ${jenis.replace(/[\\/]/g, "-")} `))), [row]);

    const minta = (posisi) => {
        posisiRef.current = posisi;
        inputRef.current?.click();
    };

    function dipilih(event) {
        const files = Array.from(event.target.files || []);
        const posisi = posisiRef.current;
        // Cleared at once: picking the same file twice fires no change event otherwise
        event.target.value = "";
        if (files.length === 0 || posisi === null) return;
        
        const invalidType = files.find(f => f.type !== "application/pdf");
        if (invalidType) return onGagal("Semua berkas harus berformat PDF.", "error");
        
        const overSize = files.find(f => f.size > maxMb * 1024 * 1024);
        if (overSize) return onGagal(`Ada berkas yang ukurannya melebihi ${maxMb} MB.`, "error");
        
        setBerkas(lama => new Map(lama).set(posisi, files));
    }

    const totalFiles = Array.from(berkas.values()).reduce((sum, f) => sum + f.length, 0);

    return (
        <Dialog open onClose={onTutup} maxWidth="sm" fullWidth>
            <div className="ulg">
                <h2>Unggah Lampiran</h2>
                <p className="ulg-sub">
                    No. {row.no} — {row.namaLengkap || "-"}<br />
                    Dokumen dikirim ke <b>{row.email}</b>
                </p>

                <ul className="ulg-daftar">
                    {row.daftarJenis.map((jenis, posisi) => {
                        const dipilihkan = berkas.get(posisi) || [];
                        const lama = sudahAda[posisi] || [];
                        return (
                            <li className="ulg-item" key={jenis}>
                                <div className="ulg-jenis">
                                    <span>{jenis}</span>
                                    {dipilihkan.length > 0
                                        ? <em className="ulg-baru">{dipilihkan.map(f => f.name).join(", ")}</em>
                                        : lama.length > 0
                                            ? <em className="ulg-ada"><CheckCircleIcon sx={{fontSize: 14}} /> {lama.length} sudah ada</em>
                                            : <em className="ulg-kosong">belum ada</em>}
                                </div>
                                <Button size="small" startIcon={<UploadFileIcon />} sx={{textTransform: "none"}}
                                        onClick={() => minta(posisi)}>
                                    {lama.length > 0 || dipilihkan.length > 0 ? "Ganti" : "Pilih"}
                                </Button>
                            </li>
                        );
                    })}
                </ul>

                <p className="ulg-catatan">
                    Hanya berkas yang dipilih di atas yang dikirim. Dokumen lain yang sudah ada
                    tetap tersimpan dan tidak dikirim ulang.
                </p>

                <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={dipilih} />
                <div className="ulg-aksi">
                    <Button onClick={onTutup} color="inherit" sx={{textTransform: "none"}}>Batal</Button>
                    <Button variant="contained" disabled={berkas.size === 0} sx={{textTransform: "none"}}
                            onClick={() => onKirim(row, berkas)}>
                        Unggah &amp; Kirim ({totalFiles})
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

UnggahLampiranGaji.propTypes = {
    row: PropTypes.object.isRequired,
    maxMb: PropTypes.number.isRequired,
    onTutup: PropTypes.func.isRequired,
    onKirim: PropTypes.func.isRequired,
    onGagal: PropTypes.func.isRequired,
};
