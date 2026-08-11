// Pilot switches. There is no staging server, so a few finished features are held back
// on the live one and exercised by the pilot roles only. None of the logic behind them
// is removed - each flag is a temporary hold, and setting it to false hands the feature
// back to everyone exactly as it behaved before.
//
// hideMenungguPjkSection has a twin on the backend (PILOT_SKIP_MENUNGGU_PJK in
// server.js). Flip the two together: the backend one decides whether rows are parked on
// the PJK at all, this one only hides the card that would otherwise sit at zero forever.

export const PILOT = {
    // Buat-Pengajuan: only "master admin" may pick a Jenis Pengajuan outside GUP/PTUP
    jenisPengajuanMasterAdminOnly: true,
    // Kelola-Pengajuan: hide the "Menunggu Diuji Verifikator PJK" card and table
    hideMenungguPjkSection: true,
    // Home: hide the right hand dashboard from role="user"
    hideHomeDashboardFromUser: true,
};

// The jenis everyone may still submit while jenisPengajuanMasterAdminOnly is on.
// Kept in sync with PILOT_JENIS_ALLOWED in server.js.
export const PILOT_JENIS_ALLOWED = ["gup", "ptup"];
