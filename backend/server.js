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

// Helper to get spreadsheet IDs based on year from request
function getSpreadsheetId(req, type) {
    const year = req.query.year || req.body.year || new Date().getFullYear().toString();
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

    const headerResponse = await withBackoff(async () => {
        return await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Notifikasi'!A1:CB1",
        });
    });
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
    const blockResponse = await withBackoff(async () => {
        return await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'Notifikasi'!${idColumnLetter}3:${statusColumnLetter}`,
        });
    });
    const blockRows = blockResponse.data.values || [];
    const newRow = 3 + blockRows.length;
    const newId = newRow - 2;

    await withBackoff(async () => {
        return await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'Notifikasi'!${idColumnLetter}${newRow}:${statusColumnLetter}${newRow}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[newId, title, description || "", 'no']]
            }
        });
    });

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
        const valueResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetIdGaji,
                range: `'Sheet1'!A:C`,
            });
        });

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
        res.json({ data: paginatedRows, realAllAntrianRows: totalFiltered });

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
            totalPages
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

// The mirror row carries its own id, so timestamp + nama is the only link back to the
// 'Write Antrian' row that produced it. Both are written in the same batch, so they match
// exactly; a nama colliding within the same second is the only way this is ambiguous.
const mirrorRowKey = (timestamp, nama) =>
    JSON.stringify([String(timestamp ?? "").trim(), String(nama ?? "").trim()]);

// Picks the 'Write Antrian Verif' mirror of a 'Write Antrian' row out of that sheet's rows.
// Returns { row, canonical } only when exactly one row matches - a duplicate or missing match
// means we cannot tell which row is the mirror, and touching the wrong one is worse than
// doing nothing. Takes the rows rather than fetching them so callers that already hold the
// sheet do not pay for a second read.
function matchMirrorAntrianRow(mirrorRows, antrianRowValues, purpose = "update") {
    const key = mirrorRowKey(antrianRowValues?.[1], antrianRowValues?.[2]);
    if (key === mirrorRowKey("", "")) return null; // nothing to match on

    const matches = [];
    (mirrorRows || []).forEach((row, index) => {
        if (mirrorRowKey(row?.[1], row?.[2]) === key) {
            matches.push({ row: index + 1, canonical: toCanonicalAntrianRow(row, AJUAN_FLOWS.verif) });
        }
    });
    if (matches.length !== 1) {
        console.warn(`Mirror row for ${key}: ${matches.length} matches, skipping mirror ${purpose}.`);
        return null;
    }
    return matches[0];
}

async function findMirrorAntrianRow(spreadsheetId, antrianRowValues, purpose = "update") {
    const verifFlow = AJUAN_FLOWS.verif;
    const response = await withBackoff(async () => {
        return await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${verifFlow.antrianSheet}'!A:${verifFlow.antrianLastColumn}`,
        });
    });
    return matchMirrorAntrianRow(response.data.values, antrianRowValues, purpose);
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
    const response = await withBackoff(async () => {
        return await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: flows.map(flow => `'${flow.antrianSheet}'!A3:${flow.antrianLastColumn}`),
        });
    });

    // The mirrors are dropped from the list itself, but their lampiran is the only copy of
    // the PJK a GUP/PTUP pengajuan uploaded, so it is indexed on the way past
    const mirrorPjkByKey = new Map();
    const merged = [];
    flows.forEach((flow, index) => {
        const rows = response.data.valueRanges?.[index]?.values || [];
        for (const row of rows) {
            const canonical = toCanonicalAntrianRow(row, flow);
            if (flow.key === "verif") {
                const jenis = resolveJenis(canonical[ANTRIAN_JENIS_INDEX]);
                if (jenis?.flow === "gup") { // mirror of a 'Write Antrian' row
                    mirrorPjkByKey.set(mirrorRowKey(canonical[1], canonical[2]), canonical[19]);
                    continue;
                }
            }
            canonical[ANTRIAN_FLOW_INDEX] = flow.key;
            merged.push(canonical);
        }
    });

    for (const row of merged) {
        if (row[ANTRIAN_FLOW_INDEX] === "gup") {
            row[ANTRIAN_PJK_INDEX] = mirrorPjkByKey.get(mirrorRowKey(row[1], row[2])) || "";
        } else {
            row[ANTRIAN_PJK_INDEX] = row[19]; // its own lampiran already is the PJK
        }
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
    const text = String(value ?? "").trim();
    return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
};

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
            const jenis = JENIS_PENGAJUAN[String(jenisKey || "").trim()];
            if (!jenis) {
                return res.status(400).json({ message: "Jenis pengajuan tidak dikenal." });
            }
            const flow = AJUAN_FLOWS[jenis.flow];
            const hasTable = jenis.hasTable && Array.isArray(tabledata) && tabledata.length > 0;
            if (jenis.hasTable && !hasTable) {
                return res.status(400).json({ message: "Data tabel wajib diisi." });
            }
            // GUP/PTUP also register in the verifikasi antrian, using the same short
            // layout the other jenis write, but never get a Write Table Verif block
            const mirrorFlow = jenis.flow === "gup" ? AJUAN_FLOWS.verif : null;

            // File Upload Handling
            let fileLink = "";    //Bupot, GUP/PTUP only
            let pjkLink = "";     //PJK, verifikasi flow only
            const bupotFile = req.files?.file?.[0];
            const pjkFile = req.files?.filePjk?.[0];

            if (bupotFile || pjkFile) {
                // Dedicated uploader account, not the shared /auth/google token
                const uploaderReady = await ensureGajiDriveReady();
                if (!uploaderReady) {
                    console.error('Token uploader belum ada - buka /auth/google/gaji dengan akun yang dituju.');
                    return res.status(401).json({
                        error: "Google Drive authentication required. Please authenticate first.",
                        authUrl: `${req.protocol}://${req.get('host')}/auth/google/gaji`,
                        redirectToAuth: true
                    });
                }
                if (pjkFile && !driveFolderIdVerifPjk) {
                    console.error("DRIVE_FOLDER_ID_VERIF_PJK belum diatur - upload dibatalkan.");
                    return res.status(503).json({ message: "Folder penyimpanan PJK belum dikonfigurasi. Hubungi admin." });
                }
                if (bupotFile) fileLink = await uploadToDriveFolder(bupotFile, driveFolderId);
                if (pjkFile) {
                    // Drive rejects "/" in names, and a jenis label can carry one
                    const safePart = (value) => String(value ?? "").replace(/[\\/]/g, "-").trim();
                    const pjkName = `${safePart(userdata)}_${safePart(jenis.verifValue || jenis.sheetValue)}_${safePart(jumlahAjuan)}.pdf`;
                    pjkLink = await uploadToDriveFolder(pjkFile, driveFolderIdVerifPjk, pjkName);
                }
            }

            // Get textdata/input data antrian and tabledata
            const ranges = [
                `'${flow.antrianSheet}'!A:A`,
                `'${flow.tableSheet}'!A:A`,
                `'${flow.antrianSheet}'!${flow.counterCell}`  //Getting antrian ID counter
            ]
            if (mirrorFlow) {
                ranges.push(`'${mirrorFlow.antrianSheet}'!A:A`, `'${mirrorFlow.antrianSheet}'!${mirrorFlow.counterCell}`);
            }

            // Apply backoff strategy for batch data fetch
            const allRequest = await withBackoff(async () => {
                return await sheets.spreadsheets.values.batchGet({
                    spreadsheetId,
                    ranges: ranges
                });
            });

            const responseAntrian = allRequest.data.valueRanges[0].values || [];
            const responseTable = allRequest.data.valueRanges[1].values || [];
            const responseId = allRequest.data.valueRanges[2].values || [];

            const lastFilledRows = responseAntrian.length || 0;
            const lastTableRows = responseTable.length || 0;
            const timestamp = getFormattedDate().fullDateTimeFormat;

            // The counter cell lags any row added to the sheet by hand, and handing out
            // an id that already exists makes TRANS_ID ambiguous. Never issue below the
            // highest id actually present.
            const nextAntrianId = (rows, counter) => Math.max(
                parseInt(counter) || 0,
                (rows || []).reduce((max, row) => Math.max(max, Number(row?.[0]) || 0), 0)
            ) + 1;
            const newIdCounter = nextAntrianId(responseAntrian, responseId);

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

            // Apply backoff strategy for batch update
            await withBackoff(async () => {
                return await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    resource: { data, valueInputOption: "RAW" },
                });
            });

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
        const matchResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range: matchRange 
            });
        });

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
            const uploaderReady = await ensureGajiDriveReady();
            if (!uploaderReady) {
                console.error('Token uploader belum ada - buka /auth/google/gaji dengan akun yang dituju.');
                return res.status(401).json({
                    error: "Google Drive authentication required. Please authenticate first.",
                    authUrl: `${req.protocol}://${req.get('host')}/auth/google/gaji`,
                    redirectToAuth: true
                });
            }
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
        const antriResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${flowConfig.antrianSheet}'!A3:${flowConfig.antrianLastColumn}`
            });
        });

        const matchResult = antriResponse.data.values || [];
        let antriRow = null;
        let currentAntrianValues = null;
        let currentLampiran = "";
        for (let i = 0; i < matchResult.length; i++) {
            if (String(matchResult[i][0]) === String(antriPosition)) {
                antriRow = i + 1 + 2; //Convert to 1-based row index. +2 to exclude header and start from A3
                currentAntrianValues = matchResult[i];
                currentLampiran = toCanonicalAntrianRow(matchResult[i], flowConfig)[19];
                break;
            }
        }
        if (!antriRow) {
            return res.status(400).json({ error: "Keyword not found" });
        }

        if (pjkFile) {
            // Drive rejects "/" in names, and a jenis label can carry one
            const safePart = (value) => String(value ?? "").replace(/[\\/]/g, "-").trim();
            const pjkName = `${safePart(textdata[1])}_${safePart(editJenis.verifValue || editJenis.sheetValue)}_${safePart(textdata[3])}.pdf`;
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
            const mirrorMatch = await findMirrorAntrianRow(spreadsheetId, currentAntrianValues, "update");
            if (mirrorMatch) {
                batchDataUpdates.push({
                    // Same four columns the mirror was created with, jenis under its verif label
                    range: `'${mirrorFlow.antrianSheet}'!B${mirrorMatch.row}:E${mirrorMatch.row}`,
                    values: [[textdata[0], textdata[1], editJenis.verifValue || editJenis.sheetValue, textdata[3]]]
                });
                pjkTarget = { flow: mirrorFlow, row: mirrorMatch.row, currentLink: mirrorMatch.canonical[19] };
            }
        } else {
            pjkTarget = { flow: flowConfig, row: antriRow, currentLink: currentLampiran };
        }

        if ((pjkLink || removePjk) && !pjkTarget) {
            return res.status(409).json({ message: "Baris verifikasi untuk pengajuan ini tidak ditemukan, PJK tidak dapat diperbarui." });
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
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    data: batchDataUpdates,
                    valueInputOption: "RAW" // Prevents auto-conversion of text like "100.000" to 100
                }
            });
        });

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
             withBackoff(async () => {
                 return await sheets.spreadsheets.values.batchGet({
                     spreadsheetId,
                     ranges: matchRange
                 });
             }),
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

// Handling interaction with PEMBAYARAN BP Sheet
// Cari SPM
app.patch("/bendahara/cari-spm", async (req, res) => {
    try {
        const { data } = req.body;
        const cariRange = "'DASHBOARD'!D8"
        const spreadsheetIdCariSPM = getSpreadsheetId(req, 'CARISPM');

        // Apply backoff for updating cell
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetIdCariSPM,
                range: cariRange,
                valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
                resource: { values: [[data]] },
            });
        });

        res.status(200).json({ message: "Data updated successfully." });
    } catch (error) {
        console.error("Error in /bendahara/cari-spm:", error);
        res.status(500).json({error: "Failed to update cell." });
    }
})

// SPM Belum Bayar
app.get("/bendahara/spm-belum-bayar", async (req, res) => {
    try {
        const spreadsheetIdCariSPM = getSpreadsheetId(req, 'CARISPM');
        const range = "'MACHINE DB'!AE3:AM"

        // Apply backoff for getting SPM data
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetIdCariSPM,
                range,
            });
        });

        const result = (response.data.values || []).map(row => {
            while (row.length < 9) {
                row.push("");
            }
            return row;
        });

        res.json({ data: result })
    } catch (error) {
        console.error("Error in /bendahara/spm-belum-bayar:", error);
        res.status(500).json({error: "Failed to fetch data." });
    }
})

// Find and Return Rincian SPM
app.post("/bendahara/cari-rincian", async (req, res) => {
    try {
        const spreadsheetIdCariSPM = getSpreadsheetId(req, 'CARISPM');
        const {startDate, endDate, selectJenis, selectStatus, satkerName} = req.body;
        const cariRanges = [
            "'DASHBOARD'!P17", //start date
            "'DASHBOARD'!P19", //end date
            "'DASHBOARD'!T17", //satkerName
            "'DASHBOARD'!T19", //select jenis
            "'DASHBOARD'!T21", //select status
        ]
        var resource = {
            data: [
                {
                    range: cariRanges[0],
                    values: [[startDate]],
                },
                {
                    range: cariRanges[1],
                    values: [[endDate]],
                },
                {
                    range: cariRanges[2],
                    values: [[satkerName]],
                },
                {
                    range: cariRanges[3],
                    values: [[selectJenis]],
                },
                {
                    range: cariRanges[4],
                    values: [[selectStatus]],
                },
            ],
            valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
        }

        // Apply backoff for batch update
        const postResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetIdCariSPM,
                resource,
            });
        });

        try {
            // Apply backoff for getting results
            const getResponse = await withBackoff(async () => {
                return await sheets.spreadsheets.values.get({ 
                    spreadsheetId: spreadsheetIdCariSPM, 
                    range: "'MACHINE DB'!AT3:BD",
                });
            });

            let result = getResponse.data.values;
            // Add empty rows to generate max 11 columns
            const maxColumns = 11;
            result = result.map(row => {
                while (row.length < maxColumns) {
                    row.push("");
                }
                return row;
            })
            res.json({ data: result })
        } catch (error) {
            console.error("Error fetching results in /bendahara/cari-rincian:", error);
            res.status(500).json({error: "Failed fetching results." });
        }
    } catch (error) {
        console.error("Error in /bendahara/cari-rincian:", error);
        res.status(500).json({error: "Failed handling data." });
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
        // PJK status of each mirror row costs no extra round trip
        const [response, mirrorResponse] = await Promise.all([
            withBackoff(async () => {
                return await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: "'Write Antrian'!B:B",
                });
            }),
            withBackoff(async () => {
                return await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `'${AJUAN_FLOWS.verif.antrianSheet}'!A:${AJUAN_FLOWS.verif.antrianLastColumn}`,
                });
            }),
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

        const batchGetResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'Write Antrian'!A${minRow}:T${maxRow}`,
            });
        });

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
        for (const row of mirrorResponse.data.values || []) {
            pjkByKey.set(mirrorRowKey(row?.[1], row?.[2]), [row?.[PJK_COLUMN.substansi], row?.[PJK_COLUMN.kelengkapan]]);
        }

        // Bendahara is done but the verifikator has not signed off yet. A row with no mirror
        // has no PJK to wait on, so it stays where it was.
        const isOk = value => String(value ?? "").trim() === "OK";
        const waitingPjk = (row) => {
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
        // available for the notification check below - no extra API call.
        const getAntrianResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Write Antrian'!A:N"
            });
        });

        const allRows = getAntrianResponse.data.values || [];
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

        // Apply backoff for batch update
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: updateData.map(([range, value]) => ({
                        range,
                        values: [[value]]
                    }))
                }
            });
        });

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
            const getMonitoringResponse = await withBackoff(async () => {
                return await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: "'Monitoring DRPP'!B:I"
                });
            });

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
                await withBackoff(async () => {
                    return await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: targetRange,
                        valueInputOption: "RAW",
                        resource: { values: rowsToWrite }
                    });
                });

            } else {
                // If trans_id doesn't exist, append new rows with backoff
                const lastFilledRow = monitoringRows.length + 1;
                const targetRange = `Monitoring DRPP!B${lastFilledRow}:J${lastFilledRow + newRowCount - 1}`;
                await withBackoff(async () => {
                    return await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: targetRange,
                        valueInputOption: "RAW",
                        resource: { values: rowsToWrite }
                    });
                });
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
        const sheetResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
        });

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
        const getAllRowsResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Monitoring DRPP'!A:K",
            });
        });

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
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Monitoring DRPP'!H:I", // Columns H and I
            });
        });

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
                const getAllSpby = await withBackoff(async () => {
                    return await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: "'Write Table'!D:D",
                    });
                });

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
                const searchResponse = await withBackoff(async () => {
                    return await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: searchRange,
                    });
                });

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
                const getAllBupot = await withBackoff(async () => {
                    return await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: "'Write Table'!I:Q",
                    });
                });

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
                const searchResponse = await withBackoff(async () => {
                    return await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: searchRange,
                    });
                });

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
            const getDRPPResponses = await withBackoff(async () => {
                return await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `'Monitoring DRPP'!A${minRow}:K${maxRow}`,
                });
            });

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
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range,
            });
        });

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
        // Apply backoff for batch get
        const getDrppRows = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: [
                    "'Monitoring DRPP'!A3:I",   // Range to update DRPP status. A3:I so satker (D) and the pre-update pungut/setor (H/I) are available for the notification check
                    "'Write Table'!X:X",        // Range to update colored row status
                    "'Monitoring DRPP'!F3:F"    // Range to get SPM numbers
                ],
            });
        });

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

        // Apply backoff for batch update
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: "RAW",
                    data: updateData
                }
            });
        });

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
        const response = await withBackoff(async () => {
            return await sheets2.spreadsheets.values.get({
                spreadsheetId: spreadsheetIdVerif,
                range: "'Daftar SPM'!A:H"
            });
        });
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
            const batchGetResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.batchGet({
                    spreadsheetId: spreadsheetIdVerif,
                    ranges: rowRanges,
                })
            })
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
            await withBackoff(async () => {
                return await sheets2.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Sheet Coding'!G4`,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [[monthValue]]
                    }
                });
            });

            const countResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.get({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Sheet Coding'!A4:E4`,
                })
            })
            countData = countResponse.data.values[0] || [];
        } else {
            const allKeyword = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.get({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Sheet Coding'!A:A`
                })
            })

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
                await withBackoff(async () => {
                    return await sheets2.spreadsheets.values.update({
                        spreadsheetId: spreadsheetIdVerif,
                        range: `'Sheet Coding'!G${monthCellRow}`,
                        valueInputOption: 'RAW',
                        resource: {
                            values: [[monthValue]]
                        }
                    });
                });

                const countResponse = await withBackoff(async () => {
                    return await sheets2.spreadsheets.values.get({
                        spreadsheetId: spreadsheetIdVerif,
                        range: `'Sheet Coding'!A${foundRow}:E${foundRow}`,
                    })
                })
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
            const writeResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Data'!A${rowPosition}:H${rowPosition}`,
                    valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
                    resource: { values: [data] }
                })
            })

        } else {
            //Get all row information
            const getAllRowsResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.get({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Data'!A:A`
                })
            })

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

                const writeResponse = await withBackoff(async () => {
                    return await sheets2.spreadsheets.values.update({
                        spreadsheetId: spreadsheetIdVerif,
                        range: `'Data'!A${nextRow}:H${nextRow}`,
                        valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
                        resource: { values: [data] }
                    })
                })
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
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: [
                    `'${verifFlow.antrianSheet}'!A3:${verifFlow.antrianLastColumn}`,
                    `'${AJUAN_FLOWS.gup.antrianSheet}'!A:C`,
                ],
            });
        });

        const sourceIdByKey = new Map();
        for (const row of response.data.valueRanges[1].values || []) {
            sourceIdByKey.set(mirrorRowKey(row?.[1], row?.[2]), row?.[0] ?? "");
        }
        // Only GUP/PTUP have a mirror; matching every row risks a native verifikasi row
        // borrowing an id off a same-second, same-name collision
        const sourceId = row => resolveJenis(row[3])?.flow === "gup"
            ? sourceIdByKey.get(mirrorRowKey(row[1], row[2])) || ""
            : "";

        // Index 15, appended past the sheet's own columns
        const width = 15;
        const rows = (response.data.valueRanges[0].values || [])
            .filter(row => String(row?.[0] ?? "").trim() !== "")
            .map(row => Array.from({ length: width }, (_, i) => row[i] ?? ""))
            .map(row => [...row, sourceId(row)])
            .reverse();

        const isVerified = value => PJK_VERIFIED_VALUES.includes(String(value).trim());
        const filled = value => String(value ?? "").trim() !== "";

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

        res.json({ data: [informasi, sedangVerif, sudahVerif] });
    } catch (error) {
        console.error("Error in /verifikasi/pengujian-pjk:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

app.post("/verifikasi/aksi-pjk", async (req, res) => {
    try {
        const spreadsheetId = getSpreadsheetId(req, 'AJUAN');
        const { no_antri, mulai_verifikasi, tgl_selesai, substansi, kelengkapan, catatan } = req.body || {};
        if (!no_antri) {
            return res.status(400).json({ message: "Invalid or missing data." });
        }

        const verifFlow = AJUAN_FLOWS.verif;
        const { pjk } = verifFlow;

        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${verifFlow.antrianSheet}'!A:A`,
            });
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row?.[0] ?? "") === String(no_antri)) + 1;
        if (rowIndex === 0) {
            return res.status(400).json({ error: "Keyword not found in column A" });
        }

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

        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: updates.map(([cell, value]) => ({
                        range: `'${verifFlow.antrianSheet}'!${cell}`,
                        values: [[value ?? ""]],
                    })),
                },
            });
        });

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
        const response = await withBackoff(async () => {
            return await sheets2.spreadsheets.values.get({
                spreadsheetId: spreadsheetIdVerif,
                range: `'Data'!A:A`
            })
        })
        const allRows = response.data.values || [];
        //Row index
        const rowIndex = allRows.findIndex(row => row[0].includes(searchValue));
        if (rowIndex === -1) {
            return res.status(404).json({error: "Keyword not found."});
        }
        const targetRowNumber = rowIndex + 1 //Gsheet 1 indexed

        //Fetch target row
        const result = await withBackoff(async () => {
            return await sheets2.spreadsheets.values.get({
                spreadsheetId: spreadsheetIdVerif,
                range: `'Data'!A${targetRowNumber}:G${targetRowNumber}`
            })
        })
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
        const { page = 1, limit = 30, name, role } = req.query;

        // Filter by user role and admin division
        let findByWhat = role === 'user' ? name : (name.includes('Annisa' || 'Ardi' || 'Anggun') ? 'Bendahara' : 'Verifikasi' )
        if (role === 'master admin') { findByWhat = 'Bendahara'; }

        // Find the correct notification column index first
        const getTypeRowsResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Notifikasi'!A:CB",
            });
        });
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
        const getColumnResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'Notifikasi'!${columnLetter}3:${nextOffsetColumnLetter}`,
            });
        });
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
        const updateStatus = await withBackoff(async () => {
            return await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Notifikasi'!${statusColPosition}${rowNumber}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [['yes']]
                }
            });
        });

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
const STATUS_PEGAWAI_OPTIONS = ["PNS", "PPPK", "TNI/POLRI"];

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

        const gajiDriveReady = await ensureGajiDriveReady();
        if (!gajiDriveReady) {
            console.error("Token Dokumen Gaji belum ada - buka /auth/google/gaji dengan akun yang dituju.");
            return res.status(503).json({ message: "Layanan penyimpanan berkas belum siap. Hubungi admin." });
        }

        // Drive rejects "/" in names, and Status Pegawai "TNI/POLRI" can appear in Keterangan
        const safePart = (value) => value.replace(/[\\/]/g, "-").trim();
        const fileName = `${safePart(nomorSurat)} - ${safePart(keteranganSurat)} - ${safePart(namaTercantum)}.pdf`;

        const bufferStream = new stream.Readable();
        bufferStream.push(req.file.buffer);
        bufferStream.push(null);

        const driveResponse = await driveGaji.files.create({
            requestBody: {
                name: fileName,
                parents: [driveFolderIdDokumenGaji],
            },
            media: { mimeType: req.file.mimetype, body: bufferStream },
            fields: "webViewLink",
            supportsAllDrives: true,
        });
        const fileLink = driveResponse.data.webViewLink || "";

        // Next free row / running No. Sheets trims trailing empty rows, so the
        // length of column A is the offset of the last populated row from row 3.
        const existingResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${DOKUMEN_GAJI_SHEET}'!A3:A`,
            });
        });
        const existingRows = existingResponse.data.values || [];
        const targetRow = 3 + existingRows.length;
        const nextId = existingRows.length + 1;

        await withBackoff(async () => {
            return await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${DOKUMEN_GAJI_SHEET}'!A${targetRow}:H${targetRow}`,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: [[
                        nextId,
                        getFormattedDate().fullDateTimeFormat,
                        tanggalSurat,
                        nomorSurat,
                        namaTercantum,
                        statusPegawai,
                        keteranganSurat,
                        fileLink,
                    ]]
                }
            });
        });

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

        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${DOKUMEN_GAJI_SHEET}'!A3:H`,
            });
        });
        const rows = response.data.values || [];

        // Pad to 8 cells so the table never sees undefined
        let data = rows
            .filter(row => row && row.some(cell => String(cell || "").trim() !== ""))
            .map(row => Array.from({ length: 8 }, (_, i) => row[i] || ""));

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

// Realisasi Anggaran - budget ceilings, spending aggregated per satker per month,
// and who still has to fill a ceiling in. Pass ?detail=1 to also get the raw SPM rows.
app.get("/verifikasi/realisasi-anggaran", async (req, res) => {
    try {
        let viewer;
        try {
            viewer = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ message: "Sesi tidak valid, silakan login ulang." });
        }

        const spreadsheetId = getSpreadsheetId(req, 'VERIFSPM');
        // Only the year suffixed key exists, there is no bare SPREADSHEET_ID_VERIFSPM
        // fallback - fail here instead of letting Google reject an undefined id
        if (!spreadsheetId) {
            return res.status(400).json({ message: "Spreadsheet SPM untuk tahun ini belum dikonfigurasi." });
        }

        const response = await withBackoff(async () => {
            return await sheets2.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: [
                    `'${DATABASE_SPM_SHEET}'!A2:Q`,
                    `'${CODE_ANGGARAN_SHEET}'!A${CODE_ANGGARAN_FIRST_ROW}:${CODE_ANGGARAN_LAST_COLUMN}`,
                ],
            });
        });

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
        // This route moves money figures, so it checks the JWT itself. Every other
        // route trusts the UI, which would let any signed in user post a ceiling.
        let role = "";
        try {
            role = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET).role || "";
        } catch {
            return res.status(401).json({ message: "Sesi tidak valid, silakan login ulang." });
        }
        if (role !== "admin" && role !== "master admin") {
            return res.status(403).json({ message: "Akses ditolak, hanya admin yang bisa mengubah anggaran." });
        }

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
        const response = await withBackoff(async () => {
            return await sheets2.spreadsheets.values.get({
                spreadsheetId,
                range: `'${CODE_ANGGARAN_SHEET}'!A${CODE_ANGGARAN_FIRST_ROW}:C`,
            });
        });

        const { budgetBySatker } = mapCodeAnggaran(response.data.values || []);
        const budget = budgetBySatker.get(normalizeSatker(satker));
        if (!budget) {
            return res.status(404).json({ message: `Satker "${String(satker).trim()}" tidak ditemukan di Code_Anggaran.` });
        }

        // Stored as strings, matching how the sheet already holds "0". A fund that was
        // not sent keeps the value just read back.
        const nextValues = FUND_KEYS.map(fund => parsedFunds[fund] !== undefined ? String(parsedFunds[fund]) : budget[fund]);

        await withBackoff(async () => {
            return await sheets2.spreadsheets.values.update({
                spreadsheetId,
                range: `'${CODE_ANGGARAN_SHEET}'!B${budget.rowNumber}:${CODE_ANGGARAN_LAST_COLUMN}${budget.rowNumber}`,
                valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
                resource: { values: [nextValues] },
            });
        });

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
// Grid style data entry over 'Pembayaran BP'!A3:O. The API speaks ISO dates and
// plain numbers; the sheet keeps "1-Jan-2026" text and whole rupiah, so every
// conversion happens at this boundary and nowhere else.

const PEMBAYARAN_BP_SHEET = "Pembayaran BP";
const PEMBAYARAN_BP_FIRST_ROW = 3;
const PEMBAYARAN_BP_LAST_COLUMN = "O";
const PEMBAYARAN_BP_MAX_ROWS = 200;
const PEMBAYARAN_BP_VIEW_ROLES = ["admin", "master admin", "admin_gaji"];
const PEMBAYARAN_BP_EDIT_ROLES = ["admin", "master admin"];

const STATUS_BAYAR_BP_OPTIONS = ["Belum Bayar", "Sudah Bayar"];
const STATUS_PAJAK_BP_OPTIONS = ["Belum Setor", "Sudah Setor"];

// Short form spellings, matching how Unit Kerja is written on 'Database SPM'
const UNIT_KERJA_BP_OPTIONS = [
    "Biro Umum", "Biro Sarpras", "Biro Rencana", "Dit Datin", "Dit Hukum",
    "Dit Kebijakan", "Dit Kerma", "Dit Latihan", "Dit Litbang", "Dit Opsla",
    "Dit Opsud", "Dit Strategi", "Inspektorat", "KPIML", "UPH",
    "Zona Barat", "Zona Tengah", "Zona Timur",
];

// Column order is the sheet order, A to O. The two 'auto' columns are written by
// the server; the rest are what the admin fills in.
const PEMBAYARAN_BP_COLUMNS = [
    { key: "no", label: "No", type: "auto" },
    { key: "tanggalEdit", label: "Tanggal Edit", type: "auto" },
    { key: "unitKerja", label: "Unit Kerja", type: "satker", required: true },
    { key: "nomorSpm", label: "Nomor SPM", type: "text", required: true },
    { key: "jenisSpm", label: "Jenis SPM", type: "text", required: true },
    { key: "tanggalSp2d", label: "Tanggal SP2D", type: "date", required: true },
    { key: "va", label: "VA", type: "text" },
    { key: "nilaiSp2d", label: "Nilai SP2D", type: "money", required: true },
    { key: "kodeBniDirect", label: "Kode BNI Direct", type: "text" },
    { key: "statusBayarPenerima", label: "Status Bayar Penerima", type: "enum", options: STATUS_BAYAR_BP_OPTIONS },
    { key: "tanggalBayarPenerima", label: "Tanggal Bayar Penerima", type: "date" },
    { key: "fileBuktiBayar", label: "File Bukti Bayar", type: "link" },
    { key: "statusPajak", label: "Status Pajak", type: "enum", options: STATUS_PAJAK_BP_OPTIONS },
    { key: "tanggalPajak", label: "Tanggal Pajak", type: "date" },
    { key: "fileDepositPajak", label: "File Deposit Pajak", type: "link" },
];
const PEMBAYARAN_BP_EDITABLE = PEMBAYARAN_BP_COLUMNS.filter(column => column.type !== "auto");

// Written form of MONTH_TOKENS, which already parses both these and the English
// spellings back
const MONTH_TOKENS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function splitSheetDate(value) {
    const parts = String(value).split("-");
    if (parts.length !== 3) return null;
    const day = Number(parts[0]);
    const month = MONTH_TOKENS[parts[1].trim().toUpperCase()];
    const year = Number(parts[2]);
    if (!month || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) return null;
    return { day, month, year };
}

// "2026-01-01" or "1-Jan-2026" -> "1-Jan-2026". null when unreadable.
function toSheetDate(value) {
    const raw = String(value ?? "").trim();
    if (raw === "") return "";
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
        const month = Number(iso[2]);
        const day = Number(iso[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${day}-${MONTH_TOKENS_ID[month - 1]}-${Number(iso[1])}`;
    }
    const parsed = splitSheetDate(raw);
    return parsed ? `${parsed.day}-${MONTH_TOKENS_ID[parsed.month - 1]}-${parsed.year}` : null;
}

// "1-Jan-2026" -> "2026-01-01", so a date input on the frontend can bind directly
function fromSheetDate(value) {
    const raw = String(value ?? "").trim();
    if (raw === "") return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = splitSheetDate(raw);
    if (!parsed) return null;
    return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

function pembayaranBpTimestamp() {
    const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map(part => String(part).padStart(2, "0")).join(":");
    return `${date.getDate()}-${MONTH_TOKENS_ID[date.getMonth()]}-${date.getFullYear()} ${time}`;
}

// Normalizes as it validates, so "DIT LATIHAN " can never land as a third spelling
// of an existing satker the way it does when the sheet is typed into directly
function validatePembayaranBpRow(input, index) {
    const cells = {};
    for (const column of PEMBAYARAN_BP_EDITABLE) {
        const raw = input?.[column.key];
        const value = typeof raw === "number" ? raw : String(raw ?? "").trim();
        const where = `Baris ${index + 1}, kolom "${column.label}"`;

        if (value === "") {
            if (column.required) return { ok: false, message: `${where} wajib diisi.` };
            cells[column.key] = "";
            continue;
        }

        switch (column.type) {
            case "satker": {
                const match = UNIT_KERJA_BP_OPTIONS.find(option => normalizeSatker(option) === normalizeSatker(value));
                if (!match) return { ok: false, message: `${where}: "${value}" bukan unit kerja yang dikenal.` };
                cells[column.key] = match;
                break;
            }
            case "enum": {
                const match = column.options.find(option => normalizeSatker(option) === normalizeSatker(value));
                if (!match) return { ok: false, message: `${where} harus salah satu dari: ${column.options.join(", ")}.` };
                cells[column.key] = match;
                break;
            }
            case "date": {
                const date = toSheetDate(value);
                if (date === null) return { ok: false, message: `${where}: tanggal "${value}" tidak terbaca.` };
                cells[column.key] = date;
                break;
            }
            case "money": {
                const nominal = parseRupiah(value);
                if (Number.isNaN(nominal)) return { ok: false, message: `${where}: nilai "${value}" bukan angka.` };
                if (nominal < 0) return { ok: false, message: `${where} tidak boleh negatif.` };
                cells[column.key] = nominal;
                break;
            }
            case "link": {
                if (!/^https:\/\//i.test(value)) return { ok: false, message: `${where} harus berupa tautan hasil unggahan.` };
                cells[column.key] = value;
                break;
            }
            default:
                cells[column.key] = String(value);
        }
    }
    return { ok: true, cells };
}

function pembayaranBpToRecord(row, rowNumber) {
    const record = { rowNumber, no: Number(row?.[0]) || null, tanggalEdit: String(row?.[1] ?? "").trim() };
    const invalidFields = [];

    PEMBAYARAN_BP_EDITABLE.forEach((column, index) => {
        const value = String(row?.[index + 2] ?? "").trim();
        if (value === "") {
            record[column.key] = column.type === "money" ? null : "";
            return;
        }
        if (column.type === "money") {
            const nominal = parseRupiah(value);
            if (Number.isNaN(nominal)) { record[column.key] = value; invalidFields.push(column.key); }
            else record[column.key] = nominal;
        } else if (column.type === "date") {
            const iso = fromSheetDate(value);
            if (iso === null) { record[column.key] = value; invalidFields.push(column.key); }
            else record[column.key] = iso;
        } else {
            record[column.key] = value;
        }
    });

    // Unreadable cells come back as their raw text so the grid can flag them
    // instead of blanking real data on the next save
    if (invalidFields.length) record.invalidFields = invalidFields;
    return record;
}

const pembayaranBpRow = (no, timestamp, cells) =>
    [no, timestamp, ...PEMBAYARAN_BP_EDITABLE.map(column => cells[column.key])];

function requirePembayaranBpRole(roles) {
    return (req, res, next) => {
        let viewer;
        try {
            viewer = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ message: "Sesi tidak valid, silakan login ulang." });
        }
        if (!roles.includes(viewer.role)) {
            return res.status(403).json({ message: "Akses ditolak." });
        }
        req.viewer = viewer;
        next();
    };
}

function pembayaranBpSpreadsheet(req, res) {
    const spreadsheetId = getSpreadsheetId(req, 'PEMBAYARAN_BP');
    if (!spreadsheetId) {
        res.status(400).json({ message: "Spreadsheet Pembayaran BP untuk tahun ini belum dikonfigurasi." });
        return null;
    }
    return spreadsheetId;
}

// Sheets trims trailing empty rows, so the length of column A is the offset of the
// last populated row. Next No comes off the max rather than the count, so a row
// deleted from the sheet cannot make a new entry reuse an existing id.
async function readPembayaranBpIds(spreadsheetId) {
    const response = await withBackoff(async () => {
        return await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${PEMBAYARAN_BP_SHEET}'!A${PEMBAYARAN_BP_FIRST_ROW}:A`,
        });
    });
    const ids = (response.data.values || []).map(row => String(row?.[0] ?? "").trim());
    return {
        ids,
        nextRow: PEMBAYARAN_BP_FIRST_ROW + ids.length,
        nextNo: ids.reduce((max, id) => Math.max(max, Number(id) || 0), 0) + 1,
    };
}

function readPembayaranBpBody(req, res) {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [req.body?.row].filter(Boolean);
    if (rows.length === 0) {
        res.status(400).json({ message: "Tidak ada baris yang dikirim." });
        return null;
    }
    if (rows.length > PEMBAYARAN_BP_MAX_ROWS) {
        res.status(400).json({ message: `Maksimal ${PEMBAYARAN_BP_MAX_ROWS} baris per simpan.` });
        return null;
    }
    return rows;
}

app.get("/bendahara/pembayaran-bp/options", requirePembayaranBpRole(PEMBAYARAN_BP_VIEW_ROLES), (req, res) => {
    return res.status(200).json({
        unitKerja: UNIT_KERJA_BP_OPTIONS,
        statusBayarPenerima: STATUS_BAYAR_BP_OPTIONS,
        statusPajak: STATUS_PAJAK_BP_OPTIONS,
        columns: PEMBAYARAN_BP_COLUMNS.map(({ key, label, type, required }) => ({
            key, label, type, required: Boolean(required),
        })),
    });
});

app.get("/bendahara/pembayaran-bp", requirePembayaranBpRole(PEMBAYARAN_BP_VIEW_ROLES), async (req, res) => {
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;

        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${PEMBAYARAN_BP_SHEET}'!A${PEMBAYARAN_BP_FIRST_ROW}:${PEMBAYARAN_BP_LAST_COLUMN}`,
            });
        });

        const data = (response.data.values || [])
            .map((row, index) => pembayaranBpToRecord(row, PEMBAYARAN_BP_FIRST_ROW + index))
            .filter(record => record.no !== null || PEMBAYARAN_BP_EDITABLE.some(column => {
                const value = record[column.key];
                return value !== "" && value !== null;
            }));

        return res.status(200).json({ data });
    } catch (error) {
        console.error("Error in GET /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal memuat data Pembayaran BP." });
    }
});

app.post("/bendahara/pembayaran-bp", requirePembayaranBpRole(PEMBAYARAN_BP_EDIT_ROLES), async (req, res) => {
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;
        const rows = readPembayaranBpBody(req, res);
        if (!rows) return;

        // Every row is validated before anything is written, so a bad row at the end
        // of a batch cannot land after good rows above it
        const validated = [];
        for (let index = 0; index < rows.length; index++) {
            const result = validatePembayaranBpRow(rows[index], index);
            if (!result.ok) return res.status(400).json({ message: result.message, rowIndex: index });
            validated.push(result.cells);
        }

        const { nextRow, nextNo } = await readPembayaranBpIds(spreadsheetId);
        const timestamp = pembayaranBpTimestamp();
        const values = validated.map((cells, index) => pembayaranBpRow(nextNo + index, timestamp, cells));
        const endRow = nextRow + values.length - 1;

        // RAW keeps "1-Jan-2026" as the text the rest of the app parses, while a JS
        // number still lands as a real number cell
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${PEMBAYARAN_BP_SHEET}'!A${nextRow}:${PEMBAYARAN_BP_LAST_COLUMN}${endRow}`,
                valueInputOption: "RAW",
                requestBody: { values },
            });
        });

        return res.status(201).json({
            message: `${values.length} baris berhasil disimpan.`,
            data: values.map((row, index) => ({ rowNumber: nextRow + index, no: row[0], tanggalEdit: timestamp })),
        });
    } catch (error) {
        console.error("Error in POST /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal menyimpan data Pembayaran BP." });
    }
});

app.patch("/bendahara/pembayaran-bp", requirePembayaranBpRole(PEMBAYARAN_BP_EDIT_ROLES), async (req, res) => {
    try {
        const spreadsheetId = pembayaranBpSpreadsheet(req, res);
        if (!spreadsheetId) return;
        const rows = readPembayaranBpBody(req, res);
        if (!rows) return;

        const validated = [];
        const seenRows = new Set();
        for (let index = 0; index < rows.length; index++) {
            const rowNumber = Number(rows[index]?.rowNumber);
            const no = String(rows[index]?.no ?? "").trim();
            if (!Number.isInteger(rowNumber) || rowNumber < PEMBAYARAN_BP_FIRST_ROW) {
                return res.status(400).json({ message: `Baris ${index + 1}: rowNumber tidak valid.`, rowIndex: index });
            }
            if (no === "") {
                return res.status(400).json({ message: `Baris ${index + 1}: No wajib dikirim saat memperbarui.`, rowIndex: index });
            }
            if (seenRows.has(rowNumber)) {
                return res.status(400).json({ message: `Baris ${rowNumber} dikirim lebih dari sekali.`, rowIndex: index });
            }
            seenRows.add(rowNumber);

            const result = validatePembayaranBpRow(rows[index], index);
            if (!result.ok) return res.status(400).json({ message: result.message, rowIndex: index });
            validated.push({ rowNumber, no, cells: result.cells });
        }

        // Column A is read back and matched against the No the client fetched. Anyone
        // inserting a row directly in the sheet shifts every rowNumber, and without
        // this an edit would silently overwrite a different payment.
        const { ids } = await readPembayaranBpIds(spreadsheetId);
        for (const item of validated) {
            const current = ids[item.rowNumber - PEMBAYARAN_BP_FIRST_ROW];
            if (current === undefined || current !== item.no) {
                return res.status(409).json({
                    message: `Data di baris ${item.rowNumber} sudah berubah di spreadsheet. Muat ulang sebelum menyimpan.`,
                    rowNumber: item.rowNumber,
                });
            }
        }

        // Starts at B so the No in column A survives the update
        const timestamp = pembayaranBpTimestamp();
        const data = validated.map(item => ({
            range: `'${PEMBAYARAN_BP_SHEET}'!B${item.rowNumber}:${PEMBAYARAN_BP_LAST_COLUMN}${item.rowNumber}`,
            values: [[timestamp, ...PEMBAYARAN_BP_EDITABLE.map(column => item.cells[column.key])]],
        }));

        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: { valueInputOption: "RAW", data },
            });
        });

        return res.status(200).json({
            message: `${data.length} baris berhasil diperbarui.`,
            tanggalEdit: timestamp,
        });
    } catch (error) {
        console.error("Error in PATCH /bendahara/pembayaran-bp:", error);
        return res.status(500).json({ message: "Gagal memperbarui data Pembayaran BP." });
    }
});

// Upload stays off the save path: the grid gets a link back, then saves it like any
// other cell value, so a batch save never carries file bytes
const driveFolderIdPembayaranBp = process.env.DRIVE_FOLDER_ID_PEMBAYARAN_BP;

app.post(
    "/bendahara/pembayaran-bp/upload",
    requirePembayaranBpRole(PEMBAYARAN_BP_EDIT_ROLES),
    handleDokumenGajiUpload,
    async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ message: "Berkas PDF wajib diunggah." });
            if (!driveFolderIdPembayaranBp) {
                console.error("DRIVE_FOLDER_ID_PEMBAYARAN_BP belum diatur - upload dibatalkan.");
                return res.status(503).json({ message: "Folder penyimpanan belum dikonfigurasi. Hubungi admin." });
            }
            if (!await ensureGajiDriveReady()) {
                console.error("Token uploader belum ada - buka /auth/google/gaji dengan akun yang dituju.");
                return res.status(503).json({ message: "Layanan penyimpanan berkas belum siap. Hubungi admin." });
            }

            const safePart = (value) => String(value || "").replace(/[\\/]/g, "-").trim();
            const jenis = safePart(req.body.jenis).toLowerCase() === "pajak" ? "Deposit Pajak" : "Bukti Bayar";
            const nomorSpm = safePart(req.body.nomorSpm) || "Tanpa Nomor SPM";

            const bufferStream = new stream.Readable();
            bufferStream.push(req.file.buffer);
            bufferStream.push(null);

            const driveResponse = await driveGaji.files.create({
                requestBody: {
                    name: `${jenis} - ${nomorSpm}.pdf`,
                    parents: [driveFolderIdPembayaranBp],
                },
                media: { mimeType: req.file.mimetype, body: bufferStream },
                fields: "webViewLink",
                supportsAllDrives: true,
            });

            return res.status(200).json({ link: driveResponse.data.webViewLink || "" });
        } catch (error) {
            console.error("Error in /bendahara/pembayaran-bp/upload:", error);
            return res.status(500).json({ message: "Gagal mengunggah berkas." });
        }
    }
);

// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})
