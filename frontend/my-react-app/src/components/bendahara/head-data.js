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
const ringkasColumns = [0, 1, 2, 4];
const ringkasLabels = { 4: "Nilai Tagihan/Gross" };

// The antrian sheets store the Jenis as a label, not the slug the form works in. GUP/PTUP
// store theirs lowercased, so the comparison is case-insensitive on both sides.
const jenisValueFromLabel = (label) => {
    const target = String(label ?? "").trim().toLowerCase();
    return jenisPengajuan.find(jenis => jenis.label.toLowerCase() === target)?.value || null;
};

//For SPM-Bend.jsx
const jenisSPM = ["GUP", "GUP NIHIL", "GUP KKP JKT", "GUP KKP ZOBAR", "GUP KKP ZOTIM", "GUP KKP JALDIS", "TUP", "GTUP NIHIL", "PENGEMBALIAN TUP", "LS JALDIS", "LS HONORARIUM", "UP"];
const statusSPM = ["DANA BELUM MASUK", "DANA DI REK BPP", "SELESAI", "TUP ON GOING"];

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
const placeholderTable = ["No.", "ID Number", "Tanggal", "Satker", "DRPP", "SPM", "Nominal", "Pungut Pajak", "Setor Pajak", "Jenis Tagihan" ]
const cardTitles = ["Belum Pungut", "Sudah Pungut", "Belum Setor", "Sudah Setor", "Total DRPP"]
const pajakStatus = ["", "Belum", "Sudah", "Ada Masalah", "Tidak Ada Pajak", "Pajak Manual"]

//For SPM-Bend.jsx
const satkerNames = [
    {title: "", value: ""},
    {title: "Biro Umum", value: "BIRO UMUM"},
    {title: "Biro Sarana dan Prasarana", value: "SARPRAS"},
    {title: "Biro Perencanaan", value: "PERENCANAAN"},
    {title: "Dit Data dan Informasi", value: "DATIN"},
    {title: "Dit Hukum", value: "HUKUM"},
    {title: "Dit Kebijakan", value: "KEBIJAKAN"},
    {title: "Dit Kerja Sama", value: "KERJASAMA"},
    {title: "Dit Latihan", value: "LATIHAN"},
    {title: "Dit Litbang", value: "LITBANG"},
    {title: "Dit Operasi Laut", value: "OPSLA"},
    {title: "Dit Operasi Udara", value: "OPSUD"},
    {title: "Dit Strategi", value: "STRATEGI"},
    {title: "Inspektorat", value: "INSPEKTORAT"},
    {title: "Puskodal", value: "PUSKODAL"},
    {title: "Unit Penindakan Hukum", value: "UPH"},
    {title: "Zona Maritim Barat", value: "ZONA BARAT"},
    {title: "Zona Maritim Tengah", value: "ZONA TENGAH"},
    {title: "Zona Maritim Timur", value: "ZONA TIMUR"},
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


//For Pembayaran-Bp.jsx - order must match PEMBAYARAN_BP_COLUMNS on the server. The
//dropdown lists are absent on purpose: they come from the route, read off the sheet.
const pembayaranBpHeadData = ["No.", "Tanggal SP2D", "Nomor SPM", "Jenis", "VA", "Unit Kerja",
    "Nilai SP2D", "Kode BNI Direct", "Bukti Bayar", "Status Bayar Penerima",
    "Tanggal Bayar Penerima", "Status Pajak", "Tanggal Trx Pajak", "Bukti Bayar Deposit Pajak"];


export { columns, columns2, jenisPengajuan, jenisTabelPenuh, jenisTanpaTabel, ringkasColumns, ringkasLabels, jenisValueFromLabel, pjkHeadData, pjkHeadDataMulai, pjkInfoHeadData, pjkStatusOptions, pjkKelengkapanOptions, formatNomorSpp, jenisSPM, statusSPM, headData1, headData2, headData3, headData4, headDataPjk, infoHeadData, drppHeadData, placeholderTable, cardTitles, pajakStatus, satkerNames, monthNames, statusPegawaiOptions, dokumenGajiHeadData, rowsPerPageOptions, pembayaranBpHeadData };

