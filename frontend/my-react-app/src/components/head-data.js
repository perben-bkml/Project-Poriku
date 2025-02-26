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
]

//For SPM-Bend.jsx
const jenisSPM = ["GUP", "GUP NIHIL", "GUP KKP JKT", "GUP KKP ZOBAR", "GUP KKP ZOTIM", "GUP KKP JALDIS", "TUP", "GTUP NIHIL", "PENGEMBALIAN TUP", "LS JALDIS", "LS HONORARIUM", "UP"];
const statusSPM = ["DANA BELUM MASUK", "DANA DI REK BPP", "SELESAI", "TUP ON GOING"];

//For Kelola-Pengajuan.jsx
const headData1 = ["No.", "Timestamp", "Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "Status"];
const headData2 = ["No.", "Timestamp", "Nama", "Jenis", "Nominal", "Tanggal Verifikasi", "Tanggal Acc.", "Pajak", "Anggaran", "Unit Kerja", "Status"];
const headData3 = ["No.", "Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "Status"];
const headData4 = ["No.", "Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "DRPP", "SPP", "SPM"];

export { columns, columns2, jenisSPM, statusSPM, headData1, headData2, headData3, headData4 };

