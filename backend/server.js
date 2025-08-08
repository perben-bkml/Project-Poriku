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
    const date = new Date();
    // Get date in yyyy-mm-dd
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const prevMonth = String(date.getMonth()).padStart(2, '0'); // Prev Month
    const day = String(date.getDate()).padStart(2, '0');
    const fullDateFormat = `${year}-${month}-${day}`;
    // Date in yyyy-mm
    const MonthDateFormat = `${year}-${month}`;
    // Previous Month
    const PrevMonthDate =  `${year}-${prevMonth}`;
    return {
        fullDateFormat,
        MonthDateFormat,
        PrevMonthDate,
    }
}
const { fullDateFormat, MonthDateFormat, PrevMonthDate } = getFormattedDate();

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
            console.log("Cookie header:", req.headers.cookie);
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

// OAuth2 Client for Google Drive
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Gsheet API Setup
const sheets = google.sheets({ version: "v4", auth })
const spreadsheetId = process.env.SPREADSHEET_ID_AJUAN;
const spreadsheetIdCariSPM = process.env.SPREADSHEET_ID_CARISPM;
const spreadsheetIdGaji = process.env.SPREADSHEET_ID_GAJI;

// Gsheet Verif API Setup
const sheets2 = google.sheets({ version: "v4", auth: auth2 })
const spreadsheetIdVerif = process.env.SPREADSHEET_ID_VERIF;

// Gdrive API Setup (will be initialized with OAuth2 tokens)
let drive = null;
const driveFolderId = process.env.DRIVE_FOLDER_ID_AJUAN;

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

// Initialize OAuth tokens on server startup
loadOAuthTokens();

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
        console.log("=== COOKIE SETTING DEBUG ===");
        console.log("Setting auth cookie for user:", userData[0].name);
        console.log("Environment:", process.env.NODE_ENV);
        console.log("Frontend Origin:", process.env.FRONTEND_ORIGIN);
        console.log("Hostname Domain:", process.env.HOSTNAME_DOMAIN);
        console.log("Cookie config:", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax',
            domain: process.env.NODE_ENV === "production" ? process.env.HOSTNAME_DOMAIN : undefined,
            path: '/',
            maxAge: 5 * 60 * 60 * 1000
        });
        
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
        const { page = 1, limit = 5, username } = req.query;

        // Fetch all data from columns A to L starting from row 3
        const getAllRowsResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Write Antrian'!A3:T",
            });
        });

        let allRows = getAllRowsResponse.data.values || [];

        // Filter rows where column L matches username (if username don't exist it will handle Lihat-Antrian)
        let filteredRows = []
        if (username) {
            filteredRows = allRows.filter(row => row[11] === username);
        } else {
            filteredRows = allRows;
        }
        // Sort from latest to earliest by reversing
        filteredRows = filteredRows.reverse();

        const totalFiltered = filteredRows.length;

        // Pagination logic (from the bottom up)
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedRows = filteredRows.slice(startIndex, endIndex);

        // Ensure each row has 20 columns
        const normalizedRows = paginatedRows.map(row => {
            while (row.length < 20) row.push("");
            return row;
        });

        res.json({ data: normalizedRows, realAllAntrianRows: totalFiltered });

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
        // Fetch the entire column B from Google Sheets with backoff handling
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Write Antrian'!B:B", // Adjust to your sheet name and range
            });
        });

        // Get all rows from column B
        const allRows = response.data.values || [];

        // Filter rows that match the date prefix
        const filteredRows = allRows
            .map((row, index) => ({ date: row[0], rowIndex: index + 1 })) // Add row index for reference
            .filter(row => row.date && row.date.startsWith(datePrefix));
        // Error handling if no keyword found
        if (filteredRows.length === 0) {
            return res.status(404).json({ error: "No matching rows found." });
        }
        // Sort rows in reverse order (latest dates first)
        filteredRows.reverse();

        // Calculate pagination
        const totalRows = filteredRows.length;
        const startIndex = (page - 1) * limit;
        const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);

        // Fetch full row data for the paginated rows with backoff handling
        const rowRanges = paginatedRows.map(row => `'Write Antrian'!A${row.rowIndex}:L${row.rowIndex}`); // Adjust range if needed

        // Using backoff for the batch get operation
        const batchGetResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: rowRanges,
            });
        });

        // Combine row data
        const rowData = batchGetResponse.data.valueRanges.map(range => range.values[0]);
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
app.post("/bendahara/buat-ajuan", upload.single('file'), async (req, res) => {
    //Extracting each part from formData
    const textdata = JSON.parse(req.body.textdata);
    const tabledata = JSON.parse(req.body.tabledata);
    const userdata = req.body.userdata;

    if (textdata && tabledata && userdata) {
        try {
            // File Upload Handling
            let fileLink = ""; //Link to see the uploaded file

            //Check if req.file from formData exist
            if (req.file) {
                // Check if OAuth2 is authenticated, try to load from database if not
                if (!drive || !oauth2Client.credentials.access_token) {
                    console.log('No OAuth tokens in memory, attempting to load from database...');
                    const tokensLoaded = await loadOAuthTokens();
                    
                    if (!tokensLoaded) {
                        return res.status(401).json({ 
                            error: "Google Drive authentication required. Please authenticate first.",
                            authUrl: `${req.protocol}://${req.get('host')}/auth/google`,
                            redirectToAuth: true
                        });
                    }
                }

                // Check if token is expired and refresh if needed
                try {
                    if (oauth2Client.credentials.expiry_date && oauth2Client.credentials.expiry_date < Date.now()) {
                        console.log('Token expired, refreshing...');
                        await oauth2Client.refreshAccessToken();
                        drive = google.drive({ version: "v3", auth: oauth2Client });
                        
                        // Save refreshed tokens to database
                        await saveOAuthTokens(oauth2Client.credentials);
                    }
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    return res.status(401).json({ 
                        error: "Authentication expired. Please re-authenticate.",
                        authUrl: `${req.protocol}://${req.get('host')}/auth/google`,
                        redirectToAuth: true
                    });
                }

                const bufferStream = new stream.Readable();
                bufferStream.push(req.file.buffer);
                bufferStream.push(null);

                // This is your 'requestBody' for metadata
                const requestBody = {
                    name: req.file.originalname,
                    parents: [driveFolderId] // <-- The critical part the example omits
                };

                // This is your 'media' for the file content
                const media = {
                    mimeType: req.file.mimetype,
                    body: bufferStream
                };

                const driveResponse = await drive.files.create({
                    requestBody: requestBody,
                    media: media,
                    fields: 'webViewLink',
                    supportsAllDrives: true,
                    supportsTeamDrives: true
                });

                fileLink = driveResponse.data.webViewLink;
            }

            // Get textdata/input data antrian and tabledata
            const ranges = [
                "'Write Antrian'!A:A",
                "'Write Table'!A:A",
                "'Write Antrian'!R1:R1"  //Getting antrian ID counter
            ]

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
            const lastTableRows = responseTable.length || [];
            // Add date to beginning of textdata array
            textdata.unshift(fullDateFormat);
            // Add counter increment and unshift to textdata
            const newIdCounter = parseInt(responseId) + 1;
            textdata.unshift(newIdCounter)
            // Posting on Write Antrian
            const startAntrianRow = lastFilledRows + 1;
            const antrianColumnCount = textdata.length;
            const antrianColumnEnd = String.fromCharCode(65 + antrianColumnCount); //Convert to letter.
            const newAntrianRange = `'Write Antrian'!A${startAntrianRow}:${antrianColumnEnd}${startAntrianRow}`
            // Posting on Write Table
            const startTableRow = lastTableRows + 3;
            const endTableRow = startTableRow + tabledata.length -1;
            const tableColumnCount = tabledata[0].length;
            const tableColumnEnd = String.fromCharCode(65 + tableColumnCount - 1); //Convert to letter
            const newTableRange = `'Write Table'!A${startTableRow}:${tableColumnEnd}${endTableRow}`
            // Update Gsheet Antrian and Table
            var resource = {
                data: [
                    {
                        range: newAntrianRange,
                        values: [textdata],
                    },
                    {
                        range: newTableRange,
                        values: tabledata,
                    },
                    {
                        range: "'Write Antrian'!R1:R1",
                        values: [[newIdCounter]],
                    },
                    {
                        //Write Satuan Kerja Name
                        range: `'Write Antrian'!L${startAntrianRow}`,
                        values: [[userdata]],
                    },
                    {
                        //Write file name
                        range: `'Write Antrian'!T${startAntrianRow}`,
                        values: [[fileLink]],
                    }
                ],
                valueInputOption: "RAW",
            }

            // Apply backoff strategy for batch update
            const response = await withBackoff(async () => {
                return await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    resource,
                });
            });

            // Assign Transaksi ID and Row number (Row number for edits)
            // Getting posted Antrian Number
            const newAntrianNumRange = `'Write Antrian'!A${startAntrianRow}:A${startAntrianRow}` 

            // Apply backoff for getting antrian number
            const requestNewAntrianNum = await withBackoff(async () => {
                return await sheets.spreadsheets.values.get({
                    spreadsheetId, 
                    range: newAntrianNumRange
                });
            });

            const getNewAntrianNum = requestNewAntrianNum.data.values;
            const newAntrianNum = getNewAntrianNum[0][0]
            // Getting posted Table row numbers
            const postedTableRow = tabledata.length - 1;
            // Writing it to desired table
            const idAndRowNum = [ `TRANS_ID:${newAntrianNum}`, postedTableRow ];
            const idAndRowNumRange = `'Write Table'!X${startTableRow}:Y${startTableRow}`;
            resource = { values: [idAndRowNum] }

            // Apply backoff for updating ID and row number
            const writeIdAndRowNum = await withBackoff(async () => {
                return await sheets.spreadsheets.values.update({
                    spreadsheetId, 
                    range: idAndRowNumRange, 
                    valueInputOption: "RAW", 
                    resource
                });
            });

            // Coloring Gsheet Table header & giving borders
            resource = "";

            // Apply backoff for getting sheet info
            const sheetInfo = await withBackoff(async () => {
                return await sheets.spreadsheets.get({ spreadsheetId });
            });

            const sheet = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Table");
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
            const updateColor = await withBackoff(async () => {
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
        const transaksiKeyword = req.query.tableKeyword;
        // Finding keyword range with data from X & Y columns on Write Table Sheet
        const matchRange = "'Write Table'!X:Y";

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
        const keywordTableRange = `'Write Table'!A${keywordRow}:V${endKeywordTableRow}`;

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
        // Add empty rows to generate max 22 columns
        const num_Columns = 22;
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
app.patch("/bendahara/edit-table", upload.single('file'), async (req, res) => {
    //Extracting each part from formData
    const textdata = JSON.parse(req.body.textdata);
    const tabledata = JSON.parse(req.body.tabledata);
    const tablePosition = JSON.parse(req.body.tablePosition);
    const antriPosition = JSON.parse(req.body.antriPosition);
    const lastTableEndRow = JSON.parse(req.body.lastTableEndRow);

    if (!textdata || !tabledata || !tablePosition || !antriPosition || !lastTableEndRow) {
        return res.status(400).json({message: "Invalid Data."})  
    }
    try {

        // File Upload Handling
        let fileLink = "";

        //Check if req.file from formData exist
        if (req.file) {
            // Check if OAuth2 is authenticated, try to load from database if not
            if (!drive || !oauth2Client.credentials.access_token) {
                console.log('No OAuth tokens in memory, attempting to load from database...');
                const tokensLoaded = await loadOAuthTokens();
                
                if (!tokensLoaded) {
                    return res.status(401).json({
                        error: "Google Drive authentication required. Please authenticate first.",
                        authUrl: `${req.protocol}://${req.get('host')}/auth/google`,
                        redirectToAuth: true
                    });
                }
            }

            // Check if token is expired and refresh if needed
            try {
                if (oauth2Client.credentials.expiry_date && oauth2Client.credentials.expiry_date < Date.now()) {
                    console.log('Token expired, refreshing...');
                    await oauth2Client.refreshAccessToken();
                    drive = google.drive({ version: "v3", auth: oauth2Client });
                    
                    // Save refreshed tokens to database
                    await saveOAuthTokens(oauth2Client.credentials);
                }
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                return res.status(401).json({
                    error: "Authentication expired. Please re-authenticate.",
                    authUrl: `${req.protocol}://${req.get('host')}/auth/google`,
                    redirectToAuth: true
                });
            }

            const bufferStream = new stream.Readable();
            bufferStream.push(req.file.buffer);
            bufferStream.push(null);

            // This is your 'requestBody' for metadata
            const requestBody = {
                name: req.file.originalname,
                parents: [driveFolderId] // <-- The critical part the example omits
            };

            // This is your 'media' for the file content
            const media = {
                mimeType: req.file.mimetype,
                body: bufferStream
            };

            const driveResponse = await drive.files.create({
                requestBody: requestBody,
                media: media,
                fields: 'webViewLink',
                supportsAllDrives: true,
                supportsTeamDrives: true
            });

            fileLink = driveResponse.data.webViewLink;
        }

        console.log(fileLink);
        console.log("you hit the edit-table path")

        // Setting antrian data range
        textdata.unshift(fullDateFormat);

        // Apply backoff strategy for getting antrian data
        const antriResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId, 
                range: "'Write Antrian'!A3:A"
            });
        });

        const matchResult = antriResponse.data.values || [];
        let antriRow = null;
        for (let i = 0; i < matchResult.length; i++) {
            if (String(matchResult[i][0]) === String(antriPosition)) {
                antriRow = i + 1 + 2; //Convert to 1-based row index. +2 to exclude header and start from A3
                break;
            }
        }
        if (!antriRow) {
            return res.status(400).json({ error: "Keyword not found" });
        }
        // Setting table data range
        const startTableRow = tablePosition;
        const endTableRow = startTableRow + tabledata.length -1;
        const tableColumnCount = tabledata[0].length;
            // Getting sheet ID
        // Get Sheet IDs with backoff
        const sheetInfo = await withBackoff(async () => {
            return await sheets.spreadsheets.get({ spreadsheetId });
        });

        const tableSheetId = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Table").properties.sheetId;

        // For Border Style
        const tableBorderStyle = { style: "SOLID", width: 1, color: {red: 0, green: 0, blue: 0,}, }

        // Calculate Row Adjustments
        const endRowDifference = Math.abs(endTableRow - lastTableEndRow);
        let requests = [];

        if (endTableRow > lastTableEndRow) {
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

        // Prepare batch data updates (Preserves text formatting with single API call)
        const batchDataUpdates = [
            {
                range: `'Write Table'!A${startTableRow}:${String.fromCharCode(65 + tableColumnCount - 1)}${endTableRow}`,
                values: tabledata
            },
            {
                range: `'Write Antrian'!B${antriRow}:${String.fromCharCode(66 + textdata.length - 1)}${antriRow}`,
                values: [textdata]
            },
            {
                range: `'Write Table'!Y${startTableRow}`,
                values: [[`${tabledata.length - 1}`]]
            }
        ];

        // Add file link update if file was uploaded
        if (fileLink) {
            batchDataUpdates.push({
                range: `'Write Antrian'!T${antriRow}`,
                values: [[fileLink]]
            });
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

        // Execute Batch Update for row adjustments only (if any requests remain)
        if (requests.length > 0) {
            await withBackoff(async () => {
                return await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests },
                });
            });
        }

        console.log("✅ Update successful!");

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
        // Finding keyword range with data from X & Y columns and A column on Write Table and Write Antrian Sheet 
         const matchRange = [
            "'Write Table'!X:Y",  //Table data Range
            "'Write Antrian'!A:A", //Antrian data Range
            ];

         // Apply backoff for batch get operation
         const matchResponse = await withBackoff(async () => { 
             return await sheets.spreadsheets.values.batchGet({ 
                 spreadsheetId, 
                 ranges: matchRange 
             });
         });

         const responseTable = matchResponse.data.valueRanges[0].values || [];
         const responseAntrian = matchResponse.data.valueRanges[1].values || [];
         // Matching range with user inputted keyword
         let keywordRow = null;  //To get the keyword row range. Used to grab table data later.
         let keywordTableRow = null;  //To get how long the row is on the keyword table data.
         let keywordAntrian = null; //To get antrian row range.
         for (let i = 0; i < responseTable.length; i++) {
             if (responseTable[i][0] === delTableKeyword) {
                 keywordRow = i + 1 ; //Convert to 1-based row index.
                 keywordTableRow = responseTable[i][1]; //Getting the number of rows stated on Column Y
                 break;
             }
         }
         for (let i = 0; i < responseAntrian.length; i++) {
            if (responseAntrian[i][0] === delKeyword) {
                keywordAntrian = i + 1; //Convert to 1-based row index
                break;
            }
         }
         if (!keywordRow || !keywordTableRow || !keywordAntrian){
             return res.status(400).json({ error: "Keyword not found" })
         }
        //  Delete Rows
            // Find Sheets ID with backoff
        const sheetInfo = await withBackoff(async () => {
            return await sheets.spreadsheets.get({ spreadsheetId });
        });

        const antriSheetId = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Antrian").properties.sheetId;
        const tableSheetId = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Table").properties.sheetId;
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
                },
                { // Delete row in Table Sheet
                    deleteDimension: {
                        range: {
                            sheetId: tableSheetId,
                            dimension: "ROWS",
                            startIndex: keywordRow - 3, //Zero based index. Add -2 to delete two columns above
                            endIndex: parseInt(keywordRow) + parseInt(keywordTableRow) //Zero based index.
                        }
                    }
                }
            ]
        };
        // Send the batch update request with backoff
        const result = await withBackoff(async () => {
            return await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: batchRequest
            });
        });

        console.log("Successfully delete data.")
        res.status(200).json({ message: "Table Deleted successfully." });

    } catch (error) {
        console.error("Error in /bendahara/delete-ajuan:", error);
        res.status(500).json({ message: "Server error." });
    }
})

// Handling interaction with PEMBAYARAN BP 2025 Sheet
// Cari SPM
app.patch("/bendahara/cari-spm", async (req, res) => {
    try {
        const { data } = req.body;
        const cariRange = "'DASHBOARD'!D8"

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
    const datePrefixes = [MonthDateFormat, PrevMonthDate];
      try {
        // Fetch entire column B from Google Sheets with backoff
        const response = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Write Antrian'!B:B",
            });
        });

        // Get all rows
        const allRows = response.data.values || [];

        // Filter rows based on this month and previous month
        const filteredRows = allRows
            .map((row, index) => ({ date: row[0], rowIndex: index + 1 })) // Add row index for reference
            .filter(row => row.date && datePrefixes.some(prefix => row.date.startsWith(prefix)));
        // Error handling if no keyword found
        if (filteredRows.length === 0) {
            return res.status(404).json({ error: "No matching rows found." });
        }
        // Sort rows in reverse order (latest dates first)
        const reversedRows = filteredRows.reverse();
        // Fetch full row data for the selected month with backoff
        const rowRanges = reversedRows.map(row => `'Write Antrian'!A${row.rowIndex}:T${row.rowIndex}`); // Adjust range if needed

        const batchGetResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: rowRanges,
            });
        });

        let rowData = batchGetResponse.data.valueRanges.map(range => range.values[0]);
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
        // Filtering to separate into 6 array
        const dalamAntrian = filterByStatus(rowData, "Dalam Antrian");
        const sedangVerif = filterByStatus(rowData, "Sedang Di Verifikasi");
        const sudahVerif = filterByStatus(rowData, "Sudah Di Verifikasi");
        const ajuanHariIni = filterByStatus(rowData, "Diajukan Hari Ini");
        const terbitDRPP = filterByStatus(rowData, "Sudah Diterbitkan DRPP");
        const diajukanKPPN = filterByStatus(rowData, "Sudah Diajukan ke KPPN");
        res.json({ data: [dalamAntrian, sedangVerif, sudahVerif, ajuanHariIni, terbitDRPP, diajukanKPPN] });

      } catch (error) {
            console.error("Error in /bendahara/kelola-ajuan:", error);
            res.status(500).json({ error: "Failed to fetch data." });
      } 
})

//Aksi-Pengajuan Handler
app.post("/bendahara/aksi-ajuan", async (req, res) => {
    try {
        const {updatedAntriData, monitoringDrppData, documentData} = req.body
        if (!updatedAntriData) {
            return res.status(400).json({ message: "Invalid or missing data." });
        }

        const {no_antri, ajuan_verifikasi, tgl_verifikasi, status_pajak, sedia_anggaran, tgl_setuju, drpp, spp, spm, catatan} = updatedAntriData;

        //Handling Write Antrian Sheet update with backoff
        const getAntrianResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Write Antrian'!A:A"
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

        const ajuanVerifikasiValue = ajuan_verifikasi === "TRUE" ? fullDateFormat : "";

        // Update multiple columns in a single request
        const updateData = [
            [`'Write Antrian'!P${rowIndex}`, tgl_verifikasi],
            [`'Write Antrian'!M${rowIndex}`, status_pajak],
            [`'Write Antrian'!N${rowIndex}`, sedia_anggaran],
            [`'Write Antrian'!G${rowIndex}`, tgl_setuju],
            [`'Write Antrian'!I${rowIndex}`, drpp],
            [`'Write Antrian'!J${rowIndex}`, spp],
            [`'Write Antrian'!K${rowIndex}`, spm],
            [`'Write Antrian'!Q${rowIndex}`, catatan],
            [`'Write Antrian'!O${rowIndex}`, ajuanVerifikasiValue], // Condition for column O
        ];

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
                    range: "'Monitoring DRPP'!B:G"
                });
            });

            const monitoringRows = getMonitoringResponse.data.values || [];
            let existingStartRow = null;
            let existingRowCount = 0;

            // Find if `trans_id` already exists
            for (let i = 0; i < monitoringRows.length; i++) {
                if (monitoringRows[i][0] === trans_id) {
                    if (!existingStartRow) {
                        existingStartRow = i + 1; // Convert to 1-based index (first occurrence)
                    }
                    existingRowCount++; // Count all rows belonging to the same trans_id
                } else if (existingStartRow) {
                    break; // Stop counting when a new `trans_id` appears
                }
            }

            const newRowCount = drppArray.length;

            // Prepare the new rows
            let rowsToWrite = [];
            for (let i = 0; i < newRowCount; i++) {
                rowsToWrite.push([
                    trans_id, // Trans ID is written on all rows
                    fullDateFormat, // Column C
                    satker, // Column D
                    drppArray[i], // Column E
                    spmDrppArray[i], // Column F
                    nominalArray[i], // Column G
                    "Belum", // Column H
                    "Belum", // Column I
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
        const { page = 1, limit = 10, filterKeyword } = req.query;

        // Fetch total rows based on A column with backoff
        const getAllRowsResponse = await withBackoff(async () => {
            return await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Monitoring DRPP'!A:I",
            });
        });

        const totalRows = getAllRowsResponse.data.values || [];
        const totalRowCount = totalRows.length;

        let allRows = totalRows.map((row, index) => ({
            satker: row[0] || "",
            pungut: row[7] || "",
            setor: row[8] || "",
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

        const visibleRows = allRows.filter(row => row.rowIndex >= 3);
        
        // Sort by rowIndex in descending order to get latest rows first
        const sortedRows = visibleRows.sort((a, b) => b.rowIndex - a.rowIndex);
        
        const startIndex = ( page - 1 ) * limit;
        const endIndex = startIndex + limit;
        const paginatedRows = sortedRows.slice(startIndex, endIndex)

        const fetchRowRange= paginatedRows.map(row => `'Monitoring DRPP'!A${row.rowIndex}:K${row.rowIndex}` );
        // Fetch Paginated Data with backoff
        const getDRPPResponses = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: fetchRowRange,
            });
        });

        //Capture data values
        const paginatedDRPP = getDRPPResponses.data.valueRanges ?
            getDRPPResponses.data.valueRanges.map(row => {
                const values = row.values?.[0] || [];
                while (values.length < 11) {
                    values.push("");
                }
                return values;
            }) : [];

        const paginatedSlicedDRPP = paginatedDRPP.map(row => row.slice(0, -1))

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

        const countData = [hBelum, hSudah, iBelum, iSudah]

        res.json({ data: paginatedSlicedDRPP, realAllDRPPRows: totalRowCount, countData: countData, fullData: paginatedDRPP });

    } catch (error) {
        console.error("Error in /bendahara/monitoring-drpp:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

//Aksi DRPP handler
app.get("/bendahara/cek-drpp", async (req, res) => {
    try {
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
        // Apply backoff for batch get
        const getDrppRows = await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges: [
                    "'Monitoring DRPP'!A3:A",   // Range to update DRPP status
                    "'Write Table'!X:X"       // Range to update colored row status
                ],
            });
        });

        const totalRows = getDrppRows.data.valueRanges[0].values || [];
        const colorRows = getDrppRows.data.valueRanges[1].values || [];

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

        // Apply backoff for batch update - Combine the two API calls into one batchUpdate for efficiency
        await withBackoff(async () => {
            return await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: "RAW",
                    data: [
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
                    ]
                }
            });
        });

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
        const { satkerPrefix = "", filterKeyword = "", page = 1, limit = 10 } = req.query;

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
            status: row[7] || "",           // Column H
            rowIndex: index + 1
        }));

        //Filter if satkerPrefix exist
        if (satkerPrefix !== "") {
            allRows = allRows.filter(row => row.satker.startsWith(satkerPrefix));
        }
        if (filterKeyword !== "") {
            allRows = allRows.filter(row => row.status.includes(filterKeyword));
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
            const rowRanges = paginatedRows.map(row => `'Daftar SPM'!A${row.rowIndex}:H${row.rowIndex}`);
            const batchGetResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.batchGet({
                    spreadsheetId: spreadsheetIdVerif,
                    ranges: rowRanges,
                })
            })
            rowData = batchGetResponse.data.valueRanges.map(row => row.values[0]);
            totalPages = Math.ceil(allRows.length / limit);
            if (satkerPrefix === "" && filterKeyword === "" && parseInt(page) === parseInt(totalPages)) {
                rowData.pop()
            }
        }


        //Fetch PJK Count data
        let countData = null;
        if (satkerPrefix === "") {
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
        const { data, type, rowPosition } = req.body;
        //Current Date converter to dd/mm/yyyy hh:mm:ss
        function formatDateTime(date) {
            const pad = (n) => String(n).padStart(2, '0');

            const day = pad(date.getDate());
            const month = pad(date.getMonth() + 1); // Months are 0-indexed
            const year = date.getFullYear();

            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            const seconds = pad(date.getSeconds());

            return dateFormat(date, "dd/mm/yyyy hh:MM:ss");

            // return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }

        const now = new Date();
        const formatted = formatDateTime(now);
        data.push(formatted);


        if (type === "filled") {
            //Directly write into the row
            const writeResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Data'!A${rowPosition}:G${rowPosition}`,
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
            const nextRow = getAllRows.length + 1;

            const writeResponse = await withBackoff(async () => {
                return await sheets2.spreadsheets.values.update({
                    spreadsheetId: spreadsheetIdVerif,
                    range: `'Data'!A${nextRow}:G${nextRow}`,
                    valueInputOption: "RAW", // Preserves text format, prevents auto-conversion
                    resource: { values: [data] }
                })
            })

        }

        res.status(200).json({ message: "Data successfully written." })

    } catch (error) {
        console.error("Error fetching Data PJK", error);
    }
})

app.get("/verifikasi/cari-spm", async (req,res) => {
    const { searchValue } = req.query;
    try {
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




// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})
