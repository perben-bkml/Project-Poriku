// Pilot switches. There is no staging server, so a few finished features are held back
// on the live one and exercised by the pilot accounts only. None of the logic behind them
// is removed - each flag is a temporary hold, and setting it to false hands the feature
// back to everyone exactly as it behaved before.
//
// hideMenungguPjkSection has a twin on the backend (PILOT_SKIP_MENUNGGU_PJK in
// server.js). Flip the two together: the backend one decides whether rows are parked on
// the PJK at all, this one only hides the card that would otherwise sit at zero forever.
// PILOT_SATKER is duplicated there too - a name added here has to be added there as well.

// The satker taking part in the pilot, matched on user.name. Comparison is case and
// whitespace insensitive so a stray double space in poriku_users cannot drop an account
// out of the pilot. Kept in sync with PILOT_SATKER in server.js.
export const PILOT_SATKER = ["Biro Umum", "Biro Umum TU Rumga", "Biro Sarana dan Prasarana", "Dit Operasi Laut", "Zona Maritim Barat", "Zona Maritim Tengah", "Zona Maritim Timur", "Dit Data dan Informasi"];

const satkerKey = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const isPilotSatker = (name) => PILOT_SATKER.some(satker => satkerKey(satker) === satkerKey(name));

// The accounts every hold below is lifted for: the pilot satker, plus "master admin",
// which has passed every hold since the pilot started.
export const isPilotUser = (user) => user?.role === "master admin" || isPilotSatker(user?.name);

export const PILOT = {
    // Buat-Pengajuan: only the pilot accounts may pick a Jenis Pengajuan outside GUP/PTUP
    jenisPengajuanPilotOnly: true,
    // Kelola-Pengajuan: hide the "Menunggu Diuji Verifikator PJK" card and table. The
    // backend now parks only pilot satker rows there, so the card has rows to show for as
    // long as the pilot has participants - it is dead weight only once the list is empty.
    hideMenungguPjkSection: PILOT_SATKER.length === 0,
    // Home: hide the right hand dashboard from role="user", pilot accounts excepted
    hideHomeDashboardFromUser: true,
};

// The jenis everyone may still submit while jenisPengajuanPilotOnly is on.
// Kept in sync with PILOT_JENIS_ALLOWED in server.js.
export const PILOT_JENIS_ALLOWED = ["gup", "ptup"];
