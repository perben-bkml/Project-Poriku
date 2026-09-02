import {useEffect, useRef, useState} from "react";
import {NavLink} from "react-router-dom";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import SendIcon from "@mui/icons-material/Send";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import apiClient from "../lib/apiClient";
import {layananGajiFormFields} from "../components/bendahara/head-data.js";

const KOSONG = Object.fromEntries(layananGajiFormFields.map(field => [field.key, field.banyak ? [] : ""]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAINNYA = "Lainnya";

// The MUI input restyled as one of the plain fields around it, so the searchable Unit Kerja
// does not read as a control from a different form. The 1rem font is load bearing on a phone:
// iOS Safari zooms the page whenever a focused field is smaller than that.
const CARI_SX = {
    "& .MuiOutlinedInput-root": {
        backgroundColor: "#fcfcfc", borderRadius: "8px", fontSize: "1rem", minHeight: "44px",
    },
    "& .MuiOutlinedInput-notchedOutline": {borderColor: "#C9D2E0"},
};

// The first field the pemohon has to fix, in the order the form shows them - not the order
// the checks happen to run in. On a phone the offending field is usually off screen, so the
// message alone reads as a form that refused to submit for no reason.
function bawaKeSalah(salah) {
    const field = layananGajiFormFields.find(item => salah[item.key]);
    const elemen = field && document.getElementById(`fg-${field.key}`);
    if (!elemen) return;
    // block center clears the sticky ribbon; preventScroll keeps the keyboard from yanking
    // the page somewhere else as it opens
    elemen.scrollIntoView({behavior: "smooth", block: "center"});
    elemen.focus({preventScroll: true});
}

// Twin of periksaFormGaji in server.js. Checked here first so a typo costs no request, and
// again there because the route is public and a browser is not a guard.
function periksa(nilai) {
    const salah = {};
    for (const field of layananGajiFormFields) {
        const isi = nilai[field.key];
        const kosong = field.banyak ? isi.length === 0 : !isi.trim();
        if (field.wajib && kosong) salah[field.key] = field.banyak ? "Pilih minimal satu" : "Wajib diisi";
    }
    if (!salah.email && !EMAIL.test(nilai.email.trim())) salah.email = "Alamat e-mail tidak valid";
    // No shape check on NIP/NRP: the two are numbered differently and some carry letters, so
    // refusing a real one is worse than accepting an odd one
    return salah;
}

export default function InputFormGaji() {
    const [nilai, setNilai] = useState(KOSONG);
    const [salah, setSalah] = useState({});
    const [bebas, setBebas] = useState({});
    const gagalRef = useRef(null);
    const [mengirim, setMengirim] = useState(false);
    const [gagal, setGagal] = useState("");
    const [hasil, setHasil] = useState(null);
    // The ribbon is sticky, so it is hidden past the fold exactly as on Gaji.jsx - a 210px
    // header pinned over a long form leaves too little of it on screen
    const [judulTersembunyi, setJudulTersembunyi] = useState(false);

    useEffect(() => {
        document.body.classList.add("scrollable-page");
        const onScroll = () => setJudulTersembunyi(window.scrollY > 100);
        window.addEventListener("scroll", onScroll);
        return () => {
            document.body.classList.remove("scrollable-page");
            window.removeEventListener("scroll", onScroll);
        };
    }, []);

    // In an effect, not beside setGagal: the banner does not exist in the DOM until the state
    // that renders it has been committed
    useEffect(() => {
        if (gagal) gagalRef.current?.scrollIntoView({behavior: "smooth", block: "center"});
    }, [gagal]);

    const ubah = (key, isi) => {
        setNilai(lama => ({...lama, [key]: isi}));
        setSalah(lama => lama[key] ? {...lama, [key]: ""} : lama);
    };

    async function kirim(event) {
        event.preventDefault();
        const temuan = periksa(nilai);
        setSalah(temuan);
        if (Object.values(temuan).some(Boolean)) return bawaKeSalah(temuan);

        setMengirim(true);
        setGagal("");
        try {
            const {data} = await apiClient.post("/layanan-gaji/form", nilai);
            setHasil({...data, ...nilai});
            window.scrollTo({top: 0, behavior: "smooth"});
        } catch (error) {
            console.error("Failed to submit layanan gaji form.", error);
            setGagal(error.response?.data?.message || "Permintaan gagal dikirim. Silakan coba lagi.");
        } finally {
            setMengirim(false);
        }
    }

    // "Lainnya" must never reach the sheet as the answer, so picking it reveals a box and the
    // typed text is what is submitted. The flag is what remembers the choice, since the value
    // itself is then free text and no longer matches any option.
    const pilihOpsi = (key, opsi) => {
        setBebas(lama => ({...lama, [key]: opsi === LAINNYA}));
        ubah(key, opsi === LAINNYA ? "" : opsi);
    };

    const ubahBanyak = (key, item, dipilih) => {
        setNilai(lama => ({
            ...lama,
            [key]: dipilih ? [...lama[key], item] : lama[key].filter(isi => isi !== item),
        }));
        setSalah(lama => lama[key] ? {...lama, [key]: ""} : lama);
    };

    const isian = (field) => {
        // Checkboxes rather than a multi-select: a phone renders the latter as a scrolling
        // list where ticking a second item silently unpicks the first
        if (field.banyak) {
            return (
                <div className="fg-pilihan" id={`fg-${field.key}`} tabIndex={-1}>
                    {field.pilihan.map(item => (
                        <label className="fg-pilihan-item" key={item}>
                            <input type="checkbox" checked={nilai[field.key].includes(item)}
                                   onChange={event => ubahBanyak(field.key, item, event.target.checked)} />
                            <span>{item}</span>
                        </label>
                    ))}
                </div>
            );
        }
        const umum = {
            id: `fg-${field.key}`,
            className: `fg-input${salah[field.key] ? " fg-input-salah" : ""}`,
            value: nilai[field.key],
            onChange: event => ubah(field.key, event.target.value),
        };
        if (field.pilihan) {
            const terpilih = bebas[field.key] ? LAINNYA : nilai[field.key];
            return (
                <>
                    {field.cari
                        ? <Autocomplete options={field.pilihan} value={terpilih || null} sx={CARI_SX}
                                        onChange={(event, opsi) => pilihOpsi(field.key, opsi || "")}
                                        size="small" id={`fg-${field.key}`} autoHighlight
                                        slotProps={{listbox: {sx: {"& li": {minHeight: 44, fontSize: "1rem"}}}}}
                                        renderInput={params => <TextField {...params} placeholder="Ketik untuk mencari…"
                                                                          error={Boolean(salah[field.key])} />} />
                        : <select {...umum} value={terpilih}
                                  onChange={event => pilihOpsi(field.key, event.target.value)}>
                            <option value="">— Pilih —</option>
                            {field.pilihan.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>}
                    {bebas[field.key] &&
                        <input className={umum.className} value={nilai[field.key]} autoFocus
                               placeholder={`Tulis ${field.label}`}
                               onChange={event => ubah(field.key, event.target.value)} />}
                </>
            );
        }
        if (field.baris) return <textarea {...umum} rows={field.baris} />;
        return <input {...umum} type={field.type || "text"} inputMode={field.inputMode}
                      autoComplete={field.autoComplete} />;
    };

    return (
        <div className="gaji-page">
            <div className={`gaji-title ${judulTersembunyi ? "hidden" : ""}`}>
                <h3>Formulir</h3>
                <h1>Permintaan Dokumen Gaji</h1>
                <br />
                <NavLink to="/layanan-gaji" style={{textDecoration: "none", color: "inherit"}}>
                    <p className="gaji-title-desc">Kembali ke <b>Pelayanan Gaji</b></p>
                </NavLink>
            </div>

            <div className="fg-content">
                {hasil
                    ? <div className="fg-card fg-selesai">
                        <TaskAltIcon sx={{fontSize: 64, color: "#0F7A3D"}} />
                        <h2>Permintaan Anda Telah Kami Terima</h2>
                        <p className="fg-antrian">No. Antrian <b>{hasil.no}</b></p>
                        <dl className="fg-ringkas">
                            <div><dt>Nama</dt><dd>{hasil.namaLengkap}</dd></div>
                            <div><dt>Jenis Permintaan</dt><dd>{hasil.jenisPermintaan.join(", ")}</dd></div>
                            <div><dt>Status</dt><dd>{hasil.status}</dd></div>
                            <div><dt>Dikirim ke</dt><dd>{hasil.email}</dd></div>
                        </dl>
                        {hasil.emailTerkirim === false &&
                            <p className="fg-peringatan">
                                E-mail konfirmasi gagal dikirim ke <b>{hasil.email}</b>. Permintaan Anda
                                tetap tercatat, namun pastikan alamat tersebut benar dan aktif — dokumen
                                akan dikirim ke alamat yang sama. Hubungi Bagian Keuangan bila alamatnya keliru.
                            </p>}
                        <p className="fg-catatan">
                            Dokumen akan kami kirimkan ke alamat e-mail di atas melalui perbend.bakamla@gmail.com.
                            Pantau perkembangan permintaan Anda pada tabel Antrian Pelayanan.
                        </p>
                        <div className="fg-aksi">
                            <button type="button" className="fg-kirim"
                                    onClick={() => { setHasil(null); setNilai(KOSONG); setBebas({}); }}>
                                Kirim Permintaan Lain
                            </button>
                            <NavLink to="/layanan-gaji" className="fg-kembali">Lihat Antrian Pelayanan</NavLink>
                        </div>
                    </div>
                    : <form className="fg-card" onSubmit={kirim} noValidate>
                        <h2>Data Pemohon</h2>
                        <p className="fg-catatan">
                            Isi seluruh kolom bertanda <span className="fg-wajib">*</span>. Dokumen dikirim
                            ke e-mail yang Anda cantumkan, jadi pastikan alamatnya benar.
                        </p>
                        <div className="fg-grid">
                            {layananGajiFormFields.map(field => (
                                <div className={`fg-field${field.lebar ? " fg-field-lebar" : ""}`} key={field.key}>
                                    <label htmlFor={`fg-${field.key}`}>
                                        {field.label}{field.wajib && <span className="fg-wajib"> *</span>}
                                    </label>
                                    {isian(field)}
                                    {salah[field.key]
                                        ? <span className="fg-pesan fg-pesan-salah">{salah[field.key]}</span>
                                        : field.petunjuk && <span className="fg-pesan">{field.petunjuk}</span>}
                                </div>
                            ))}
                        </div>
                        {gagal && <p className="fg-gagal" ref={gagalRef}>{gagal}</p>}
                        <div className="fg-aksi">
                            <button type="submit" className="fg-kirim" disabled={mengirim}>
                                <SendIcon fontSize="small" />
                                {mengirim ? "Mengirim…" : "Kirim Permintaan"}
                            </button>
                        </div>
                    </form>}
            </div>
        </div>
    );
}
