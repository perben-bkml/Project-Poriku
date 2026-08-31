import {useEffect, useMemo, useRef, useState} from 'react';
import apiClient from "../../lib/apiClient";
// Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {sbmKolomTiket, sbmKolomHotel, sbmContohTiket, sbmContohHotel, sbmKelasPesawat,
    sbmGolonganHotel, sbmUnggahKeterangan, kalkulatorKeterangan, formatRupiah} from "./head-data.js";
import {unduhExcelBanyakSheet, selTeks} from "../../lib/excel.js";
// Import Tables
import {TableSbmTiket, TableSbmHotel, TableKalkulatorRincian} from "../../ui/tables.jsx";

// Twin of ANGGARAN_MAX_FILE_MB in server.js - the label has to name the limit multer enforces
const SBM_MAX_MB = 10;

// Frontend twin of normalizeSatker in server.js. The SBM file is maintained by hand, so
// "Jakarta", "JAKARTA " and "Jakarta  Pusat" must not become three entries in a dropdown.
const kunci = (teks) => String(teks ?? "").trim().replace(/\s+/g, " ").toUpperCase();

// A counter rather than crypto.randomUUID(), which throws outside a secure context - the dev
// server reached over a LAN IP is http. The id only has to be stable as a React key.
let nomorBaris = 0;
const barisKosongTiket = () => ({id: ++nomorBaris, kotaAsal: "", kotaTujuan: "", kelas: "", orang: 1});
const barisKosongHotel = () => ({id: ++nomorBaris, provinsi: "", golongan: "", durasi: 1, orang: 1});

// Blank while the row is incomplete rather than zero: a zero subtotal reads as "this leg is
// free", which is a different claim from "this leg is not filled in yet".
const bulat = (nilai) => {
    const angka = parseInt(nilai, 10);
    return Number.isInteger(angka) && angka > 0 ? angka : null;
};

export default function KelolaKkp() {
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState(null);
    const [alert, setAlert] = useState(null);

    // Upload panel
    const berkasRef = useRef(null);
    const [isUnggah, setIsUnggah] = useState(false);
    const [isTerapkan, setIsTerapkan] = useState(false);
    const [pratinjau, setPratinjau] = useState(null);
    const [masalah, setMasalah] = useState([]);

    // Kalkulator. Line items rather than one set of fields, so a single trip can mix people
    // on different kelas or golongan - which is the normal case, not the exception.
    const [barisTiket, setBarisTiket] = useState([barisKosongTiket()]);
    const [barisHotel, setBarisHotel] = useState([barisKosongHotel()]);

    const [cariTiket, setCariTiket] = useState("");
    const [cariHotel, setCariHotel] = useState("");

    function showAlert(severity, message) {
        setAlert({severity, message});
        setTimeout(() => setAlert(null), 5000);
    }

    async function fetchSbm(quiet = false) {
        try {
            if (!quiet) setIsLoading(true);
            const response = await apiClient.get('/kkp/sbm');
            setData(response.data);
        } catch (error) {
            console.log("Failed fetching SBM.", error);
            showAlert("error", error?.response?.data?.message || "Gagal memuat data SBM.");
            setData(null);
        } finally {
            if (!quiet) setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchSbm();
    }, []);

    // The template is generated rather than stored so it can never drift from the columns
    // the parser actually checks, and the sheet ORDER is what the upload matches on
    async function unduhTemplate() {
        await unduhExcelBanyakSheet("Template SBM.xlsx", [
            {
                nama: "Tiket Pesawat", head: sbmKolomTiket, lebar: [22, 22, 18, 18],
                baris: sbmContohTiket.map(row => row.map(sel => selTeks(sel, true))),
            },
            {
                nama: "Tarif Hotel", head: sbmKolomHotel, lebar: [24, 18, 18, 24, 26],
                baris: sbmContohHotel.map(row => row.map(sel => selTeks(sel, true))),
            },
        ]);
    }

    // Preview. The server persists the parsed file as a draft and answers with what it read;
    // nothing replaces the live SBM until Terapkan flips it.
    async function kirimBerkas(event) {
        // The form owns the submit so `required` runs, which means stopping the reload here
        event.preventDefault();
        const berkas = berkasRef.current?.files?.[0];
        if (!berkas) return showAlert("warning", "Pilih berkas .xlsx terlebih dahulu.");
        if (berkas.size > SBM_MAX_MB * 1024 * 1024) {
            // Rejected here as well as on the server, so an oversized file is never uploaded
            return showAlert("warning", `Ukuran berkas melebihi ${SBM_MAX_MB} MB.`);
        }

        // A draft already on screen would be orphaned by a second upload
        if (pratinjau) await batalkanDraf(true);

        const formData = new FormData();
        formData.append('berkas', berkas);
        try {
            setIsUnggah(true);
            setMasalah([]);
            const response = await apiClient.post('/kkp/sbm/unggah', formData,
                {headers: {'Content-Type': 'multipart/form-data'}});
            setPratinjau(response.data);
        } catch (error) {
            const body = error?.response?.data;
            setPratinjau(null);
            setMasalah(body?.masalah || []);
            showAlert("error", body?.message || "Gagal memproses berkas.");
        } finally {
            setIsUnggah(false);
        }
    }

    async function terapkanDraf() {
        if (!pratinjau) return;
        try {
            setIsTerapkan(true);
            const response = await apiClient.post('/kkp/sbm/unggah/terapkan', {unggahanId: pratinjau.unggahanId});
            setPratinjau(null);
            if (berkasRef.current) berkasRef.current.value = "";
            // Prices the rows were priced against are gone, so the picks are cleared with them
            setBarisTiket([barisKosongTiket()]);
            setBarisHotel([barisKosongHotel()]);
            showAlert("success", response.data.message || "Data SBM diterapkan.");
            await fetchSbm(true);
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menerapkan data SBM.");
        } finally {
            setIsTerapkan(false);
        }
    }

    // diam=true when this is housekeeping before a fresh upload, not the admin pressing Batal
    async function batalkanDraf(diam = false) {
        if (!pratinjau) return;
        try {
            await apiClient.delete('/kkp/sbm/unggah', {params: {unggahanId: pratinjau.unggahanId}});
            setPratinjau(null);
            if (!diam) showAlert("info", "Draf dibatalkan.");
        } catch (error) {
            if (!diam) showAlert("error", error?.response?.data?.message || "Gagal membatalkan draf.");
        }
    }

    // Memoised so the indexes below rebuild on a new fetch and not on every render
    const tiket = useMemo(() => data?.tiket || [], [data]);
    const hotel = useMemo(() => data?.hotel || [], [data]);

    // Kota Asal -> its rute. Built once per data load: the calculators look a price up on
    // every keystroke, and scanning the whole list each time is what a Map avoids.
    const indeksTiket = useMemo(() => {
        const peta = new Map();
        tiket.forEach(row => {
            const asal = kunci(row.kotaAsal);
            if (!peta.has(asal)) peta.set(asal, {nama: row.kotaAsal, tujuan: new Map()});
            peta.get(asal).tujuan.set(kunci(row.kotaTujuan), {nama: row.kotaTujuan, tarif: row.tarif});
        });
        return peta;
    }, [tiket]);

    const indeksHotel = useMemo(() => new Map(
        hotel.map(row => [kunci(row.provinsi), {nama: row.provinsi, tarif: row.tarif}])
    ), [hotel]);

    const opsiKotaAsal = useMemo(() => [...indeksTiket]
        .map(([value, item]) => ({value, title: item.nama}))
        .sort((a, b) => a.title.localeCompare(b.title, "id")), [indeksTiket]);

    const opsiProvinsi = useMemo(() => [...indeksHotel]
        .map(([value, item]) => ({value, title: item.nama}))
        .sort((a, b) => a.title.localeCompare(b.title, "id")), [indeksHotel]);

    const opsiKotaTujuan = (asal) => [...(indeksTiket.get(asal)?.tujuan || new Map())]
        .map(([value, item]) => ({value, title: item.nama}))
        .sort((a, b) => a.title.localeCompare(b.title, "id"));

    function ubahTiket(id, key, nilai) {
        setBarisTiket(prev => prev.map(row => {
            if (row.id !== id) return row;
            const baru = {...row, [key]: nilai};
            // A tujuan is only valid for the asal it was picked under, so changing the origin
            // drops it rather than leaving a rute that has no price
            if (key === "kotaAsal") baru.kotaTujuan = "";
            return baru;
        }));
    }

    const ubahHotel = (id, key, nilai) =>
        setBarisHotel(prev => prev.map(row => row.id === id ? {...row, [key]: nilai} : row));

    // The last row is never removed - an empty calculator has nothing to type into
    const hapusBaris = (setter) => (id) =>
        setter(prev => prev.length === 1 ? prev : prev.filter(row => row.id !== id));

    const hitungTiket = barisTiket.map(row => {
        const tarif = indeksTiket.get(row.kotaAsal)?.tujuan.get(row.kotaTujuan)?.tarif;
        const orang = bulat(row.orang);
        const satuan = tarif && row.kelas ? tarif[row.kelas] : null;
        return {...row, satuan, subtotal: satuan !== null && satuan !== undefined && orang ? satuan * orang : null};
    });

    const hitungHotel = barisHotel.map(row => {
        const tarif = indeksHotel.get(row.provinsi)?.tarif;
        const durasi = bulat(row.durasi);
        const orang = bulat(row.orang);
        const satuan = tarif && row.golongan ? tarif[row.golongan] : null;
        return {
            ...row, satuan,
            subtotal: satuan !== null && satuan !== undefined && durasi && orang ? satuan * durasi * orang : null,
        };
    });

    const totalTiket = hitungTiket.reduce((sum, row) => sum + (row.subtotal || 0), 0);
    const totalHotel = hitungHotel.reduce((sum, row) => sum + (row.subtotal || 0), 0);
    const belumLengkap = [...hitungTiket, ...hitungHotel].some(row => row.subtotal === null);

    const kolomTiket = [
        {key: "kotaAsal", label: "Kota Asal", pilihan: () => opsiKotaAsal},
        {key: "kotaTujuan", label: "Kota Tujuan", pilihan: (row) => opsiKotaTujuan(row.kotaAsal)},
        {key: "kelas", label: "Kelas Pesawat", pilihan: () => sbmKelasPesawat},
        {key: "orang", label: "Jumlah Orang"},
    ];
    const kolomHotel = [
        {key: "provinsi", label: "Provinsi", pilihan: () => opsiProvinsi},
        {key: "golongan", label: "Golongan", pilihan: () => sbmGolonganHotel},
        {key: "durasi", label: "Durasi (hari)"},
        {key: "orang", label: "Jumlah Orang"},
    ];

    const saring = (baris, teks, ambil) => {
        const cari = kunci(teks);
        return cari === "" ? baris : baris.filter(row => ambil(row).some(nilai => kunci(nilai).includes(cari)));
    };
    const tiketTampil = saring(tiket, cariTiket, row => [row.kotaAsal, row.kotaTujuan]);
    const hotelTampil = saring(hotel, cariHotel, row => [row.provinsi]);

    if (isLoading && !data) return <LoadingAnimate/>;

    const unggahan = data?.unggahan;
    const labelSumber = unggahan
        ? `${unggahan.namaBerkas || "tanpa nama berkas"} - diterapkan ${new Date(unggahan.aktifPada).toLocaleString("id-ID", {dateStyle: "short", timeStyle: "short"})} oleh ${unggahan.dibuatOleh || "-"}`
        : "Belum ada data SBM untuk tahun ini";

    return (
        <div>
            <div className="bg-card wide-card-content">
                <div className="wide-card-head">
                    <h2 className="wide-card-title">Unggah Standar Biaya Masukan {data?.tahun || ""}</h2>
                    <div className="wide-card-actions">
                        <span className="anggaran-sinkron">{labelSumber}</span>
                        <input className="btn-aksi btn-aksi-wide" type="button" value="Unduh Template"
                               onClick={unduhTemplate}/>
                    </div>
                </div>

                {/* Native submit so the browser runs the `required` check on the file input,
                    the same reason Anggaran avoids SubmitButton here */}
                <form className="anggaran-form" onSubmit={kirimBerkas}>
                    <p className="anggaran-intro">{sbmUnggahKeterangan}</p>

                    <label htmlFor="berkas-sbm">Berkas SBM (.xlsx, maks. {SBM_MAX_MB} MB)</label>
                    <div className="anggaran-file">
                        <input type="file" id="berkas-sbm" name="berkas" accept=".xlsx" ref={berkasRef} required/>
                        <span className="anggaran-note">
                            Gunakan Unduh Template bila belum punya berkas dengan susunan sheet yang benar.
                        </span>
                    </div>

                    <div className="form-submit">
                        <input type="submit" className="btn-submit-wide" name="periksa-sbm"
                               value={isUnggah ? "Memproses..." : "Periksa Berkas"} disabled={isUnggah}/>
                    </div>
                </form>

                {/* Blocking problems. Nothing was written, so there is no draft to discard. */}
                {masalah.length > 0 &&
                    <div className="anggaran-pesan">
                        <h3>Berkas belum dapat diproses</h3>
                        <ul>
                            {masalah.map((item, index) => (
                                <li key={index}>Baris {item.baris}: {item.pesan}</li>
                            ))}
                        </ul>
                    </div>}
            </div>

            {/* What the file was read as, waiting for a decision. The prices themselves are
                shown, not just a count: a mis-shifted column is only obvious as numbers. */}
            {pratinjau &&
                <div className="bg-card wide-card-content anggaran-pratinjau">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Pratinjau Data SBM</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-revisi-aktif">{pratinjau.namaBerkas}</span>
                        </div>
                    </div>
                    <div className="anggaran-pratinjau-body">
                        <p className="anggaran-ringkasan">
                            <strong>{pratinjau.ringkasan.tiket}</strong> rute tiket pesawat,{' '}
                            <strong>{pratinjau.ringkasan.hotel}</strong> provinsi tarif hotel.
                        </p>
                        <p className="anggaran-belum">
                            Belum ada yang berubah. Menekan Terapkan akan mengganti seluruh data SBM tahun ini.
                        </p>
                        <div className="form-submit">
                            <input type="button" className="btn-submit-wide" name="terapkan-sbm"
                                   value={isTerapkan ? "Menerapkan..." : "Terapkan"}
                                   disabled={isTerapkan} onClick={terapkanDraf}/>
                            <input type="button" className="btn-submit-wide" name="batal-sbm" value="Batalkan"
                                   disabled={isTerapkan} onClick={() => batalkanDraf(false)}/>
                        </div>
                    </div>
                    <h3 className="kkp-sub">Tiket Pesawat</h3>
                    <TableSbmTiket baris={pratinjau.tiket} kosong="Sheet Tiket Pesawat tidak berisi baris."/>
                    <h3 className="kkp-sub">Tarif Hotel</h3>
                    <TableSbmHotel baris={pratinjau.hotel} kosong="Sheet Tarif Hotel tidak berisi baris."/>
                </div>}

            <div className="bg-card wide-card-content">
                <div className="wide-card-head">
                    <h2 className="wide-card-title">Kalkulator Standar Biaya Masukan {data?.tahun || ""}</h2>
                    <div className="wide-card-actions">
                        <input className="btn-aksi btn-aksi-wide" type="button" value="Kosongkan"
                               onClick={() => {
                                   setBarisTiket([barisKosongTiket()]);
                                   setBarisHotel([barisKosongHotel()]);
                               }}/>
                    </div>
                </div>
                <p className="anggaran-note anggaran-catatan-realisasi">{kalkulatorKeterangan}</p>

                <div className="kkp-kalkulator">
                    <div className="kkp-blok">
                        <div className="kkp-blok-head">
                            <h3 className="kkp-sub">Kalkulator Tiket Pesawat</h3>
                            <input className="btn-aksi" type="button" value="+ Tambah Baris"
                                   disabled={opsiKotaAsal.length === 0}
                                   onClick={() => setBarisTiket(prev => [...prev, barisKosongTiket()])}/>
                        </div>
                        {opsiKotaAsal.length === 0
                            ? <p className="anggaran-note">Belum ada data SBM Tiket Pesawat untuk dihitung.</p>
                            : <>
                                <TableKalkulatorRincian baris={hitungTiket} kolom={kolomTiket}
                                                        onUbah={ubahTiket} onHapus={hapusBaris(setBarisTiket)}/>
                                <p className="kkp-total">Total Tiket Pesawat <strong>{formatRupiah(totalTiket)}</strong></p>
                              </>}
                    </div>

                    <div className="kkp-blok">
                        <div className="kkp-blok-head">
                            <h3 className="kkp-sub">Kalkulator Tarif Hotel</h3>
                            <input className="btn-aksi" type="button" value="+ Tambah Baris"
                                   disabled={opsiProvinsi.length === 0}
                                   onClick={() => setBarisHotel(prev => [...prev, barisKosongHotel()])}/>
                        </div>
                        {opsiProvinsi.length === 0
                            ? <p className="anggaran-note">Belum ada data SBM Tarif Hotel untuk dihitung.</p>
                            : <>
                                <TableKalkulatorRincian baris={hitungHotel} kolom={kolomHotel}
                                                        onUbah={ubahHotel} onHapus={hapusBaris(setBarisHotel)}/>
                                <p className="kkp-total">Total Tarif Hotel <strong>{formatRupiah(totalHotel)}</strong></p>
                              </>}
                    </div>
                </div>

                <div className="kkp-grand">
                    <span>Total Keseluruhan</span>
                    <strong>{formatRupiah(totalTiket + totalHotel)}</strong>
                </div>
                {belumLengkap &&
                    <p className="kkp-catatan">
                        Ada baris yang belum lengkap dan belum ikut dijumlahkan.
                    </p>}
            </div>

            <div className="bg-card wide-card-content">
                <div className="wide-card-head">
                    <h2 className="wide-card-title">SBM Tiket Pesawat</h2>
                    <div className="wide-card-actions">
                        <span className="anggaran-sinkron">{tiketTampil.length} dari {tiket.length} rute</span>
                        <input className="type-btn kkp-cari" type="search" placeholder="Cari kota..."
                               value={cariTiket} onChange={event => setCariTiket(event.target.value)}/>
                        <input className="btn-aksi btn-aksi-wide" type="button"
                               value={isLoading ? "Memuat..." : "Muat Ulang"} disabled={isLoading}
                               onClick={() => fetchSbm()}/>
                    </div>
                </div>
                <TableSbmTiket baris={tiketTampil}
                               kosong={tiket.length === 0 ? undefined : "Tidak ada rute yang cocok."}/>
            </div>

            <div className="bg-card wide-card-content">
                <div className="wide-card-head">
                    <h2 className="wide-card-title">SBM Tarif Hotel</h2>
                    <div className="wide-card-actions">
                        <span className="anggaran-sinkron">{hotelTampil.length} dari {hotel.length} provinsi</span>
                        <input className="type-btn kkp-cari" type="search" placeholder="Cari provinsi..."
                               value={cariHotel} onChange={event => setCariHotel(event.target.value)}/>
                    </div>
                </div>
                <TableSbmHotel baris={hotelTampil}
                               kosong={hotel.length === 0 ? undefined : "Tidak ada provinsi yang cocok."}/>
            </div>

            {alert && <PopupAlert isAlert={true} severity={alert.severity} message={alert.message}/>}
        </div>
    );
}
