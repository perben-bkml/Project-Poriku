import express from "express";
import cors from "cors";
import { google } from "googleapis";
import axios from "axios";
import postgres from "postgres";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import session from "express-session";
import 'dotenv/config'
import dateFormat from "dateformat";
import multer from 'multer';
import stream from 'stream';


// Initialize tools
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const getFormattedDate = () => {
    const date = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
    // Get date in yyyy-mm-dd
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const prevMonth = String(date.getMonth()).padStart(2, '0'); // Prev Month
    const day = String(date.getDate()).padStart(2, '0');
    const fullDateFormat = `${year}-${month}-${day}`;
    // Get time in hh:mm:ss
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const fullDateTimeFormat = `${fullDateFormat} ${hours}:${minutes}:${seconds}`;
    // Date in yyyy-mm
    const MonthDateFormat = `${year}-${month}`;
    // Previous Month
    const PrevMonthDate =  `${year}-${prevMonth}`;
    // Timestamp for Verifikasi
    const fullDateTimeVerifFormat = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
    return {
        fullDateFormat,
    fullDateTimeFormat,
        fullDateTimeVerifFormat,
        MonthDateFormat,
        PrevMonthDate,
    }
}

//Exponential Backoff for GSheet API Limits
async function withBackoff(apiCallFn, options = {}) {
  const {
    maxRetries = 5,               // Maximum number of retry attempts
    initialDelayMs = 1000,        // Start with a 1 second delay
    maxDelayMs = 30000,           // Maximum delay between retries (30 seconds)
    factor = 2                    // Exponential factor (delay doubles each retry)
  } = options;

  let retries = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await apiCallFn();
    } catch (error) {
      // Check if error is due to rate limiting (Google's quota exceeded)
      const isRateLimitError = 
        error.code === 429 || 
        (error.response && error.response.status === 429) ||
        (error.message && (
          error.message.includes("quota") || 
          error.message.includes("rate limit") ||
          error.message.includes("too many requests")
        ));

      if (!isRateLimitError || retries >= maxRetries) {
        // If it's not a rate limit error or we've exceeded max retries, throw the error
        throw error;
      }

      // Increment retry count
      retries++;

      // Log the retry attempt
      console.log(`Rate limit exceeded. Retrying in ${delay}ms... (Attempt ${retries} of ${maxRetries})`);

      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay for next potential retry (with a maximum limit)
      delay = Math.min(delay * factor, maxDelayMs);
    }
  }
}

// REFACTOR: string helpers that were redefined inline in several routes
const trimmed = (value) => String(value ?? "").trim();
const filled = (value) => trimmed(value) !== "";
// Drive rejects "/" in a file name, and both jenis labels and Status Pegawai can carry one
const safePart = (value) => String(value ?? "").replace(/[\\/]/g, "-").trim();

// REFACTOR: every Sheets call went through the same five line
// withBackoff(async () => { return await client.spreadsheets.values.X({...}) }) wrapper.
// These keep the backoff and the argument shape identical, just without the repetition.
const readRange = (client, spreadsheetId, range) =>
    withBackoff(async () => client.spreadsheets.values.get({ spreadsheetId, range }));

const readRanges = (client, spreadsheetId, ranges) =>
    withBackoff(async () => client.spreadsheets.values.batchGet({ spreadsheetId, ranges }));

const writeRange = (client, spreadsheetId, range, values, valueInputOption = "RAW") =>
    withBackoff(async () => client.spreadsheets.values.update({
        spreadsheetId, range, valueInputOption, requestBody: { values },
    }));

const writeRanges = (client, spreadsheetId, data, valueInputOption = "RAW") =>
    withBackoff(async () => client.spreadsheets.values.batchUpdate({
        spreadsheetId, requestBody: { valueInputOption, data },
    }));

// Allowing CORS to get request and cookies from frontend
const corsOption = {
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
}

// Middleware
app.use(express.json());
app.use(cors(corsOption));
app.use(cookieParser());

// Cookie debugging middleware (only in development)
if (process.env.NODE_ENV !== "production") {
    app.use((req, res, next) => {
        if (req.path === '/check-auth' || req.path === '/login-auth' || req.path === '/logout') {
            console.log(`[${req.method}] ${req.path} - Cookies:`, Object.keys(req.cookies));
        }
        next();
    });
}
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === "production", // Use secure cookies in production
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true, // Prevent XSS attacks
        sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax' // Consistent with auth cookies
    },
    name: 'session_id' // Custom session name for better security
}));

// --- Authorisation ------------------------------------------------------------
// Every route is gated here rather than one by one, so the whole policy reads as a
// single block and a route added later is denied until it is listed. Every path in
// this file is static, so an exact "METHOD /path" match is enough.
// "master admin" is never listed - it passes everything, like canOpen on the frontend.

const MASTER_ROLE = "master admin";
const USER = ["user"];
const ADMIN = ["admin"];
const GAJI = ["admin_gaji"];
const USER_ADMIN = ["user", "admin"];
const ADMIN_GAJI = ["admin", "admin_gaji"];
const ANY_ROLE = ["user", "admin", "admin_gaji"];

// --- Pilot switches -----------------------------------------------------------
// There is no staging server, so a couple of finished features are held back on the live
// one while they are trialled. Nothing behind these flags is removed - each is a temporary
// hold, and setting it to false restores the behaviour the code already had.
// PILOT_SKIP_MENUNGGU_PJK has a twin on the frontend (hideMenungguPjkSection in
// src/lib/pilot.js) that hides the card this flag would leave empty; flip the two together.
// PILOT_SATKER is duplicated there too - a name added here has to be added there as well.

// The satker taking part in the pilot, matched on the account name the JWT carries.
// Comparison goes through normalizeSatker, so case and stray whitespace in poriku_users
// cannot drop an account out of the pilot. Kept in sync with PILOT_SATKER in src/lib/pilot.js.
const PILOT_SATKER = ["Biro Umum", "Biro Sarana dan Prasarana"];
const isPilotSatker = (name) => PILOT_SATKER.some(satker => normalizeSatker(satker) === normalizeSatker(name));
// The accounts the holds are lifted for: the pilot satker, plus "master admin", which has
// passed every hold since the pilot started.
const isPilotViewer = (viewer) => viewer?.role === MASTER_ROLE || isPilotSatker(viewer?.name);

// Non-GUP/PTUP jenis are open to the pilot accounts only, matching the option list
// Buat-Pengajuan.jsx offers. Rows submitted before the hold still open, edit and verify normally.
const PILOT_JENIS_PILOT_ONLY = true;
const PILOT_JENIS_ALLOWED = ["gup", "ptup"];
// Kelola-Pengajuan stops parking a GUP/PTUP row on the verifikator PJK: once the bendahara
// has set Pajak, Anggaran and the Tanggal Selesai Verifikasi the row moves straight on to
// Sudah Verifikasi. Rows whose Unit Kerja is a pilot satker are exempt - they run the new
// flow and do wait on the verifikator, so the card holds their rows and nobody else's. The
// PJK verification itself is untouched and still runs on the mirror either way.
const PILOT_SKIP_MENUNGGU_PJK = true;
// Whether any row can still park on the PJK, and so whether the mirror sheet is worth reading
const PILOT_ANY_MENUNGGU_PJK = !PILOT_SKIP_MENUNGGU_PJK || PILOT_SATKER.length > 0;
// Which GUP/PTUP submissions register a mirror row on the verifikasi antrian. The mirror only
// exists so the PJK step has a row to hang off, and while the hold is on no other satker's row
// ever reaches that step - registering one would only put a row on the verifikator's screen that
// nobody is meant to act on. A PJK actually being attached still forces one, since the mirror is
// the only place that link can live. Turning PILOT_SKIP_MENUNGGU_PJK off mirrors everything again.
const shouldMirrorAntrian = (viewer, hasPjkFile) =>
    !PILOT_SKIP_MENUNGGU_PJK || isPilotViewer(viewer) || !!hasPjkFile;

// Reachable without a session: login itself, the public Layanan Gaji page, and the
// Google redirect targets the browser lands on without passing through the app
const PUBLIC_ROUTES = new Set([
    "POST /login-auth",
    "POST /logout",
    "GET /check-auth",
    "GET /bendahara/antrian-gaji",
    "GET /auth/google/callback",
    "GET /auth/google/verif/callback",
    "GET /auth/google/gaji/callback",
    "GET /auth/success",
]);

const ROUTE_ROLES = {
    // Navbar and the Home landing page, so every signed in role needs them. The
    // realisasi route scopes itself - role="user" only ever sees its own satker.
    "GET /notification": ANY_ROLE,
    "POST /notification/mark-read": ANY_ROLE,
    "GET /verifikasi/realisasi-anggaran": ANY_ROLE,
    "GET /home/dashboard": ANY_ROLE,
    // Buat-Pengajuan opens these in a popup when the Drive token has lapsed
    "GET /auth/google": ANY_ROLE,
    "GET /auth/google/verif": ANY_ROLE,
    "GET /auth/google/gaji": ANY_ROLE,
    "GET /auth/status": ANY_ROLE,

    // Daftar Pengajuan, Buat Pengajuan, Lihat Antrian
    "GET /bendahara/antrian": USER,
    "GET /bendahara/filter-date": USER,
    "POST /bendahara/buat-ajuan": USER,
    "PATCH /bendahara/edit-table": USER,
    "DELETE /bendahara/delete-ajuan": USER,

    // Called from both sides: data-transaksi by Buat-Pengajuan and the three aksi
    // screens, data-pjk by Monitor-PJK and Kelola-PJK
    "GET /bendahara/data-transaksi": USER_ADMIN,
    "GET /verifikasi/data-pjk": USER_ADMIN,

    // Kelola Pengajuan, Monitoring DRPP
    "GET /bendahara/kelola-ajuan": ADMIN,
    "POST /bendahara/aksi-ajuan": ADMIN,
    "GET /bendahara/get-ajuan": ADMIN,
    "GET /bendahara/monitoring-drpp": ADMIN,
    "GET /bendahara/cek-drpp": ADMIN,
    "POST /bendahara/aksi-drpp": ADMIN,

    // Pengujian PJK, Kelola PJK, Form Verifikasi, Realisasi
    "GET /verifikasi/pengujian-pjk": ADMIN,
    "GET /verifikasi/hasil-verif/pending": USER_ADMIN,
    "POST /verifikasi/aksi-pjk": ADMIN,
    "GET /verifikasi/cari-spm": ADMIN,
    "POST /verifikasi/verifikasi-form": ADMIN,
    "PATCH /verifikasi/code-anggaran": ADMIN,
    "POST /verifikasi/generate-pdf": ADMIN,

    // Monitor Data Gaji is read-only for admin; only admin_gaji may write
    "GET /bendahara/monitor-perubahan-gaji": ADMIN_GAJI,
    "POST /dokumen-gaji/kirim": GAJI,

    // Also feeds SPM Bendahara, which users open; their rows are scoped to their satker
    "GET /bendahara/pembayaran-bp": USER_ADMIN,
    "GET /bendahara/pembayaran-bp/options": ADMIN,
    "GET /bendahara/pembayaran-bp/cari": USER_ADMIN,
    "GET /bendahara/pembayaran-bp/rek-koran": USER_ADMIN,
    "PATCH /bendahara/pembayaran-bp/rek-koran": ADMIN,
    "POST /bendahara/pembayaran-bp": ADMIN,
    "PATCH /bendahara/pembayaran-bp": ADMIN,
    "DELETE /bendahara/pembayaran-bp": ADMIN,

    // Clears the Google credentials the whole process shares
    "POST /auth/logout": [],
};

// Routes carrying a path parameter cannot be matched by an exact key, so they are listed
// by prefix instead. Kept apart from the table above so that stays a plain lookup, and
// checked only after it misses - an exact entry always wins.
// A prefix must end in "/" so that "/dokumen-gaji/12" matches but a longer sibling route
// such as "/dokumen-gaji-arsip" cannot.
const ROUTE_ROLES_PREFIX = [
    // Reading a Dokumen Gaji row follows Monitor Data Gaji, which admin may read; writing
    // and deleting follow POST /dokumen-gaji/kirim, which only admin_gaji may do
    { method: "GET", prefix: "/dokumen-gaji/", roles: ADMIN_GAJI },
    { method: "PUT", prefix: "/dokumen-gaji/", roles: GAJI },
    { method: "DELETE", prefix: "/dokumen-gaji/", roles: GAJI },
];

const rolesForRoute = (method, path) => ROUTE_ROLES[`${method} ${path}`]
    || ROUTE_ROLES_PREFIX.find(route => route.method === method && path.startsWith(route.prefix))?.roles
    || [];

app.use((req, res, next) => {
    // Query string is already stripped from req.path; drop a trailing slash so
    // /bendahara/antrian/ cannot slip past the table
    const path = req.path.length > 1 ? req.path.replace(/\/$/, "") : req.path;
    const key = `${req.method} ${path}`;
    if (req.method === "OPTIONS" || PUBLIC_ROUTES.has(key)) return next();

    let viewer;
    try {
        viewer = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: "Sesi tidak valid, silakan login ulang." });
    }
    if (viewer.role !== MASTER_ROLE && !rolesForRoute(req.method, path).includes(viewer.role)) {
        return res.status(403).json({ message: "Akses ditolak." });
    }
    req.viewer = viewer;
    next();
});

// Setting Up Postgres
const sql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
});

// Credentials for Pengajuan Gsheet
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
const auth = new google.auth.JWT(
    process.env.AJUAN_CLIENT_EMAIL,
    null,
    process.env.AJUAN_PRIVATE_KEY,
    SCOPES
);

// Credentials for Verifikasi Gsheet
const auth2 = new google.auth.JWT(
    process.env.VERIF_CLIENT_EMAIL,
    null,
    process.env.VERIF_PRIVATE_KEY,
    SCOPES
);

// OAuth2 Client for Google Drive Ajuan
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// OAuth2 Client for Google Drive Verif
const oauth2ClientVerif = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_VERIF,
    process.env.GOOGLE_CLIENT_SECRET_VERIF,
    process.env.GOOGLE_REDIRECT_URI_VERIF
);

// Gsheet API Setup
const sheets = google.sheets({ version: "v4", auth })
const sheets2 = google.sheets({ version: "v4", auth: auth2 })

// The year the request is scoped to. Pembayaran BP needs it for its tab name as well
// as its spreadsheet id, so it lives here rather than inline in getSpreadsheetId.
const getRequestYear = (req) =>
    req.query.year || req.body.year || new Date().getFullYear().toString();

// Helper to get spreadsheet IDs based on year from request
function getSpreadsheetId(req, type) {
    const year = getRequestYear(req);
    const envKey = `SPREADSHEET_ID_${type.toUpperCase()}_${year}`;
    // Try year-specific first, then fall back to old format (without year suffix)
    return process.env[envKey] || process.env[`SPREADSHEET_ID_${type.toUpperCase()}`];
}

// --- Notifikasi writer --------------------------------------------------------
// Each recipient owns a 4 column block: [id, judul, keterangan, status baca].
// Row 1 holds the recipient name, row 2 is a sub header, data starts on row 3.

// Convert a 0-based column index to a sheet column letter (0 -> A, 26 -> AA)
function getColumnLetter(index) {
    let letter = '';
    let tempIndex = index;
    while (tempIndex >= 0) {
        letter = String.fromCharCode((tempIndex % 26) + 65) + letter;
        tempIndex = Math.floor(tempIndex / 26) - 1;
    }
    return letter;
}

// Locate a recipient's block on row 1. Exact match first, then the substring
// match GET /notification uses - guards against prefix collisions such as
// "Biro Umum" vs "Biro Umum dan Keuangan".
function findNotificationColumnIndex(headerRow, recipientName) {
    const target = String(recipientName || '').trim().toLowerCase();
    if (!target) return -1;
    const normalized = headerRow.map(columnName => String(columnName || '').trim().toLowerCase());
    const exact = normalized.findIndex(columnName => columnName === target);
    if (exact !== -1) return exact;
    return normalized.findIndex(columnName => columnName !== '' && columnName.includes(target));
}

// Append one notification to a recipient's block. The id MUST equal (sheet row - 2)
// because /notification/mark-read resolves a row with `Number(notifId) + 2` - any
// other id makes a later "mark as read" stamp 'yes' onto the wrong notification.
// Returns {ok:false} for expected misses; real API failures still reject.
async function writeNotification(spreadsheetId, recipientName, title, description) {
    const recipient = String(recipientName || '').trim();
    if (!spreadsheetId || !recipient || !title) {
        console.warn("[notifikasi] dilewati, data tidak lengkap:", { recipient, title });
        return { ok: false, reason: "missing-args" };
    }

    const headerResponse = await readRange(sheets, spreadsheetId, "'Notifikasi'!A1:CB1");
    const headerRow = headerResponse.data.values?.[0] || [];
    const columnIndex = findNotificationColumnIndex(headerRow, recipient);
    if (columnIndex === -1) {
        console.warn(`[notifikasi] kolom tidak ditemukan untuk: "${recipient}"`);
        return { ok: false, reason: "recipient-not-found" };
    }

    const idColumnLetter = getColumnLetter(columnIndex);
    const statusColumnLetter = getColumnLetter(columnIndex + 3);

    // Sheets trims trailing empty rows but returns interior ones as [], so `length`
    // is the offset of the last populated row - an interior gap cannot shift it.
    const blockResponse = await readRange(
        sheets,
        spreadsheetId,
        `'Notifikasi'!${idColumnLetter}3:${statusColumnLetter}`,
    );
    const blockRows = blockResponse.data.values || [];
    const newRow = 3 + blockRows.length;
    const newId = newRow - 2;

    await writeRange(
        sheets,
        spreadsheetId,
        `'Notifikasi'!${idColumnLetter}${newRow}:${statusColumnLetter}${newRow}`,
        [[newId, title, description || "", 'no']],
        "RAW",
    );

    console.log(`[notifikasi] "${recipient}" <- id ${newId} baris ${newRow}: ${title}`);
    return { ok: true, id: newId, row: newRow };
}

// Gdrive API Setup (will be initialized with OAuth2 tokens)
let drive = null;
const driveFolderId = process.env.DRIVE_FOLDER_ID_AJUAN;

// Gdrive and Gdocs API for Verifikasi
let driveVerif = null;
let docsVerif = null;
const driveFolderIdVerif = process.env.DRIVE_FOLDER_ID_VERIF;

// OAuth Token Management Functions
async function saveOAuthTokens(tokens) {
    try {
        // Delete existing tokens first
        await sql`DELETE FROM oauth_tokens WHERE id = 1`;
        
        // Insert new tokens
        await sql`
            INSERT INTO oauth_tokens (id, access_token, refresh_token, expiry_date, created_at)
            VALUES (1, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expiry_date || null}, NOW())
            ON CONFLICT (id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expiry_date = EXCLUDED.expiry_date,
                updated_at = NOW()
        `;
        console.log('OAuth tokens saved to database');
    } catch (error) {
        console.error('Failed to save OAuth tokens:', error);
    }
}

async function loadOAuthTokens() {
    try {
        const result = await sql`SELECT * FROM oauth_tokens WHERE id = 1 LIMIT 1`;
        if (result.length > 0) {
            const tokenData = result[0];
            const tokens = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry_date: tokenData.expiry_date
            };
            
            oauth2Client.setCredentials(tokens);
        drive = google.drive({ version: "v3", auth: oauth2Client });
            console.log('OAuth tokens loaded from database');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load OAuth tokens:', error);
        return false;
    }
}

// OAuth Token Management Functions for Verification
async function saveVerifOAuthTokens(tokens) {
    try {
        // Delete existing verification tokens first
        await sql`DELETE FROM oauth_tokens_verif WHERE id = 1`;
        
        // Insert new verification tokens
        await sql`
            INSERT INTO oauth_tokens_verif (id, access_token, refresh_token, expiry_date, created_at)
            VALUES (1, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expiry_date || null}, NOW())
            ON CONFLICT (id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expiry_date = EXCLUDED.expiry_date,
                updated_at = NOW()
        `;
        console.log('Verification OAuth tokens saved to database');
    } catch (error) {
        console.error('Failed to save verification OAuth tokens:', error);
    }
}

async function loadVerifOAuthTokens() {
    try {
        const result = await sql`SELECT * FROM oauth_tokens_verif WHERE id = 1 LIMIT 1`;
        if (result.length > 0) {
            const tokenData = result[0];
            const tokens = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry_date: tokenData.expiry_date
            };
            
            oauth2ClientVerif.setCredentials(tokens);
            console.log('Verification OAuth tokens loaded from database');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load verification OAuth tokens:', error);
        return false;
    }
}

// Function to initialize Verifikasi APIs with OAuth tokens
async function initializeVerifAPIs() {
    try {
        // Load verification tokens first
        await loadVerifOAuthTokens();
        
        // Check if oauth2ClientVerif has credentials
        if (oauth2ClientVerif.credentials && Object.keys(oauth2ClientVerif.credentials).length > 0) {
            driveVerif = google.drive({ version: 'v3', auth: oauth2ClientVerif });
            docsVerif = google.docs({ version: 'v1', auth: oauth2ClientVerif });
            console.log('Verifikasi Google APIs initialized successfully');
        } else {
            console.log('No OAuth tokens found for Verifikasi APIs initialization');
        }
    } catch (error) {
        console.error('Error initializing Verifikasi APIs:', error);
    }
}

// Initialize OAuth tokens on server startup
loadOAuthTokens();
initializeVerifAPIs();

//Endpoints
// Google OAuth2 Authentication
app.get("/auth/google", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

// Google OAuth2 Callback
app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Initialize Google Drive with OAuth2 tokens
        drive = google.drive({ version: "v3", auth: oauth2Client });
        
        // Save tokens to database for persistence across server restarts
        await saveOAuthTokens(tokens);
        
        res.redirect('/auth/success');
    } catch (error) {
        console.error('OAuth2 callback error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Google OAuth2 Verification Authentication
app.get("/auth/google/verif", (req, res) => {
    const authUrl = oauth2ClientVerif.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

// Google OAuth2 Verification Callback
app.get("/auth/google/verif/callback", async (req, res) => {
    const { code } = req.query;
    
    try {
        const { tokens } = await oauth2ClientVerif.getToken(code);
        oauth2ClientVerif.setCredentials(tokens);
        
        // Initialize Verifikasi APIs with OAuth2 tokens
        driveVerif = google.drive({ version: 'v3', auth: oauth2ClientVerif });
        docsVerif = google.docs({ version: 'v1', auth: oauth2ClientVerif });
        
        // Save verification tokens to database
        await saveVerifOAuthTokens(tokens);
        
        res.redirect('/auth/verif/success');
    } catch (error) {
        console.error('OAuth2 verification callback error:', error);
        res.status(500).json({ error: 'Verification authentication failed' });
    }
});

// Check authentication status
app.get("/auth/status", (req, res) => {
    const isAuthenticated = drive !== null && oauth2Client.credentials.access_token;
    res.json({ authenticated: isAuthenticated });
});

// Logout/Remove OAuth2 account
app.post("/auth/logout", (req, res) => {
    try {
        // Clear OAuth2 credentials
        oauth2Client.setCredentials({});
        
        // Clear drive instance
        drive = null;
        
        // Clear session if exists
        if (req.session) {
            req.session.tokens = null;
        }
        
        res.json({ message: "Successfully logged out from Google Drive" });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: "Failed to logout" });
    }
});

// Authentication success page
app.get("/auth/success", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .success {
                    color: #4CAF50;
                    font-size: 1.2rem;
                    margin-bottom: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success">✓ Authentication Successful!</div>
                <p>You can now upload files. This window will close automatically.</p>
            </div>
            <script>
                // Send success message to parent window
                if (window.opener) {
                    window.opener.postMessage('oauth-success', '*');
                }
                
                // Close the popup window automatically after 2 seconds
                setTimeout(() => {
                    window.close();
                }, 2000);
                
                // Try to close immediately (some browsers allow this)
                try {
                    window.close();
                } catch (e) {
                    // Fallback: close after delay
                }
            </script>
        </body>
        </html>
    `);
});

// Login page
app.post("/login-auth", async (req, res) => {
    const { username, password } = req.body;
    try {

        //Get user data
        const userData= await sql`
            SELECT * FROM poriku_users WHERE username = ${username} LIMIT 1
        `;
        //Check if user exist
        if (userData.length === 0 ){
            return res.status(401).json({ message: "Invalid username or password" });
        }
        //Verify Password
        const validPassword = await bcrypt.compare(password, userData[0].password);
        if (!validPassword) {
            return res.status(401).json({ message: "Invalid username or password" });
        }
        //Create JWT Token
        const token = jwt.sign(
            { id: userData[0].id, username: userData[0].username, name: userData[0].name, role: userData[0].role },
            process.env.JWT_SECRET,
            { expiresIn: "12h" }
        );

            // Set cookie with the token
        // console.log("=== COOKIE SETTING DEBUG ===");
        // console.log("Setting auth cookie for user:", userData[0].name);
        // console.log("Environment:", process...env.NODE_ENV);
        // console.log("Frontend Origin:", process...env.FRONTEND_ORIGIN);
        // console.log("Hostname Domain:", process...env.HOSTNAME_DOMAIN);
        // console.log("Cookie config:", {
        //     httpOnly: true,
        //     secure: process...env.NODE_ENV === "production",
        //     sameSite: process...env.NODE_ENV === "production" ? 'none' : 'lax',
        //     domain: process...env.NODE_ENV === "production" ? process...env.HOSTNAME_DOMAIN : undefined,
        //     path: '/',
        //     maxAge: 5 * 60 * 60 * 1000
        // });

        res.cookie("auth_token", token, {   //The cookie name is "auth_token"
            httpOnly: true, // Prevent JavaScript access
            secure: process.env.NODE_ENV === "production", // Only send cookie over HTTPS
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax',
            domain: process.env.NODE_ENV === "production" ? process.env.HOSTNAME_DOMAIN : undefined,
            path: '/', // Add explicit path
            maxAge: 5 * 60 * 60 * 1000, // 5 hours
        });

        console.log("✅ Auth cookie set successfully");

        // Make array to send only Name and Role
        const sendData = [userData[0].name, userData[0].role]

        res.json({data: sendData, message: "Login Success!"})
    } catch (error) {
        console.log("Error sending data to DB.", error)
        res.status(500).json({error: "Can't write data to DB."})
    }
})

//Logout Handler
app.post("/logout", (req, res) => {
    try {
        
        res.clearCookie("auth_token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax',
            domain: process.env.NODE_ENV === "production" ? process.env.HOSTNAME_DOMAIN : undefined,
            path: '/', // Add explicit path
            expires: new Date(0) // Set to past date to ensure deletion
        })
        console.log("Cookie cleared successfully");
        res.status(200).json({ message: "Logout Successful!"})
    } catch (error) {
        console.error("Error during logout:", error);
        res.status(500).json({ error: "Logout failed" });
    }
})

//Check user cookies
app.get("/check-auth", (req, res) => {
    const token = req.cookies.auth_token;
    
    if (!token) {
        console.log("❌ Authentication failed: No token found");
        return res.status(401).json({ message: "Not authenticated" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("✅ Auth check successful for user:", decoded.name);
        console.log("Token expires at:", new Date(decoded.exp * 1000));
        res.status(200).json({ 
            user: {
                name: decoded.name,
                role: decoded.role } 
            });
    } catch (error) {
        console.log("❌ Auth check failed - Token invalid:", error.message);
        res.status(400).json({ message: "Invalid token" });
    }
});

// Layanan Gaji antrian
app.get("/bendahara/antrian-gaji", async (req, res) => {
    try {
        const spreadsheetIdGaji = getSpreadsheetId(req, 'GAJI');
        const { page = 1, limit = 5 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        //Get hidden rows metadata
        const metaResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.get({
                spreadsheetId: spreadsheetIdGaji,
                includeGridData: false,
                ranges: ["'Sheet1'!A:C"],
                fields: 'sheets(data(rowMetadata(hiddenByUser,hiddenByFilter)))'
            })
        })

        const hiddenRowIdx = new Set();

        metaResponse.data.sheets[0].data.forEach(grid => {
            grid.rowMetadata.forEach((rowMeta, idx) => {
                if (rowMeta.hiddenByUser || rowMeta.hiddenByFilter) {
                    hiddenRowIdx.add(idx);      // row index is zero–based
                }
            });
        });

        //Get filtered values
        const valueResponse = await readRange(sheets, spreadsheetIdGaji, `'Sheet1'!A:C`);

        const visibleRows = valueResponse.data.values.filter(
            (_, idx) => !hiddenRowIdx.has(idx)
        );

        // Ensure each row has 3 columns
        const normalizedRows = visibleRows.slice(1).reverse().map(row => {
            while (row.length < 3) row.push("");
            return row;
        });

        const allRows = normalizedRows.length;

        // Apply pagination
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedRows = normalizedRows.slice(startIndex, endIndex);

        res.json({ data: paginatedRows, rowLength: allRows });


    } catch (error) {
        console.error("Error in fetching gaji antrian data:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }

})


// Render data antrian
app.get("/bendahara/antrian", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { page = 1, limit = 5, username, flow } = req.query;

        // Both antrian sheets, already projected onto the canonical layout
        let filteredRows = await fetchMergedAntrianRows(spreadsheetId);

        // Filter rows where column L matches username (if username don't exist it will handle Lihat-Antrian)
        if (username) {
            filteredRows = filteredRows.filter(row => row[ANTRIAN_UNIT_KERJA_INDEX] === username);
        }
        // flow="gup" narrows to GUP/PTUP, the only jenis on 'Write Antrian'
        if (flow) {
            filteredRows = filteredRows.filter(row => row[ANTRIAN_FLOW_INDEX] === flow);
        }
        // Latest first. The two sheets each number their own rows, so the timestamp is
        // the only ordering the merged list can share.
        filteredRows = sortAntrianLatestFirst(filteredRows);

        const totalFiltered = filteredRows.length;

        // Pagination logic (from the bottom up)
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedRows = filteredRows.slice(startIndex, endIndex);

        // Rows are already ANTRIAN_ROW_WIDTH wide from the canonical projection
        res.json({ data: paginatedRows, realAllAntrianRows: totalFiltered, pending: [...pendingHasilVerif.keys()] });

    } catch (error) {
        console.error("Error in /bendahara/antrian:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

// Filter data antrian based on keyword
app.get("/bendahara/filter-date", async (req, res) => {
    const { datePrefix, page = 1, limit = 5 } = req.query;

    if (!datePrefix || typeof datePrefix !== 'string') {
        return res.status(400).json({ message: "Invalid date prefix." });
    }

    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { username } = req.query;

        // Same merged source as /bendahara/antrian, so a filtered row carries the flow
        // tag and the full canonical width the unfiltered list gives
        let allRows = await fetchMergedAntrianRows(spreadsheetId);
        if (username) {
            allRows = allRows.filter(row => row[ANTRIAN_UNIT_KERJA_INDEX] === username);
        }

        // Filter rows whose timestamp matches the date prefix
        const filteredRows = sortAntrianLatestFirst(
            allRows.filter(row => String(row[1] ?? "").startsWith(datePrefix))
        );
        // Error handling if no keyword found
        if (filteredRows.length === 0) {
            return res.status(404).json({ error: "No matching rows found." });
        }

        // Calculate pagination
        const totalRows = filteredRows.length;
        const startIndex = (page - 1) * limit;
        const rowData = filteredRows.slice(startIndex, startIndex + parseInt(limit));
        const totalPages = Math.ceil(totalRows / limit)

        // Send paginated data and total rows count for pagination
        res.json({
            data: rowData,
            totalPages,
            pending: [...pendingHasilVerif.keys()]
        });

    } catch (error) {
        console.error("Error in /bendahara/filter-date:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
});



// Write data from table on sheet
// Two submission flows share this route. GUP/PTUP keep the original sheets; every
// other Jenis Pengajuan is a verifikasi flow that writes the '... Verif' pair, which
// has no Request Tanggal column and keeps its ID counter in O1 rather than R1.
const ANTRIAN_ROW_WIDTH = 20;

const AJUAN_FLOWS = {
    gup: {
        key: "gup",
        antrianSheet: "Write Antrian",
        tableSheet: "Write Table",
        counterCell: "R1",
        unitKerjaColumn: "L",
        lampiranColumn: "T",
        antrianLastColumn: "T",
        tableColumnCount: 22,
        hasRequestTanggal: true,
        antrianMap: null, // already the canonical layout
    },
    verif: {
        key: "verif",
        antrianSheet: "Write Antrian Verif",
        tableSheet: "Write Table Verif",
        counterCell: "O1",
        unitKerjaColumn: "I",
        lampiranColumn: "O",
        antrianLastColumn: "O",
        tableColumnCount: 4,
        hasRequestTanggal: false,
        pjk: {
            spp: "G",
            substansi: "J",
            kelengkapan: "K",
            mulaiVerif: "L",
            selesaiVerif: "M",
            catatan: "N",
            // Link to the newest Hasil Verifikasi PDF. Past O, which is the lampiran and
            // the last column the antrian write path touches.
            dokVerif: "P",
            defaults: { substansi: "Belum", kelengkapan: "Belum Verif" },
        },
        // canonical index ('Write Antrian' layout) -> column on this sheet
        antrianMap: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 7: 5, 9: 6, 10: 7, 11: 8, 14: 11, 15: 12, 16: 13, 19: 14 },
    },
};

const getAjuanFlow = (value) => AJUAN_FLOWS[value === "verif" ? "verif" : "gup"];

// 0-based indices of the PJK columns, derived from the letters above so the two cannot drift
const PJK_COLUMN = Object.fromEntries(
    Object.entries(AJUAN_FLOWS.verif.pjk)
        .filter(([, letter]) => typeof letter === "string")
        .map(([name, letter]) => [name, letter.charCodeAt(0) - 65])
);
const PJK_VERIFIED_VALUES = ["OK", "OK Catatan"];

// Jenis is stored as a label, so the flow a row belongs to is read back off it
function resolveJenis(value) {
    const target = String(value ?? "").trim().toLowerCase();
    return Object.values(JENIS_PENGAJUAN).find(jenis =>
        jenis.sheetValue.toLowerCase() === target || String(jenis.verifValue || "").toLowerCase() === target
    ) || null;
}

// Both antrian sheets are projected onto the 'Write Antrian' column layout, so the
// list and everything reading it work against one shape
function toCanonicalAntrianRow(row, flowConfig) {
    const canonical = Array(ANTRIAN_ROW_WIDTH).fill("");
    if (!flowConfig.antrianMap) {
        (row || []).slice(0, ANTRIAN_ROW_WIDTH).forEach((cell, index) => { canonical[index] = cell ?? ""; });
        return canonical;
    }
    for (const [target, source] of Object.entries(flowConfig.antrianMap)) {
        canonical[target] = row?.[source] ?? "";
    }
    return canonical;
}

// Canonical indices the routes and the frontend both index by position
const ANTRIAN_JENIS_INDEX = 3;
const ANTRIAN_UNIT_KERJA_INDEX = 11;
// Appended past the canonical width so every existing index keeps its meaning. Tells
// the frontend which flow a row came from, so edit/delete can be routed back to it.
const ANTRIAN_FLOW_INDEX = ANTRIAN_ROW_WIDTH;
// A GUP/PTUP pengajuan keeps its Bupot on its own row but its PJK on the mirror row,
// so the mirror's lampiran is carried across for the daftar to show
const ANTRIAN_PJK_INDEX = ANTRIAN_ROW_WIDTH + 1;
// The verifikator writes their note on the mirror row, the bendahara theirs on the
// original, and the user needs to read both
const ANTRIAN_PJK_CATATAN_INDEX = ANTRIAN_ROW_WIDTH + 2;
const ANTRIAN_DOK_VERIF_INDEX = ANTRIAN_ROW_WIDTH + 3;
const ANTRIAN_HASIL_VERIF_ID_INDEX = ANTRIAN_ROW_WIDTH + 4;

// GUP/PTUP are verified twice and independently - Pajak/Anggaran by the bendahara on
// 'Write Antrian', Substansi/Kelengkapan by the verifikator on the mirror. Either side
// finishing first would otherwise show the user a status the other side contradicts, so
// a problem or an open verification outranks the other row's optimistic status.
function antrianStatusRank(status) {
    const value = String(status ?? "").toLowerCase();
    if (value.includes("masalah")) return 2;
    if (value.includes("sedang di verifikasi")) return 1;
    return 0;
}

// The mirror row carries its own id, so timestamp + nama is the only link back to the
// 'Write Antrian' row that produced it. Both are written in the same batch, so they match
// exactly; a nama colliding within the same second is the only way this is ambiguous.
const mirrorRowKey = (timestamp, nama) =>
    JSON.stringify([String(timestamp ?? "").trim(), String(nama ?? "").trim()]);

// Every 'Write Antrian Verif' row that could be the mirror of the given 'Write Antrian' row.
// Nothing found and several found are different problems - a GUP/PTUP submitted before the
// mirror existed simply has none and one can be registered, whereas an ambiguous match must
// be left alone - so callers that can tell them apart get the whole list. Takes the rows
// rather than fetching them so callers that already hold the sheet do not pay for a second read.
function findMirrorAntrianMatches(mirrorRows, antrianRowValues) {
    const key = mirrorRowKey(antrianRowValues?.[1], antrianRowValues?.[2]);
    if (key === mirrorRowKey("", "")) return []; // nothing to match on

    const matches = [];
    (mirrorRows || []).forEach((row, index) => {
        if (mirrorRowKey(row?.[1], row?.[2]) === key) {
            matches.push({ row: index + 1, canonical: toCanonicalAntrianRow(row, AJUAN_FLOWS.verif) });
        }
    });
    return matches;
}

// Picks the mirror out of those matches. Returns { row, canonical } only when exactly one row
// matches - a duplicate or missing match means we cannot tell which row is the mirror, and
// touching the wrong one is worse than doing nothing.
function matchMirrorAntrianRow(mirrorRows, antrianRowValues, purpose = "update") {
    const matches = findMirrorAntrianMatches(mirrorRows, antrianRowValues);
    if (matches.length !== 1) {
        const key = mirrorRowKey(antrianRowValues?.[1], antrianRowValues?.[2]);
        console.warn(`Mirror row for ${key}: ${matches.length} matches, skipping mirror ${purpose}.`);
        return null;
    }
    return matches[0];
}

// Timestamps are 'yyyy-mm-dd hh:mm:ss', so a plain string compare orders them correctly
function sortAntrianLatestFirst(rows) {
    return [...rows].sort((a, b) => String(b[1] ?? "").localeCompare(String(a[1] ?? "")));
}

// The daftar shows both antrian sheets as one list. GUP/PTUP also register a mirror row
// on 'Write Antrian Verif', so those are dropped here - the 'Write Antrian' original is
// the authoritative one and carries the columns the mirror does not have.
async function fetchMergedAntrianRows(spreadsheetId) {
    const flows = [AJUAN_FLOWS.gup, AJUAN_FLOWS.verif];
    const response = await readRanges(
        sheets,
        spreadsheetId,
        flows.map(flow => `'${flow.antrianSheet}'!A3:${flow.pjk?.dokVerif || flow.antrianLastColumn}`),
    );

    // The mirrors are dropped from the list itself, but they hold the only copy of the PJK
    // lampiran, the verifikator's note and the PJK-side status, so they are indexed on the
    // way past
    const mirrorByKey = new Map();
    const merged = [];
    flows.forEach((flow, index) => {
        const rows = response.data.valueRanges?.[index]?.values || [];
        for (const row of rows) {
            const canonical = toCanonicalAntrianRow(row, flow);
            if (flow.key === "verif") {
                canonical[ANTRIAN_DOK_VERIF_INDEX] = row?.[PJK_COLUMN.dokVerif] ?? "";
                const jenis = resolveJenis(canonical[ANTRIAN_JENIS_INDEX]);
                if (jenis?.flow === "gup") { // mirror of a 'Write Antrian' row
                    mirrorByKey.set(mirrorRowKey(canonical[1], canonical[2]), canonical);
                    continue;
                }
            }
            canonical[ANTRIAN_FLOW_INDEX] = flow.key;
            merged.push(canonical);
        }
    });

    for (const row of merged) {
        if (row[ANTRIAN_FLOW_INDEX] !== "gup") {
            row[ANTRIAN_PJK_INDEX] = row[19]; // its own lampiran already is the PJK
            row[ANTRIAN_HASIL_VERIF_ID_INDEX] = row[0];
            continue;
        }
        const mirror = mirrorByKey.get(mirrorRowKey(row[1], row[2]));
        row[ANTRIAN_PJK_INDEX] = mirror?.[19] || "";
        row[ANTRIAN_PJK_CATATAN_INDEX] = mirror?.[16] || "";
        row[ANTRIAN_DOK_VERIF_INDEX] = mirror?.[ANTRIAN_DOK_VERIF_INDEX] || "";
        row[ANTRIAN_HASIL_VERIF_ID_INDEX] = mirror?.[0] || "";
        if (antrianStatusRank(mirror?.[7]) > antrianStatusRank(row[7])) row[7] = mirror[7];
    }
    return merged;
}

// sheetValue is what lands in the Jenis column of the flow's own antrian sheet. GUP/PTUP
// keep their lowercase keys there so existing rows and the edit dropdown stay readable,
// and use verifValue for their mirror row so 'Write Antrian Verif' reads consistently
// against the labels the other jenis write.
const JENIS_PENGAJUAN = {
    "gup": { sheetValue: "gup", verifValue: "GUP", flow: "gup", hasTable: true },
    "ptup": { sheetValue: "ptup", verifValue: "PTUP", flow: "gup", hasTable: true },
    "gup-kkp": { sheetValue: "GUP KKP", flow: "verif", hasTable: true },
    "ls-bendahara": { sheetValue: "LS Bendahara", flow: "verif", hasTable: true },
    "ls-kontraktual": { sheetValue: "LS Kontraktual", flow: "verif", hasTable: true },
    "ls-pegawai": { sheetValue: "LS Pegawai", flow: "verif", hasTable: false },
    "ls-platform": { sheetValue: "LS Platform Pembayaran Pemerintah", flow: "verif", hasTable: false },
};

// Nomor SPP is stored zero padded to 5 digits. Anything not purely numeric is left alone
// rather than mangled, and the sheet write must stay RAW to keep the leading zeros.
const formatNomorSpp = (value) => {
    const text = trimmed(value);
    return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
};

const buildPjkFileName = (satker, jenisLabel, nomor, nominal) => [satker, jenisLabel, nomor, nominal]
    .map(value => String(value ?? "").replace(/[\\/]/g, "-").trim())
    .filter(Boolean)
    .join("_") + ".pdf";

// The counter cell lags any row added to the sheet by hand, and handing out an id that
// already exists makes TRANS_ID ambiguous. Never issue below the highest id actually present.
const nextAntrianId = (rows, counter) => Math.max(
    parseInt(counter) || 0,
    (rows || []).reduce((max, row) => Math.max(max, Number(row?.[0]) || 0), 0)
) + 1;

// One antrian row plus the single cell writes that belong with it
function buildAntrianWrites(flowConfig, rowNumber, values, unitKerja, lampiranLink, nomorSpp = "") {
    const writes = [
        {
            range: `'${flowConfig.antrianSheet}'!A${rowNumber}:${getColumnLetter(values.length - 1)}${rowNumber}`,
            values: [values],
        },
        {
            range: `'${flowConfig.antrianSheet}'!${flowConfig.counterCell}`,
            values: [[values[0]]],
        },
        {
            //Write Satuan Kerja Name
            range: `'${flowConfig.antrianSheet}'!${flowConfig.unitKerjaColumn}${rowNumber}`,
            values: [[unitKerja]],
        },
        {
            //Write file link
            range: `'${flowConfig.antrianSheet}'!${flowConfig.lampiranColumn}${rowNumber}`,
            values: [[lampiranLink]],
        },
    ];

    // Every row on the verifikasi antrian starts unverified, mirrors included
    if (flowConfig.pjk) {
        writes.push({
            range: `'${flowConfig.antrianSheet}'!${flowConfig.pjk.substansi}${rowNumber}:${flowConfig.pjk.kelengkapan}${rowNumber}`,
            values: [[flowConfig.pjk.defaults.substansi, flowConfig.pjk.defaults.kelengkapan]],
        });
        writes.push({
            range: `'${flowConfig.antrianSheet}'!${flowConfig.pjk.spp}${rowNumber}`,
            values: [[formatNomorSpp(nomorSpp)]],
        });
    }
    return writes;
}

const driveFolderIdVerifPjk = process.env.DRIVE_FOLDER_ID_VERIF_PJK;

// Bupot keeps its unrestricted handling; PJK is PDF only. multer applies fileSize
// across all fields, so the cap is the larger of the two.
const uploadAjuan = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "filePjk" && file.mimetype !== "application/pdf") {
            return cb(new Error("Berkas PJK harus berformat PDF."));
        }
        cb(null, true);
    }
});

function handleAjuanUpload(req, res, next) {
    uploadAjuan.fields([{ name: "file", maxCount: 1 }, { name: "filePjk", maxCount: 1 }])(req, res, (err) => {
        if (err) {
            const message = err.code === "LIMIT_FILE_SIZE"
                ? "Ukuran berkas melebihi 100 MB."
                : (err.message || "Berkas tidak valid.");
            return res.status(400).json({ message });
        }
        next();
    });
}

async function uploadToDriveFolder(uploadFile, folderId, fileName) {
    const bufferStream = new stream.Readable();
    bufferStream.push(uploadFile.buffer);
    bufferStream.push(null);

    const driveResponse = await driveGaji.files.create({
        requestBody: { name: fileName || uploadFile.originalname, parents: [folderId] },
        media: { mimeType: uploadFile.mimetype, body: bufferStream },
        fields: "webViewLink",
        supportsAllDrives: true,
        supportsTeamDrives: true
    });
    return driveResponse.data.webViewLink || "";
}

// Drive stores a webViewLink, not an id. Both shapes it hands back are covered:
// .../file/d/<id>/view and .../open?id=<id>
function driveFileIdFromLink(link) {
    const value = String(link ?? "").trim();
    if (!value) return null;
    return value.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
        || value.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
        || null;
}

// Removes the uploaded file itself. A file that is already gone counts as removed - the
// caller only needs to know the link no longer points at anything it should keep.
async function deleteDriveFile(link) {
    const fileId = driveFileIdFromLink(link);
    if (!fileId) return { deleted: false, reason: "link tidak dikenali" };
    try {
        await driveGaji.files.delete({ fileId, supportsAllDrives: true });
        return { deleted: true };
    } catch (error) {
        const status = error?.code || error?.response?.status;
        if (status === 404 || status === 410) return { deleted: true };
        console.error(`Gagal menghapus berkas Drive ${fileId}:`, error?.message || error);
        return { deleted: false, reason: error?.message || "gagal menghapus dari Drive" };
    }
}

// Deletes every link in one go rather than one after another - these are independent
// files and the caller is holding a response open. Returns the reasons that failed.
async function deleteDriveFiles(links) {
    const wanted = [...new Set((links || []).filter(Boolean))];
    if (wanted.length === 0) return [];
    const results = await Promise.all(wanted.map(link => deleteDriveFile(link)));
    return results.filter(result => !result.deleted).map(result => result.reason);
}

app.post("/bendahara/buat-ajuan", handleAjuanUpload, async (req, res) => {
    //Extracting each part from formData
    const textdata = JSON.parse(req.body.textdata);
    const tabledata = JSON.parse(req.body.tabledata);
    const userdata = req.body.userdata;

    if (textdata && tabledata && userdata) {
        try {
            const spreadsheetId = getSpreadsheetId(req, 'AJUAN');

            const [namaPengisi, jenisKey, jumlahAjuan, tanggalAjuan, nomorSpp = ""] = textdata;
            const jenisSlug = String(jenisKey || "").trim();
            const jenis = JENIS_PENGAJUAN[jenisSlug];
            if (!jenis) {
                return res.status(400).json({ message: "Jenis pengajuan tidak dikenal." });
            }
            // Pilot hold: the option list in Buat-Pengajuan.jsx already stops at GUP/PTUP for
            // everyone else, this is the same rule where it cannot be edited around
            if (PILOT_JENIS_PILOT_ONLY && !isPilotViewer(req.viewer)
                && !PILOT_JENIS_ALLOWED.includes(jenisSlug)) {
                return res.status(403).json({ message: "Jenis pengajuan ini belum tersedia." });
            }
            if (jenis.flow === "verif" && trimmed(nomorSpp) === "") {
                return res.status(400).json({ message: "Nomor SPP wajib diisi." });
            }
            const flow = AJUAN_FLOWS[jenis.flow];
            const hasTable = jenis.hasTable && Array.isArray(tabledata) && tabledata.length > 0;
            if (jenis.hasTable && !hasTable) {
                return res.status(400).json({ message: "Data tabel wajib diisi." });
            }
            // Read here rather than at the upload below: whether a PJK is coming decides
            // the mirror, which decides what this route has to read from the sheet
            const bupotFile = req.files?.file?.[0];
            const pjkFile = req.files?.filePjk?.[0];

            // GUP/PTUP also register in the verifikasi antrian, using the same short
            // layout the other jenis write, but never get a Write Table Verif block.
            // Pilot hold: only rows that can actually reach the PJK step get one.
            const mirrorFlow = jenis.flow === "gup" && shouldMirrorAntrian(req.viewer, pjkFile)
                ? AJUAN_FLOWS.verif
                : null;

            // Get textdata/input data antrian and tabledata
            const ranges = [
                `'${flow.antrianSheet}'!A:A`,
                `'${flow.tableSheet}'!A:A`,
                `'${flow.antrianSheet}'!${flow.counterCell}`  //Getting antrian ID counter
            ]
            if (mirrorFlow) {
                ranges.push(`'${mirrorFlow.antrianSheet}'!A:A`, `'${mirrorFlow.antrianSheet}'!${mirrorFlow.counterCell}`);
            }

            const allRequest = await readRanges(sheets, spreadsheetId, ranges);

            const responseAntrian = allRequest.data.valueRanges[0].values || [];
            const responseTable = allRequest.data.valueRanges[1].values || [];
            const responseId = allRequest.data.valueRanges[2].values || [];

            const lastFilledRows = responseAntrian.length || 0;
            const lastTableRows = responseTable.length || 0;
            const timestamp = getFormattedDate().fullDateTimeFormat;

            const newIdCounter = nextAntrianId(responseAntrian, responseId);

            // File Upload Handling
            let fileLink = "";    //Bupot, GUP/PTUP only
            let pjkLink = "";     //PJK, verifikasi flow only

            if (bupotFile || pjkFile) {
                // Dedicated uploader account, not the shared /auth/google token
                if (!await requireGajiDriveAuth(req, res)) return;
                if (pjkFile && !driveFolderIdVerifPjk) {
                    console.error("DRIVE_FOLDER_ID_VERIF_PJK belum diatur - upload dibatalkan.");
                    return res.status(503).json({ message: "Folder penyimpanan PJK belum dikonfigurasi. Hubungi admin." });
                }
                if (bupotFile) fileLink = await uploadToDriveFolder(bupotFile, driveFolderId);
                if (pjkFile) {
                    const pjkName = buildPjkFileName(
                        req.viewer?.name,
                        jenis.verifValue || jenis.sheetValue,
                        jenis.flow === "gup" ? newIdCounter : formatNomorSpp(nomorSpp),
                        jumlahAjuan
                    );
                    pjkLink = await uploadToDriveFolder(pjkFile, driveFolderIdVerifPjk, pjkName);
                }
            }

            // The verifikasi sheet has no Request Tanggal column, so its row stops at Nominal
            const antrianValues = jenis.flow === "gup"
                ? [newIdCounter, timestamp, namaPengisi, jenis.sheetValue, jumlahAjuan, tanggalAjuan]
                : [newIdCounter, timestamp, namaPengisi, jenis.sheetValue, jumlahAjuan];

            // Posting on the antrian sheet. Lampiran holds Bupot for GUP/PTUP, PJK otherwise.
            const startAntrianRow = lastFilledRows + 1;
            const data = buildAntrianWrites(
                flow,
                startAntrianRow,
                antrianValues,
                userdata,
                jenis.flow === "gup" ? fileLink : pjkLink,
                nomorSpp
            );

            if (mirrorFlow) {
                const mirrorRows = allRequest.data.valueRanges[3].values || [];
                const mirrorId = nextAntrianId(mirrorRows, allRequest.data.valueRanges[4].values || []);
                const mirrorRow = mirrorRows.length + 1;
                data.push(...buildAntrianWrites(
                    mirrorFlow,
                    mirrorRow,
                    [mirrorId, timestamp, namaPengisi, jenis.verifValue, jumlahAjuan],
                    userdata,
                    pjkLink
                ));
            }

            // Posting on the table sheet
            let startTableRow = 0;
            let endTableRow = 0;
            let tableColumnCount = 0;
            if (hasTable) {
                startTableRow = lastTableRows + 3;
                endTableRow = startTableRow + tabledata.length - 1;
                tableColumnCount = tabledata[0].length;
                const tableColumnEnd = getColumnLetter(tableColumnCount - 1);
                data.push({
                    range: `'${flow.tableSheet}'!A${startTableRow}:${tableColumnEnd}${endTableRow}`,
                    values: tabledata,
                });
                // Transaksi ID and row count, the key /bendahara/data-transaksi reads back.
                // Folded into this batch since both values are already known.
                data.push({
                    range: `'${flow.tableSheet}'!X${startTableRow}:Y${startTableRow}`,
                    values: [[`TRANS_ID:${newIdCounter}`, tabledata.length - 1]],
                });
            }

            await writeRanges(sheets, spreadsheetId, data, "RAW");

            if (!hasTable) {
                return res.status(200).json({message: "Data sent successfully."});
            }

            // Coloring Gsheet Table header & giving borders
            // Apply backoff for getting sheet info
            const sheetInfo = await withBackoff(async () => {
                return await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
            });

            const sheet = sheetInfo.data.sheets.find((s) => s.properties.title === flow.tableSheet);
            const sheetId = sheet.properties.sheetId
            const tableBorderStyle = { style: "SOLID", width: 1, color: {red: 0, green: 0, blue: 0,}, }
            const batchUpdateRequest = {
                requests: [
                    // Style Header
                    {
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: startTableRow - 1, // Zero-based index
                                endRowIndex: startTableRow, // Only the first row
                                startColumnIndex: 0, // Start at column A (zero-based)
                                endColumnIndex: tableColumnCount, // Number of columns in tabledata[0]
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: {
                                        red: 0.2, // RGB for blue
                                        green: 0.4,
                                        blue: 0.6,
                                    },
                                    horizontalAlignment: "CENTER",
                                    textFormat: {
                                        bold: true,
                                        foregroundColor: {
                                            red: 1.0,
                                            green: 1.0,
                                            blue: 1.0
                                        }
                                    }
                                },
                            },
                            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
                        },
                    },
                    // Add borders
                    {
                        updateBorders: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: startTableRow - 1, // Zero-based index
                                endRowIndex: endTableRow, // All rows
                                startColumnIndex: 0, // Start at column A (zero-based)
                                endColumnIndex: tableColumnCount, // Number of columns in tabledata[0]
                            },
                            top: tableBorderStyle,
                            bottom: tableBorderStyle,
                            left: tableBorderStyle,
                            right: tableBorderStyle,
                            innerHorizontal: tableBorderStyle,
                            innerVertical: tableBorderStyle,
                        }
                    },
                ],
            };

            // Apply backoff for batch update (coloring and borders)
            await withBackoff(async () => {
                return await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: batchUpdateRequest
                });
            });

            return res.status(200).json({message: "Data sent successfully."});
        } catch (error) {
            console.error("Error in /bendahara/buat-ajuan:", error);
            return res.status(500).json({message: "Failed to process request due to server error."});
        }
    } else {
        return res.status(400).json({message: "Invalid Data."});
    }
})


// Find, get, and return existing data based on user input
app.get("/bendahara/data-transaksi", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const transaksiKeyword = req.query.tableKeyword;
        const flowConfig = getAjuanFlow(req.query.flow);
        // Finding keyword range with data from X & Y columns on the flow's table sheet.
        // Both sheets keep the TRANS_ID marker in X/Y regardless of how wide their data is.
        const matchRange = `'${flowConfig.tableSheet}'!X:Y`;

        // Apply backoff strategy for finding keyword match
        const matchResponse = await readRange(sheets, spreadsheetId, matchRange);

        const matchResponseRows = matchResponse.data.values || [];
        // Matching range with user inputted keyword
        let keywordRow = null;  //To get the keyword row range. Used to grab table data later.
        let keywordTableRow = null;
        for (let i = 0; i < matchResponseRows.length; i++) {
            if (matchResponseRows[i][0] === transaksiKeyword) {
                keywordRow = i + 1 + 1; //Convert to 1-based row index. Add another +1 to exclude header when grabbing table data.
                keywordTableRow = matchResponseRows[i][1];
                break;
            }
        }
        if (!keywordRow || !keywordTableRow){
            return res.status(400).json({ error: "Keyword not found" })
        }
        // Fetch entire table data based on table row data
        let endKeywordTableRow = parseInt(keywordRow) + parseInt(keywordTableRow) - 1; //Adjusting matchResponseRows data so it target rows instead of telling how many rows exist.
        const keywordTableRange = `'${flowConfig.tableSheet}'!A${keywordRow}:${getColumnLetter(flowConfig.tableColumnCount - 1)}${endKeywordTableRow}`;

        // Apply backoff strategy for getting table data
        const keywordTableRespose = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range: keywordTableRange, 
                majorDimension: "ROWS",  // Ensure data is returned row-wise
                valueRenderOption: "UNFORMATTED_VALUE",  // Ensures empty cells are included
            });
        });

        let keywordTableData = keywordTableRespose.data.values || [];
        // Pad every row out to the flow's table width
        const num_Columns = flowConfig.tableColumnCount;
        keywordTableData = keywordTableData.map(row => {
            while (row.length < num_Columns) {
                row.push("");
            }
            return row;
        })

        // Return back to only the grabbed table to frontend
        res.json({ data: keywordTableData, keywordRowPos: keywordRow - 1, keywordEndRow: endKeywordTableRow })
    } catch (error) {
        console.error("Error in /bendahara/data-transaksi:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

// Patch/Updates table data based on edited data from user
app.patch("/bendahara/edit-table", handleAjuanUpload, async (req, res) => {
    //Extracting each part from formData
    const textdata = JSON.parse(req.body.textdata);
    const tabledata = JSON.parse(req.body.tabledata);
    const tablePosition = JSON.parse(req.body.tablePosition);
    const antriPosition = JSON.parse(req.body.antriPosition);
    const lastTableEndRow = JSON.parse(req.body.lastTableEndRow);

    const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
    const flowConfig = getAjuanFlow(req.body.flow);
    // LS Pegawai and LS Platform submit no table at all, so the whole table half of
    // this route has to be skippable
    const hasTable = Array.isArray(tabledata) && tabledata.length > 0;
    // Uploading a replacement supersedes a removal, so a request carrying both is a replace
    const removePjk = req.body.removePjk === "true" && !req.files?.filePjk?.[0];

    if (!textdata || !tabledata || !antriPosition || (hasTable && (!tablePosition || !lastTableEndRow))) {
        return res.status(400).json({message: "Invalid Data."})
    }
    if (flowConfig.key === "verif" && trimmed(req.body.nomorSpp) === "") {
        return res.status(400).json({ message: "Nomor SPP wajib diisi." });
    }
    try {

        // File Upload Handling. Bupot replaces the lampiran on this row; PJK always belongs
        // to the verifikasi side, which for GUP/PTUP is the mirror row on the other sheet.
        let fileLink = "";
        let pjkLink = "";
        const bupotFile = req.files?.file?.[0];
        const pjkFile = req.files?.filePjk?.[0];

        // Removing a PJK deletes the file too, so it needs the same Drive access as uploading
        if (bupotFile || pjkFile || removePjk) {
            // Dedicated uploader account, not the shared /auth/google token
            if (!await requireGajiDriveAuth(req, res)) return;
            if (pjkFile && !driveFolderIdVerifPjk) {
                console.error("DRIVE_FOLDER_ID_VERIF_PJK belum diatur - upload dibatalkan.");
                return res.status(503).json({ message: "Folder penyimpanan PJK belum dikonfigurasi. Hubungi admin." });
            }
            if (bupotFile) fileLink = await uploadToDriveFolder(bupotFile, driveFolderId);
        }

        // Setting antrian data range
        textdata.unshift(getFormattedDate().fullDateTimeFormat);

        // The form works in jenis slugs, the sheet stores labels. They only coincide for
        // GUP/PTUP, so writing the slug straight through would corrupt every other jenis.
        const editJenis = JENIS_PENGAJUAN[String(textdata[2] ?? "").trim()];
        if (!editJenis || editJenis.flow !== flowConfig.key) {
            return res.status(400).json({ message: "Jenis pengajuan tidak dikenal." });
        }
        textdata[2] = editJenis.sheetValue;

        // Column F on the verifikasi antrian is Status, not Request Tanggal. Writing the
        // full row there would blank the status, so the trailing date is dropped instead.
        const antrianValues = flowConfig.hasRequestTanggal ? textdata : textdata.slice(0, 4);

        // Apply backoff strategy for getting antrian data
        // The whole row, not just A - the mirror is matched on the timestamp and nama this row
        // still holds, and the lampiran is the only handle on the file it currently points at.
        // Both are about to be overwritten.
        const antriResponse = await readRange(
            sheets,
            spreadsheetId,
            `'${flowConfig.antrianSheet}'!A3:${flowConfig.antrianLastColumn}`,
        );

        const matchResult = antriResponse.data.values || [];
        let antriRow = null;
        let currentAntrianValues = null;
        let currentLampiran = "";
        let currentUnitKerja = "";
        for (let i = 0; i < matchResult.length; i++) {
            if (String(matchResult[i][0]) === String(antriPosition)) {
                antriRow = i + 1 + 2; //Convert to 1-based row index. +2 to exclude header and start from A3
                currentAntrianValues = matchResult[i];
                const currentCanonical = toCanonicalAntrianRow(matchResult[i], flowConfig);
                currentLampiran = currentCanonical[19];
                currentUnitKerja = currentCanonical[ANTRIAN_UNIT_KERJA_INDEX];
                break;
            }
        }
        if (!antriRow) {
            return res.status(400).json({ error: "Keyword not found" });
        }

        if (pjkFile) {
            const pjkName = buildPjkFileName(
                req.viewer?.name,
                editJenis.verifValue || editJenis.sheetValue,
                flowConfig.key === "gup" ? currentAntrianValues[0] : formatNomorSpp(req.body.nomorSpp),
                textdata[3]
            );
            pjkLink = await uploadToDriveFolder(pjkFile, driveFolderIdVerifPjk, pjkName);
        }
        // Setting table data range
        const startTableRow = tablePosition;
        const endTableRow = hasTable ? startTableRow + tabledata.length - 1 : 0;
        const tableColumnCount = hasTable ? tabledata[0].length : 0;
            // Getting sheet ID
        // Get Sheet IDs with backoff
        const sheetInfo = hasTable ? await withBackoff(async () => {
            return await sheets.spreadsheets.get({ spreadsheetId });
        }) : null;

        const tableSheetId = hasTable
            ? sheetInfo.data.sheets.find((s) => s.properties.title === flowConfig.tableSheet).properties.sheetId
            : null;

        // For Border Style
        const tableBorderStyle = { style: "SOLID", width: 1, color: {red: 0, green: 0, blue: 0,}, }

        // Calculate Row Adjustments
        const endRowDifference = Math.abs(endTableRow - lastTableEndRow);
        let requests = [];

        if (!hasTable) {
            // no table block to resize
        } else if (endTableRow > lastTableEndRow) {
            // ADD empty rows if new data is longer
            requests.push({
                insertDimension: {
                    range: {
                        sheetId: tableSheetId,
                        dimension: "ROWS",
                        startIndex: lastTableEndRow,
                        endIndex: lastTableEndRow + endRowDifference,
                    },
                    inheritFromBefore: false, // Ensures no formatting is copied
                }
            });
            // ADD border to style new empty rows
            requests.push({
                updateBorders: {
                    range: {
                        sheetId: tableSheetId,
                        startRowIndex: lastTableEndRow,  // Start from new rows
                        endRowIndex: lastTableEndRow + endRowDifference, // Apply to inserted rows
                        startColumnIndex: 0, //Starts from A
                        endColumnIndex: tableColumnCount, // Apply to the whole table width
                    },
                    top: tableBorderStyle,
                    bottom: tableBorderStyle,
                    left: tableBorderStyle,
                    right: tableBorderStyle,
                    innerHorizontal: tableBorderStyle,
                    innerVertical: tableBorderStyle,
                }
            })

        } else if (endTableRow < lastTableEndRow) {
            // DELETE extra rows if new data is shorter
            requests.push({
                deleteDimension: {
                    range: {
                        sheetId: tableSheetId,
                        dimension: "ROWS",
                        startIndex: endTableRow,
                        endIndex: lastTableEndRow,
                    },
                }
            });
        }

        // Execute Batch Update for row adjustments first (if any requests remain)
        if (requests.length > 0) {
            await withBackoff(async () => {
                return await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests },
                });
            });
        }

        // Prepare batch data updates (Preserves text formatting with single API call)
        const batchDataUpdates = [
            {
                range: `'${flowConfig.antrianSheet}'!B${antriRow}:${getColumnLetter(antrianValues.length)}${antriRow}`,
                values: [antrianValues]
            }
        ];

        if (flowConfig.pjk && req.body.nomorSpp !== undefined) {
            batchDataUpdates.push({
                range: `'${flowConfig.antrianSheet}'!${flowConfig.pjk.spp}${antriRow}`,
                values: [[formatNomorSpp(req.body.nomorSpp)]]
            });
        }

        if (hasTable) {
            batchDataUpdates.push(
                {
                    range: `'${flowConfig.tableSheet}'!A${startTableRow}:${getColumnLetter(tableColumnCount - 1)}${endTableRow}`,
                    values: tabledata
                },
                {
                    range: `'${flowConfig.tableSheet}'!Y${startTableRow}`,
                    values: [[`${tabledata.length - 1}`]]
                }
            );
        }

        // Add file link update if file was uploaded
        if (fileLink) {
            batchDataUpdates.push({
                range: `'${flowConfig.antrianSheet}'!${flowConfig.lampiranColumn}${antriRow}`,
                values: [[fileLink]]
            });
        }

        // Where this pengajuan's PJK lives: on its own row for a verifikasi jenis, on the
        // mirror row on the other sheet for GUP/PTUP
        let pjkTarget = null;
        if (flowConfig.key === "gup") {
            // The mirror row is matched on the values this row had before the edit, so it has
            // to be re-synced here or the two drift apart and can never be paired again.
            const mirrorFlow = AJUAN_FLOWS.verif;
            const mirrorResponse = await readRanges(sheets, spreadsheetId, [
                `'${mirrorFlow.antrianSheet}'!A:${mirrorFlow.antrianLastColumn}`,
                `'${mirrorFlow.antrianSheet}'!${mirrorFlow.counterCell}`,
            ]);
            const mirrorRows = mirrorResponse.data.valueRanges[0].values || [];
            const mirrorMatches = findMirrorAntrianMatches(mirrorRows, currentAntrianValues);
            // Same four columns the mirror was created with, jenis under its verif label
            const mirrorValues = [textdata[0], textdata[1], editJenis.verifValue || editJenis.sheetValue, textdata[3]];

            if (mirrorMatches.length === 1) {
                const mirrorMatch = mirrorMatches[0];
                batchDataUpdates.push({
                    range: `'${mirrorFlow.antrianSheet}'!B${mirrorMatch.row}:E${mirrorMatch.row}`,
                    values: [mirrorValues]
                });
                pjkTarget = { flow: mirrorFlow, row: mirrorMatch.row, currentLink: mirrorMatch.canonical[19] };
            } else if (mirrorMatches.length === 0 && pjkLink) {
                // GUP/PTUP only started registering a mirror when the PJK upload shipped, so
                // rows submitted before that have no verifikasi row for the PJK to hang off.
                // Register one now, exactly as buat-ajuan would have, rather than refusing an
                // upload the user can never make succeed. Only when a PJK is actually being
                // attached - a plain edit has no reason to move an old row into the PJK queue.
                const mirrorRow = mirrorRows.length + 1;
                const mirrorId = nextAntrianId(mirrorRows, mirrorResponse.data.valueRanges[1].values || []);
                batchDataUpdates.push(...buildAntrianWrites(
                    mirrorFlow,
                    mirrorRow,
                    [mirrorId, ...mirrorValues],
                    currentUnitKerja || req.viewer?.name || "",
                    pjkLink
                ));
                console.log(`Registered missing mirror row ${mirrorRow} for antrian ${antriPosition}.`);
                pjkTarget = { flow: mirrorFlow, row: mirrorRow, currentLink: "" };
            } else if (mirrorMatches.length > 1) {
                // Cannot tell which row is the mirror; touching the wrong one is worse than nothing
                console.warn(`Mirror row for antrian ${antriPosition}: ${mirrorMatches.length} matches, skipping mirror update.`);
            }
        } else {
            pjkTarget = { flow: flowConfig, row: antriRow, currentLink: currentLampiran };
        }

        // A missing mirror is registered above, so what is left here is a mirror that cannot be
        // identified - either several rows match, or there is nothing to remove the PJK from.
        if ((pjkLink || removePjk) && !pjkTarget) {
            return res.status(409).json({ message: "Baris verifikasi untuk pengajuan ini tidak dapat dipastikan, PJK tidak dapat diperbarui. Hubungi admin." });
        }

        // Whatever the lampiran cells stop pointing at gets removed from Drive, so replacing
        // a file does not leave the superseded one behind
        const linksToDelete = [];
        if (pjkTarget && (removePjk || pjkLink)) {
            batchDataUpdates.push({
                range: `'${pjkTarget.flow.antrianSheet}'!${pjkTarget.flow.lampiranColumn}${pjkTarget.row}`,
                values: [[removePjk ? "" : pjkLink]]
            });
            if (pjkTarget.currentLink && pjkTarget.currentLink !== pjkLink) {
                linksToDelete.push(pjkTarget.currentLink);
            }
        }
        // The Bupot sits on this row and is only ever replaced, never removed
        if (fileLink && currentLampiran && currentLampiran !== fileLink && flowConfig.key === "gup") {
            linksToDelete.push(currentLampiran);
        }

        // Execute batch data update with backoff (preserves text format)
        await writeRanges(sheets, spreadsheetId, batchDataUpdates, "RAW");

        console.log("✅ Update successful!");

        // Drive last: the sheet no longer points at these files, so a failure here leaves
        // unreferenced files rather than links to something already deleted
        const failed = await deleteDriveFiles(linksToDelete);
        if (failed.length > 0) {
            return res.status(200).json({
                message: "Data tersimpan, tetapi berkas lama gagal dihapus dari Drive.",
                warning: failed.join("; ")
            });
        }

        res.status(200).json({ message: "Table updated successfully." });

    } catch (error) {
        console.error("Error in /bendahara/edit-table:", error);
        res.status(500).json({ message: "Server error." });
    }
})

// Delete Antrian and Tabledata based on keyword
app.delete("/bendahara/delete-ajuan", async (req, res) => {
    const delKeyword = req.query.tableKeyword;
    const delTableKeyword = `TRANS_ID:${delKeyword}`
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const flowConfig = getAjuanFlow(req.query.flow);
        // Finding keyword range with data from X & Y columns on the flow's table sheet, and
        // the full row on its antrian sheet - D carries the Jenis, which says whether a table
        // exists, and the lampiran is the only handle on the uploaded file. For GUP/PTUP the
        // mirror sheet rides along in the same batch so the mirror needs no second read.
         const isGupFlow = flowConfig.key === "gup";
         const matchRange = [
            `'${flowConfig.tableSheet}'!X:Y`,  //Table data Range
            `'${flowConfig.antrianSheet}'!A:${flowConfig.antrianLastColumn}`, //Antrian data Range
            ];
         if (isGupFlow) {
             matchRange.push(`'${AJUAN_FLOWS.verif.antrianSheet}'!A:${AJUAN_FLOWS.verif.antrianLastColumn}`);
         }

         // The sheet ids are needed either way, so that lookup runs alongside the read
         // rather than after it
         const [matchResponse, sheetInfo] = await Promise.all([
             readRanges(sheets, spreadsheetId, matchRange),
             withBackoff(async () => {
                 return await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
             }),
         ]);

         const responseTable = matchResponse.data.valueRanges[0].values || [];
         const responseAntrian = matchResponse.data.valueRanges[1].values || [];
         const responseMirror = isGupFlow ? (matchResponse.data.valueRanges[2].values || []) : [];
         // Matching range with user inputted keyword
         let keywordRow = null;  //To get the keyword row range. Used to grab table data later.
         let keywordTableRow = null;  //To get how long the row is on the keyword table data.
         let keywordAntrian = null; //To get antrian row range.
         let antrianRowValues = null;
         for (let i = 0; i < responseTable.length; i++) {
             if (responseTable[i][0] === delTableKeyword) {
                 keywordRow = i + 1 ; //Convert to 1-based row index.
                 keywordTableRow = responseTable[i][1]; //Getting the number of rows stated on Column Y
                 break;
             }
         }
         for (let i = 0; i < responseAntrian.length; i++) {
            if (String(responseAntrian[i][0]) === String(delKeyword)) {
                keywordAntrian = i + 1; //Convert to 1-based row index
                antrianRowValues = responseAntrian[i];
                break;
            }
         }
         if (!keywordAntrian){
             return res.status(400).json({ error: "Keyword not found" })
         }
         // LS Pegawai and LS Platform never wrote a table block. Anything else that
         // should have one but has no findable marker is a mismatch, not an empty table -
         // deleting only the antrian row there would orphan the table.
         const jenis = resolveJenis(antrianRowValues?.[ANTRIAN_JENIS_INDEX]);
         const expectsTable = jenis ? jenis.hasTable : true;
         if (expectsTable && (!keywordRow || !keywordTableRow)) {
             return res.status(400).json({ error: "Keyword not found" })
         }
         const deleteTable = expectsTable && keywordRow && keywordTableRow;
        //  Delete Rows
        const findSheetId = (title) => sheetInfo.data.sheets.find((s) => s.properties.title === title).properties.sheetId;
        const antriSheetId = findSheetId(flowConfig.antrianSheet);
            // Create the batch update request
        const batchRequest = {
            requests: [
                { // Delete row in Antri Sheet
                    deleteDimension: {
                        range: {
                            sheetId: antriSheetId,
                            dimension: "ROWS",
                            startIndex: keywordAntrian - 1,  //Zero-based index
                            endIndex: keywordAntrian
                        }
                    }
                }
            ]
        };

        if (deleteTable) {
            batchRequest.requests.push({ // Delete row in Table Sheet
                deleteDimension: {
                    range: {
                        sheetId: findSheetId(flowConfig.tableSheet),
                        dimension: "ROWS",
                        startIndex: keywordRow - 3, //Zero based index. Add -2 to delete two columns above
                        endIndex: parseInt(keywordRow) + parseInt(keywordTableRow) //Zero based index.
                    }
                }
            });
        }

        // A GUP/PTUP pengajuan also registered a mirror row on 'Write Antrian Verif' under
        // its own id, so deleting only the original would leave that mirror behind. It is
        // matched on timestamp + nama; anything but a single hit is left alone rather than
        // risk deleting an unrelated row.
        const mirrorMatch = isGupFlow
            ? matchMirrorAntrianRow(responseMirror, antrianRowValues, "delete")
            : null;
        if (mirrorMatch) {
            batchRequest.requests.push({
                deleteDimension: {
                    range: {
                        sheetId: findSheetId(AJUAN_FLOWS.verif.antrianSheet),
                        dimension: "ROWS",
                        startIndex: mirrorMatch.row - 1,
                        endIndex: mirrorMatch.row
                    }
                }
            });
        }

        // Every file this pengajuan uploaded: the Bupot on its own row, and the PJK which
        // for GUP/PTUP only ever lived on the mirror row
        const linksToDelete = [toCanonicalAntrianRow(antrianRowValues, flowConfig)[19]];
        if (mirrorMatch) linksToDelete.push(mirrorMatch.canonical[19]);
        // Send the batch update request with backoff
        await withBackoff(async () => {
            return await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: batchRequest
            });
        });

        console.log("Successfully delete data.")

        // Drive last, for the same reason as the edit route: a failure here leaves
        // unreferenced files rather than rows pointing at something already deleted
        const driveReady = linksToDelete.some(Boolean) ? await ensureGajiDriveReady() : true;
        const failed = driveReady
            ? await deleteDriveFiles(linksToDelete)
            : ["akun Drive belum terhubung"];
        if (failed.length > 0) {
            return res.status(200).json({
                message: "Pengajuan dihapus, tetapi berkas di Drive gagal dihapus.",
                warning: failed.join("; ")
            });
        }

        res.status(200).json({ message: "Table Deleted successfully." });

    } catch (error) {
        console.error("Error in /bendahara/delete-ajuan:", error);
        res.status(500).json({ message: "Server error." });
    }
})

//Kelola-Pengajuan handlers
app.get("/bendahara/kelola-ajuan", async (req, res) => {
    const { MonthDateFormat, PrevMonthDate } = getFormattedDate();
    const datePrefixes = [MonthDateFormat, PrevMonthDate];
      try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');

        // Check if selected year is different from current year
        const selectedYear = req.query.year || req.body.year || new Date().getFullYear().toString();
        const currentYear = new Date().getFullYear().toString();
        const isHistoricalYear = selectedYear !== currentYear;

        // Column B drives the date filter; the verifikasi antrian rides alongside it so the
        // PJK status of each mirror row costs no extra round trip.
        // REFACTOR: when no row at all can park on the PJK, nothing reads that PJK status,
        // so the whole mirror sheet was being fetched and thrown away on every page load.
        const [response, mirrorResponse] = await Promise.all([
            readRange(sheets, spreadsheetId, "'Write Antrian'!B:B"),
            PILOT_ANY_MENUNGGU_PJK ? readRange(
                sheets,
                spreadsheetId,
                `'${AJUAN_FLOWS.verif.antrianSheet}'!A:${AJUAN_FLOWS.verif.antrianLastColumn}`,
            ) : null,
        ]);

        // Get all rows
        const allRows = response.data.values || [];

        // Filter rows based on year selection
        let filteredRows;
        if (isHistoricalYear) {
            // If viewing historical year, show all data (no date filter)
            filteredRows = allRows
                .map((row, index) => ({ date: row[0], rowIndex: index + 1 }))
                .filter(row => row.date); // Only filter out empty dates
        } else {
            // If current year, filter by this month and previous month
            filteredRows = allRows
                .map((row, index) => ({ date: row[0], rowIndex: index + 1 }))
                .filter(row => row.date && datePrefixes.some(prefix => row.date.startsWith(prefix)));
        }

        // Error handling if no keyword found
        if (filteredRows.length === 0) {
            return res.status(404).json({ error: "No matching rows found." });
        }
        // Sort rows in reverse order (latest dates first)
        const reversedRows = filteredRows.reverse();

        // Fetch full row data using continuous range to avoid URL length issues
        const rowIndices = reversedRows.map(row => row.rowIndex);
        const minRow = Math.min(...rowIndices);
        const maxRow = Math.max(...rowIndices);

        const batchGetResponse = await readRange(sheets, spreadsheetId, `'Write Antrian'!A${minRow}:T${maxRow}`);

        const allRowsData = batchGetResponse.data.values || [];

        // Extract only the rows we need based on rowIndex
        let rowData = reversedRows.map(row => {
            const dataIndex = row.rowIndex - minRow;
            return allRowsData[dataIndex] || [];
        });
        const num_Columns = 20;
        rowData = rowData.map(row => {
            while (row.length < num_Columns) {
                row.push("");
            }
            return row;
        });

        // Function to filter arrays
        function filterByStatus(array, status) {
            return array.filter(row => row.includes(status));
        }

        // PJK status of each mirror row, keyed the same way delete and edit pair them
        const pjkByKey = new Map();
        for (const row of mirrorResponse?.data.values || []) {
            pjkByKey.set(mirrorRowKey(row?.[1], row?.[2]), [row?.[PJK_COLUMN.substansi], row?.[PJK_COLUMN.kelengkapan]]);
        }

        // Bendahara is done but the verifikator has not signed off yet. A row with no mirror
        // has no PJK to wait on, so it stays where it was.
        const isOk = value => trimmed(value) === "OK";
        const waitingPjk = (row) => {
            // Pilot hold: only a pilot satker's row waits on the verifikator. Everyone else
            // falls through to the section its own status column puts it in, the way it did
            // before the PJK step existed.
            if (PILOT_SKIP_MENUNGGU_PJK && !isPilotSatker(row[ANTRIAN_UNIT_KERJA_INDEX])) return false;
            const pjk = pjkByKey.get(mirrorRowKey(row[1], row[2]));
            return !!pjk && isOk(row[12]) && isOk(row[13])
                && !(PJK_VERIFIED_VALUES.includes(String(pjk[0] ?? "").trim())
                    && PJK_VERIFIED_VALUES.includes(String(pjk[1] ?? "").trim()));
        };

        const sedangAll = filterByStatus(rowData, "Sedang Di Verifikasi");
        const sudahAll = filterByStatus(rowData, "Sudah Di Verifikasi");
        // Substansi/Kelengkapan appended past the 20 'Write Antrian' columns, so every
        // index the aksi page reads keeps its meaning
        const menungguPJK = [...sedangAll, ...sudahAll].filter(waitingPjk)
            .map(row => [...row, ...(pjkByKey.get(mirrorRowKey(row[1], row[2])) || ["", ""])]);

        res.json({ data: [
            filterByStatus(rowData, "Dalam Antrian"),
            sedangAll.filter(row => !waitingPjk(row)),
            sudahAll.filter(row => !waitingPjk(row)),
            filterByStatus(rowData, "Diajukan Hari Ini"),
            filterByStatus(rowData, "Sudah Diterbitkan DRPP"),
            filterByStatus(rowData, "Sudah Diajukan ke KPPN"),
            menungguPJK,
        ] });

      } catch (error) {
            console.error("Error in /bendahara/kelola-ajuan:", error);
            res.status(500).json({ error: "Failed to fetch data." });
      } 
})

//Aksi-Pengajuan Handler
app.post("/bendahara/aksi-ajuan", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const {updatedAntriData, monitoringDrppData, documentData} = req.body
        if (!updatedAntriData) {
            return res.status(400).json({ message: "Invalid or missing data." });
        }

        const {no_antri, ajuan_verifikasi, tgl_verifikasi, status_pajak, sedia_anggaran, tgl_setuju, drpp, spp, spm, catatan} = updatedAntriData;

        //Handling Write Antrian Sheet update with backoff
        // A:N so the pre-update satker (L) and pajak/anggaran status (M/N) are
        // available for the notification check below - no extra API call. The verif
        // antrian rides along so the mirror row can be found without a second read.
        const getAntrianResponse = await readRanges(
            sheets,
            spreadsheetId,
            [
                "'Write Antrian'!A:N",
                `'${AJUAN_FLOWS.verif.antrianSheet}'!A:${AJUAN_FLOWS.verif.antrianLastColumn}`,
            ],
        );

        const allRows = getAntrianResponse.data.valueRanges[0].values || [];
        const mirrorRows = getAntrianResponse.data.valueRanges[1].values || [];
        let rowIndex = null;

        // Find the matching row based on no_antri
        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i][0] === no_antri) { // Matching row found
                rowIndex = i + 1; // Convert to 1-based index
                break;
            }
        }

        if (!rowIndex) {
            return res.status(400).json({ error: "Keyword not found in column A" });
        }

        const ajuanVerifikasiValue = ajuan_verifikasi === "TRUE" ? getFormattedDate().fullDateFormat : "";

        // Update multiple columns in a single request. If tgl_verifikasi exist then don't update tgl mulai verif.
        const updateData = [
            [`'Write Antrian'!P${rowIndex}`, tgl_verifikasi],
            [`'Write Antrian'!M${rowIndex}`, status_pajak],
            [`'Write Antrian'!N${rowIndex}`, sedia_anggaran],
            [`'Write Antrian'!G${rowIndex}`, tgl_setuju],
            [`'Write Antrian'!I${rowIndex}`, drpp],
            [`'Write Antrian'!J${rowIndex}`, spp],
            [`'Write Antrian'!K${rowIndex}`, spm],
            [`'Write Antrian'!Q${rowIndex}`, catatan],
            tgl_verifikasi === "" ? [`'Write Antrian'!O${rowIndex}`, ajuanVerifikasiValue]  : null, // Condition for column O
        ].filter(item => item !== null); //filter null to exclude it from the array


        await writeRanges(
            sheets,
            spreadsheetId,
            updateData.map(([range, value]) => ({
                range,
                values: [[value]]
            })),
            "USER_ENTERED",
        );

        // GUP/PTUP keep their Nomor SPP only here, so the mirror the PJK screen reads
        // shows it blank without this. Written RAW and on its own - USER_ENTERED above
        // would parse "00041" down to 41.
        const mirrorMatch = matchMirrorAntrianRow(mirrorRows, allRows[rowIndex - 1], "update");
        if (mirrorMatch) {
            const { antrianSheet, pjk } = AJUAN_FLOWS.verif;
            await writeRange(
                sheets,
                spreadsheetId,
                `'${antrianSheet}'!${pjk.spp}${mirrorMatch.row}`,
                [[formatNomorSpp(spp)]],
                "RAW",
            );
        }

        // Handling Monitoring DRPP Sheet update
        if (monitoringDrppData) {
            const {trans_id, satker, nominal, jenis, spmDrpp} = monitoringDrppData;

            //Split drpp and nominal into arrays
            const drppArray = drpp.split(", ").map(num => num.trim());
            const nominalArray = nominal.split(", ").map(num => num.trim());
            const spmDrppArray = spmDrpp.split(", ").map(num => num.trim());

            if (drppArray.length !== nominalArray.length) {
                return res.status(400).json({message: "DRPP and Nominal data mismatch."});
            }

            // Apply backoff for getting monitoring data
            const getMonitoringResponse = await readRange(sheets, spreadsheetId, "'Monitoring DRPP'!B:I");

            const monitoringRows = getMonitoringResponse.data.values || [];
            let existingStartRow = null;
            let existingRowCount = 0;
            let existingColumnCData = [];
            let existingColumnHData = [];
            let existingColumnIData = [];

            // Find if `trans_id` already exists
            for (let i = 0; i < monitoringRows.length; i++) {
                if (monitoringRows[i][0] === trans_id) {
                    if (!existingStartRow) {
                        existingStartRow = i + 1; // Convert to 1-based index (first occurrence)
                    }
                    existingRowCount++; // Count all rows belonging to the same trans_id
                    // Store existing column C data (index 1)
                    existingColumnCData.push(monitoringRows[i][1] || "");
                    // Store existing column H data (index 6)
                    existingColumnHData.push(monitoringRows[i][6] || "");
                    // Store existing column I data (index 7)
                    existingColumnIData.push(monitoringRows[i][7] || "");
                } else if (existingStartRow) {
                    break; // Stop counting when a new `trans_id` appears
                }
            }

            const newRowCount = drppArray.length;

            // Prepare the new rows
            let rowsToWrite = [];
            for (let i = 0; i < newRowCount; i++) {
                // Determine column C value: use existing data if available and not empty, otherwise use fullDateFormat
                let columnCValue = getFormattedDate().fullDateFormat;
                if (existingStartRow && i < existingColumnCData.length && existingColumnCData[i] && existingColumnCData[i].trim() !== "") {
                    columnCValue = existingColumnCData[i]; // Keep existing column C data
                }
                
                // Determine column H value: only write "Belum" if existing value is "Belum", otherwise preserve existing
                let columnHValue = "Belum";
                if (existingStartRow && i < existingColumnHData.length && existingColumnHData[i] && existingColumnHData[i].trim() !== "Belum") {
                    columnHValue = existingColumnHData[i]; // Keep existing column H data if not "Belum"
                }
                
                // Determine column I value: only write "Belum" if existing value is "Belum", otherwise preserve existing
                let columnIValue = "Belum";
                if (existingStartRow && i < existingColumnIData.length && existingColumnIData[i] && existingColumnIData[i].trim() !== "Belum") {
                    columnIValue = existingColumnIData[i]; // Keep existing column I data if not "Belum"
                }
                
                rowsToWrite.push([
                    trans_id, // Trans ID is written on all rows
                    columnCValue, // Column C - conditional based on existing data
                    satker, // Column D
                    drppArray[i], // Column E
                    spmDrppArray[i], // Column F
                    nominalArray[i], // Column G
                    columnHValue, // Column H - conditional based on existing data
                    columnIValue, // Column I - conditional based on existing data
                    jenis.toUpperCase(), // Column J
                ]);
            }

            // Find Sheets ID with backoff
            const sheetInfo = await withBackoff(async () => {
                return await sheets.spreadsheets.get({ spreadsheetId });
            });

            const DrppSheetId = sheetInfo.data.sheets.find((s) => s.properties.title === "Monitoring DRPP").properties.sheetId;

            //Operator to add and delete empty row
            if (existingStartRow) {
                if (newRowCount > existingRowCount) {
                    // INSERT rows before updating (so there is space) with backoff
                    await withBackoff(async () => {
                        return await sheets.spreadsheets.batchUpdate({
                            spreadsheetId,
                            resource: {
                                requests: [
                                    {
                                        insertDimension: {
                                            range: {
                                                sheetId: DrppSheetId,
                                                dimension: "ROWS",
                                                startIndex: existingStartRow + existingRowCount - 1,
                                                endIndex: existingStartRow + newRowCount - 1
                                            },
                                            inheritFromBefore: false
                                        }
                                    }
                                ]
                            }
                        });
                    });
                } else if (newRowCount < existingRowCount) {
                    // DELETE excess rows with backoff
                    await withBackoff(async () => {
                        return await sheets.spreadsheets.batchUpdate({
                            spreadsheetId,
                            resource: {
                                requests: [
                                    {
                                        deleteDimension: {
                                            range: {
                                                sheetId: DrppSheetId,
                                                dimension: "ROWS",
                                                startIndex: existingStartRow + newRowCount - 1,
                                                endIndex: existingStartRow + existingRowCount - 1
                                            }
                                        }
                                    }
                                ]
                            }
                        });
                    });
                }

                // Update the rows with backoff
                const targetRange = `Monitoring DRPP!B${existingStartRow}:J${existingStartRow + newRowCount - 1}`;
                await writeRange(sheets, spreadsheetId, targetRange, rowsToWrite, "RAW");

            } else {
                // If trans_id doesn't exist, append new rows with backoff
                const lastFilledRow = monitoringRows.length + 1;
                const targetRange = `Monitoring DRPP!B${lastFilledRow}:J${lastFilledRow + newRowCount - 1}`;
                await writeRange(sheets, spreadsheetId, targetRange, rowsToWrite, "RAW");
            }
        }

        // Notify the satker. Isolated: the sheet update already succeeded, so a
        // failed notification must not turn this into an error the admin retries.
        try {
            const antrianRow = allRows[rowIndex - 1] || []; // rowIndex is 1-based
            const satker = String(antrianRow[11] || "").trim();
            const pajak = String(status_pajak || "").trim();
            const anggaran = String(sedia_anggaran || "").trim();

            // Blank means "belum dicek", not a problem
            const hasProblem = (pajak !== "" && pajak !== "OK") ||
                               (anggaran !== "" && anggaran !== "OK");
            // Only on change, else re-saving the form would send a duplicate
            const changed = pajak !== String(antrianRow[12] || "").trim() ||
                            anggaran !== String(antrianRow[13] || "").trim();

            if (hasProblem && changed && satker) {
                // Keterangan line is dropped entirely when catatan is empty
                const keterangan = String(catatan || "").trim();
                const deskripsi = `No. Antri ${no_antri} - ${getFormattedDate().fullDateTimeVerifFormat.split(' ')[0]}` +
                                  (keterangan ? `\nKeterangan: ${keterangan}` : "");

                await writeNotification(
                    spreadsheetId,
                    satker,
                    "Ada Masalah di Pajak/Anggaran",
                    deskripsi
                );
            }
        } catch (notifError) {
            console.error("Gagal menulis notifikasi (aksi-ajuan):", notifError);
        }

        res.json({ message: "Data updated successfully!" });

    } catch (error) {
        console.error("Error in /bendahara/aksi-ajuan:", error);
        res.status(500).json({ error: "Failed to update data." });
    }
})

//Fetch monitoring data for Aksi-Pengajuan
app.get("/bendahara/get-ajuan", async (req, res) => {
    const { trans_id, spm } = req.query;
    if (!trans_id) {
        return res.status(400).json({ error: "Missing trans_id" });
    }

    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        // Fetch the relevant columns with backoff
        const range = "Monitoring DRPP!B2:G";
        const sheetResponse = await readRange(sheets, spreadsheetId, range);

        const rows = sheetResponse.data.values || [];
        if (rows.length === 0) {
            return res.status(404).json({ error: "No data found" });
        }

        let matchedRows = [];
        let found = false; // Flag to check if we found trans_id

        for (const row of rows) {
            const rowTransId = row[0]?.trim(); // Convert to string and trim spaces

            if (rowTransId === trans_id.toString()) {
                found = true; // Start collecting rows
            } else if (found && rowTransId) {
                break; // Stop collecting if a new trans_id appears
            }

            if (found) {
                matchedRows.push({
                    drpp: row[3] || "",
                    nominal: row[5] || "",
                    spp: row[4] || "",
                    spm: spm !== "" ? row[4] : "",
                });
            }
        }

        if (matchedRows.length === 0) {
            return res.status(404).json({ error: "No matching data found" });
        }

        return res.status(200).json({ data: matchedRows });

    } catch (error) {
        console.error("Error in /bendahara/get-ajuan:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

//Monitoring DRPP component handlers
app.get("/bendahara/monitoring-drpp", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { page = 1, limit = 10, filterKeyword, cariNomor } = req.query;
        
        // Parse cariNomor if it exists
        let parsedCariNomor = null;
        if (cariNomor) {
            try {
                parsedCariNomor = typeof cariNomor === 'string' ? JSON.parse(cariNomor) : cariNomor;
            } catch (e) {
                parsedCariNomor = null;
            }
        }

        // Fetch total rows based on A column with backoff
        const getAllRowsResponse = await readRange(sheets, spreadsheetId, "'Monitoring DRPP'!A:K");

        const totalRows = getAllRowsResponse.data.values || [];
        const totalRowCount = totalRows.length;

        let allRows = totalRows.map((row, index) => ({
            satker: row[3] || "",
            pungut: row[7] || "",
            setor: row[8] || "",
            date: row[2] || "",
            rowIndex: index + 1,
        }));

        //Filter rows based on keyword
        if (filterKeyword.satker !== "Master") {
            allRows = allRows.filter(row => row.satker.startsWith(filterKeyword.satker));
        }
        if (filterKeyword.pungutan !== "") {
            allRows = allRows.filter(row => row.pungut.startsWith(filterKeyword.pungutan));
        }
        if (filterKeyword.setoran !== "") {
            allRows = allRows.filter(row => row.setor.startsWith(filterKeyword.setoran));
        }
        if (filterKeyword.month !== "") {
            allRows = allRows.filter(row => {
                // Extract month from date string (format: yyyy-mm-dd)
                const dateParts = row.date.split('-');
                if (dateParts.length >= 2) {
                    const month = dateParts[1];
                    return month === filterKeyword.month;
                }
                return false;
            });
        }

        //Get Total count of pajak status
        // Get column H and I from row 3 downward
        const response = await readRange(sheets, spreadsheetId, "'Monitoring DRPP'!H:I");

        const rows = response.data.values || [];

        let hBelum = 0, hSudah = 0;
        let iBelum = 0, iSudah = 0;

        rows.forEach(row => {
            const colH = row[0]?.trim();
            const colI = row[1]?.trim();

            if (colH === "Belum") hBelum++;
            else hSudah++;

            if (colI === "Belum") iBelum++;
            else iSudah++;
        });

        const countData = [hBelum, hSudah, iBelum, iSudah, totalRowCount]

        // Handle cariNomor search logic
        if (parsedCariNomor && (parsedCariNomor.spm || parsedCariNomor.spby || parsedCariNomor.drpp || parsedCariNomor.bupot)) {

            if (parsedCariNomor.spm && parsedCariNomor.spm !== "") {
                // Search for SPM in column index 5 (column F)
                const spmValue = parsedCariNomor.spm;
                const matchedRows = [];

                const normalizedSpmValue = spmValue.padStart(5, '0');
                
                totalRows.forEach((row, index) => {
                    const columnFValue = row[5] || "";
                    // Check if the column value matches (exact match or padded match)
                    if (columnFValue === spmValue || columnFValue === normalizedSpmValue) {
                        matchedRows.push({
                            data: row,
                            rowIndex: index + 1
                        });
                    }
                });
                
                // Filter to get only rows from row 3 downward
                const visibleMatchedRows = matchedRows.filter(row => row.rowIndex >= 3);

                if (visibleMatchedRows.length > 0) {
                    const resultData = visibleMatchedRows.map(row => {
                        const values = [...row.data];
                        while (values.length < 11) {
                            values.push("");
                        }
                        return values.slice(0, -1); // Remove last column like paginatedSlicedDRPP
                    });
                    
                    return res.json({ 
                        data: resultData, 
                        realAllDRPPRows: visibleMatchedRows.length, 
                        countData: countData,
                        fullData: visibleMatchedRows.map(row => {
                            const values = [...row.data];
                            while (values.length < 11) {
                                values.push("");
                            }
                            return values;
                        })
                    });
                } else {
                    return res.json({ 
                        data: [], 
                        realAllDRPPRows: 0, 
                        countData: {}, 
                        fullData: []
                    });
                }
            } else if (parsedCariNomor.spby && parsedCariNomor.spby !== "") {
                // Get all data from column D
                const getAllSpby = await readRange(sheets, spreadsheetId, "'Write Table'!D:D");

                const spbyRows = getAllSpby.data.values || [];
                const spbyValue = parsedCariNomor.spby;
                let matchedRowPosition = -1;

                // Find first match of spby in column D
                for (let i = 0; i < spbyRows.length; i++) {
                    const cellValue = spbyRows[i][0] || "";
                    if (cellValue.includes(spbyValue)) {
                        matchedRowPosition = i + 1; // Convert to 1-based indexing
                        break;
                    }
                }

                if (matchedRowPosition === -1) {
                    return res.json({ 
                        data: [], 
                        realAllDRPPRows: 0, 
                        countData: countData, 
                        fullData: []
                    });
                }

                // Calculate search range (from matched row up to 170 rows above)
                const searchStartRow = Math.max(1, matchedRowPosition - 150);
                const searchEndRow = matchedRowPosition;
                
                // Get both column D and X data for the search range in one request
                const searchRange = `'Write Table'!D${searchStartRow}:X${searchEndRow}`;
                const searchResponse = await readRange(sheets, spreadsheetId, searchRange);

                const searchData = searchResponse.data.values || [];
                let nomorSpbyRowPosition = -1;
                let transId = null;

                // Find "Nomor SPBY" exact match in column D within the range
                for (let i = searchData.length - 1; i >= 0; i--) { // Search from bottom to top (nearest to matched row)
                    if (searchData[i][0] === "Nomor SPBY") {
                        nomorSpbyRowPosition = searchStartRow + i;
                        // Get TRANS_ID from column X
                        const columnXValue = searchData[i][20] || ""; // X is at index 20 in D:X range
                        
                        // Extract number from "TRANS_ID:xx" format
                        const transIdMatch = columnXValue.match(/TRANS_ID:(\d+)/);
                        if (transIdMatch) {
                            transId = transIdMatch[1]; // Extract just the number as string
                        }
                        break;
                    }
                }

                if (!transId) {
                    return res.json({ 
                        data: [], 
                        realAllDRPPRows: 0, 
                        countData: countData, 
                        fullData: []
                    });
                }

                // Find matches in Monitoring DRPP column B using already fetched totalRows
                const matchedDrppRows = [];
                totalRows.forEach((row, index) => {
                    const columnBValue = row[1] || ""; // Column B index 1
                    if (columnBValue === transId) {
                        matchedDrppRows.push({
                            data: row,
                            rowIndex: index + 1
                        });
                    }
                });

                // Filter to get only rows from row 3 downward
                const visibleMatchedDrppRows = matchedDrppRows.filter(row => row.rowIndex >= 3);

                if (visibleMatchedDrppRows.length > 0) {
                    const resultData = visibleMatchedDrppRows.map(row => {
                        const values = [...row.data];
                        while (values.length < 11) {
                            values.push("");
                        }
                        return values.slice(0, -1); // Remove last column like paginatedSlicedDRPP
                    });
                    
                    return res.json({ 
                        data: resultData, 
                        realAllDRPPRows: visibleMatchedDrppRows.length, 
                        countData: countData,
                        fullData: visibleMatchedDrppRows.map(row => {
                            const values = [...row.data];
                            while (values.length < 11) {
                                values.push("");
                            }
                            return values;
                        })
                    });
                } else {
                    return res.json({ 
                        data: [], 
                        realAllDRPPRows: 0, 
                        countData: countData, 
                        fullData: []
                    });
                }
            } else if (parsedCariNomor.drpp && parsedCariNomor.drpp !=="") {
                // Search for DRPP in column index 4 (column E)
                const drppValue = parsedCariNomor.drpp;
                const matchedRow = [];

                const normalizedDrppValue = drppValue.padStart(5, '0');

                totalRows.forEach((row, index) => {
                    const columnFValue = row[4] || "";
                    // Check if the column value matches (exact match or padded match)
                    if (columnFValue === drppValue || columnFValue === normalizedDrppValue) {
                        matchedRow.push({
                            data: row,
                            rowIndex: index + 1
                        });
                    }
                });

                // Filter to get only rows from row 3 downward
                const drppMatchedRows = matchedRow.filter(row => row.rowIndex >= 3);

                if (drppMatchedRows.length > 0) {
                    const resultData = drppMatchedRows.map(row => {
                        const values = [...row.data];
                        while (values.length < 11) {
                            values.push("");
                        }
                        return values.slice(0, -1); // Remove last column like paginatedSlicedDRPP
                    });

                    return res.json({
                        data: resultData,
                        realAllDRPPRows: drppMatchedRows.length,
                        countData: countData,
                        fullData: drppMatchedRows.map(row => {
                            const values = [...row.data];
                            while (values.length < 11) {
                                values.push("");
                            }
                            return values;
                        })
                    });
                } else {
                    return res.json({
                        data: [],
                        realAllDRPPRows: 0,
                        countData: {},
                        fullData: []
                    });
                }
            } else if (parsedCariNomor.bupot && parsedCariNomor.bupot !== "") {
                // Search for Bupot/Faktur in col I and Q
                const getAllBupot = await readRange(sheets, spreadsheetId, "'Write Table'!I:Q");

                const bupotRows = getAllBupot.data.values || [];
                const bupotValue = parsedCariNomor.bupot;
                let matchedRowPosition = -1;

                // Find first match of bupot in any column from I to Q
                for (let i = 0; i < bupotRows.length; i++) {
                    let foundMatch = false;
                    
                    // Check all columns in the I:Q range (indices 0 through 8)
                    for (let j = 0; j < 9; j++) { // I to Q is 9 columns
                        const cellValue = bupotRows[i][j] || "";
                        if (cellValue.includes(bupotValue)) {
                            matchedRowPosition = i + 1; // Convert to 1-based indexing
                            foundMatch = true;
                            break;
                        }
                    }
                    
                    if (foundMatch) {
                        break;
                    }
                }

                if (matchedRowPosition === -1) {
                    return res.json({
                        data: [],
                        realAllDRPPRows: 0,
                        countData: countData,
                        fullData: []
                    });
                }

                // Calculate search range (from matched row up to 170 rows above)
                const searchStartRow = Math.max(1, matchedRowPosition - 150);
                const searchEndRow = matchedRowPosition;

                // Get both column D and X data for the search range in one request
                const searchRange = `'Write Table'!D${searchStartRow}:X${searchEndRow}`;
                const searchResponse = await readRange(sheets, spreadsheetId, searchRange);

                const searchData = searchResponse.data.values || [];
                let nomorBupotRowPosition = -1;
                let transId = null;

                // Find "Nomor SPBY" exact match in column D within the range
                for (let i = searchData.length - 1; i >= 0; i--) { // Search from bottom to top (nearest to matched row)
                    if (searchData[i][0] === "Nomor SPBY") {
                        nomorBupotRowPosition = searchStartRow + i;
                        // Get TRANS_ID from column X
                        const columnXValue = searchData[i][20] || ""; // X is at index 20 in D:X range

                        // Extract number from "TRANS_ID:xx" format
                        const transIdMatch = columnXValue.match(/TRANS_ID:(\d+)/);
                        if (transIdMatch) {
                            transId = transIdMatch[1]; // Extract just the number as string
                        }
                        break;
                    }
                }

                if (!transId) {
                    return res.json({
                        data: [],
                        realAllDRPPRows: 0,
                        countData: countData,
                        fullData: []
                    });
                }

                // Find matches in Monitoring DRPP column B using already fetched totalRows
                const matchedDrppRows = [];
                totalRows.forEach((row, index) => {
                    const columnBValue = row[1] || ""; // Column B index 1
                    if (columnBValue === transId) {
                        matchedDrppRows.push({
                            data: row,
                            rowIndex: index + 1
                        });
                    }
                });

                // Filter to get only rows from row 3 downward
                const visibleMatchedDrppRows = matchedDrppRows.filter(row => row.rowIndex >= 3);

                if (visibleMatchedDrppRows.length > 0) {
                    const resultData = visibleMatchedDrppRows.map(row => {
                        const values = [...row.data];
                        while (values.length < 11) {
                            values.push("");
                        }
                        return values.slice(0, -1); // Remove last column like paginatedSlicedDRPP
                    });

                    return res.json({
                        data: resultData,
                        realAllDRPPRows: visibleMatchedDrppRows.length,
                        countData: countData,
                        fullData: visibleMatchedDrppRows.map(row => {
                            const values = [...row.data];
                            while (values.length < 11) {
                                values.push("");
                            }
                            return values;
                        })
                    });
                } else {
                    return res.json({
                        data: [],
                        realAllDRPPRows: 0,
                        countData: countData,
                        fullData: []
                    });
                }
            }
        }

        const visibleRows = allRows.filter(row => row.rowIndex >= 3);
        const paginatedDRPPLength = visibleRows.length;
        
        // Sort by rowIndex in descending order to get latest rows first
        const sortedRows = visibleRows.sort((a, b) => b.rowIndex - a.rowIndex);
        
        const startIndex = ( page - 1 ) * limit;
        const endIndex = startIndex + limit;
        const paginatedRows = sortedRows.slice(startIndex, endIndex)

        // Check if paginatedRows is empty to avoid Infinity error
        let paginatedDRPP = [];
        if (paginatedRows.length === 0) {
            // Return empty data if no rows to paginate
            paginatedDRPP = [];
        } else {
            // Instead of fetching each row individually, fetch a continuous range
            // Find min and max row indices
            const rowIndices = paginatedRows.map(row => row.rowIndex);
            const minRow = Math.min(...rowIndices);
            const maxRow = Math.max(...rowIndices);

            // Fetch continuous range with backoff
            const getDRPPResponses = await readRange(sheets, spreadsheetId, `'Monitoring DRPP'!A${minRow}:K${maxRow}`);

            const allRowsData = getDRPPResponses.data.values || [];

            // Extract only the rows we need based on rowIndex
            paginatedDRPP = paginatedRows.map(row => {
                const dataIndex = row.rowIndex - minRow;
                const values = allRowsData[dataIndex] || [];
                while (values.length < 11) {
                    values.push("");
                }
                return values;
            });
        }

        const paginatedSlicedDRPP = paginatedDRPP.map(row => row.slice(0, -1))


        res.json({ data: paginatedSlicedDRPP, realAllDRPPRows: paginatedDRPPLength, countData: countData, fullData: paginatedDRPP });

    } catch (error) {
        console.error("Error in /bendahara/monitoring-drpp:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

//Aksi DRPP handler
app.get("/bendahara/cek-drpp", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const tablePos  = req.query;
        const colorStartRow = parseInt(tablePos.startRow) + 1;
        const range = `'Write Table'!W${colorStartRow}:W${tablePos.endRow}`;

        // Apply backoff for getting color status
        const response = await readRange(sheets, spreadsheetId, range);

        let result = response.data.values || [];

        // Add empty rows to fill based on row numbers
        const num_Columns = parseInt(tablePos.startRow) - parseInt(tablePos.endRow);
        result = result.map(row => {
            while (row.length < num_Columns) {
                row.push("");
            }
            return row;
        })

        res.json({ data: result })

    } catch (error) {
        console.error("Error in /bendahara/cek-drpp:", error);
        res.status(500).json({ error: "Cannot fetch color status." });
    }
})

app.post("/bendahara/aksi-drpp", async (req, res) => {
    const {numbers, pajakStatus, colorData} = req.body;
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const getDrppRows = await readRanges(
            sheets,
            spreadsheetId,
            [
                "'Monitoring DRPP'!A3:I",   // Range to update DRPP status. A3:I so satker (D) and the pre-update pungut/setor (H/I) are available for the notification check
                "'Write Table'!X:X",        // Range to update colored row status
                "'Monitoring DRPP'!F3:F"    // Range to get SPM numbers
            ],
        );

        const totalRows = getDrppRows.data.valueRanges[0].values || [];
        const colorRows = getDrppRows.data.valueRanges[1].values || [];
        const spmRows = getDrppRows.data.valueRanges[2].values || [];

        // totalRows/DRPP status handler (find DRPP status number order on sheet)
        let trackedRowNum = null;
        for (let i = 0; i < totalRows.length; i++) {
            if (totalRows[i][0]?.toString().trim() === numbers.data.toString().trim()) {
                trackedRowNum = i + 3; // A3 = index 0 => row number = i + 3
                break;
            }
        }

        if (!trackedRowNum) {
            return res.status(404).json({ message: "Nomor urut DRPP tidak ditemukan." });
        }

        // Find all rows with matching SPM number
        const matchingSpmRows = [];
        const spmNumber = numbers.spm?.toString().trim();
        if (spmNumber) {
            for (let i = 0; i < spmRows.length; i++) {
                if (spmRows[i][0]?.toString().trim() === spmNumber) {
                    matchingSpmRows.push(i + 3); // F3 = index 0 => row number = i + 3
                }
            }
        }

        // colorRows/colored row status handler
        let foundRow = null;
        for (let i = 0; i < colorRows.length; i++) {
            if (colorRows[i][0] === colorData.id) {
                foundRow = i + 1 + 1; // Adjust for 1-based indexing and +1 to skip table header
                break;
            }
        }

        if (!foundRow) {
            console.log(`Keyword "${colorData}" tidak ditemukan.`);
        }

        // Prepare batch update data
        const updateData = [
            {
                range: `'Monitoring DRPP'!H${trackedRowNum}:I${trackedRowNum}`,
                values: [[pajakStatus.pungutan || "", pajakStatus.setoran || ""]],
            },
            {
                range: `'Monitoring DRPP'!K${trackedRowNum}:K${trackedRowNum}`,
                values: [[pajakStatus.catatan || ""]],
            },
            {
                range: `'Write Table'!W${foundRow}`,
                values: colorData.data,
            }
        ];

        // Add catatan updates for all rows with matching SPM (excluding the current row to avoid duplicate)
        if (matchingSpmRows.length > 0) {
            matchingSpmRows.forEach(rowNum => {
                if (rowNum !== trackedRowNum) {
                    updateData.push({
                        range: `'Monitoring DRPP'!K${rowNum}:K${rowNum}`,
                        values: [[pajakStatus.catatan || ""]],
                    });
                }
            });
        }

        await writeRanges(sheets, spreadsheetId, updateData, "RAW");

        // Notify the satker. Isolated, same as aksi-ajuan.
        try {
            const drppRow = totalRows[trackedRowNum - 3] || []; // trackedRowNum = i + 3
            const satker = String(drppRow[3] || "").trim();
            const pungutan = String(pajakStatus?.pungutan || "").trim();
            const setoran = String(pajakStatus?.setoran || "").trim();

            const hasProblem = pungutan === "Ada Masalah" || setoran === "Ada Masalah";
            // Only on an actual change, to avoid duplicates on re-save
            const changed = pungutan !== String(drppRow[7] || "").trim() ||
                            setoran !== String(drppRow[8] || "").trim();

            if (hasProblem && changed && satker) {
                const keterangan = String(pajakStatus?.catatan || "").trim();
                const deskripsi = `DRPP ${numbers.data} - ${getFormattedDate().fullDateTimeVerifFormat.split(' ')[0]}` +
                                  (keterangan ? `\nKeterangan: ${keterangan}` : "");

                await writeNotification(
                    spreadsheetId,
                    satker,
                    "Ada Masalah di Pungut/Setor Pajak",
                    deskripsi
                );
            }
        } catch (notifError) {
            console.error("Gagal menulis notifikasi (aksi-drpp):", notifError);
        }

        res.status(200).json({ message: "Status pajak berhasil diperbarui." });

    } catch (error) {
        console.error("Error in /bendahara/aksi-drpp:", error);
        res.status(500).json({ message: "Error processing data." });
    }
})

//Verifikasi Section
//Kelola-PJK Page
app.get("/verifikasi/data-pjk", async (req, res) => {
    try {
        const spreadsheetIdVerif = getSpreadsheetId(req, 'VERIF');
        const { satkerPrefix = "", filterKeyword = "", page = 1, limit = 10, searchKeyword = "", monthKeyword = "" } = req.query;

        //Get all data from range A
        const response = await readRange(sheets2, spreadsheetIdVerif, "'Daftar SPM'!A:H");
        let allRows = response.data.values || [];

        //Format setup
        allRows = allRows.map((row, index) => ({
            satker: row[0] || "",           // Column A
            nomorSpm: row[1] || "",         // Column B
            date: row[2] || "",             // Column C
            status: row[7] || "",           // Column H
            rowIndex: index + 1
        }));

        //Filter if keyword exist
        if (satkerPrefix !== "") {
            allRows = allRows.filter(row => row.satker.startsWith(satkerPrefix));
        }
        if (filterKeyword !== "") {
        allRows = allRows.filter(row => row.status.includes(filterKeyword));
        }
        if (searchKeyword !== "") {
            allRows = allRows.filter(row => row.nomorSpm.includes(searchKeyword));
        }
        if (monthKeyword !== "") {
            // Map numeric month to Indonesian abbreviation
            const monthMap = {
                "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
                "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
                "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
            };
            const monthAbbr = monthMap[monthKeyword];

            allRows = allRows.filter(row => {
                // Extract month from date string (format: dd-mmm-yyyy)
                const dateParts = row.date.split('-');
                if (dateParts.length >= 3) {
                    const month = dateParts[1]; // Middle part is the month abbreviation
                    return month === monthAbbr;
                }
                return false;
            });
        }


        let rowData = [];
        let totalPages = 0;
        let message = true;

        if (allRows.length === 0) {
            message = false;
        } else {
            //Sort by Column B (nomorSpm) from highest to lowest number
            allRows = allRows.sort((a, b) => {
                // Extract numeric part from nomorSpm (e.g., "00001A" -> 1)
                const getNumericPart = (spm) => {
                    if (!spm) return 0;
                    const match = spm.match(/^(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                };
                
                const numA = getNumericPart(a.nomorSpm);
            const numB = getNumericPart(b.nomorSpm);
                
                // Sort from highest to lowest
                return numB - numA;
            });

            //Pagination logic
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            const paginatedRows = allRows.slice(startIndex, endIndex);

            //Fetch Rows with pagination
            const rowRanges = paginatedRows.map(row => `'Daftar SPM'!A${row.rowIndex}:J${row.rowIndex}`);
            const batchGetResponse = await readRanges(sheets2, spreadsheetIdVerif, rowRanges)
            rowData = batchGetResponse.data.valueRanges.map(row => {
                const rowValues = row.values[0] || [];
                // Ensure each row has 10 columns by filling blanks with ""
                while (rowValues.length < 10) {
                    rowValues.push("");
                }
                return rowValues;
            });
            totalPages = Math.ceil(allRows.length / limit);
            if (satkerPrefix === "" && filterKeyword === "" && searchKeyword === "" && parseInt(page) === parseInt(totalPages)) {
                rowData.pop()
            }
        }


        //Fetch PJK Count data
        let countData = null;

        // Map numeric month to Indonesian abbreviation if monthKeyword exists
        let monthAbbr = "";
        if (monthKeyword !== "") {
            const monthMap = {
                "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
                "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
                "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
            };
            monthAbbr = monthMap[monthKeyword] || "";
        }

        if (satkerPrefix === "") {
            // Write month to G4 if monthKeyword exists, or reset to empty if not
            const monthValue = (monthKeyword !== "" && monthAbbr !== "") ? monthAbbr : "";
            await writeRange(sheets2, spreadsheetIdVerif, `'Sheet Coding'!G4`, [[monthValue]], 'RAW');

            const countResponse = await readRange(sheets2, spreadsheetIdVerif, `'Sheet Coding'!A4:E4`)
            countData = countResponse.data.values[0] || [];
        } else {
            const allKeyword = await readRange(sheets2, spreadsheetIdVerif, `'Sheet Coding'!A:A`)

            const allrows = allKeyword.data.values || [];
            let foundRow = null;

            for (let i = 0; i < allrows.length; i++) {
                if (allrows[i][0] === satkerPrefix) {
                    foundRow = i + 1 + 2; // +1 for 1-based indexing, +2 to target the data row
                    break;
                }
            }
            if (foundRow) {
                // Write month to G cell (2 rows below foundRow) if monthKeyword exists, or reset to empty if not
                const monthCellRow = foundRow;
                const monthValue = (monthKeyword !== "" && monthAbbr !== "") ? monthAbbr : "";
                await writeRange(sheets2, spreadsheetIdVerif, `'Sheet Coding'!G${monthCellRow}`, [[monthValue]], 'RAW');

                const countResponse = await readRange(sheets2, spreadsheetIdVerif, `'Sheet Coding'!A${foundRow}:E${foundRow}`)
                countData = countResponse.data.values[0] || [];
            }
        }




        res.json({ data: rowData, totalPages, countData, message: message });


    } catch (error) {
        console.error("Error fetching Data PJK", error);
    }
})

//Form-Verifikasi.jsx
app.post("/verifikasi/verifikasi-form", async (req, res) => {
    try {
        const spreadsheetIdVerif = getSpreadsheetId(req, 'VERIF');
        const { data, type, rowPosition } = req.body;

        data.push(getFormattedDate().fullDateTimeVerifFormat);

        //Function to generate pdf from Google Docs template
        async function generatePdf(dataArray) {
            try {
                // Check if verification APIs are initialized
                if (!driveVerif || !docsVerif) {
                    console.log('Verification Google APIs not authenticated. Skipping PDF generation.');
                    return null;
                }

                const templateDocId = process.env.DOCS_ID_VERIF;
                if (!templateDocId) {
                    console.log('Template document ID not configured. Skipping PDF generation.');
                    return null;
                }

                // Map array data to template placeholders
                const templateData = {
                    NoSPM: dataArray[0],           // noSpm
                    UnitKerja: dataArray[1],       // unitKerja  
                    TanggalUpload: dataArray[2],   // date
                    HasilVerifikasi: dataArray[3], // hasil
                    Catatan: dataArray[4],         // catatan
                    Operator: dataArray[5]         // verifikator
                };

                // Create a copy of the template
                const copyResponse = await driveVerif.files.copy({
                    fileId: templateDocId,
                    requestBody: {
                        name: `Verifikasi_${templateData.Operator}_SPM_${templateData.NoSPM}`
                    }
                });

                const newDocId = copyResponse.data.id;

                //Replace placeholders in the copied document
                const requests = [];
                
                // Replace text placeholders with actual data
                for (const [placeholder, value] of Object.entries(templateData)) {
                    requests.push({
                        replaceAllText: {
                            containsText: {
                                text: `{{${placeholder}}}`,
                                matchCase: false
                            },
                            replaceText: String(value || '')
                        }
                    });
                }

                // Execute the replacements
                if (requests.length > 0) {
                    await docsVerif.documents.batchUpdate({
                        documentId: newDocId,
                        requestBody: { requests }
                    });
                }

                //Export the document as PDF
                const pdfResponse = await driveVerif.files.export({
                    fileId: newDocId,
                    mimeType: 'application/pdf'
                });

                //Create a new PDF file in Drive
                const pdfFileName = `Verifikasi_${templateData.Operator}_SPM_${templateData.NoSPM}.pdf`;
                
                // Convert Blob to Buffer if needed
                let pdfBuffer;
                if (pdfResponse.data instanceof Buffer) {
                    pdfBuffer = pdfResponse.data;
                } else {
                    // Handle Blob data
                    const arrayBuffer = await pdfResponse.data.arrayBuffer();
                    pdfBuffer = Buffer.from(arrayBuffer);
                }
                
                const pdfFile = await driveVerif.files.create({
                    requestBody: {
                        name: pdfFileName,
                        parents: [driveFolderIdVerif]
                    },
                    media: {
                        mimeType: 'application/pdf',
                        body: stream.Readable.from(pdfBuffer)
                    }
                });

                //Make the PDF shareable and get link
                await driveVerif.permissions.create({
                    fileId: pdfFile.data.id,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone'
                    }
                });

                // Get the shareable link
                const fileInfo = await driveVerif.files.get({
                    fileId: pdfFile.data.id,
                    fields: 'webViewLink, webContentLink'
                });

                //Clean up - delete the temporary doc copy
                await driveVerif.files.delete({
                    fileId: newDocId
                });

                console.log(`PDF generated successfully: ${pdfFileName}`);
                return {
                    success: true,
                    pdfId: pdfFile.data.id,
                    fileName: pdfFileName,
                    viewLink: fileInfo.data.webViewLink,
                    downloadLink: fileInfo.data.webContentLink
                };

            } catch (error) {
                console.error('PDF generation error:', error);
                return null;
            }
        }

        if (type === "filled") {
            // Generate PDF after writing data
            const pdf = await generatePdf(data);
            const pdfFileLink = pdf.viewLink;

            data.push(pdfFileLink)

            //Directly write into the row
            const writeResponse = await writeRange(
                sheets2,
                spreadsheetIdVerif,
                `'Data'!A${rowPosition}:H${rowPosition}`,
                [data],
                "RAW",
            )

        } else {
            //Get all row information
            const getAllRowsResponse = await readRange(sheets2, spreadsheetIdVerif, `'Data'!A:A`)

            const getAllRows = getAllRowsResponse.data.values || [];
            
            // Search for existing noSpm in the data
            let existingRowPosition = null;
            if (data && data[0]) {
                for (let i = 0; i < getAllRows.length; i++) {
                    const row = getAllRows[i];
                    // Check if noSpm exists in column A of this row
                    if (row && row.some(cell => cell === data[0])) {
                        existingRowPosition = i + 1; // 1-based indexing for sheets
                        break;
                    }
                }
            }
            
            if (existingRowPosition) {
                //Notify front-end that the SPM exist, and redirect to the "filled" form type.
                res.status(201).json({ message:"Nomor SPM already exist!", existingData: data[0] } );
                return;
            } else {
                const nextRow = getAllRows.length + 1;

                // Generate PDF after writing data
                const pdf = await generatePdf(data);
                const pdfFileLink = pdf.viewLink;

                data.push(pdfFileLink)

                const writeResponse = await writeRange(
                    sheets2,
                    spreadsheetIdVerif,
                    `'Data'!A${nextRow}:H${nextRow}`,
                    [data],
                    "RAW",
                )
            }

        }

        res.status(200).json({ message: "Data successfully written."})

    } catch (error) {
        console.error("Error fetching Data PJK", error);
    }
})

// Pengujian PJK - the whole verifikasi antrian in one read, split into its three sections
app.get("/verifikasi/pengujian-pjk", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const verifFlow = AJUAN_FLOWS.verif;

        // The gup antrian rides along so each mirror row can be labelled with the id of the
        // 'Write Antrian' row that produced it - two ranges, still one request
        const response = await readRanges(
            sheets,
            spreadsheetId,
            [
                // Through P, not antrianLastColumn: the Dok. Verifikasi link sits past
                // the columns the antrian write path knows about
                `'${verifFlow.antrianSheet}'!A3:${verifFlow.pjk.dokVerif}`,
                `'${AJUAN_FLOWS.gup.antrianSheet}'!A:C`,
            ],
        );

        const sourceIdByKey = new Map();
        for (const row of response.data.valueRanges[1].values || []) {
            sourceIdByKey.set(mirrorRowKey(row?.[1], row?.[2]), row?.[0] ?? "");
        }
        // Only GUP/PTUP have a mirror; matching every row risks a native verifikasi row
        // borrowing an id off a same-second, same-name collision
        const sourceId = row => resolveJenis(row[3])?.flow === "gup"
            ? sourceIdByKey.get(mirrorRowKey(row[1], row[2])) || ""
            : "";

        // Index 16, appended past the sheet's own columns (A..P)
        const width = PJK_COLUMN.dokVerif + 1;
        const rows = (response.data.valueRanges[0].values || [])
            .filter(row => String(row?.[0] ?? "").trim() !== "")
            .map(row => Array.from({ length: width }, (_, i) => row[i] ?? ""))
            .map(row => [...row, sourceId(row)])
            .reverse();

        const isVerified = value => PJK_VERIFIED_VALUES.includes(trimmed(value));

        // A row belongs to one section only, tested furthest stage first so it moves along
        // as it progresses and settles in Sudah Verifikasi
        const informasi = [], sedangVerif = [], sudahVerif = [];
        for (const row of rows) {
            if (filled(row[PJK_COLUMN.selesaiVerif])
                || (isVerified(row[PJK_COLUMN.substansi]) && isVerified(row[PJK_COLUMN.kelengkapan]))) {
                sudahVerif.push(row);
            } else if (filled(row[PJK_COLUMN.mulaiVerif])) {
                sedangVerif.push(row);
            } else {
                informasi.push(row);
            }
        }

        res.json({ data: [informasi, sedangVerif, sudahVerif], pending: [...pendingHasilVerif.keys()] });
    } catch (error) {
        console.error("Error in /verifikasi/pengujian-pjk:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

// Which rows are still generating a PDF. In memory only, so polling this costs no Sheets quota
app.get("/verifikasi/hasil-verif/pending", (req, res) => {
    res.json({ pending: [...pendingHasilVerif.keys()] });
})

// --- Hasil Verifikasi Substansi PDF -------------------------------------------
// One PDF per saved change to Substansi or Kelengkapan. Nothing is ever overwritten:
// each run counts the PDFs already tagged with this transaction and appends the next
// #N, so a later revision lands beside the earlier one under its own admin's name.

const driveFolderIdHasilVerif = process.env.DRIVE_FOLDER_ID_HASIL_VERIF;
// Kept in appProperties rather than parsed back out of the file name - Drive matches
// names by token, so an id sitting mid-string would not be found reliably
const HASIL_VERIF_KEY = "pjkHasilVerif";

// Generation runs after the save responds. Nothing waits on it - the rows still being
// generated are reported instead, so the list can label them and swap the link in later.
const pendingHasilVerif = new Map();

function trackHasilVerif(key, promise) {
    const id = String(key);
    // Only clear if this run is still the current one - a fast re-save must not have its
    // entry deleted by the promise it replaced
    const tracked = promise.finally(() => {
        if (pendingHasilVerif.get(id) === tracked) pendingHasilVerif.delete(id);
    });
    pendingHasilVerif.set(id, tracked);
}

async function nextHasilVerifSequence(transactionKey) {
    const existing = await driveVerif.files.list({
        q: `appProperties has { key='${HASIL_VERIF_KEY}' and value='${transactionKey}' } and trashed = false`,
        fields: "files(id)",
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });
    return (existing.data.files || []).length + 1;
}

async function generateHasilVerifPdf({ spreadsheetId, rowIndex, row, sourceId, operator }) {
    if (!driveVerif || !docsVerif) {
        console.log("Verifikasi Google APIs belum terautentikasi - PDF hasil verifikasi dilewati.");
        return null;
    }
    const templateDocId = process.env.DOCS_ID_HASIL_VERIF_SUBSTANSI;
    if (!templateDocId || !driveFolderIdHasilVerif) {
        console.log("DOCS_ID_HASIL_VERIF_SUBSTANSI / DRIVE_FOLDER_UD_HASIL_VERIF belum diatur - PDF hasil verifikasi dilewati.");
        return null;
    }

    // GUP/PTUP carry no Nomor SPP, so they are identified by the id of the
    // 'Write Antrian' row they mirror
    const isGup = resolveJenis(row[3])?.flow === "gup";
    const noSpp = isGup ? "" : formatNomorSpp(row[PJK_COLUMN.spp]);
    const noId = isGup ? String(sourceId ?? "").trim() : String(row[0] ?? "").trim();

    const placeholders = {
        TimestampPengajuan: row[1],
        JenisPengajuan: row[3],
        UnitKerja: row[8],
        NoSPP: noSpp,
        NoID: noId,
        TanggalSelesaiPengujian: row[PJK_COLUMN.selesaiVerif],
        SubstansiPJK: row[PJK_COLUMN.substansi],
        KelengkapanPJK: row[PJK_COLUMN.kelengkapan],
        Catatan: row[PJK_COLUMN.catatan],
        Operator: operator,
    };

    const { fullDateFormat, fullDateTimeFormat } = getFormattedDate();
    const [year, month, day] = fullDateFormat.split("-");
    const stamp = `${day}-${month}-${year} ${fullDateTimeFormat.slice(11, 16)}`;
    // The copy is scratch space that gets deleted, so its name is irrelevant and the
    // sequence lookup does not have to finish first - both go out at once
    const [sequence, copyResponse] = await Promise.all([
        nextHasilVerifSequence(row[0]),
        driveVerif.files.copy({ fileId: templateDocId, fields: "id", supportsAllDrives: true }),
    ]);
    const fileName = `${safePart(operator)}_${stamp}_${safePart(row[3])}_${safePart(noSpp || noId)}_#${sequence}`;
    const newDocId = copyResponse.data.id;

    try {
        await docsVerif.documents.batchUpdate({
            documentId: newDocId,
            requestBody: {
                requests: Object.entries(placeholders).map(([placeholder, value]) => ({
                    replaceAllText: {
                        containsText: { text: `{{${placeholder}}}`, matchCase: false },
                        replaceText: String(value ?? ""),
                    }
                })),
            },
        });

        const pdfResponse = await driveVerif.files.export(
            { fileId: newDocId, mimeType: "application/pdf" },
            { responseType: "arraybuffer" }
        );

        const pdfFile = await driveVerif.files.create({
            requestBody: {
                name: `${fileName}.pdf`,
                parents: [driveFolderIdHasilVerif],
                appProperties: { [HASIL_VERIF_KEY]: String(row[0] ?? "") },
            },
            media: {
                mimeType: "application/pdf",
                body: stream.Readable.from(Buffer.from(pdfResponse.data)),
            },
            fields: "id, webViewLink",
            supportsAllDrives: true,
        });

        // The cell always points at the newest revision - earlier PDFs stay in Drive
        // under their own #N rather than being replaced
        const viewLink = pdfFile.data.webViewLink || "";
        await writeRange(
            sheets,
            spreadsheetId,
            `'${AJUAN_FLOWS.verif.antrianSheet}'!${AJUAN_FLOWS.verif.pjk.dokVerif}${rowIndex}`,
            [[viewLink]],
            "RAW",
        );

        console.log(`PDF hasil verifikasi dibuat: ${fileName}.pdf`);
        return { fileName: `${fileName}.pdf`, viewLink };
    } finally {
        // Cleanup runs whether or not the export got that far, but nothing waits on it
        driveVerif.files.delete({ fileId: newDocId, supportsAllDrives: true })
            .catch(error => console.error("Gagal menghapus salinan dokumen sementara:", error.message));
    }
}

app.post("/verifikasi/aksi-pjk", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { no_antri, mulai_verifikasi, tgl_selesai, substansi, kelengkapan, catatan } = req.body || {};
        if (!no_antri) {
            return res.status(400).json({ message: "Invalid or missing data." });
        }

        const verifFlow = AJUAN_FLOWS.verif;
        const { pjk } = verifFlow;

        // The whole row, not just column A: the pre-update verdicts decide whether a PDF
        // is due, and the rest of the row fills the template
        const response = await readRange(
            sheets,
            spreadsheetId,
            `'${verifFlow.antrianSheet}'!A:${verifFlow.antrianLastColumn}`,
        );

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row?.[0] ?? "") === String(no_antri)) + 1;
        if (rowIndex === 0) {
            return res.status(400).json({ error: "Keyword not found in column A" });
        }
        const previousRow = rows[rowIndex - 1] || [];

        // Once a selesai date exists the mulai date is history and must not be rewritten
        const selesaiValue = tgl_selesai ?? "";
        const mulaiValue = mulai_verifikasi === "TRUE" ? getFormattedDate().fullDateFormat : "";
        const updates = [
            [`${pjk.selesaiVerif}${rowIndex}`, selesaiValue],
            [`${pjk.substansi}${rowIndex}`, substansi],
            [`${pjk.kelengkapan}${rowIndex}`, kelengkapan],
            [`${pjk.catatan}${rowIndex}`, catatan],
            selesaiValue === "" ? [`${pjk.mulaiVerif}${rowIndex}`, mulaiValue] : null,
        ].filter(Boolean);

        await writeRanges(
            sheets,
            spreadsheetId,
            updates.map(([cell, value]) => ({
                range: `'${verifFlow.antrianSheet}'!${cell}`,
                values: [[value ?? ""]],
            })),
            "USER_ENTERED",
        );

        // Only a changed verdict or note is worth a document - opening a row and saving
        // it untouched must not mint another revision
        const documentFieldChanged = [
            [previousRow[PJK_COLUMN.substansi], substansi],
            [previousRow[PJK_COLUMN.kelengkapan], kelengkapan],
            [previousRow[PJK_COLUMN.catatan], catatan],
        ].some(([before, after]) => String(before ?? "").trim() !== String(after ?? "").trim());

        if (documentFieldChanged) {
            const savedRow = [...previousRow];
            savedRow[PJK_COLUMN.substansi] = substansi ?? "";
            savedRow[PJK_COLUMN.kelengkapan] = kelengkapan ?? "";
            savedRow[PJK_COLUMN.catatan] = catatan ?? "";
            savedRow[PJK_COLUMN.selesaiVerif] = selesaiValue;

            // Signed in name, not a client supplied one, so the document credits whoever
            // actually saved this revision. Read now, while the request is still around.
            const operator = req.viewer.name || "";

            // Deliberately not awaited - the verdict is already on the sheet, so half a
            // dozen Drive/Docs round trips have no business holding up the save. Tracked
            // by row id so the list can show the row as still being generated.
            trackHasilVerif(no_antri, (async () => {
                // Only GUP/PTUP need the mirrored id, so this read stays off the common path
                let sourceId = "";
                if (resolveJenis(savedRow[3])?.flow === "gup") {
                    const gupResponse = await readRange(sheets, spreadsheetId, `'${AJUAN_FLOWS.gup.antrianSheet}'!A:C`);
                    const key = mirrorRowKey(savedRow[1], savedRow[2]);
                    sourceId = (gupResponse.data.values || [])
                        .find(row => mirrorRowKey(row?.[1], row?.[2]) === key)?.[0] ?? "";
                }
                await generateHasilVerifPdf({ spreadsheetId, rowIndex, row: savedRow, sourceId, operator });
            })().catch(error => console.error("Gagal membuat PDF hasil verifikasi:", error)));
        }

        res.status(200).json({ message: "Data successfully written." });
    } catch (error) {
        console.error("Error in /verifikasi/aksi-pjk:", error);
        res.status(500).json({ message: "Server error." });
    }
})

app.get("/verifikasi/cari-spm", async (req,res) => {
    const { searchValue } = req.query;
    try {
        const spreadsheetIdVerif = getSpreadsheetId(req, 'VERIF');
        const response = await readRange(sheets2, spreadsheetIdVerif, `'Data'!A:A`)
        const allRows = response.data.values || [];
        //Row index
        const rowIndex = allRows.findIndex(row => row[0].includes(searchValue));
        if (rowIndex === -1) {
            return res.status(404).json({error: "Keyword not found."});
        }
        const targetRowNumber = rowIndex + 1 //Gsheet 1 indexed

        //Fetch target row
        const result = await readRange(sheets2, spreadsheetIdVerif, `'Data'!A${targetRowNumber}:G${targetRowNumber}`)
        const targetRow = result.data.values[0] || [];
        res.json({ data: targetRow, rowNumber: targetRowNumber});

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Internal server error" });
    }

})

//Generate PDF
app.post("/verifikasi/generate-pdf", async (req, res) => {
    const data = req.body;

    try {
        const response = await axios.post(
            'https://script.google.com/macros/s/AKfycbz9i4yr9mBC-M62M4rummZrd_zLNHo0sN4U3XcY47zzOOptopqmQIklSDxKpSpTpcif/exec',
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        res.status(200).json({ message: "PDF successfully generated." });
    } catch (error) {
        console.error("Error forwarding to Google Apps Script:", error.message);
        res.status(500).json({ message: "Error creating PDF", error: error.message });
    }
})

//Navbar.jsx - Notification Message
app.get('/notification', async (req, res) => {
    try{
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { page = 1, limit = 30 } = req.query;
        // Audience comes from the verified token, never the query string - otherwise
        // anyone could read another user's notifications by editing the URL
        const { name, role } = req.viewer;

        // Filter by user role and admin division
        let findByWhat = role === 'user' ? name : (name.includes('Annisa' || 'Ardi' || 'Anggun') ? 'Bendahara' : 'Verifikasi' )
        if (role === 'master admin') { findByWhat = 'Bendahara'; }

        // Find the correct notification column index first
        const getTypeRowsResponse = await readRange(sheets, spreadsheetId, "'Notifikasi'!A:CB");
        let typeRow = await getTypeRowsResponse.data.values || [];
        const headerRow = typeRow.length > 0 ? typeRow[0] : [];
        const columnIndex = headerRow.findIndex(columnName => columnName.includes(findByWhat));
            //Handle Error
        if (columnIndex === -1) {
            throw new Error(`Could not find column for: ${findByWhat}`);
        }

        // Convert index to google sheet column letter
        function getColumnLetter(index) {
            let letter = '';
            let tempIndex = index;
            while (tempIndex >= 0) {
                letter = String.fromCharCode((tempIndex % 26) + 65) + letter;
                tempIndex = Math.floor(tempIndex / 26) - 1;
            }
            return letter;
        }
        const columnLetter = getColumnLetter(columnIndex);

        // Get n column letter after columnIndex
        function getOffsetColumnLetter(letter, step = 2) {
            let nextLetter = '';

            let carry = step;

            for (let i = letter.length - 1; i >= 0; i--) {
                if (carry > 0) {
                    let charCode = letter.charCodeAt(i);
                    let newCharCode = charCode + carry;

                    if (newCharCode > 90) {

                        nextLetter = String.fromCharCode(newCharCode - 26) + nextLetter;
                        carry = 1;
                    } else {
                        nextLetter = String.fromCharCode(newCharCode) + nextLetter;
                        carry = 0;
                    }
                } else {
                    nextLetter = letter[i] + nextLetter;
                }
            }

            if (carry > 0) {
                nextLetter = 'A' + nextLetter;
            }
            return nextLetter;
        }
        const nextOffsetColumnLetter = getOffsetColumnLetter(columnLetter, 3);

        // Get selected column data
        const getColumnResponse = await readRange(
            sheets,
            spreadsheetId,
            `'Notifikasi'!${columnLetter}3:${nextOffsetColumnLetter}`,
        );
        let columnData = getColumnResponse.data.values || [];
        const columnRows = columnData.length;

        //Limit slice to send to FE
        const limitToTake = 30 * page
        columnData = columnData.slice(-limitToTake);
        columnData = columnData.reverse()

        //Separate read status
        let statusData = columnData.map(row => row.slice(3));

        // Send to FE
        res.status(200).json({ data: columnData, rowCount: columnRows, status: statusData, statusPosition: nextOffsetColumnLetter });

    } catch {
        res.status(500).json({ error: "Failed to fetch notification data" });
    }

})

//Notification - mark as read
app.post('/notification/mark-read', async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { notifId, statusColPosition } = req.body;
        if (!notifId) {
            return res.status(400).json({ message: "Invalid notification id." })
        }

        const rowNumber = Number(notifId) + 2;
        const updateStatus = await writeRange(
            sheets,
            spreadsheetId,
            `'Notifikasi'!${statusColPosition}${rowNumber}`,
            [['yes']],
            "RAW",
        );

        if (updateStatus.status === 200) {
            return res.status(200).json({ message: "Notification status updated successfully." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Failed to update notification status" });
    }
})

// --- Dokumen Perubahan Data Penghasilan Pegawai -------------------------------
// Submission form + monitoring, both under the bendahara menu. Data lives on the 'Dokumen Gaji'
// tab of the AJUAN spreadsheet, columns A:H starting at row 3:
// A No | B Tanggal Terima | C Tanggal Surat | D Nomor Surat |
// E Nama Tercantum | F Status Pegawai | G Keterangan Surat | H Link File

const driveFolderIdDokumenGaji = process.env.DRIVE_FOLDER_ID_DOKUMEN_GAJI;

// Dedicated uploader identity. The shared /auth/google token (oauth_tokens id=1)
// is overwritten by whoever authorises last, so uploads using it end up owned by
// an arbitrary account. Reuses the main OAuth app - only the redirect URI differs.
const oauth2ClientGaji = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_GAJI || process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET_GAJI || process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI_GAJI
);
let driveGaji = null;

async function saveGajiOAuthTokens(tokens) {
    try {
        await sql`DELETE FROM oauth_tokens_gaji WHERE id = 1`;
        await sql`
            INSERT INTO oauth_tokens_gaji (id, access_token, refresh_token, expiry_date, created_at)
            VALUES (1, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expiry_date || null}, NOW())
            ON CONFLICT (id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expiry_date = EXCLUDED.expiry_date,
                updated_at = NOW()
        `;
        console.log('Dokumen Gaji OAuth tokens saved to database');
    } catch (error) {
        console.error('Failed to save Dokumen Gaji OAuth tokens:', error);
    }
}

async function loadGajiOAuthTokens() {
    try {
        const result = await sql`SELECT * FROM oauth_tokens_gaji WHERE id = 1 LIMIT 1`;
        if (result.length > 0) {
            oauth2ClientGaji.setCredentials({
                access_token: result[0].access_token,
                refresh_token: result[0].refresh_token,
                expiry_date: result[0].expiry_date ? Number(result[0].expiry_date) : undefined,
            });
            driveGaji = google.drive({ version: "v3", auth: oauth2ClientGaji });
            console.log('Dokumen Gaji OAuth tokens loaded from database');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load Dokumen Gaji OAuth tokens:', error);
        return false;
    }
}

async function ensureGajiDriveReady() {
    if (!driveGaji || !oauth2ClientGaji.credentials.access_token) {
        const loaded = await loadGajiOAuthTokens();
        if (!loaded) return false;
    }
    if (oauth2ClientGaji.credentials.expiry_date && oauth2ClientGaji.credentials.expiry_date < Date.now()) {
        await oauth2ClientGaji.refreshAccessToken();
        driveGaji = google.drive({ version: "v3", auth: oauth2ClientGaji });
        await saveGajiOAuthTokens(oauth2ClientGaji.credentials);
    }
    return true;
}

// REFACTOR: the readiness check plus its response was repeated across six routes. Both
// answer the request themselves and return false when the caller must stop, matching
// allowDokumenGajiWrite. The two differ in what the caller can do about it: the upload
// routes hand the browser a URL to re-authorise with, the rest just report unavailable.
async function requireGajiDriveAuth(req, res) {
    if (await ensureGajiDriveReady()) return true;
    console.error('Token uploader belum ada - buka /auth/google/gaji dengan akun yang dituju.');
    res.status(401).json({
        error: "Google Drive authentication required. Please authenticate first.",
        authUrl: `${req.protocol}://${req.get('host')}/auth/google/gaji`,
        redirectToAuth: true
    });
    return false;
}

async function requireGajiDriveReady(res, tokenName = "Token uploader") {
    if (await ensureGajiDriveReady()) return true;
    console.error(`${tokenName} belum ada - buka /auth/google/gaji dengan akun yang dituju.`);
    res.status(503).json({ message: "Layanan penyimpanan berkas belum siap. Hubungi admin." });
    return false;
}

// Authorise once, signed in as the intended account. Needs full `drive` scope:
// `drive.file` only ever sees files this app itself created, not existing folders.
app.get("/auth/google/gaji", (req, res) => {
    const authUrl = oauth2ClientGaji.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

app.get("/auth/google/gaji/callback", async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2ClientGaji.getToken(code);
        oauth2ClientGaji.setCredentials(tokens);
        driveGaji = google.drive({ version: "v3", auth: oauth2ClientGaji });
        await saveGajiOAuthTokens(tokens);
        res.send("Akun Google untuk Dokumen Gaji berhasil terhubung. Halaman ini boleh ditutup.");
    } catch (error) {
        console.error('Dokumen Gaji OAuth callback error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

const DOKUMEN_GAJI_SHEET = "Dokumen Gaji";
const DOKUMEN_GAJI_FIRST_ROW = 3;
const STATUS_PEGAWAI_OPTIONS = ["PNS", "PPPK", "TNI/POLRI"];

// The Drive file name is derived from the form, so an edit that changes any of these
// three fields has to rename the file as well. Drive rejects "/" in names, and Status
// Pegawai "TNI/POLRI" can appear inside Keterangan.
function dokumenGajiFileName(nomorSurat, keteranganSurat, namaTercantum) {
    return `${safePart(nomorSurat)} - ${safePart(keteranganSurat)} - ${safePart(namaTercantum)}.pdf`;
}

function bufferToStream(buffer) {
    const bufferStream = new stream.Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);
    return bufferStream;
}

// Column H holds a Drive webViewLink: https://drive.google.com/file/d/<id>/view?usp=drivesdk
function extractDriveFileId(link) {
    const value = String(link || "");
    const match = value.match(/\/d\/([-\w]+)/) || value.match(/[?&]id=([-\w]+)/);
    return match ? match[1] : null;
}

// Sheets returns a date cell as a serial number when it parsed the input as a date and
// as plain text when it did not. <input type="date"> needs yyyy-mm-dd either way.
function toDateInputValue(value) {
    if (typeof value === "number") {
        // Sheets counts days from 1899-12-30
        return new Date(Math.round(value * 86400000) + Date.UTC(1899, 11, 30))
            .toISOString().slice(0, 10);
    }
    return trimmed(value);
}

// Only the roles that may open the input form may change or remove a document.
// Answers the request itself and returns false when the caller must stop.
function allowDokumenGajiWrite(req, res) {
    let role = "";
    try {
        role = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET).role || "";
    } catch {
        res.status(401).json({ message: "Sesi tidak valid, silakan login ulang." });
        return false;
    }
    if (role !== "admin_gaji" && role !== "master admin") {
        res.status(403).json({ message: "Akses ditolak, hanya admin gaji yang bisa." });
        return false;
    }
    return true;
}

// Row numbers are only stable until somebody deletes a row above them, so every row
// targeted call carries the No. and Nomor Surat the client saw and they are re-checked
// here before anything is read back or written. Answers the request and returns null
// when the row is gone or no longer the one the client meant.
async function loadDokumenGajiRow(req, res, spreadsheetId, { unformatted = false } = {}) {
    const rowNumber = parseInt(req.params.rowNumber, 10);
    if (!Number.isInteger(rowNumber) || rowNumber < DOKUMEN_GAJI_FIRST_ROW) {
        res.status(400).json({ message: "Baris tidak valid." });
        return null;
    }

    const response = await withBackoff(async () => {
        return await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${DOKUMEN_GAJI_SHEET}'!A${rowNumber}:H${rowNumber}`,
            ...(unformatted ? { valueRenderOption: "UNFORMATTED_VALUE" } : {}),
        });
    });

    const rawRow = (response.data.values || [])[0];
    if (!rawRow || rawRow.every(cell => String(cell ?? "").trim() === "")) {
        res.status(404).json({ message: "Data tidak ditemukan, muat ulang halaman." });
        return null;
    }
    const row = Array.from({ length: 8 }, (_, i) => rawRow[i] ?? "");

    const source = { ...req.query, ...(req.body || {}) };
    const expectedNo = String(source.expectedNo ?? "").trim();
    const expectedNomorSurat = String(source.expectedNomorSurat ?? "").trim();
    if ((expectedNo && String(row[0]).trim() !== expectedNo) ||
        (expectedNomorSurat && String(row[3]).trim() !== expectedNomorSurat)) {
        res.status(409).json({ message: "Data sudah berubah, muat ulang halaman." });
        return null;
    }

    return { rowNumber, row };
}

// Separate from the shared `upload` so existing routes keep their unrestricted storage
const uploadDokumenGaji = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
            return cb(new Error("Berkas harus berformat PDF."));
        }
        cb(null, true);
    }
});

// Multer rejects by throwing into the middleware chain, which would surface as a 500
function handleDokumenGajiUpload(req, res, next) {
    uploadDokumenGaji.single("file")(req, res, (err) => {
        if (err) {
            const message = err.code === "LIMIT_FILE_SIZE"
                ? "Ukuran berkas melebihi 10 MB."
                : (err.message || "Berkas tidak valid.");
            return res.status(400).json({ message });
        }
        next();
    });
}

// Submit handler for the Kirim Dokumen Gaji form
app.post("/dokumen-gaji/kirim", handleDokumenGajiUpload, async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const tanggalSurat = String(req.body.tanggalSurat || "").trim();
        const nomorSurat = String(req.body.nomorSurat || "").trim();
        const namaTercantum = String(req.body.namaTercantum || "").trim();
        const statusPegawai = String(req.body.statusPegawai || "").trim();
        const keteranganSurat = String(req.body.keteranganSurat || "").trim();

        // Re-check server side - the route has no auth of its own
        if (!tanggalSurat || !nomorSurat || !namaTercantum || !statusPegawai || !keteranganSurat) {
            return res.status(400).json({ message: "Semua kolom wajib diisi." });
        }
        if (!STATUS_PEGAWAI_OPTIONS.includes(statusPegawai)) {
            return res.status(400).json({ message: "Status Pegawai tidak valid." });
        }
        if (!req.file) {
            return res.status(400).json({ message: "Berkas PDF wajib diunggah." });
        }

        // Fail loudly rather than dropping the file in the Drive root, where it would
        // inherit no sharing. Read at startup, so restart the server after editing .env.
        if (!driveFolderIdDokumenGaji) {
            console.error("DRIVE_FOLDER_ID_DOKUMEN_GAJI belum diatur - upload dibatalkan.");
            return res.status(503).json({ message: "Folder penyimpanan belum dikonfigurasi. Hubungi admin." });
        }

        if (!await requireGajiDriveReady(res, "Token Dokumen Gaji")) return;

        const fileName = dokumenGajiFileName(nomorSurat, keteranganSurat, namaTercantum);

        const driveResponse = await driveGaji.files.create({
            requestBody: {
                name: fileName,
                parents: [driveFolderIdDokumenGaji],
            },
            media: { mimeType: req.file.mimetype, body: bufferToStream(req.file.buffer) },
            fields: "webViewLink",
            supportsAllDrives: true,
        });
        const fileLink = driveResponse.data.webViewLink || "";

        // Next free row / running No. Sheets trims trailing empty rows, so the
        // length of column A is the offset of the last populated row from row 3.
        const existingResponse = await readRange(
            sheets,
            spreadsheetId,
            `'${DOKUMEN_GAJI_SHEET}'!A${DOKUMEN_GAJI_FIRST_ROW}:A`,
        );
        const existingRows = existingResponse.data.values || [];
        const targetRow = DOKUMEN_GAJI_FIRST_ROW + existingRows.length;
        const nextId = existingRows.length + 1;

        await writeRange(
            sheets,
            spreadsheetId,
            `'${DOKUMEN_GAJI_SHEET}'!A${targetRow}:H${targetRow}`,
            [[
                nextId,
                getFormattedDate().fullDateTimeFormat,
                tanggalSurat,
                nomorSurat,
                namaTercantum,
                statusPegawai,
                keteranganSurat,
                fileLink,
            ]],
            "USER_ENTERED",
        );

        return res.status(200).json({ message: "Dokumen Berhasil Dikirim" });

    } catch (error) {
        console.error("Error in /dokumen-gaji/kirim:", error);
        return res.status(500).json({ message: "Pengiriman Gagal, Coba Lagi" });
    }
});

//Monitor Data Gaji component handler
app.get("/bendahara/monitor-perubahan-gaji", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { page = 1, limit = 10, month = "", statusPegawai = "" } = req.query;

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const rowsPerPage = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);

        const response = await readRange(sheets, spreadsheetId, `'${DOKUMEN_GAJI_SHEET}'!A${DOKUMEN_GAJI_FIRST_ROW}:H`);
        const rows = response.data.values || [];

        // Pad to 8 cells so the table never sees undefined. Index 8 is the sheet row
        // number, appended past the columns the table renders so edit/delete can name
        // the row they act on - the sort below scrambles the display order.
        let data = rows
            .map((row, index) => ({ row: row || [], rowNumber: DOKUMEN_GAJI_FIRST_ROW + index }))
            .filter(({ row }) => row.some(cell => String(cell || "").trim() !== ""))
            .map(({ row, rowNumber }) => [
                ...Array.from({ length: 8 }, (_, i) => row[i] || ""),
                rowNumber,
            ]);

        // Filter on Tanggal Terima (column B) - the date the document was received
        if (month) {
            data = data.filter(row => {
                const received = String(row[1] || "");
                // Stored as "yyyy-mm-dd hh:mm:ss"
                return received.slice(5, 7) === month;
            });
        }
        if (statusPegawai) {
            data = data.filter(row => String(row[5] || "").trim() === statusPegawai);
        }

        // Newest first
        data.reverse();

        const totalRows = data.length;
        const startIndex = (pageNumber - 1) * rowsPerPage;
        const pagedData = data.slice(startIndex, startIndex + rowsPerPage);

        return res.status(200).json({ data: pagedData, totalRows, rowsPerPage });

    } catch (error) {
        console.error("Error in /bendahara/monitor-perubahan-gaji:", error);
        return res.status(500).json({ error: "Failed to fetch dokumen gaji data" });
    }
});

// One row, read back for the edit form. Read unformatted so Tanggal Surat arrives as a
// serial number the server can turn into yyyy-mm-dd, instead of whatever display format
// the spreadsheet locale happens to use.
app.get("/dokumen-gaji/:rowNumber", async (req, res) => {
    try {
        if (!allowDokumenGajiWrite(req, res)) return;

        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const target = await loadDokumenGajiRow(req, res, spreadsheetId, { unformatted: true });
        if (!target) return;

        const { rowNumber, row } = target;
        return res.status(200).json({
            rowNumber,
            no: String(row[0] ?? "").trim(),
            tanggalSurat: toDateInputValue(row[2]),
            nomorSurat: String(row[3] ?? "").trim(),
            namaTercantum: String(row[4] ?? "").trim(),
            statusPegawai: String(row[5] ?? "").trim(),
            keteranganSurat: String(row[6] ?? "").trim(),
            fileLink: String(row[7] ?? "").trim(),
        });

    } catch (error) {
        console.error("Error in GET /dokumen-gaji/:rowNumber:", error);
        return res.status(500).json({ message: "Gagal memuat data, coba lagi." });
    }
});

// Edit. The Drive file keeps its id - the content is replaced in place when a new PDF is
// attached and the name is always rewritten, so the link already on the sheet stays valid.
app.put("/dokumen-gaji/:rowNumber", handleDokumenGajiUpload, async (req, res) => {
    try {
        if (!allowDokumenGajiWrite(req, res)) return;

        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const tanggalSurat = String(req.body.tanggalSurat || "").trim();
        const nomorSurat = String(req.body.nomorSurat || "").trim();
        const namaTercantum = String(req.body.namaTercantum || "").trim();
        const statusPegawai = String(req.body.statusPegawai || "").trim();
        const keteranganSurat = String(req.body.keteranganSurat || "").trim();

        if (!tanggalSurat || !nomorSurat || !namaTercantum || !statusPegawai || !keteranganSurat) {
            return res.status(400).json({ message: "Semua kolom wajib diisi." });
        }
        if (!STATUS_PEGAWAI_OPTIONS.includes(statusPegawai)) {
            return res.status(400).json({ message: "Status Pegawai tidak valid." });
        }

        const target = await loadDokumenGajiRow(req, res, spreadsheetId, {});
        if (!target) return;
        const { rowNumber, row } = target;

        if (!await requireGajiDriveReady(res, "Token Dokumen Gaji")) return;

        const fileName = dokumenGajiFileName(nomorSurat, keteranganSurat, namaTercantum);
        const media = req.file
            ? { mimeType: req.file.mimetype, body: bufferToStream(req.file.buffer) }
            : undefined;

        // Uploading a replacement for a row that never got a link needs the folder id,
        // the same way a fresh submission does
        async function uploadReplacement() {
            if (!driveFolderIdDokumenGaji) {
                throw new Error("DRIVE_FOLDER_ID_DOKUMEN_GAJI belum diatur - upload dibatalkan.");
            }
            const created = await driveGaji.files.create({
                requestBody: { name: fileName, parents: [driveFolderIdDokumenGaji] },
                media: { mimeType: req.file.mimetype, body: bufferToStream(req.file.buffer) },
                fields: "webViewLink",
                supportsAllDrives: true,
            });
            return created.data.webViewLink || "";
        }

        let fileLink = String(row[7] || "").trim();
        const fileId = extractDriveFileId(fileLink);
        if (fileId) {
            try {
                const updated = await driveGaji.files.update({
                    fileId,
                    requestBody: { name: fileName },
                    ...(media ? { media } : {}),
                    fields: "webViewLink",
                    supportsAllDrives: true,
                });
                fileLink = updated.data.webViewLink || fileLink;
            } catch (error) {
                // The file may have been removed from Drive by hand. A replacement was
                // attached, so upload it fresh instead of failing the whole edit.
                if (!req.file) throw error;
                console.error("Gagal memperbarui berkas Drive, mengunggah ulang:", error.message);
                fileLink = await uploadReplacement();
            }
        } else if (req.file) {
            fileLink = await uploadReplacement();
        }

        // A No. (column A) and Tanggal Terima (column B) are not the user's to change
        await writeRange(
            sheets,
            spreadsheetId,
            `'${DOKUMEN_GAJI_SHEET}'!C${rowNumber}:H${rowNumber}`,
            [[
                tanggalSurat,
                nomorSurat,
                namaTercantum,
                statusPegawai,
                keteranganSurat,
                fileLink,
            ]],
            "USER_ENTERED",
        );

        return res.status(200).json({ message: "Dokumen Berhasil Diperbarui" });

    } catch (error) {
        console.error("Error in PUT /dokumen-gaji/:rowNumber:", error);
        return res.status(500).json({ message: "Perubahan Gagal, Coba Lagi" });
    }
});

// Delete. Drive first: a stray file left behind is harmless, a row pointing at a file
// that is already gone is not, so nothing is removed from the sheet until the file is.
app.delete("/dokumen-gaji/:rowNumber", async (req, res) => {
    try {
        if (!allowDokumenGajiWrite(req, res)) return;

        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const target = await loadDokumenGajiRow(req, res, spreadsheetId, {});
        if (!target) return;
        const { rowNumber, row } = target;

        const fileId = extractDriveFileId(row[7]);
        if (fileId) {
            if (!await requireGajiDriveReady(res, "Token Dokumen Gaji")) return;
            try {
                await driveGaji.files.delete({ fileId, supportsAllDrives: true });
            } catch (error) {
                // Already gone is the outcome we wanted anyway
                if (error.code !== 404 && error.response?.status !== 404) throw error;
                console.log(`Berkas Drive ${fileId} sudah tidak ada, lanjut hapus baris.`);
            }
        }

        const sheetInfo = await withBackoff(async () => {
            return await sheets.spreadsheets.get({ spreadsheetId });
        });
        const sheetId = sheetInfo.data.sheets
            .find(s => s.properties.title === DOKUMEN_GAJI_SHEET)?.properties.sheetId;
        if (sheetId === undefined) {
            return res.status(500).json({ message: `Tab '${DOKUMEN_GAJI_SHEET}' tidak ditemukan.` });
        }

        await withBackoff(async () => {
            return await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId,
                                dimension: "ROWS",
                                startIndex: rowNumber - 1,  // deleteDimension is 0-based
                                endIndex: rowNumber,
                            }
                        }
                    }]
                }
            });
        });

        // Column A is a running counter and /dokumen-gaji/kirim derives the next No. from
        // how many rows it finds, so the numbering has to close up behind the deleted row
        const remainingResponse = await readRange(
            sheets,
            spreadsheetId,
            `'${DOKUMEN_GAJI_SHEET}'!A${DOKUMEN_GAJI_FIRST_ROW}:A`,
        );
        const remainingCount = (remainingResponse.data.values || []).length;
        if (remainingCount > 0) {
            await writeRange(
                sheets,
                spreadsheetId,
                `'${DOKUMEN_GAJI_SHEET}'!A${DOKUMEN_GAJI_FIRST_ROW}:A${DOKUMEN_GAJI_FIRST_ROW + remainingCount - 1}`,
                Array.from({ length: remainingCount }, (_, i) => [i + 1]),
                "RAW",
            );
        }

        return res.status(200).json({ message: "Dokumen Berhasil Dihapus" });

    } catch (error) {
        console.error("Error in DELETE /dokumen-gaji/:rowNumber:", error);
        return res.status(500).json({ message: "Penghapusan Gagal, Coba Lagi" });
    }
});

// --- Realisasi Anggaran -------------------------------------------------------
// Spending lives on 'Database SPM', the yearly budget ceiling on 'Code_Anggaran',
// both inside the SPREADSHEET_ID_VERIFSPM_<year> spreadsheet.
//
// There is no realisasi without a ceiling: a satker that has already spent money
// while its Code_Anggaran cell is still "0" is reported back as needing input,
// so the admin fills the ceiling in before any percentage is calculated.

const DATABASE_SPM_SHEET = "Database SPM";
const CODE_ANGGARAN_SHEET = "Code_Anggaran";

// 'Database SPM' column positions. Row 1 is the header, data starts on row 2.
// The range is read from column A so these indices line up with the sheet letters.
const SPM_COLUMN = {
    jenisSpm: 1,      // B
    tanggalSp2d: 7,   // H - "1-Jan-2026"
    belanja: 8,       // I - "100000000"
    unitKerja: 12,    // M
    jenisBelanja: 13, // N
    sumberDana: 16,   // Q
};

// 'Code_Anggaran': one row per satker from row 3 - A satker, B Rupiah Murni, C SBSN, D PLN
const CODE_ANGGARAN_FIRST_ROW = 3;
const CODE_ANGGARAN_LAST_COLUMN = "D";
const FUND_RUPIAH_MURNI = "rupiahMurni";
const FUND_SBSN = "sbsn";
const FUND_PLN = "pln";
// Order matters - it is the order the sheet columns sit in, B onwards
const FUND_KEYS = [FUND_RUPIAH_MURNI, FUND_SBSN, FUND_PLN];
const FUND_LABEL = { [FUND_RUPIAH_MURNI]: "Rupiah Murni", [FUND_SBSN]: "SBSN", [FUND_PLN]: "PLN" };

// Both sheets are maintained by hand, so "Dit Latihan", "DIT LATIHAN " and
// "Dit  Latihan" have to resolve to one satker instead of three.
function normalizeSatker(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Map the free text 'Sumber Dana' column onto a budget column. Returns null when
// the value is unrecognised so the caller can report it - silently dropping the
// row would understate realisasi.
function normalizeSumberDana(value) {
    const raw = normalizeSatker(value);
    if (raw === "") return null;
    if (raw.includes("SBSN")) return FUND_SBSN;
    if (raw.includes("RUPIAH MURNI") || raw === "RM") return FUND_RUPIAH_MURNI;
    // No PLN row exists on the SPM sheet yet - matched tightly so it cannot swallow
    // an unrelated code that happens to contain these letters
    if (raw === "PLN" || raw === "PHLN" || raw.includes("PINJAMAN LUAR NEGERI")) return FUND_PLN;
    return null;
}

// Accepts "100000000", "Rp 100.000.000", "(50000)" and "". Anything holding no
// digit at all returns NaN rather than 0, so a typo cannot pass as zero rupiah.
// Whole rupiah is assumed - neither sheet carries decimals.
function parseRupiah(value) {
    const raw = String(value ?? "").trim();
    if (raw === "") return 0;
    const isNegative = raw.startsWith("-") || /^\(.*\)$/.test(raw);
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") return NaN;
    return isNegative ? -Number(digits) : Number(digits);
}

// Read 'Code_Anggaran' into rows keyed by normalized satker name
function mapCodeAnggaran(anggaranRows) {
    const budgets = [];
    const budgetBySatker = new Map();

    anggaranRows.forEach((row, index) => {
        const satker = String(row?.[0] ?? "").trim();
        if (satker === "") return; // trailing blank rows

        const budget = {
            satker,
            rowNumber: CODE_ANGGARAN_FIRST_ROW + index,
            rupiahMurni: String(row?.[1] ?? ""),
            sbsn: String(row?.[2] ?? ""),
            pln: String(row?.[3] ?? ""),
            rupiahMurniNominal: parseRupiah(row?.[1]),
            sbsnNominal: parseRupiah(row?.[2]),
            plnNominal: parseRupiah(row?.[3]),
        };
        budgets.push(budget);
        // First row wins if a satker is listed twice - the duplicate is reported as a warning
        if (!budgetBySatker.has(normalizeSatker(satker))) {
            budgetBySatker.set(normalizeSatker(satker), budget);
        }
    });

    return { budgets, budgetBySatker };
}

// 'Database SPM' writes Unit Kerja in short form, 'Code_Anggaran' uses the full
// satker name. Keys are normalized, so spacing and casing do not matter here.
// The same pairing exists on the frontend as userSatkerNames in
// components/verifikasi/head-data.js - keep the two in step.
const UNIT_KERJA_ALIAS = {
    "BIRO SARPRAS": "Biro Sarana dan Prasarana",
    "BIRO RENCANA": "Biro Perencanaan",
    "DIT DATIN": "Dit Data dan Informasi",
    "DIT KERMA": "Dit Kerja Sama",
    "DIT OPSLA": "Dit Operasi Laut",
    "DIT OPSUD": "Dit Operasi Udara",
    "KPIML": "Puskodal",
    "UPH": "Unit Penindakan Hukum",
    "ZONA BARAT": "Zona Maritim Barat",
    "ZONA TENGAH": "Zona Maritim Tengah",
    "ZONA TIMUR": "Zona Maritim Timur",
};

// Unit Kerja as written on the SPM sheet -> the key its Code_Anggaran row is stored under
function resolveSatkerKey(unitKerja) {
    const key = normalizeSatker(unitKerja);
    const alias = UNIT_KERJA_ALIAS[key];
    return alias ? normalizeSatker(alias) : key;
}

// 'Tanggal SP2D' arrives as "1-Jan-2026" with Indonesian month tokens.
// English spellings are accepted too in case the sheet locale ever flips.
const MONTH_TOKENS = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6,
    JUL: 7, AGU: 8, AGT: 8, AGS: 8, AUG: 8, SEP: 9, OKT: 10,
    OCT: 10, NOV: 11, DES: 12, DEC: 12,
};

// "1-Jan-2026" -> 1. Returns null when the token is unreadable, so the row can be
// reported instead of silently landing in January.
function parseMonthSp2d(value) {
    const token = String(value ?? "").split("-")[1];
    if (!token) return null;
    return MONTH_TOKENS[token.trim().toUpperCase()] ?? null;
}

// Jenis SPM that must not count as belanja. Matched whole, never as a substring -
// "UP" sits alongside "GUP", "GUP-KKP" and "TUP", which do count.
const EXCLUDED_JENIS_SPM = ["PEMBAYARAN RPATA", "UP"];

function isExcludedJenisSpm(jenisSpm) {
    return EXCLUDED_JENIS_SPM.includes(normalizeSatker(jenisSpm));
}

function emptyFundTotals() {
    return { rupiahMurni: 0, sbsn: 0, pln: 0, total: 0 };
}

// One bucket per month so the frontend can move the month filter without refetching
function emptyMonthlyBuckets() {
    return Array.from({ length: 12 }, (_, index) => ({ month: index + 1, ...emptyFundTotals() }));
}

function addToFundTotals(target, fund, nominal) {
    target[fund] += nominal;
    target.total += nominal;
}

// Home dashboard counters. Both sheets each need one batchGet - the antrian pair and
// 'Database SPM' live in different spreadsheets behind different service accounts.
const SPM_UP_JENIS = ["GUP", "GUP-KKP", "PTUP"];
const SPM_NON_LS_JENIS = [...SPM_UP_JENIS, "PEMBAYARAN RPATA", "UP", "TUP", "GUP NIHIL"];

app.get("/home/dashboard", async (req, res) => {
    try {
        const viewer = req.viewer;
        const isAdminViewer = ["admin", "master admin", "admin_gaji"].includes(viewer.role);
        const viewerKey = normalizeSatker(viewer.name);

        const verifFlow = AJUAN_FLOWS.verif;
        const spmSpreadsheetId = getSpreadsheetId(req, 'VERIFSPM');

        const [antrianResponse, spmResponse] = await Promise.all([
            readRanges(
                sheets,
                getSpreadsheetId(req, 'AJUAN'),
                [
                    `'${verifFlow.antrianSheet}'!A3:${verifFlow.antrianLastColumn}`,
                    `'${AJUAN_FLOWS.gup.antrianSheet}'!A:${AJUAN_FLOWS.gup.antrianLastColumn}`,
                ],
            ),
            spmSpreadsheetId
                ? readRange(sheets2, spmSpreadsheetId, `'${DATABASE_SPM_SHEET}'!A2:Q`)
                : null,
        ]);

        // GUP/PTUP carry a second verification on their 'Write Antrian' original, so the
        // mirror alone does not say whether the pengajuan is done
        const gupByKey = new Map();
        for (const row of antrianResponse.data.valueRanges[1].values || []) {
            gupByKey.set(mirrorRowKey(row?.[1], row?.[2]), row);
        }

        const pengajuan = { belum: 0, sedang: 0, sudah: 0 };
        for (const row of antrianResponse.data.valueRanges[0].values || []) {
            if (!filled(row?.[0])) continue;
            if (!isAdminViewer && normalizeSatker(row[verifFlow.antrianMap[ANTRIAN_UNIT_KERJA_INDEX]]) !== viewerKey) continue;

            const mulai = [row[PJK_COLUMN.mulaiVerif]];
            const selesai = [row[PJK_COLUMN.selesaiVerif]];
            if (resolveJenis(row[3])?.flow === "gup") {
                const origin = gupByKey.get(mirrorRowKey(row[1], row[2]));
                mulai.push(origin?.[14]);
                selesai.push(origin?.[15]);
            }

            if (selesai.every(filled)) pengajuan.sudah++;
            else if (mulai.some(filled)) pengajuan.sedang++;
            else pengajuan.belum++;
        }

        const spm = { total: 0, up: 0, ls: 0 };
        for (const row of spmResponse?.data.values || []) {
            const jenis = normalizeSatker(row?.[SPM_COLUMN.jenisSpm]);
            if (jenis === "") continue;
            if (!isAdminViewer && resolveSatkerKey(row?.[SPM_COLUMN.unitKerja]) !== viewerKey) continue;

            spm.total++;
            if (SPM_UP_JENIS.includes(jenis)) spm.up++;
            else if (!SPM_NON_LS_JENIS.includes(jenis)) spm.ls++;
        }

        return res.status(200).json({ pengajuan, spm });

    } catch (error) {
        console.error("Error in /home/dashboard:", error);
        return res.status(500).json({ error: "Failed to fetch dashboard data." });
    }
})

// Realisasi Anggaran - budget ceilings, spending aggregated per satker per month,
// and who still has to fill a ceiling in. Pass ?detail=1 to also get the raw SPM rows.
app.get("/verifikasi/realisasi-anggaran", async (req, res) => {
    try {
        const viewer = req.viewer;

        const spreadsheetId = getSpreadsheetId(req, 'VERIFSPM');
        // Only the year suffixed key exists, there is no bare SPREADSHEET_ID_VERIFSPM
        // fallback - fail here instead of letting Google reject an undefined id
        if (!spreadsheetId) {
            return res.status(400).json({ message: "Spreadsheet SPM untuk tahun ini belum dikonfigurasi." });
        }

        const response = await readRanges(
            sheets2,
            spreadsheetId,
            [
                `'${DATABASE_SPM_SHEET}'!A2:Q`,
                `'${CODE_ANGGARAN_SHEET}'!A${CODE_ANGGARAN_FIRST_ROW}:${CODE_ANGGARAN_LAST_COLUMN}`,
            ],
        );

        const spmRows = response.data.valueRanges[0].values || [];
        const anggaranRows = response.data.valueRanges[1].values || [];

        const { budgets } = mapCodeAnggaran(anggaranRows);

        // Seed one entry per Code_Anggaran satker so a satker that has not spent
        // anything yet still shows up with its ceiling
        const summaryBySatker = new Map();
        const invalidAnggaran = [];
        budgets.forEach(budget => {
            const anggaran = emptyFundTotals();
            FUND_KEYS.forEach(fund => {
                const nominal = budget[`${fund}Nominal`];
                if (Number.isNaN(nominal)) return; // reported below, counted as 0
                anggaran[fund] = nominal;
                anggaran.total += nominal;
            });
            if (FUND_KEYS.some(fund => Number.isNaN(budget[`${fund}Nominal`]))) {
                invalidAnggaran.push({
                    satker: budget.satker,
                    rowNumber: budget.rowNumber,
                    rupiahMurni: budget.rupiahMurni,
                    sbsn: budget.sbsn,
                    pln: budget.pln,
                });
            }
            summaryBySatker.set(normalizeSatker(budget.satker), {
                satker: budget.satker,
                rowNumber: budget.rowNumber,
                matched: true,
                anggaran,
                belanja: emptyFundTotals(),
                monthly: emptyMonthlyBuckets(),
                byJenisBelanja: {},
            });
        });

        const spending = [];
        // Keyed by the raw cell value - these rows carry real money that lands in no
        // fund column, so the amount is reported, not just the label
        const unknownSumberDana = new Map();
        const excludedJenisSpm = new Map();
        const unmatchedUnitKerja = new Set();
        const invalidBelanja = [];
        const invalidTanggal = [];

        spmRows.forEach((row, index) => {
            const item = {
                rowNumber: 2 + index,
                jenisSpm: String(row?.[SPM_COLUMN.jenisSpm] ?? "").trim(),
                tanggalSp2d: String(row?.[SPM_COLUMN.tanggalSp2d] ?? "").trim(),
                belanja: String(row?.[SPM_COLUMN.belanja] ?? "").trim(),
                unitKerja: String(row?.[SPM_COLUMN.unitKerja] ?? "").trim(),
                jenisBelanja: String(row?.[SPM_COLUMN.jenisBelanja] ?? "").trim(),
                sumberDana: String(row?.[SPM_COLUMN.sumberDana] ?? "").trim(),
            };
            // Skip the blank rows a sheet range always trails
            if (item.jenisSpm === "" && item.unitKerja === "" && item.belanja === "") return;

            const nominal = parseRupiah(item.belanja);
            item.belanjaNominal = Number.isNaN(nominal) ? 0 : nominal;
            if (Number.isNaN(nominal)) {
                invalidBelanja.push({ rowNumber: item.rowNumber, unitKerja: item.unitKerja, belanja: item.belanja });
            }

            // Kept in the detail list but never counted as belanja
            item.excluded = isExcludedJenisSpm(item.jenisSpm);
            if (item.excluded) {
                const seen = excludedJenisSpm.get(item.jenisSpm) || { jenisSpm: item.jenisSpm, rows: 0, totalBelanja: 0 };
                seen.rows += 1;
                seen.totalBelanja += item.belanjaNominal;
                excludedJenisSpm.set(item.jenisSpm, seen);
                spending.push(item);
                return;
            }

            const fund = normalizeSumberDana(item.sumberDana);
            item.sumberDanaKey = fund; // null when the sheet holds something unexpected
            if (!fund) {
                const label = item.sumberDana === "" ? "(kosong)" : item.sumberDana;
                const seen = unknownSumberDana.get(label) || { sumberDana: label, rows: 0, totalBelanja: 0 };
                seen.rows += 1;
                seen.totalBelanja += item.belanjaNominal;
                unknownSumberDana.set(label, seen);
            }

            spending.push(item);

            if (item.unitKerja === "" || !fund || item.belanjaNominal === 0) return;

            // Aggregate onto the satker this Unit Kerja resolves to
            const satkerKey = resolveSatkerKey(item.unitKerja);
            let entry = summaryBySatker.get(satkerKey);
            if (!entry) {
                // Spending from a satker with no Code_Anggaran row - kept visible with a
                // zero ceiling rather than dropped, so the money is never hidden
                unmatchedUnitKerja.add(item.unitKerja);
                entry = {
                    satker: item.unitKerja,
                    rowNumber: null,
                    matched: false,
                    anggaran: emptyFundTotals(),
                    belanja: emptyFundTotals(),
                    monthly: emptyMonthlyBuckets(),
                    byJenisBelanja: {},
                };
                summaryBySatker.set(satkerKey, entry);
            }

            addToFundTotals(entry.belanja, fund, item.belanjaNominal);

            const jenis = item.jenisBelanja || "-";
            const jenisBucket = entry.byJenisBelanja[jenis]
                || (entry.byJenisBelanja[jenis] = { total: 0, monthly: Array(12).fill(0) });
            jenisBucket.total += item.belanjaNominal;

            const month = parseMonthSp2d(item.tanggalSp2d);
            item.bulan = month;
            if (month) {
                addToFundTotals(entry.monthly[month - 1], fund, item.belanjaNominal);
                jenisBucket.monthly[month - 1] += item.belanjaNominal;
            } else {
                // Counted in the yearly total but not in any month, so a cumulative
                // filter can never quietly exceed the full year figure
                invalidTanggal.push({ rowNumber: item.rowNumber, unitKerja: item.unitKerja, tanggalSp2d: item.tanggalSp2d });
            }
        });

        // role="user" only ever sees its own satker - the lite dashboard on Home reads
        // this same route, and filtering on the client would still ship every figure
        const isAdminViewer = ["admin", "master admin", "admin_gaji"].includes(viewer.role);
        const viewerKey = normalizeSatker(viewer.name);
        const canSee = entry => isAdminViewer || normalizeSatker(entry.satker) === viewerKey;

        const summary = [...summaryBySatker.values()]
            .filter(canSee)
            .sort((a, b) => a.satker.localeCompare(b.satker));
        const visibleBudgets = budgets.filter(canSee);

        // Grand total row - the frontend slices monthly the same way it does per satker
        const totals = {
            anggaran: emptyFundTotals(),
            belanja: emptyFundTotals(),
            monthly: emptyMonthlyBuckets(),
        };
        summary.forEach(entry => {
            FUND_KEYS.forEach(fund => {
                addToFundTotals(totals.anggaran, fund, entry.anggaran[fund]);
                addToFundTotals(totals.belanja, fund, entry.belanja[fund]);
                entry.monthly.forEach((bucket, index) => addToFundTotals(totals.monthly[index], fund, bucket[fund]));
            });
        });

        // A satker that has spent from a fund whose ceiling is still 0 - or that has no
        // Code_Anggaran row at all - blocks the realisasi calculation
        const needsBudgetInput = [];
        summary.forEach(entry => {
            FUND_KEYS.forEach(fund => {
                if (entry.belanja[fund] <= 0) return;
                if (!entry.matched) {
                    needsBudgetInput.push({
                        satker: entry.satker,
                        sumberDana: FUND_LABEL[fund],
                        sumberDanaKey: fund,
                        rowNumber: null,
                        totalBelanja: entry.belanja[fund],
                        reason: "satker-belum-ada-di-code-anggaran",
                        message: `${entry.satker} belum terdaftar di Code_Anggaran.`,
                    });
                    return;
                }
                if (entry.anggaran[fund] === 0) {
                    needsBudgetInput.push({
                        satker: entry.satker,
                        sumberDana: FUND_LABEL[fund],
                        sumberDanaKey: fund,
                        rowNumber: entry.rowNumber,
                        totalBelanja: entry.belanja[fund],
                        reason: "anggaran-masih-nol",
                        message: `Anggaran ${FUND_LABEL[fund]} untuk ${entry.satker} masih 0, mohon diisi terlebih dahulu.`,
                    });
                }
            });
        });

        const duplicateSatker = visibleBudgets
            .map(budget => budget.satker)
            .filter((satker, index, all) => all.findIndex(other => normalizeSatker(other) === normalizeSatker(satker)) !== index);

        return res.status(200).json({
            budgetComplete: needsBudgetInput.length === 0,
            needsBudgetInput,
            budgets: visibleBudgets,
            summary,
            totals,
            warnings: {
                unknownSumberDana: [...unknownSumberDana.values()],
                excludedJenisSpm: [...excludedJenisSpm.values()],
                unmatchedUnitKerja: [...unmatchedUnitKerja],
                invalidBelanja,
                invalidTanggal,
                invalidAnggaran,
                duplicateSatker,
            },
            // 500+ rows are only worth shipping when something needs checking by hand
            ...(req.query.detail === "1" ? { spending } : {}),
        });

    } catch (error) {
        console.error("Error in /verifikasi/realisasi-anggaran:", error);
        return res.status(500).json({ error: "Failed to fetch realisasi anggaran data" });
    }
});

// Validate one budget cell coming from the admin form
function parseBudgetInput(value, label) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return { ok: false, message: `Nilai ${label} tidak boleh kosong.` };
    }
    const nominal = parseRupiah(value);
    if (Number.isNaN(nominal) || !Number.isInteger(nominal) || nominal < 0) {
        return { ok: false, message: `Nilai ${label} harus berupa angka bulat tidak negatif.` };
    }
    return { ok: true, value: nominal };
}

// Write a satker's budget ceiling onto 'Code_Anggaran'. Send only the fund you
// want to change - the other one keeps whatever the sheet already holds.
app.patch("/verifikasi/code-anggaran", async (req, res) => {
    try {
        const { satker } = req.body;
        if (!satker || String(satker).trim() === "") {
            return res.status(400).json({ message: "Nama satker wajib diisi." });
        }
        if (FUND_KEYS.every(fund => req.body[fund] === undefined)) {
            return res.status(400).json({ message: "Tidak ada nilai anggaran yang dikirim." });
        }

        // Validate every fund that was sent before touching the sheet, so a bad SBSN
        // cannot land after a good Rupiah Murni has already been written
        const parsedFunds = {};
        for (const fund of FUND_KEYS) {
            if (req.body[fund] === undefined) continue;
            const parsed = parseBudgetInput(req.body[fund], FUND_LABEL[fund]);
            if (!parsed.ok) return res.status(400).json({ message: parsed.message });
            parsedFunds[fund] = parsed.value;
        }

        const spreadsheetId = getSpreadsheetId(req, 'VERIFSPM');
        if (!spreadsheetId) {
            return res.status(400).json({ message: "Spreadsheet SPM untuk tahun ini belum dikonfigurasi." });
        }

        // Read first - the row number of a satker is not knowable up front, and the
        // fund that was not sent has to keep its current value
        const response = await readRange(
            sheets2,
            spreadsheetId,
            `'${CODE_ANGGARAN_SHEET}'!A${CODE_ANGGARAN_FIRST_ROW}:C`,
        );

        const { budgetBySatker } = mapCodeAnggaran(response.data.values || []);
        const budget = budgetBySatker.get(normalizeSatker(satker));
        if (!budget) {
            return res.status(404).json({ message: `Satker "${String(satker).trim()}" tidak ditemukan di Code_Anggaran.` });
        }

        // Stored as strings, matching how the sheet already holds "0". A fund that was
        // not sent keeps the value just read back.
        const nextValues = FUND_KEYS.map(fund => parsedFunds[fund] !== undefined ? String(parsedFunds[fund]) : budget[fund]);

        await writeRange(
            sheets2,
            spreadsheetId,
            `'${CODE_ANGGARAN_SHEET}'!B${budget.rowNumber}:${CODE_ANGGARAN_LAST_COLUMN}${budget.rowNumber}`,
            [nextValues],
            "RAW",
        );

        return res.status(200).json({
            message: "Anggaran berhasil disimpan.",
            data: {
                satker: budget.satker,
                rowNumber: budget.rowNumber,
                ...Object.fromEntries(FUND_KEYS.map((fund, index) => [fund, nextValues[index]])),
            },
        });

    } catch (error) {
        console.error("Error in /verifikasi/code-anggaran:", error);
        return res.status(500).json({ error: "Failed to update code anggaran" });
    }
});

// --- Pembayaran BP ------------------------------------------------------------
// Values pass through as the text the sheet shows; only the month is parsed. Column O
// is a date column holding "WITHDRAWAL" on one row, so parsing could only lose data.

const PEMBAYARAN_BP_SHEET_PREFIX = "PEMBAYARAN BP";
const PEMBAYARAN_BP_FIRST_ROW = 5;   // row 4 is the header, rows 1-3 are the title block
const PEMBAYARAN_BP_RANGE = "B5:U";  // read starts at B, so index 0 below is column B

// index is the offset from column B. I, J, L, R and T fall inside the read but are
// deliberately not returned.
const PEMBAYARAN_BP_COLUMNS = [
    { index: 0,  key: "no",                     label: "No" },                          // B
    { index: 1,  key: "tanggalSp2d",            label: "Tanggal SP2D" },                // C, dd-mm-yyyy, drives the month filter
    { index: 2,  key: "nomorSpm",               label: "Nomor SPM" },                   // D, zero padded, stays text
    { index: 3,  key: "jenis",                  label: "Jenis" },                       // E
    { index: 4,  key: "va",                     label: "VA" },                          // F
    { index: 5,  key: "unitKerja",              label: "Unit Kerja" },                  // G
    { index: 6,  key: "nilaiSp2d",              label: "Nilai SP2D" },                  // H
    { index: 9,  key: "kodeBniDirect",          label: "Kode BNI Direct" },             // K
    { index: 11, key: "buktiBayar",             label: "Bukti Bayar", link: true },     // M
    { index: 12, key: "statusBayarPenerima",    label: "Status Bayar Penerima" },       // N
    { index: 13, key: "tanggalBayarPenerima",   label: "Tanggal Bayar Penerima" },      // O
    { index: 14, key: "statusPajak",            label: "Status Pajak" },                // P
    { index: 15, key: "tanggalTrxPajak",        label: "Tanggal Trx Pajak" },           // Q
    { index: 17, key: "buktiBayarDepositPajak", label: "Bukti Bayar Deposit Pajak", link: true }, // S
    { index: 19, key: "keterangan",              label: "Keterangan" },                  // U
];

// Guards the month filter: a cell that is not dd-mm-yyyy cannot match a month.
const PEMBAYARAN_BP_DATE = /^\d{2}-\d{2}-\d{4}$/;
const monthOfSheetDate = (value) => PEMBAYARAN_BP_DATE.test(value) ? value.slice(3, 5) : null;

function pembayaranBpSpreadsheet(req, res) {
    const spreadsheetId = getSpreadsheetId(req, 'PEMBAYARAN_BP');
    if (!spreadsheetId) {
        res.status(400).json({ message: "Spreadsheet Pembayaran BP untuk tahun ini belum dikonfigurasi." });
        return null;
    }
    return spreadsheetId;
}

// The tab name carries the year, so it must follow the year the id was resolved with.
const pembayaranBpSheetName = (req) => `${PEMBAYARAN_BP_SHEET_PREFIX} ${getRequestYear(req)}`;

// M and S hold file drop attachments: plain string cells with a cell level hyperlink,
// not smart chips, so values.get would return the name with no way back to the file.
// Cells typed by hand ("WITHDRAWAL") have no hyperlink, so url comes back empty.
const pembayaranBpLink = (cell) => ({
    nama: String(cell?.formattedValue ?? "").trim(),
    url: String(cell?.hyperlink ?? "").trim(),
});

// The statuses that say a berkas is not owed. All are values of the sheet's own
// dropdowns, so they have to be spelled exactly as N and P offer them. WITHDRAWAL counts
// as finished just like SELESAI, and by its nature never produces a Bukti Bayar.
const STATUS_BAYAR_SELESAI = ["SELESAI", "WITHDRAWAL"];
const STATUS_PAJAK_TANPA_DEPOSIT = "NON PAJAK";

const bayarSelesai = (status) => STATUS_BAYAR_SELESAI.includes(normalizeSatker(status));

// A cell typed by hand ("WITHDRAWAL", "sisa dana") carries no url but is an answer all
// the same, so this asks for nama, not url. A blank status is not SELESAI and not
// NON PAJAK, which is what leaves a freshly added row flagged until it is filled in.
const pembayaranBpBerkasKurang = (record) => ({
    buktiBayar: !record.buktiBayar.nama && !bayarSelesai(record.statusBayarPenerima),
    buktiBayarDepositPajak: !record.buktiBayarDepositPajak.nama
        && normalizeSatker(record.statusPajak) !== STATUS_PAJAK_TANPA_DEPOSIT,
});

function pembayaranBpToRecord(cells, rowNumber) {
    const record = { rowNumber };
    for (const column of PEMBAYARAN_BP_COLUMNS) {
        const cell = cells?.[column.index];
        record[column.key] = column.link
            ? pembayaranBpLink(cell)
            : String(cell?.formattedValue ?? "").trim();
    }
    record.berkasKurang = pembayaranBpBerkasKurang(record);
    return record;
}

const kurangBerkas = (record, which) => which === "any"
    ? record.berkasKurang.buktiBayar || record.berkasKurang.buktiBayarDepositPajak
    : Boolean(record.berkasKurang[which]);

// Distinct values as spelled in the data, so the filters cannot drift from it.
function pembayaranBpOptions(records) {
    const collect = (key) => [...new Set(records.map(record => record[key]).filter(Boolean))].sort();
    return {
        unitKerja: collect("unitKerja"),
        jenis: collect("jenis"),
        statusBayar: collect("statusBayarPenerima"),
        statusPajak: collect("statusPajak"),
    };
}

// Grid data, not values.get: the only read carrying the hyperlinks in M and S. Not
// trimmed like values.get either, so the blank tail is dropped on No.
async function readPembayaranBpRecords(spreadsheetId, sheetName) {
    const response = await withBackoff(() => sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: [`'${sheetName}'!${PEMBAYARAN_BP_RANGE}`],
        fields: "sheets(data(rowData(values(formattedValue,hyperlink))))",
    }));
    return (response.data.sheets?.[0]?.data?.[0]?.rowData || [])
        .map((row, index) => pembayaranBpToRecord(row.values, PEMBAYARAN_BP_FIRST_ROW + index))
        .filter(record => record.no !== "");
}

app.get("/bendahara/pembayaran-bp", async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const { page = 1, limit = 10, unitKerja = "", jenis = "", statusBayar = "",
            belumSelesai = "", statusPajak = "", cari = "", berkas = "" } = req.query;
        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        // limit=all serves SPM Bendahara, whose watchlist is short and paginated in the
        // browser: one read instead of one per page. The cap stays for the paged table.
        const unpaged = limit === "all";
        const rowsPerPage = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);

        const records = pembayaranBpVisibleTo(
            await readPembayaranBpRecords(spreadsheetId, sheetName), req.viewer);

        const options = pembayaranBpOptions(records);

        // Absent bulan = no opinion, so use the current Jakarta month and echo it back.
        // An empty bulan is an explicit request for every month.
        const askedForMonth = req.query.bulan !== undefined;
        let bulan = askedForMonth ? String(req.query.bulan).trim() : getFormattedDate().MonthDateFormat.slice(5, 7);

        const applyFilters = (month) => records.filter(record => {
            if (month && monthOfSheetDate(record.tanggalSp2d) !== month) return false;
            if (unitKerja && normalizeSatker(record.unitKerja) !== normalizeSatker(unitKerja)) return false;
            if (jenis && normalizeSatker(record.jenis) !== normalizeSatker(jenis)) return false;
            if (statusBayar && normalizeSatker(record.statusBayarPenerima) !== normalizeSatker(statusBayar)) return false;
            if (belumSelesai && bayarSelesai(record.statusBayarPenerima)) return false;
            if (statusPajak && normalizeSatker(record.statusPajak) !== normalizeSatker(statusPajak)) return false;
            if (cari && !record.nomorSpm.toLowerCase().includes(String(cari).trim().toLowerCase())) return false;
            return true;
        });

        // Berkas sits outside applyFilters so the warning below can be read off the wider
        // set - asking the filtered rows would always say yes once the filter is on.
        const byBerkas = (rows) => berkas ? rows.filter(record => kurangBerkas(record, berkas)) : rows;

        let scoped = applyFilters(bulan);
        let filtered = byBerkas(scoped);
        // Opening in a month the sheet has not reached yet would show an empty table
        if (!askedForMonth && filtered.length === 0) {
            bulan = "";
            scoped = applyFilters(bulan);
            filtered = byBerkas(scoped);
        }

        // Only whether anything is outstanding: the screen shows a warning, not a tally
        const adaBerkasKurang = scoped.some(record => kurangBerkas(record, "any"));

        filtered = [...filtered].reverse();   // the sheet runs chronologically, newest last

        const totalRows = filtered.length;
        const startIndex = (pageNumber - 1) * rowsPerPage;

        return res.status(200).json({
            data: unpaged ? filtered : filtered.slice(startIndex, startIndex + rowsPerPage),
            totalRows,
            rowsPerPage: unpaged ? totalRows : rowsPerPage,
            bulan,
            adaBerkasKurang,
            options,
        });
    } catch (error) {
        // A new year needs a new tab; that shows up as a range parse error
        if (String(error?.message || "").includes("Unable to parse range")) {
            console.error(`Tab '${sheetName}' tidak ditemukan pada spreadsheet Pembayaran BP.`);
            return res.status(400).json({ message: `Tab "${sheetName}" tidak ditemukan di spreadsheet Pembayaran BP.` });
        }
        console.error("Error in GET /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal memuat data Pembayaran BP." });
    }
});

// --- Pembayaran BP: writing ---------------------------------------------------
// A, B, G, K, R and T are formulas a write must never touch. B above all: it is one
// spilling =SEQUENCE(COUNTA(C5:C2013)) in B5, so writing any cell of B turns the whole
// column into #REF!. A new row's No simply appears once its Tanggal SP2D is filled in.

const PEMBAYARAN_BP_MAX_FILE_MB = 10;
const driveFolderIdPembayaranBp = process.env.DRIVE_FOLDER_ID_PEMBAYARAN_BP;

// Column letter -> 0 based sheet column
const columnIndexOf = (letter) => letter.charCodeAt(0) - 65;

// Keyed by the column each field lands in. Unit Kerja is absent on purpose: G derives
// it from the VA in F, so the form offers unit names and writes back only the code.
const PEMBAYARAN_BP_FIELDS = [
    { key: "tanggalSp2d",            column: "C", type: "date",  required: true, label: "Tanggal SP2D" },
    { key: "nomorSpm",               column: "D", type: "spm",   required: true, label: "Nomor SPM" },
    { key: "jenis",                  column: "E", type: "enum",  required: true, label: "Jenis", source: "jenis" },
    { key: "va",                     column: "F", type: "enum",  required: true, label: "Unit Kerja", source: "va" },
    { key: "nilaiSp2d",              column: "H", type: "money", required: true, label: "Nilai SP2D" },
    { key: "buktiBayar",             column: "M", type: "link",  label: "Bukti Bayar" },
    { key: "statusBayarPenerima",    column: "N", type: "enum",  label: "Status Bayar Penerima", source: "statusBayar" },
    { key: "tanggalBayarPenerima",   column: "O", type: "date",  label: "Tanggal Bayar Penerima" },
    { key: "statusPajak",            column: "P", type: "enum",  label: "Status Pajak", source: "statusPajak" },
    { key: "tanggalTrxPajak",        column: "Q", type: "date",  label: "Tanggal Trx Pajak" },
    { key: "buktiBayarDepositPajak", column: "S", type: "link",  label: "Bukti Bayar Deposit Pajak" },
    { key: "keterangan",             column: "U", type: "text",  label: "Keterangan" },
];
const PEMBAYARAN_BP_FIELD_AT = new Map(PEMBAYARAN_BP_FIELDS.map(field => [columnIndexOf(field.column), field]));

// Runs of columns a write may cover, cut so the formula columns fall in the gaps.
// Create blanks I, J and L, which the copy below would otherwise leave holding the
// template row's values; edit steps around them so whatever a human put there survives.
const PEMBAYARAN_BP_RUNS_CREATE = [["C", "F"], ["H", "J"], ["L", "Q"], ["S", "S"], ["U", "U"]];
const PEMBAYARAN_BP_RUNS_EDIT = [["C", "F"], ["H", "H"], ["M", "Q"], ["S", "S"], ["U", "U"]];

// Inverse of toDateInputValue. Writing the serial rather than "26-01-2026" keeps the
// value a real date whatever the spreadsheet's locale does with text.
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
function toSheetSerial(value) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
    if (!parts) return null;
    const [, year, month, day] = parts;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
    return Math.round((Date.UTC(Number(year), Number(month) - 1, Number(day)) - SHEETS_EPOCH_UTC) / 86400000);
}

// The form asks for these every time the panel opens, so cache them per spreadsheet +
// tab rather than making three Google round trips each time.
const PEMBAYARAN_BP_CACHE_TTL_MS = 5 * 60 * 1000;
const pembayaranBpCache = new Map();

function cached(key, produce, ttl = PEMBAYARAN_BP_CACHE_TTL_MS) {
    const hit = pembayaranBpCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = produce();
    pembayaranBpCache.set(key, { value, expires: Date.now() + ttl });
    // Never remember a rejection, or one blip poisons the cache for 5 minutes
    Promise.resolve(value).catch(() => pembayaranBpCache.delete(key));
    return value;
}

function pembayaranBpSheetId(spreadsheetId, sheetName) {
    return cached(`id|${spreadsheetId}|${sheetName}`, async () => {
        const response = await withBackoff(() => sheets.spreadsheets.get({
            spreadsheetId, fields: "sheets.properties(sheetId,title)",
        }));
        const match = (response.data.sheets || []).find(sheet => sheet.properties?.title === sheetName);
        if (!match) throw new Error(`Tab "${sheetName}" tidak ditemukan.`);
        return match.properties.sheetId;
    });
}

// The lists the sheet enforces, not what happens to be in the data. Three live on
// DROPDOWNBASE; Status Bayar Penerima is a literal list on column N's validation rule.
function pembayaranBpFormOptions(spreadsheetId, sheetName) {
    return cached(`options|${spreadsheetId}|${sheetName}`, async () => {
        const [lists, validation] = await Promise.all([
            // Unformatted: VA codes are mixed types ("0" and "00" text, 1..19 numbers)
            withBackoff(() => sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                valueRenderOption: "UNFORMATTED_VALUE",
                ranges: [
                    "DROPDOWNBASE!B5:C25",  // VA -> Unit Kerja
                    "DROPDOWNBASE!E5:E17",  // Jenis
                    "DROPDOWNBASE!I5:I7",   // Status Pajak
                ],
            })),
            withBackoff(() => sheets.spreadsheets.get({
                spreadsheetId,
                includeGridData: true,
                ranges: [`'${sheetName}'!N${PEMBAYARAN_BP_FIRST_ROW}`],
                fields: "sheets(data(rowData(values(dataValidation(condition(values(userEnteredValue)))))))",
            })),
        ]);

        const ranges = lists.data.valueRanges || [];
        const flat = (index) => (ranges[index]?.values || [])
            .map(row => String(row?.[0] ?? "").trim()).filter(Boolean);

        return {
            va: (ranges[0]?.values || [])
                .filter(row => String(row?.[0] ?? "").trim() !== "")
                // raw is the code as the sheet stores it; kode is how it is shown
                .map(row => ({ kode: String(row[0]).trim(), raw: row[0], unitKerja: String(row[1] ?? "").trim() })),
            jenis: flat(1),
            statusPajak: flat(2),
            statusBayar: (validation.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]
                ?.dataValidation?.condition?.values || [])
                .map(item => String(item.userEnteredValue ?? "").trim()).filter(Boolean),
        };
    });
}

// label is what the form sends, value what the cell must hold. They differ for VA: G
// resolves Unit Kerja with FILTER(DROPDOWNBASE!B:B = F), which never matches across
// types, so a code stored as 17 cannot be written back as "17".
const allowedOptions = (options, source) =>
    source === "va"
        ? options.va.map(item => ({ label: item.kode, value: item.raw }))
        : (options[source] || []).map(item => ({ label: item, value: item }));

// Returns CellData for updateCells. An empty object clears the cell.
function pembayaranBpCell(field, raw, options) {
    const value = String(raw ?? "").trim();
    if (field.type === "link") {
        const nama = String(raw?.nama ?? "").trim();
        if (!nama) return { ok: true, cell: {} };
        const url = String(raw?.url ?? "").trim();
        return { ok: true, cell: {
            userEnteredValue: { stringValue: nama },
            // Same shape as the sheet's own file drop attachments. =HYPERLINK cannot be
            // used: this locale separates arguments with ";" so the comma form errors.
            ...(url ? { textFormatRuns: [{ startIndex: 0, format: { link: { uri: url } } }] } : {}),
        }};
    }
    if (value === "") {
        if (field.required) return { ok: false, message: `${field.label} wajib diisi.` };
        return { ok: true, cell: {} };
    }
    switch (field.type) {
        case "date": {
            const serial = toSheetSerial(value);
            if (serial === null) return { ok: false, message: `${field.label} bukan tanggal yang sah.` };
            return { ok: true, cell: { userEnteredValue: { numberValue: serial } } };
        }
        case "money": {
            const nominal = parseRupiah(value);
            if (Number.isNaN(nominal)) return { ok: false, message: `${field.label} bukan angka.` };
            if (nominal < 0) return { ok: false, message: `${field.label} tidak boleh negatif.` };
            return { ok: true, cell: { userEnteredValue: { numberValue: nominal } } };
        }
        case "spm": {
            // String, not a number: a number drops the leading zeros K reads back
            const digits = value.replace(/\D/g, "");
            if (!digits) return { ok: false, message: `${field.label} harus berupa angka.` };
            return { ok: true, cell: { userEnteredValue: { stringValue: digits.padStart(5, "0") } } };
        }
        case "enum": {
            const match = allowedOptions(options, field.source)
                .find(option => normalizeSatker(option.label) === normalizeSatker(value));
            if (!match) return { ok: false, message: `${field.label} "${value}" tidak dikenal di spreadsheet.` };
            return { ok: true, cell: { userEnteredValue: typeof match.value === "number"
                ? { numberValue: match.value }
                : { stringValue: String(match.value) } } };
        }
        default:
            return { ok: true, cell: { userEnteredValue: { stringValue: value } } };
    }
}

function pembayaranBpCells(body, links, options) {
    const cells = {};
    for (const field of PEMBAYARAN_BP_FIELDS) {
        const raw = field.type === "link" ? links[field.key] : body?.[field.key];
        const result = pembayaranBpCell(field, raw, options);
        if (!result.ok) return result;
        cells[field.key] = result.cell;
    }
    return { ok: true, cells };
}

// One updateCells per run. fields names only the value and its link, so the number
// format and validation the copy brought down survive.
function pembayaranBpWriteRequests(sheetId, row, runs, cells) {
    return runs.map(([from, to]) => {
        const start = columnIndexOf(from);
        const end = columnIndexOf(to);
        const values = [];
        for (let column = start; column <= end; column++) {
            const field = PEMBAYARAN_BP_FIELD_AT.get(column);
            values.push(field ? cells[field.key] : {});
        }
        return { updateCells: {
            range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: start, endColumnIndex: end + 1 },
            rows: [{ values }],
            fields: "userEnteredValue,textFormatRuns",
        }};
    });
}

// Stamps the new row from the first data row so it inherits the A, G, K, R and T
// formulas, number formats and validation, rather than restating them here where they
// would rot. The template is the first row, not the row above: the pre-filled helpers
// stop at different depths (K at 316, T at 360) and hand-filled rows can be missing A
// or K, so copying the neighbour propagates its gaps. Relative refs adjust on paste.
// Column B is skipped - it is a spill from B5 and pasting over it would block the spill.
const pembayaranBpCopyRow = (sheetId, sourceRow, targetRow) =>
    [[0, 1], [2, 21]].map(([startColumnIndex, endColumnIndex]) => ({
        copyPaste: {
            source: { sheetId, startRowIndex: sourceRow - 1, endRowIndex: sourceRow, startColumnIndex, endColumnIndex },
            destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex, endColumnIndex },
            pasteType: "PASTE_NORMAL",
        },
    }));

const uploadPembayaranBp = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PEMBAYARAN_BP_MAX_FILE_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== "application/pdf") return cb(new Error("Berkas harus berformat PDF."));
        cb(null, true);
    },
});

const pembayaranBpUploadError = (err) => err.code === "LIMIT_FILE_SIZE"
    ? `Ukuran berkas melebihi ${PEMBAYARAN_BP_MAX_FILE_MB} MB.`
    : (err.message || "Berkas tidak valid.");

const runPembayaranBpUpload = (accept) => (req, res, next) => accept(req, res, (err) => {
    if (err) return res.status(400).json({ message: pembayaranBpUploadError(err) });
    next();
});

const handlePembayaranBpUpload = runPembayaranBpUpload(uploadPembayaranBp.fields([
    { name: "buktiBayar", maxCount: 1 },
    { name: "buktiBayarDepositPajak", maxCount: 1 },
]));

const handleRekKoranUpload = runPembayaranBpUpload(uploadPembayaranBp.single("berkas"));

// Named as the sheet already does: "00022.pdf", "P 00060.pdf". Takes the padded SPM.
const pembayaranBpFileName = (key, nomorSpm) =>
    `${key === "buktiBayarDepositPajak" ? "P " : ""}${safePart(nomorSpm) || "Tanpa Nomor SPM"}.pdf`;

// The validator's padded form, so an upload is never named "571.pdf"
const paddedNomorSpm = (built) => built.cells?.nomorSpm?.userEnteredValue?.stringValue ?? "";

// A column with no new file keeps what the row had, so editing without re-picking does
// not wipe the link. Old Drive files are never deleted: links on older rows point at
// file drop attachments this app did not create and does not own.
async function pembayaranBpLinks(req, res, nomorSpm, current = {}) {
    const links = { buktiBayar: current.buktiBayar || {}, buktiBayarDepositPajak: current.buktiBayarDepositPajak || {} };
    const incoming = Object.keys(links).filter(key => req.files?.[key]?.[0]);
    if (incoming.length === 0) return links;

    if (!driveFolderIdPembayaranBp) {
        console.error("DRIVE_FOLDER_ID_PEMBAYARAN_BP belum diatur - upload dibatalkan.");
        res.status(503).json({ message: "Folder penyimpanan belum dikonfigurasi. Hubungi admin." });
        return null;
    }
    if (!await requireGajiDriveReady(res, "Token Pembayaran BP")) return null;

    for (const key of incoming) {
        const file = req.files[key][0];
        const nama = pembayaranBpFileName(key, nomorSpm);
        links[key] = { nama, url: await uploadToDriveFolder(file, driveFolderIdPembayaranBp, nama) };
    }
    return links;
}

// Serialises anything that moves rows: two creates would target the same last row, and
// a delete shifts every row below. Per spreadsheet, in-process only.
const pembayaranBpWrites = new Map();
function queuePembayaranBpWrite(spreadsheetId, task) {
    const previous = pembayaranBpWrites.get(spreadsheetId) || Promise.resolve();
    const next = previous.then(task, task);
    pembayaranBpWrites.set(spreadsheetId, next.then(() => {}, () => {}));
    return next;
}

// Only files in the app's own folder: older links point at file drop attachments it
// did not create and does not own.
async function deleteOwnedDriveFiles(urls, folderId) {
    if (!folderId || !await ensureGajiDriveReady()) return;
    for (const url of urls.filter(Boolean)) {
        const fileId = driveFileIdFromLink(url);
        if (!fileId) continue;
        try {
            const file = await driveGaji.files.get({ fileId, fields: "parents", supportsAllDrives: true });
            if ((file.data.parents || []).includes(folderId)) {
                await driveGaji.files.delete({ fileId, supportsAllDrives: true });
            }
        } catch (error) {
            // Best effort: an unreadable file must not block deleting the row
            const status = error?.code || error?.response?.status;
            if (status !== 404 && status !== 410) {
                console.error(`Gagal menghapus berkas Drive ${fileId}:`, error?.message || error);
            }
        }
    }
}

// Optimistic guard plus the row's link cells. Answers the request and returns null
// when the caller must stop.
async function loadPembayaranBpRow(req, res, spreadsheetId, sheetName, rowNumber, expected) {
    const snapshot = await withBackoff(() => sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: [`'${sheetName}'!B${rowNumber}:S${rowNumber}`],
        fields: "sheets(data(rowData(values(formattedValue,hyperlink))))",
    }));
    const cells = snapshot.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values || [];
    const at = (index) => String(cells[index]?.formattedValue ?? "").trim();

    if (at(0) === "" && at(2) === "") {
        res.status(404).json({ message: "Data tidak ditemukan, muat ulang halaman." });
        return null;
    }
    // B is a positional SEQUENCE, so a row inserted above renumbers everything below
    if ((expected.no && at(0) !== expected.no) || (expected.nomorSpm && at(2) !== expected.nomorSpm)) {
        res.status(409).json({ message: "Data sudah berubah, muat ulang halaman." });
        return null;
    }
    return {
        links: {
            buktiBayar: { nama: at(11), url: String(cells[11]?.hyperlink ?? "").trim() },
            buktiBayarDepositPajak: { nama: at(17), url: String(cells[17]?.hyperlink ?? "").trim() },
        },
    };
}

// Account name -> Unit Kerja as the Pembayaran BP sheet spells it. UNIT_KERJA_ALIAS
// cannot be reused: it maps the 'Database SPM' short forms, which differ.
const SATKER_UNIT_KERJA = {
    "BIRO UMUM": "BIRO UMUM",
    "BIRO SARANA DAN PRASARANA": "SARPRAS",
    "BIRO PERENCANAAN": "PERENCANAAN",
    "DIT DATA DAN INFORMASI": "DATIN",
    "DIT HUKUM": "HUKUM",
    "DIT KEBIJAKAN": "KEBIJAKAN",
    "DIT KERJA SAMA": "KERJASAMA",
    "DIT LATIHAN": "LATIHAN",
    "DIT LITBANG": "LITBANG",
    "DIT OPERASI LAUT": "OPSLA",
    "DIT OPERASI UDARA": "OPSUD",
    "DIT STRATEGI": "STRATEGI",
    "INSPEKTORAT": "INSPEKTORAT",
    "PUSKODAL": "PUSKODAL",
    "UNIT PENINDAKAN HUKUM": "UPH",
    "ZONA MARITIM BARAT": "ZONA BARAT",
    "ZONA MARITIM TENGAH": "ZONA TENGAH",
    "ZONA MARITIM TIMUR": "ZONA TIMUR",
};

// A user only ever sees their own satker's rows; admins see the whole sheet. An
// unmapped account matches nothing rather than everything - the safe direction. The
// matcher differs per tab: Pembayaran BP holds the Unit Kerja on its own, REK KORAN
// mixes it into a longer label ("BPG 049 ZONA TENGAH").
function scopeToSatker(rows, viewer, matches) {
    if (viewer.role !== "user") return rows;
    const unitKerja = SATKER_UNIT_KERJA[normalizeSatker(viewer.name)];
    if (!unitKerja) {
        console.error(`Satker "${viewer.name}" tidak dikenal - data Pembayaran BP dikosongkan.`);
        return [];
    }
    return rows.filter(row => matches(row, normalizeSatker(unitKerja)));
}

const pembayaranBpVisibleTo = (records, viewer) =>
    scopeToSatker(records, viewer, (record, satker) => normalizeSatker(record.unitKerja) === satker);

const spmDigits = (value) => String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");

// Looking up a handful of numbers in a row should not re-read the sheet each time
const PEMBAYARAN_BP_SEARCH_TTL_MS = 60 * 1000;

app.get("/bendahara/pembayaran-bp/cari", async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const wanted = spmDigits(req.query.spm);
        if (!wanted) return res.status(400).json({ message: "Nomor SPM wajib diisi." });

        const records = await cached(`rows|${spreadsheetId}|${sheetName}`,
            () => readPembayaranBpRecords(spreadsheetId, sheetName), PEMBAYARAN_BP_SEARCH_TTL_MS);

        const matches = pembayaranBpVisibleTo(records, req.viewer)
            .filter(record => spmDigits(record.nomorSpm) === wanted);

        return res.status(200).json({
            data: matches.map(({ tanggalSp2d, nomorSpm, jenis, unitKerja, nilaiSp2d,
                                 buktiBayar, tanggalBayarPenerima, statusBayarPenerima }) => ({
                tanggalSp2d, nomorSpm, jenis, unitKerja, nilaiSp2d,
                buktiBayar, tanggalBayarPenerima, statusBayarPenerima,
            })),
        });
    } catch (error) {
        console.error("Error in GET /bendahara/pembayaran-bp/cari:", error);
        return res.status(500).json({ message: "Gagal mencari data SPM." });
    }
});

// REK KORAN carries no year in its tab name - the year is already in the spreadsheet id.
// Row 6 is the month header, so the data starts at row 7 and index 0 below is column C.
const REK_KORAN_SHEET = "REK KORAN";
const REK_KORAN_RANGE = `'${REK_KORAN_SHEET}'!C7:Q`;
const REK_KORAN_FIRST_ROW = 7;
const REK_KORAN_FIRST_MONTH = 3;   // F, the first of twelve monthly berkas
const REK_KORAN_MONTHS = 12;
const REK_KORAN_MONTH_NAMES = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const driveFolderIdRekKoran = process.env.DRIVE_FOLDER_ID_REK_KORAN;

const rekKoranMonthColumn = (month) => columnIndexOf("F") + month;

// Named as the sheet already does: "BPP 001_AGUSTUS_2026.pdf". The account number sits
// in a different place per shape - BPP rows end with theirs ("BPP 018 BAKAMLA 1" is
// account 001), BPG rows carry theirs right after the prefix ("BPG 049 ZONA TENGAH").
function rekKoranKode(namaRekening) {
    const nama = normalizeSatker(namaRekening);
    const numbers = nama.match(/\d+/g) || [];
    if (nama.startsWith("RKK")) return "RKK OPS";
    if (numbers.length === 0) return namaRekening;
    if (nama.startsWith("BPP")) return `BPP ${numbers[numbers.length - 1].padStart(3, "0")}`;
    if (nama.startsWith("BPG")) return `BPG ${numbers[0].padStart(3, "0")}`;
    return namaRekening;
}

const rekKoranFileName = (namaRekening, month, year) =>
    `${safePart(rekKoranKode(namaRekening))}_${REK_KORAN_MONTH_NAMES[month]}_${year}.pdf`;

// The two REKENING INDUK rows share one vertically merged block of month cells, so only
// the top row of a merge can be written. Merge coordinates are absolute and zero based.
const rekKoranMergeFollower = (merges, rowNumber, month) => {
    const rowIndex = rowNumber - 1;
    const columnIndex = rekKoranMonthColumn(month);
    return (merges || []).some(merge => {
        const top = merge.startRowIndex ?? 0;
        const left = merge.startColumnIndex ?? 0;
        return rowIndex >= top && rowIndex < merge.endRowIndex
            && columnIndex >= left && columnIndex < merge.endColumnIndex
            && (rowIndex !== top || columnIndex !== left);
    });
};

const rekKoranToRow = (cells, rowNumber, merges) => ({
    rowNumber,
    satker: String(cells?.[0]?.formattedValue ?? "").trim(),
    namaRekening: String(cells?.[1]?.formattedValue ?? "").trim(),
    berkas: Array.from({ length: REK_KORAN_MONTHS }, (_, month) => ({
        ...pembayaranBpLink(cells?.[REK_KORAN_FIRST_MONTH + month]),
        bisaUnggah: !rekKoranMergeFollower(merges, rowNumber, month),
    })),
});

app.get("/bendahara/pembayaran-bp/rek-koran", async (req, res) => {
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        // F:Q hold file drop attachments, so this needs the hyperlinks a grid read carries
        const rows = await cached(`rek-koran|${spreadsheetId}`, async () => {
            const response = await withBackoff(() => sheets.spreadsheets.get({
                spreadsheetId,
                includeGridData: true,
                ranges: [REK_KORAN_RANGE],
                fields: "sheets(merges,data(rowData(values(formattedValue,hyperlink))))",
            }));
            const sheet = response.data.sheets?.[0];
            return (sheet?.data?.[0]?.rowData || [])
                .map((row, index) => rekKoranToRow(row.values, REK_KORAN_FIRST_ROW + index, sheet?.merges))
                .filter(row => row.satker !== "");   // drops the footnote rows below the table
        });

        return res.status(200).json({
            data: scopeToSatker(rows, req.viewer,
                (row, satker) => normalizeSatker(row.satker).includes(satker)),
        });
    } catch (error) {
        console.error("Error in GET /bendahara/pembayaran-bp/rek-koran:", error);
        return res.status(500).json({ message: "Gagal memuat data Rekening Koran." });
    }
});

// One cell, written in the shape the sheet's own file drop attachments have, so a
// berkas uploaded here is indistinguishable from one dropped into Sheets by hand.
app.patch("/bendahara/pembayaran-bp/rek-koran", handleRekKoranUpload, async (req, res) => {
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const rowNumber = parseInt(req.body.rowNumber, 10);
        const month = parseInt(req.body.bulan, 10);
        if (!Number.isInteger(rowNumber) || rowNumber < REK_KORAN_FIRST_ROW) {
            return res.status(400).json({ message: "Baris tidak valid." });
        }
        if (!Number.isInteger(month) || month < 0 || month >= REK_KORAN_MONTHS) {
            return res.status(400).json({ message: "Bulan tidak valid." });
        }
        if (!req.file) return res.status(400).json({ message: "Berkas wajib diunggah." });

        if (!driveFolderIdRekKoran) {
            console.error("DRIVE_FOLDER_ID_REK_KORAN belum diatur - upload dibatalkan.");
            return res.status(503).json({ message: "Folder penyimpanan belum dikonfigurasi. Hubungi admin." });
        }
        if (!await requireGajiDriveReady(res, "Token Rekening Koran")) return;

        const snapshot = await withBackoff(() => sheets.spreadsheets.get({
            spreadsheetId,
            includeGridData: true,
            ranges: [`'${REK_KORAN_SHEET}'!C${rowNumber}:Q${rowNumber}`],
            fields: "sheets(merges,data(rowData(values(formattedValue,hyperlink))))",
        }));
        const sheet = snapshot.data.sheets?.[0];
        const target = rekKoranToRow(sheet?.data?.[0]?.rowData?.[0]?.values, rowNumber, sheet?.merges);

        if (!target.satker) return res.status(404).json({ message: "Baris tidak ditemukan, muat ulang halaman." });
        // Rows are addressed by position, so a row inserted above would move the target
        if (normalizeSatker(target.satker) !== normalizeSatker(req.body.expectedSatker)
            || normalizeSatker(target.namaRekening) !== normalizeSatker(req.body.expectedNamaRekening)) {
            return res.status(409).json({ message: "Data sudah berubah, muat ulang halaman." });
        }
        if (!target.berkas[month].bisaUnggah) {
            return res.status(409).json({ message: "Sel ini digabung dengan baris di atasnya." });
        }

        const nama = rekKoranFileName(target.namaRekening, month, getRequestYear(req));
        const url = await uploadToDriveFolder(req.file, driveFolderIdRekKoran, nama);

        const sheetId = await pembayaranBpSheetId(spreadsheetId, REK_KORAN_SHEET);
        const columnIndex = rekKoranMonthColumn(month);
        await withBackoff(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ updateCells: {
                range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber,
                    startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
                rows: [{ values: [{
                    userEnteredValue: { stringValue: nama },
                    textFormatRuns: [{ startIndex: 0, format: { link: { uri: url } } }],
                }] }],
                fields: "userEnteredValue,textFormatRuns",
            }}] },
        }));

        pembayaranBpCache.delete(`rek-koran|${spreadsheetId}`);
        // Best effort: the cell already points at the new berkas, so a leftover old file
        // must not turn a successful upload into an error
        await deleteOwnedDriveFiles([target.berkas[month].url], driveFolderIdRekKoran)
            .catch(error => console.error("Gagal menghapus berkas Rekening Koran lama:", error?.message || error));

        return res.status(200).json({ message: `${nama} berhasil diunggah.`, berkas: { nama, url } });
    } catch (error) {
        console.error("Error in PATCH /bendahara/pembayaran-bp/rek-koran:", error);
        return res.status(500).json({ message: "Gagal mengunggah berkas Rekening Koran." });
    }
});

app.get("/bendahara/pembayaran-bp/options", async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;
        return res.status(200).json(await pembayaranBpFormOptions(spreadsheetId, sheetName));
    } catch (error) {
        console.error("Error in GET /bendahara/pembayaran-bp/options:", error);
        return res.status(500).json({ message: "Gagal memuat pilihan Pembayaran BP." });
    }
});

app.post("/bendahara/pembayaran-bp", handlePembayaranBpUpload, async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const options = await pembayaranBpFormOptions(spreadsheetId, sheetName);
        // Validated before uploading, so a rejected form leaves no orphan in Drive
        const dry = pembayaranBpCells(req.body, { buktiBayar: {}, buktiBayarDepositPajak: {} }, options);
        if (!dry.ok) return res.status(400).json({ message: dry.message });

        const links = await pembayaranBpLinks(req, res, paddedNomorSpm(dry));
        if (!links) return;
        const built = pembayaranBpCells(req.body, links, options);
        if (!built.ok) return res.status(400).json({ message: built.message });

        const sheetId = await pembayaranBpSheetId(spreadsheetId, sheetName);

        const targetRow = await queuePembayaranBpWrite(spreadsheetId, async () => {
            // The No formula counts column C, so the first row without one is ours
            const column = await readRange(sheets, spreadsheetId, `'${sheetName}'!C${PEMBAYARAN_BP_FIRST_ROW}:C`);
            const filled = (column.data.values || []).length;
            const row = PEMBAYARAN_BP_FIRST_ROW + filled;

            await withBackoff(() => sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: { requests: [
                    ...(row > PEMBAYARAN_BP_FIRST_ROW ? pembayaranBpCopyRow(sheetId, PEMBAYARAN_BP_FIRST_ROW, row) : []),
                    ...pembayaranBpWriteRequests(sheetId, row, PEMBAYARAN_BP_RUNS_CREATE, built.cells),
                ]},
            }));
            return row;
        });

        return res.status(201).json({ message: "Data berhasil disimpan.", rowNumber: targetRow });
    } catch (error) {
        console.error("Error in POST /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal menyimpan data Pembayaran BP." });
    }
});

app.delete("/bendahara/pembayaran-bp", async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const rowNumber = parseInt(req.query.rowNumber, 10);
        if (!Number.isInteger(rowNumber) || rowNumber < PEMBAYARAN_BP_FIRST_ROW) {
            return res.status(400).json({ message: "Baris tidak valid." });
        }

        const target = await loadPembayaranBpRow(req, res, spreadsheetId, sheetName, rowNumber, {
            no: String(req.query.expectedNo ?? "").trim(),
            nomorSpm: String(req.query.expectedNomorSpm ?? "").trim(),
        });
        if (!target) return;

        const sheetId = await pembayaranBpSheetId(spreadsheetId, sheetName);
        await queuePembayaranBpWrite(spreadsheetId, () => withBackoff(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{
                // Removed, not blanked: No spills from SEQUENCE, so a leftover blank row
                // would shift every number out of step. startIndex is 0-based.
                deleteDimension: {
                    range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
                },
            }]},
        })));

        // After the row is gone, so a failed delete keeps the files too
        await deleteOwnedDriveFiles([target.links.buktiBayar.url, target.links.buktiBayarDepositPajak.url],
            driveFolderIdPembayaranBp);

        return res.status(200).json({ message: "Data berhasil dihapus." });
    } catch (error) {
        console.error("Error in DELETE /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal menghapus data Pembayaran BP." });
    }
});

app.patch("/bendahara/pembayaran-bp", handlePembayaranBpUpload, async (req, res) => {
    const sheetName = pembayaranBpSheetName(req);
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const rowNumber = parseInt(req.body.rowNumber, 10);
        if (!Number.isInteger(rowNumber) || rowNumber < PEMBAYARAN_BP_FIRST_ROW) {
            return res.status(400).json({ message: "Baris tidak valid." });
        }

        const options = await pembayaranBpFormOptions(spreadsheetId, sheetName);
        const dry = pembayaranBpCells(req.body, { buktiBayar: {}, buktiBayarDepositPajak: {} }, options);
        if (!dry.ok) return res.status(400).json({ message: dry.message });

        // Link cells come back too, so an edit without a new file keeps them
        const target = await loadPembayaranBpRow(req, res, spreadsheetId, sheetName, rowNumber, {
            no: String(req.body.expectedNo ?? "").trim(),
            nomorSpm: String(req.body.expectedNomorSpm ?? "").trim(),
        });
        if (!target) return;

        const links = await pembayaranBpLinks(req, res, paddedNomorSpm(dry), target.links);
        if (!links) return;
        const built = pembayaranBpCells(req.body, links, options);
        if (!built.ok) return res.status(400).json({ message: built.message });

        const sheetId = await pembayaranBpSheetId(spreadsheetId, sheetName);
        await withBackoff(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: pembayaranBpWriteRequests(sheetId, rowNumber, PEMBAYARAN_BP_RUNS_EDIT, built.cells) },
        }));

        return res.status(200).json({ message: "Data berhasil diperbarui.", rowNumber });
    } catch (error) {
        console.error("Error in PATCH /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal memperbarui data Pembayaran BP." });
    }
});

// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})
