import {useContext, useEffect, useMemo, useRef, useState} from 'react';
import apiClient from "../../lib/apiClient";
import {AuthContext} from "../../lib/AuthContext";
// Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {sbmKolomTiket, sbmKolomHotel, sbmContohTiket, sbmContohHotel, sbmKelasPesawat,
    sbmGolonganHotel, sbmUnggahKeterangan, kalkulatorKeterangan, kkpStatusBelum, kkpStatusSudah,
    kkpWarnaUnit, formatRupiah} from "./head-data.js";
import {unduhExcelBanyakSheet, selTeks} from "../../lib/excel.js";
import KkpTransaksiForm from "./Kkp-Transaksi-Form.jsx";
// Import Tables
import {TableSbmTiket, TableSbmHotel, TableKalkulatorRincian, TableTransaksiKkp} from "../../ui/tables.jsx";

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

const KATEGORI_KEY = 'kelola-kkp-kategori';
const KKP_KATEGORI = [
    {kunci: "sbm", label: "Standar Biaya Masukan"},
    {kunci: "kkp", label: "Kartu Kredit Pemerintah"},
];

// Blank while the row is incomplete rather than zero: a zero subtotal reads as "this leg is
// free", which is a different claim from "this leg is not filled in yet".
const bulat = (nilai) => {
    const angka = parseInt(nilai, 10);
    return Number.isInteger(angka) && angka > 0 ? angka : null;
};

export default function KelolaKkp() {
    // A user reaches this screen as "Kalkulator SBM Jaldis": the kalkulator and the SBM
    // reference only. Everything else here writes, and GET /kkp/transaksi is admin only,
    // so it must not even be asked for.
    const {user} = useContext(AuthContext);
    const hanyaKalkulator = user?.role === "user";

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

    // The upload is a once-a-year job while the kalkulator below is the daily one, so the
    // panel starts folded away and opens itself only when there is no SBM to calculate with.
    const [bukaUnggah, setBukaUnggah] = useState(false);

    // A remembered category can be a key from an earlier layout, so an unknown one falls
    // back to the first rather than showing neither panel
    const [kategori, setKategori] = useState(() => {
        const disimpan = localStorage.getItem(KATEGORI_KEY);
        return KKP_KATEGORI.some(item => item.kunci === disimpan) ? disimpan : KKP_KATEGORI[0].kunci;
    });

    // The transaksi register. Kept apart from `data` so a reload of one never blanks the
    // other - the two come from different sources, Postgres and the Pembayaran BP sheet.
    const [transaksi, setTransaksi] = useState(null);
    const [isTransaksi, setIsTransaksi] = useState(false);
    const [tabTransaksi, setTabTransaksi] = useState("belum");
    const [ubahBaris, setUbahBaris] = useState(null);

    // Which reference table the one card shows. Both filters are kept so switching back
    // returns to the search the admin had typed there.
    const [tabRef, setTabRef] = useState("tiket");
    const [cariTiket, setCariTiket] = useState("");
    const [cariHotel, setCariHotel] = useState("");

    function pilihKategori(kunci) {
        setKategori(kunci);
        localStorage.setItem(KATEGORI_KEY, kunci);
    }

    function showAlert(severity, message) {
        setAlert({severity, message});
        setTimeout(() => setAlert(null), 5000);
    }

    async function fetchSbm(quiet = false) {
        try {
            if (!quiet) setIsLoading(true);
            const response = await apiClient.get('/kkp/sbm');
            setData(response.data);
            // Nothing to calculate against yet: the upload is the only thing left to do here
            if (!response.data?.unggahan && !hanyaKalkulator) setBukaUnggah(true);
        } catch (error) {
            console.log("Failed fetching SBM.", error);
            showAlert("error", error?.response?.data?.message || "Gagal memuat data SBM.");
            setData(null);
        } finally {
            if (!quiet) setIsLoading(false);
        }
    }

    async function fetchTransaksi() {
        try {
            setIsTransaksi(true);
            const response = await apiClient.get('/kkp/transaksi');
            setTransaksi(response.data);
        } catch (error) {
            console.log("Failed fetching transaksi KKP.", error);
            showAlert("error", error?.response?.data?.message || "Gagal memuat transaksi KKP.");
        } finally {
            setIsTransaksi(false);
        }
    }

    useEffect(() => {
        fetchSbm();
        if (!hanyaKalkulator) fetchTransaksi();
    }, []);

    // The whole group takes one number, so this is asked for once per Kode rather than
    // typed on every row
    async function beriNomorSpm(item) {
        const jawab = window.prompt(`Nomor SPM untuk Kode ${item.kode}:`, item.nomorSpm || "");
        if (jawab === null) return;
        try {
            const response = await apiClient.post('/kkp/transaksi/spm', {kode: item.kode, nomorSpm: jawab});
            showAlert("success", response.data.message);
            await fetchTransaksi();
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menyimpan Nomor SPM.");
        }
    }

    async function hapusTransaksi(row) {
        if (!window.confirm(`Hapus transaksi No. ${row.no} atas nama ${row.namaPejalan}?`)) return;
        try {
            const response = await apiClient.delete('/kkp/transaksi',
                {params: {rowNumber: row.rowNumber, expectedNo: row.no}});
            showAlert("success", response.data.message);
            if (ubahBaris?.rowNumber === row.rowNumber) setUbahBaris(null);
            await fetchTransaksi();
        } catch (error) {
            showAlert("error", error?.response?.data?.message || "Gagal menghapus transaksi.");
        }
    }

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

    // The two reference tables share one card and one search box, so everything that differs
    // between them is declared here and the card renders whichever tab is active.
    const daftarRef = [
        {
            kunci: "tiket", label: "Tiket Pesawat", satuan: "rute", semua: tiket.length,
            tampil: tiketTampil.length, cari: cariTiket, ubahCari: setCariTiket,
            petunjuk: "Cari kota...",
            tabel: <TableSbmTiket baris={tiketTampil}
                                  kosong={tiket.length === 0 ? undefined : "Tidak ada rute yang cocok."}/>,
        },
        {
            kunci: "hotel", label: "Tarif Hotel", satuan: "provinsi", semua: hotel.length,
            tampil: hotelTampil.length, cari: cariHotel, ubahCari: setCariHotel,
            petunjuk: "Cari provinsi...",
            tabel: <TableSbmHotel baris={hotelTampil}
                                  kosong={hotel.length === 0 ? undefined : "Tidak ada provinsi yang cocok."}/>,
        },
    ];
    const refAktif = daftarRef.find(item => item.kunci === tabRef) || daftarRef[0];

    // Two categories over the same groups, the way the reference card splits its two tables
    const semuaGrup = transaksi?.grup || [];
    const daftarTransaksi = [
        {kunci: "belum", label: kkpStatusBelum, grup: semuaGrup.filter(item => !item.lunas)},
        {kunci: "sudah", label: kkpStatusSudah, grup: semuaGrup.filter(item => item.lunas)},
    ];
    const transaksiAktif = daftarTransaksi.find(item => item.kunci === tabTransaksi) || daftarTransaksi[0];

    // With one category there is nothing to switch between, so the strip is not drawn and
    // the panel is pinned open rather than left depending on a remembered key
    const kategoriAktif = hanyaKalkulator ? "sbm" : kategori;

    // Colour is keyed to the unit's place in the sorted list the API returns, so it holds
    // still across reloads; a group naming a unit no longer on the list falls back to grey.
    const warnaUnit = useMemo(() => {
        const urutan = new Map((transaksi?.unitKerja || []).map((item, index) => [item.nama, index]));
        return (nama) => kkpWarnaUnit(urutan.has(nama) ? urutan.get(nama) : -1);
    }, [transaksi]);
    const totalTransaksi = transaksiAktif.grup.reduce((sum, item) => sum + item.total, 0);

    if (isLoading && !data) return <LoadingAnimate/>;

    const unggahan = data?.unggahan;
    const labelSumber = unggahan
        ? `${unggahan.namaBerkas || "tanpa nama berkas"} - diterapkan ${new Date(unggahan.aktifPada).toLocaleString("id-ID", {dateStyle: "short", timeStyle: "short"})} oleh ${unggahan.dibuatOleh || "-"}`
        : "Belum ada data SBM untuk tahun ini";

    return (
        <div>
            {/* Two categories rather than one column of six cards. Both panels stay
                mounted and are hidden with the attribute instead of being unmounted: the
                kalkulator rows, the pending upload draft and the half typed transaksi form
                all live in component state, and switching category must not throw them away. */}
            {!hanyaKalkulator &&
            <div className="kelola-tabs" role="tablist">
                {KKP_KATEGORI.map(item => {
                    const aktif = item.kunci === kategori;
                    return (
                        <button key={item.kunci} type="button" role="tab" aria-selected={aktif}
                                onClick={() => pilihKategori(item.kunci)}
                                className={`kelola-tab${aktif ? " kelola-tab-active" : ""}`}>
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>}
            <br/>

            <div className="kkp-panel" hidden={kategoriAktif !== "sbm"}>
                {/* Maintaining the reference is admin work; a user only prices against it */}
                {!hanyaKalkulator &&
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Unggah Standar Biaya Masukan {data?.tahun || ""}</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">{labelSumber}</span>
                            {bukaUnggah &&
                                <input className="btn-aksi btn-aksi-wide" type="button" value="Unduh Template"
                                       onClick={unduhTemplate}/>}
                            <input className="btn-aksi btn-aksi-wide" type="button" aria-expanded={bukaUnggah}
                                   value={bukaUnggah ? "Tutup" : "Unggah Berkas"}
                                   onClick={() => setBukaUnggah(open => !open)}/>
                        </div>
                    </div>

                    {/* Native submit so the browser runs the `required` check on the file input,
                        the same reason Anggaran avoids SubmitButton here */}
                    {bukaUnggah && <>
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
                    </>}
                </div>}

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
                                <input className="btn-aksi btn-aksi-wide" type="button" value="+ Tambah Baris"
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
                                <input className="btn-aksi btn-aksi-wide" type="button" value="+ Tambah Baris"
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
                    <br/><br/>
                </div>

                {/* One card for both reference tables: they are read one at a time and stacking
                    them pushed the second below a list hundreds of rutes long. */}
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Data SBM {data?.tahun || ""}</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">
                                {refAktif.tampil} dari {refAktif.semua} {refAktif.satuan}
                            </span>
                            <input className="type-btn kkp-cari" type="search" placeholder={refAktif.petunjuk}
                                   value={refAktif.cari} onChange={event => refAktif.ubahCari(event.target.value)}/>
                            <input className="btn-aksi btn-aksi-wide" type="button"
                                   value={isLoading ? "Memuat..." : "Muat Ulang"} disabled={isLoading}
                                   onClick={() => fetchSbm()}/>
                        </div>
                    </div>
                    <div className="kkp-tabs" role="tablist">
                        {daftarRef.map(item => {
                            const aktif = item.kunci === refAktif.kunci;
                            return (
                                <button key={item.kunci} type="button" role="tab" aria-selected={aktif}
                                        onClick={() => setTabRef(item.kunci)}
                                        className={`kelola-tab${aktif ? " kelola-tab-active" : ""}`}>
                                    <span>{item.label}</span>
                                    <span className="kelola-tab-count">{item.semua}</span>
                                </button>
                            );
                        })}
                    </div>
                    {refAktif.tabel}
                    <br/> <br/>
                </div>
            </div>

            {!hanyaKalkulator &&
            <div className="kkp-panel" hidden={kategoriAktif !== "kkp"}>
                {/* The register. Grouped by Kode because a Kode is one SPM: that is the unit an
                    admin gives a number to and the unit the payment sheet settles. */}
                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">Transaksi KKP {transaksi?.tahun || ""}</h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">
                                {transaksiAktif.grup.length} kode - {formatRupiah(totalTransaksi)}
                            </span>
                            <input className="btn-aksi btn-aksi-wide" type="button"
                                   value={isTransaksi ? "Memuat..." : "Muat Ulang"} disabled={isTransaksi}
                                   onClick={fetchTransaksi}/>
                        </div>
                    </div>
                    <div className="kkp-tabs" role="tablist">
                        {daftarTransaksi.map(item => {
                            const aktif = item.kunci === transaksiAktif.kunci;
                            return (
                                <button key={item.kunci} type="button" role="tab" aria-selected={aktif}
                                        onClick={() => setTabTransaksi(item.kunci)}
                                        className={`kelola-tab${aktif ? " kelola-tab-active" : ""}`}>
                                    <span>{item.label}</span>
                                    <span className="kelola-tab-count">{item.grup.length}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* The register is read straight from the sheet, so a refresh is a round
                        trip worth showing rather than a table that silently goes stale */}
                    {isTransaksi
                        ? <LoadingAnimate/>
                        : <TableTransaksiKkp grup={transaksiAktif.grup} warna={warnaUnit} onSpm={beriNomorSpm}
                                             onUbah={setUbahBaris} onHapus={hapusTransaksi}
                                             kosong={`Belum ada transaksi berstatus ${transaksiAktif.label}.`}/>}
                    <br/><br/>
                </div>

                <div className="bg-card wide-card-content">
                    <div className="wide-card-head">
                        <h2 className="wide-card-title">
                            {ubahBaris ? `Ubah Transaksi No. ${ubahBaris.no}` : "Input Transaksi KKP"}
                        </h2>
                        <div className="wide-card-actions">
                            <span className="anggaran-sinkron">
                                {ubahBaris ? `Kode ${ubahBaris.kode}` : "Status awal: Belum Terbayarkan"}
                            </span>
                        </div>
                    </div>
                    {/* Keyed so switching between adding and editing remounts the form: its
                        fields are internal state and would otherwise keep the previous row */}
                    <KkpTransaksiForm key={ubahBaris ? `ubah-${ubahBaris.rowNumber}` : "baru"}
                                      data={transaksi} record={ubahBaris}
                                      onSelesai={fetchTransaksi} onBatal={() => setUbahBaris(null)}/>
                    <br/>
                </div>
            </div>}

            {alert && <PopupAlert isAlert={true} severity={alert.severity} message={alert.message}/>}
        </div>
    );
}
