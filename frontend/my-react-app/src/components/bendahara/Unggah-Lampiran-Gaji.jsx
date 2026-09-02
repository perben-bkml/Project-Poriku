import {useMemo, useRef, useState} from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import Button from "@mui/material/Button";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

// One permintaan may ask for several documents, and the desk answers each with its own file.
// The dialog lists the jenis the pemohon actually asked for, so a missing document is visible
// rather than something the admin has to remember - which is the whole reason files are paired
// to a jenis instead of being a loose set.
export default function UnggahLampiranGaji({row, maxMb, onTutup, onKirim, onGagal}) {
    // jenis index -> File. A Map because the index is what the backend pairs on.
    const [berkas, setBerkas] = useState(new Map());
    const inputRef = useRef(null);
    const posisiRef = useRef(null);

    // A stored file carries its jenis in its own name, which is also how the backend matches it
    const sudahAda = useMemo(() => row.daftarJenis.map(jenis =>
        row.lampiran.find(item => item.nama.includes(` - ${jenis.replace(/[\\/]/g, "-")} `))), [row]);

    const minta = (posisi) => {
        posisiRef.current = posisi;
        inputRef.current?.click();
    };

    function dipilih(event) {
        const file = event.target.files?.[0];
        const posisi = posisiRef.current;
        // Cleared at once: picking the same file twice fires no change event otherwise
        event.target.value = "";
        if (!file || posisi === null) return;
        if (file.type !== "application/pdf") return onGagal("Berkas harus berformat PDF.", "error");
        if (file.size > maxMb * 1024 * 1024) return onGagal(`Ukuran berkas melebihi ${maxMb} MB.`, "error");
        setBerkas(lama => new Map(lama).set(posisi, file));
    }

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
                        const dipilihkan = berkas.get(posisi);
                        const lama = sudahAda[posisi];
                        return (
                            <li className="ulg-item" key={jenis}>
                                <div className="ulg-jenis">
                                    <span>{jenis}</span>
                                    {dipilihkan
                                        ? <em className="ulg-baru">{dipilihkan.name}</em>
                                        : lama
                                            ? <em className="ulg-ada"><CheckCircleIcon sx={{fontSize: 14}} /> sudah ada</em>
                                            : <em className="ulg-kosong">belum ada</em>}
                                </div>
                                <Button size="small" startIcon={<UploadFileIcon />} sx={{textTransform: "none"}}
                                        onClick={() => minta(posisi)}>
                                    {lama || dipilihkan ? "Ganti" : "Pilih"}
                                </Button>
                            </li>
                        );
                    })}
                </ul>

                <p className="ulg-catatan">
                    Hanya berkas yang dipilih di atas yang dikirim. Dokumen lain yang sudah ada
                    tetap tersimpan dan tidak dikirim ulang.
                </p>

                <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={dipilih} />
                <div className="ulg-aksi">
                    <Button onClick={onTutup} color="inherit" sx={{textTransform: "none"}}>Batal</Button>
                    <Button variant="contained" disabled={berkas.size === 0} sx={{textTransform: "none"}}
                            onClick={() => onKirim(row, berkas)}>
                        Unggah &amp; Kirim ({berkas.size})
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
