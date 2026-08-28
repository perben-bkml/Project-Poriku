
const satkerNames = [
    {title: "", value: ""},
    {title: "Biro Umum", value: "Biro Umum"},
    {title: "Biro Sarpras", value: "Biro Sarpras"},
    {title: "Biro Perencanaan", value: "Biro Rencana"},
    {title: "Dit Datin", value: "Dit Datin"},
    {title: "Dit Hukum", value: "Dit Hukum"},
    {title: "Dit Kebijakan", value: "Dit Kebijakan"},
    {title: "Dit Kerja Sama", value: "Dit Kerma"},
    {title: "Dit Latihan", value: "Dit Latihan"},
    {title: "Dit Litbang", value: "Dit Litbang"},
    {title: "Dit Opsla", value: "Dit Opsla"},
    {title: "Dit Opsud", value: "Dit Opsud"},
    {title: "Dit Strategi", value: "Dit Strategi"},
    {title: "Inspektorat", value: "Inspektorat"},
    {title: "KPIML", value: "KPIML"},
    {title: "UPH", value: "UPH"},
    {title: "Zona Barat", value: "Zona Barat"},
    {title: "Zona Tengah", value: "Zona Tengah"},
    {title: "Zona Timur", value: "Zona Timur"},
]

const tableHead = [
    "Unit Kerja", "No. SPM", "Tanggal SP2D", "Bulan SP2D", "Jenis SPM", "Nominal", "Jenis Belanja", "Status Verifikasi", "Catatan", "Dokumen Verif"
]

const userSatkerNames = [
    {title: "Master", value: ""},
    {title: "Biro Umum", value: "Biro Umum"},
    {title: "Biro Sarana dan Prasarana", value: "Biro Sarpras"},
    {title: "Biro Perencanaan", value: "Biro Rencana"},
    {title: "Dit Data dan Informasi", value: "Dit Datin"},
    {title: "Dit Hukum", value: "Dit Hukum"},
    {title: "Dit Kebijakan", value: "Dit Kebijakan"},
    {title: "Dit Kerja Sama", value: "Dit Kerma"},
    {title: "Dit Latihan", value: "Dit Latihan"},
    {title: "Dit Litbang", value: "Dit Litbang"},
    {title: "Dit Operasi Laut", value: "Dit Opsla"},
    {title: "Dit Operasi Udara", value: "Dit Opsud"},
    {title: "Dit Strategi", value: "Dit Strategi"},
    {title: "Inspektorat", value: "Inspektorat"},
    {title: "Puskodal", value: "KPIML"},
    {title: "Unit Penindakan Hukum", value: "UPH"},
    {title: "Zona Maritim Barat", value: "Zona Barat"},
    {title: "Zona Maritim Tengah", value: "Zona Tengah"},
    {title: "Zona Maritim Timur", value: "Zona Timur"},
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


// The Excel layout POST /anggaran/unggah expects: one flat row per Akun Belanja with the
// parent columns repeated, which is the shape a DIPA export already has. Twin of
// ANGGARAN_JUDUL in server.js - the upload rejects a file whose first column is not
// "Unit Kerja", so a change here needs the same change there.
const anggaranKolomTemplate = [
    "Unit Kerja", "Pagu Unit Kerja", "Kode MAK", "Uraian MAK", "Pagu MAK",
    "Akun Belanja", "Pagu Akun",
]

// A row may stop at MAK (a ceiling not yet broken down) or at Unit Kerja, so the sample
// shows both rather than only the full depth. Akun Belanja carries no uraian: the code is a
// national standard, so the description would be the same text repeated on every unit kerja.
const anggaranContohBaris = [
    ["Biro Umum", "10000000000", "5735.RBM.002.051.0C", "Pembangunan Fasilitas", "2000000000", "533111", "800000000"],
    ["Biro Umum", "10000000000", "5735.RBM.002.051.0C", "Pembangunan Fasilitas", "2000000000", "532111", "700000000"],
    ["Biro Umum", "10000000000", "5735.RBM.002.052", "Operasional Perkantoran", "1500000000", "", ""],
]


// How an upload folds into the anggaran already stored. Twin of ANGGARAN_MODE in server.js -
// the values are sent verbatim and an unknown one falls back to "perUnit" there.
// "bahaya" marks the modes that can delete rows, so the form can colour the warning.
const anggaranModes = [
    {
        value: "tambahan",
        title: "Perbarui sebagian - hanya baris yang ada di berkas",
        keterangan: "Baris di dalam berkas ditambah atau diperbarui. Tidak ada yang dihapus, " +
            "dan pagu yang dikosongkan tetap seperti sebelumnya. Gunakan ini untuk mengubah " +
            "satu atau beberapa Akun Belanja tanpa menulis ulang seluruh MAK.",
        bahaya: false,
    },
    {
        value: "perUnit",
        title: "Ganti per unit kerja - unit di berkas ditulis ulang",
        keterangan: "Unit kerja yang ada di berkas diganti seluruhnya, jadi MAK atau Akun " +
            "Belanja yang tidak ikut tertulis akan dihapus. Unit kerja lain tidak tersentuh. " +
            "Gunakan ini bila ada baris yang memang harus hilang.",
        bahaya: true,
    },
    {
        value: "seluruh",
        title: "Ganti seluruh anggaran tahun ini",
        keterangan: "Berkas menjadi satu-satunya isi anggaran tahun ini. Unit kerja yang tidak " +
            "ada di dalam berkas akan dihapus. Gunakan hanya untuk mengganti DIPA satu tahun penuh.",
        bahaya: true,
    },
]

export { satkerNames, tableHead, userSatkerNames, monthNames, anggaranKolomTemplate, anggaranContohBaris, anggaranModes }