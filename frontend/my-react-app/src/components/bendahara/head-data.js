const columns = [ 
    { id:"num", label: "No.", minWidth: 5 },
    { id:"kegiatan", label: "Nama Kegiatan", minWidth: 160 },
    { id:"mak", label: "Kode MAK", minWidth: 120 },
    { id:"spby", label: "Nomor SPBY", minWidth: 120 },
    { id:"tagihan", label: "Nilai Tagihan", minWidth: 90 },
    { id:"dpp", label: "DPP", minWidth: 80 },
    { id:"dpplain", label: "DPP Nilai Lain", minWidth: 80 },
    { id:"ppn", label: "PPN", minWidth: 65 },
    { id:"bpt ppn", label: "Nomor Faktur PPN", minWidth: 85 },
    { id:"pph21", label: "PPh 21", minWidth: 65 },
    { id:"bpt-pph21", label: "Nomor Bupot PPh 21", minWidth: 87 },
    { id:"pph22", label: "PPh 22", minWidth: 65 },
    { id:"bpt-pph22", label: "Nomor Bupot PPh 22", minWidth: 87 },
    { id:"pph23", label: "PPh 23", minWidth: 65 },
    { id:"bpt-pph23", label: "Nomor Bupot PPh 23", minWidth: 87 },
    { id:"pphf", label: "PPh Final", minWidth: 65 },
    { id:"bpt-pphf", label: "Nomor Bupot PPh Final", minWidth: 87 },
    { id:"terima", label: "Nilai Terima", minWidth: 90 },
    { id:"penerima", label: "Penerima", minWidth: 80 },
    { id:"bank", label: "Bank", minWidth: 50 },
    { id:"rek", label: "Rekening", minWidth: 80 },
    { id:"npwp", label: "NPWP", minWidth: 80 },
];

const columns2 = [ 
    { id:"num", label: "No.", minWidth: 5 },
    { id:"getdate", label: "Tanggal diajukan", minWidth: 40 },
    { id:"nama", label: "Nama", minWidth: 40 },
    { id:"jenis", label: "Jenis", minWidth: 40 },
    { id:"nominal", label: "Nominal", minWidth: 60 },
    { id:"reqdate", label: "Request Tanggal", minWidth: 40 },
    { id:"accdate", label: "Tanggal Disetujui", minWidth: 40 },
    { id:"stat", label: "Status", minWidth: 40 },
    { id:"drpp", label: "No. DRPP", minWidth: 40 },
    { id:"spp", label: "No. SPP", minWidth: 40 },
    { id:"spm", label: "No. SPM", minWidth: 40 },
    { id:"ukerja", label: "Unit Kerja", minWidth: 40 },
    { id:"pajak", label: "Pajak", minWidth: 40 },
    { id:"anggaran", label: "Anggaran", minWidth: 40 },
    { id:"tgl-mulai", label: "Tgl. Mulai Verif", minWidth: 40 },
    { id:"tgl-selesai", label: "Tgl. Selesai Verif", minWidth: 40 },
]

//For Buat-Pengajuan.jsx - sorted alphabetically by label
const jenisPengajuan = [
    { value: "gup", label: "GUP" },
    { value: "gup-kkp", label: "GUP KKP" },
    { value: "ls-bendahara", label: "LS Bendahara" },
    { value: "ls-kontraktual", label: "LS Kontraktual" },
    { value: "ls-pegawai", label: "LS Pegawai" },
    { value: "ls-platform", label: "LS Platform Pembayaran Pemerintah" },
    { value: "ptup", label: "PTUP" },
];

// GUP/PTUP keep the full table and the Request Tanggal input. Everything else is
// a verifikasi flow: a one row table cropped from the full one, or no table at all.
const jenisTabelPenuh = ["gup", "ptup"];
const jenisTanpaTabel = ["ls-pegawai", "ls-platform"];

// Jenis the verifikator may push on to SPM. Twin of majuSpm in JENIS_PENGAJUAN.
const jenisMajuSpm = new Set(["gup-kkp", "ls-bendahara", "ls-kontraktual", "ls-pegawai", "ls-platform"]);
const ringkasColumns = [0, 1, 2, 4];
const ringkasLabels = { 4: "Nilai Tagihan/Gross" };

// The antrian sheets store the Jenis as a label, not the slug the form works in. GUP/PTUP
// store theirs lowercased, so the comparison is case-insensitive on both sides.
const jenisValueFromLabel = (label) => {
    const target = String(label ?? "").trim().toLowerCase();
    return jenisPengajuan.find(jenis => jenis.label.toLowerCase() === target)?.value || null;
};

//For Kelola-Pengajuan.jsx
const headData1 = ["No.", "Timestamp", "Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "Status"];
const headData2 = ["No.", "Timestamp", "Nama", "Jenis", "Nominal", "Tanggal Verifikasi", "Tanggal Acc.", "Pajak", "Anggaran", "Unit Kerja", "Status"];
const headData3 = ["No.", "Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "Status"];
const headData4 = ["No.", "Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "DRPP", "SPP", "SPM"];
// headData2 plus the PJK verdicts after Anggaran, minus the trailing Status
const headDataPjk = [...headData2.slice(0, 9), "Substansi", "Kelengkapan", ...headData2.slice(9, -1)];

//For Aksi-Pengajuan.jsx
const infoHeadData = ["No. Antri", "Nama", "Jenis", "Tgl. Antri", "Status", "Satker", "Nominal", "Tgl. Request"]

//For Pengujian-PJK.jsx & Aksi-Verif-PJK.jsx
// ID GUP is the 'Write Antrian' id a GUP/PTUP mirror row came from, blank for every other jenis
const pjkHeadData = ["No.", "ID GUP", "Timestamp", "Nomor SPP", "Nama", "Jenis", "Nominal", "Unit Kerja", "Substansi", "Kelengkapan"];
const pjkHeadDataMulai = [...pjkHeadData, "Tgl. Mulai Verifikasi"];
const pjkInfoHeadData = ["No. Antri", "ID GUP", "Nomor SPP", "Nama", "Jenis", "Tgl. Antri", "Satker", "Nominal"];

// Mirrors the backend: 5 digit zero padding, non-numeric values left as they are.
// Rows written before the padding existed still display padded.
const formatNomorSpp = (value) => {
    const text = String(value ?? "").trim();
    return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
};
const pjkStatusOptions = [
    {label: "Belum", color: "white", textcolor: "#00204A"},
    {label: "OK", color: "#9FFFC3", textcolor: "#0F9043"},
    {label: "OK Catatan", color: "#FFE39F", textcolor: "#8A6100"},
    {label: "Ditolak", color: "#EB2727", textcolor: "#EEC6C6"},
];
const pjkKelengkapanOptions = [
    {...pjkStatusOptions[0], label: "Belum Verif"},
    ...pjkStatusOptions.slice(1),
];

//For Aksi-Drpp.jsx
const drppHeadData = ["No.", "Tanggal", "Satker", "DRPP", "SPM", "Nominal", "Pungut Pajak", "Setor Pajak", "Jenis Tagihan"]

//For Monitoring-Drpp.jsx
const placeholderTable = ["No.", "ID Number", "Tanggal", "Satker", "DRPP", "SPM", "Nominal", "Bukti Setor", "Pungut Pajak", "Setor Pajak", "Jenis Tagihan" ]

const spmKey = (value) => String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
const buktiSetorLabel = (entry) =>
    entry?.ada ? "Sudah Diunggah" : entry?.tidakPerlu ? "Tidak Perlu" : "Belum Diunggah";
const cardTitles = ["Belum Pungut", "Sudah Pungut", "Belum Setor", "Sudah Setor", "Total DRPP"]
const pajakStatus = ["", "Belum", "Sudah", "Ada Masalah", "Tidak Ada Pajak", "Pajak Manual"]

//Status values on 'Write Antrian Verif' column F, which the sheet owns. Twin of
//STATUS_SUDAH_VERIFIKASI / STATUS_SUDAH_MAJU in server.js.
const statusSudahVerifikasi = [
    "Sudah Di Verifikasi", "Sudah Verifikasi", "Verifikasi OK", "Verifikasi OK Dengan Catatan",
];
const statusSudahMaju = ["Sudah Diajukan ke KPPN", "Sudah SP2D"];
const OK_CATATAN = "OK Catatan";

//Status pill colours, shared by the daftar table and the pengajuan detail view
// Ordered as the row travels: neutral, blue, amber while in progress, then olive for
// passed-with-notes, green for passed, teal and purple through DRPP/KPPN, and a solid
// fill at SP2D - the only filled pill, because it is the one terminal state.
const DAFTAR_STATUS_STYLE = {
    "dalam antrian":                { bg: "#E7ECF4", fg: "#41506B" },
    "diajukan hari ini":            { bg: "#DCE9FF", fg: "#00449C" },
    "sedang di verifikasi":         { bg: "#FFF1CF", fg: "#8A6100" },
    "verifikasi ok dengan catatan": { bg: "#E9F2C6", fg: "#55700D" },
    "sudah di verifikasi":          { bg: "#D6F5E1", fg: "#0F7A3D" },
    "sudah verifikasi":             { bg: "#D6F5E1", fg: "#0F7A3D" },
    "verifikasi ok":                { bg: "#D6F5E1", fg: "#0F7A3D" },
    "sudah diterbitkan drpp":       { bg: "#D5EEF6", fg: "#0B6478" },
    "sudah diajukan ke kppn":       { bg: "#E5DEFA", fg: "#4B32A8" },
    "sudah sp2d":                   { bg: "#0F7A3D", fg: "#FFFFFF" },
};
const DAFTAR_STATUS_MASALAH = { bg: "#FBE1DE", fg: "#BD1404" };
const DAFTAR_STATUS_FALLBACK = { bg: "#E7ECF4", fg: "#5A6472" };

function daftarStatusStyle(status) {
    const key = String(status ?? "").trim().toLowerCase();
    if (key.includes("masalah")) return DAFTAR_STATUS_MASALAH;
    return DAFTAR_STATUS_STYLE[key] || DAFTAR_STATUS_FALLBACK;
}

//Values are the keys JENIS_PAJAK_KOLOM in server.js resolves to a 'Write Table' column
const jenisPajakOptions = [
    { value: "", label: "" },
    { value: "ppn", label: "PPN" },
    { value: "pph-21", label: "PPh 21" },
    { value: "pph-22", label: "PPh 22" },
    { value: "pph-23", label: "PPh 23" },
    { value: "pph-final", label: "PPh Final" },
]

const monthNames = [
    {title: "", value: ""},
    {title: "Januari", value: "01"},
    {title: "Februari", value: "02"},
    {title: "Maret", value: "03"},
    {title: "April", value: "04"},
    {title: "Mei", value: "05"},
    {title: "Juni", value: "06"},
    {title: "Juli", value: "07"},
    {title: "Agustus", value: "08"},
    {title: "September", value: "09"},
    {title: "Oktober", value: "10"},
    {title: "November", value: "11"},
    {title: "Desember", value: "12"},
]


//For Kirim-Dokumen-Gaji.jsx & Monitor-Perubahan-Gaji.jsx
const statusPegawaiOptions = ["PNS", "PPPK", "TNI/POLRI"];
const dokumenGajiHeadData = ["No.", "Tanggal Terima", "Tanggal Surat", "Nomor Surat", "Nama Tercantum", "Status Pegawai", "Keterangan Surat", "Berkas"];
const rowsPerPageOptions = [10, 15, 20, 25];

//For Cek-Sisa-Gup.jsx. Thresholds are absolute rupiah, not a share of the daily limit -
//changing the limit does not move them.
const formatRupiah = (nominal) => `Rp ${Math.round(nominal).toLocaleString('id-ID')}`;
// "2026-08-20" -> "20 Agustus 2026". Sliced rather than parsed as a Date, which would
// render the ISO string in the browser's zone and shift the day west of Greenwich.
const formatTanggalPanjang = (iso) => {
    const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return cocok ? `${Number(cocok[3])} ${monthNames[Number(cocok[2])].title} ${cocok[1]}` : (iso || "");
};
const sisaGupBands = [
    { min: 250000000, className: "gup-band-hijau", label: "\u2265 250 juta" },
    { min: 200000000, className: "gup-band-kuning", label: "\u2265 200 juta" },
    { min: 150000000, className: "gup-band-jingga", label: "\u2265 150 juta" },
    { min: -Infinity, className: "gup-band-merah", label: "< 150 juta" },
];
const hariKerja = ["Sen", "Sel", "Rab", "Kam", "Jum"];
const sisaGupHeadData = ["Unit Kerja", "Nominal", "Status"];

//For Monitoring-Drpp.jsx -> Aksi-Drpp.jsx. The Cari boxes match against 'Write Table', so
//the DRPP row cannot show why it came back; these mark the cell that actually matched.
//Twin of WRITE_TABLE_CARI in server.js plus the spby/bupot .includes() rules in the same
//route: they must agree, or a row the server returned shows nothing highlighted.
//Indices are offsets from column A, the layout `columns` above writes and data-transaksi
//pads every row out to.
const cariSorotKolom = {
    uraian: { columns: [1], mode: "teks" },                             // B, Nama Kegiatan
    nominal: { columns: [4], mode: "angka" },                           // E, Nilai Tagihan
    penerima: { columns: [18], mode: "teks" },                          // S, Penerima
    spby: { columns: [3], mode: "persis" },                             // D, Nomor SPBY
    bupot: { columns: [8, 9, 10, 11, 12, 13, 14, 15, 16], mode: "persis" }, // I:Q
};

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");

// Display only: the Cari Nominal box shows "100.000" while every match still runs on
// digitsOnly, so what the user types and what the server compares cannot diverge.
const formatRibuan = (value) => digitsOnly(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// null when the cell does not match, else [sebelum, cocok, sesudah] to render. "angka"
// marks the whole cell: the search reads a formatted "5.000.000" while data-transaksi
// reads UNFORMATTED_VALUE and returns 5000000, so the typed text is never literally there.
function sorotPotongan(cell, term, mode) {
    const teks = String(cell ?? "");
    const cari = String(term ?? "");
    if (cari === "") return null;
    if (mode === "angka") {
        const angka = digitsOnly(cari);
        return angka && digitsOnly(teks) === angka ? ["", teks, ""] : null;
    }
    const posisi = mode === "persis"
        ? teks.indexOf(cari)
        : teks.toLowerCase().indexOf(cari.toLowerCase());
    return posisi < 0 ? null
        : [teks.slice(0, posisi), teks.slice(posisi, posisi + cari.length), teks.slice(posisi + cari.length)];
}


//For Pembayaran-Bp.jsx - order must match PEMBAYARAN_BP_COLUMNS on the server. The
//dropdown lists are absent on purpose: they come from the route, read off the sheet.
const pembayaranBpHeadData = ["No.", "Tanggal SP2D", "Nomor SPM", "Jenis", "VA", "Unit Kerja",
    "Nilai SP2D", "Kode BNI Direct", "Bukti Bayar", "Status Bayar Penerima",
    "Tanggal Bayar Penerima", "Keterangan", "Status Pajak", "Tanggal Trx Pajak",
    "Bukti Bayar Deposit Pajak"];


export { columns, columns2, jenisPengajuan, jenisTabelPenuh, jenisTanpaTabel, jenisMajuSpm, ringkasColumns, ringkasLabels, jenisValueFromLabel, pjkHeadData, pjkHeadDataMulai, pjkInfoHeadData, pjkStatusOptions, pjkKelengkapanOptions, formatNomorSpp, headData1, headData2, headData3, headData4, headDataPjk, infoHeadData, drppHeadData, placeholderTable, spmKey, buktiSetorLabel, cardTitles, pajakStatus, monthNames, statusPegawaiOptions, dokumenGajiHeadData, rowsPerPageOptions, pembayaranBpHeadData, formatRupiah, formatTanggalPanjang, sisaGupBands, hariKerja, sisaGupHeadData, cariSorotKolom, sorotPotongan, formatRibuan, jenisPajakOptions, daftarStatusStyle, statusSudahVerifikasi, statusSudahMaju, OK_CATATAN };

