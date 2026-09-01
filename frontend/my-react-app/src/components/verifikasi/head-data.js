
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
        title: "Perbarui Sebagian",
        keterangan: "Baris di dalam file .xlsx akan menambah/memperbarui database. Tidak ada yang dihapus, " +
            "dan pagu yang dikosongkan tetap seperti sebelumnya. Gunakan ini untuk mengubah " +
            "satu atau beberapa Akun Belanja tanpa menulis ulang seluruh MAK.",
        bahaya: false,
    },
    {
        value: "perUnit",
        title: "Ganti per Unit Kerja",
        keterangan: "Unit kerja yang ada di dalam file .xlsx diganti seluruhnya, MAK atau Akun " +
            "Belanja yang tidak ikut tertulis akan dihapus. Unit kerja lain tidak tersentuh. " +
            "Gunakan ini bila ada baris yang memang harus hilang.",
        bahaya: true,
    },
    {
        value: "seluruh",
        title: "Ganti Seluruh Anggaran",
        keterangan: "Unit kerja yang tidak ada di dalam berkas akan dihapus. Gunakan hanya untuk mengganti DIPA satu tahun penuh.",
        bahaya: true,
    },
]

// Export layout for the Anggaran tree. Wider than anggaranKolomTemplate on purpose: the
// extra columns are what the screen shows, and a file carrying them is a report, not
// something Unggah Anggaran could parse back.
const anggaranKolomEkspor = [
    "Unit Kerja", "Pagu Unit Kerja", "Kode MAK", "Uraian MAK", "Pagu MAK",
    "Akun Belanja", "Pagu Akun", "Terpakai", "Sisa", "Belum Dirinci", "Keterangan",
]

// LS Pegawai and LS Platform are submitted without a tabel, so they carry no Kode MAK and
// their nominal can never be attributed to an akun. Said out loud on the screen rather than
// left for someone to discover by reconciling by hand.
const anggaranTanpaRincian = "Realisasi dihitung berdasarkan MAK pengajuan di Poriku."

// Twin of the SEBAB_* constants in server.js. "akun-belum-dirinci" never reaches these
// panels - it is folded into its MAK - so it is not listed here.
const anggaranSebabLabel = {
    "mak-tidak-ada": "MAK tidak ada di anggaran",
    "unit-tidak-dikenal": "Unit kerja tidak dikenal",
}

const anggaranSebabKeterangan = "Kode MAK ada pada pengajuan tetapi tidak ada di anggaran yang " +
    "berlaku, jadi nominalnya belum mengurangi pagu mana pun. Perbaiki kode MAK pada pengajuan, atau tambahkan " +
    "MAK tersebut lewat unggah anggaran."

const anggaranKlaimKeterangan = "Pengajuan berikut memakai Kode MAK yang terdaftar di unit kerja lain, bukan " +
    "milik unit kerja yang mengajukan. Nominalnya tidak mengurangi pagu siapa pun sampai kode MAK diperbaiki " +
    "atau MAK tersebut memang dialokasikan ke unit kerja ini lewat revisi anggaran."

const anggaranAwalKeterangan = "Upload pada bagian ini akan mencatat manual realisasi anggaran. Format excel yang digunakan sama dengan bagian Unggah Anggaran."

// How a Kode MAK cell is marked on Aksi-Pengajuan and Aksi-Verif-PJK. Keys are the SEBAB_*
// values server.js returns as tandaMak.
const anggaranTandaMak = {
    "cocok":              {label: "MAK sesuai", bg: "#D6F5E1", fg: "#0F7A3D"},
    "klaim-unit-lain":    {label: "MAK unit lain", bg: "#FBE1DE", fg: "#BD1404"},
    "mak-tidak-ada":      {label: "MAK tidak terdaftar", bg: "#FBE1DE", fg: "#BD1404"},
    "akun-belum-dirinci": {label: "Akun belum dirinci", bg: "#FFF1CF", fg: "#8A6100"},
}

const tandaMakPesan = (tanda) => {
    if (!tanda) return "";
    if (tanda.sebab === "cocok") return "Kode MAK dan Akun Belanja cocok dengan anggaran yang berlaku.";
    if (tanda.sebab === "klaim-unit-lain") {
        return `Kode MAK ini terdaftar di ${tanda.pemilik.join(", ")}, bukan unit kerja yang mengajukan.`;
    }
    if (tanda.sebab === "mak-tidak-ada") return "Kode MAK ini tidak ada di anggaran yang berlaku.";
    return "Akun Belanja ini belum dirinci di DIPA untuk MAK tersebut.";
}

export { satkerNames, tableHead, userSatkerNames, monthNames, anggaranKolomTemplate, anggaranContohBaris, anggaranModes, anggaranTanpaRincian, anggaranSebabLabel, anggaranSebabKeterangan, anggaranKlaimKeterangan, anggaranAwalKeterangan, anggaranTandaMak, tandaMakPesan, anggaranKolomEkspor }