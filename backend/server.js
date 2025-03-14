import express from "express";
import cors from "cors";
import { google } from "googleapis";
import bodyParser from "body-parser";
import fs from "fs";
import postgres from "postgres";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";

// Date

// Initialize tools
const app = express();
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
// Allowing CORS to get request and cookies from frontend
const corsOption = {
    origin: "http://localhost:5173",
    credentials: true,
}

// Middleware
app.use(express.json());
app.use(cors(corsOption));
app.use(cookieParser())

// Setting Up Postgres
const dbCredentials = JSON.parse(fs.readFileSync("./credentials/database.json"));
const sql = postgres(dbCredentials);

// JWT Secret Key
const JWT_SECRET = JSON.parse(fs.readFileSync("./credentials/jwt_secret.json"));
const JWT_SECRET_KEY = JWT_SECRET.jwt_secret;

// Credentials
const gsheetCredentials = JSON.parse(fs.readFileSync("./credentials/project-import-gsheet-keu-27df045eec2e.json"))
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
const auth = new google.auth.JWT(
    gsheetCredentials.client_email,
    null,
    gsheetCredentials.private_key,
    SCOPES
);

// Gsheet API Setup
const sheets = google.sheets({ version: "v4", auth })
const sheetIds = JSON.parse(fs.readFileSync("./credentials/sheetid.json"))
const spreadsheetId = sheetIds.spreadsheetId;
const spreadsheetIdCariSPM = sheetIds.spreadsheetIdCariSPM;

//Endpoints
// Login page
app.post("/login-auth", async (req, res) => {
    const { username, password } = req.body;
    try {
        //Note: i do 12 salting rounds!
        // const hashedPassword = await bcrypt.hash(password, 12)

        //Get user data
        const userData= await sql`
            SELECT * FROM poriku_users WHERE username = ${username}
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
            JWT_SECRET_KEY,
            { expiresIn: "8h" }
        );

            // Set cookie with the token
        res.cookie("auth_token", token, {   // The cookie name is "auth_token"
            httpOnly: true, // Prevent JavaScript access
            secure: false, // Set to true in production (requires HTTPS)
            sameSite: "lax", //Helps with cross site request
            maxAge: 3 * 60 * 60 * 1000, // 3 hours
        });

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
    res.clearCookie("auth_token", {
        httpOnly: true,
        secure: false,
        sameSite: "lax"
    })
    res.status(200).json({ message: "Logout Successful!"})
})

//Check user cookies
app.get("/check-auth", (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET_KEY);
        res.status(200).json({ 
            user: {
                name: decoded.name,
                role: decoded.role } 
            });
    } catch (error) {
        res.status(400).json({ message: "Invalid token" });
    }
});

// Render data antrian
app.get("/bendahara/antrian", async (req, res) => {
    try {
        const { page = 1, limit = 5 } = req.query; //Page=1 limit=5 is default. changed by req.query.

        // Fetch total rows first
        const getAllRowsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Write Antrian'!A3:A", // Only fetch the first column to determine row count
        });
        const totalRows = getAllRowsResponse.data.values.length;

        // Set rows to fetch from the end of the sheet
        const endRow = totalRows - (page - 1) * limit + 2; // +2 to account for the starting row at A3
        const startRow = Math.max(endRow - limit + 1, 3); // Ensure we don't go below row 3
        const fetchRowRange= `'Write Antrian'!A${startRow}:L${endRow}`;

        // Fetch Paginated Data
        const getAntrianResponses = await sheets.spreadsheets.values.get({ spreadsheetId, range: fetchRowRange, });

        //Handle empty rows
        let paginatedAntrian = getAntrianResponses.data.values || [];
         // Add empty rows to generate max 12 columns
         const num_Columns = 12;
         paginatedAntrian = paginatedAntrian.map(row => {
             while (row.length < num_Columns) {
                 row.push("");
             }
             return row;
         })
        res.json({ data: paginatedAntrian, realAllAntrianRows: totalRows })

    } catch (error) {
        console.error(error);
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
        // Fetch the entire column B from Google Sheets
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Write Antrian'!B:B", // Adjust to your sheet name and range
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

        // Fetch full row data for the paginated rows
        const rowRanges = paginatedRows.map(row => `'Write Antrian'!A${row.rowIndex}:L${row.rowIndex}`); // Adjust range if needed
        const batchGetResponse = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: rowRanges,
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
        console.error("Error fetching filtered data:", error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
});



// Write data from table on sheet
app.post("/bendahara/buat-ajuan", async (req, res) => {
    const {textdata, tabledata} = req.body;
    if (textdata && tabledata) {
        // Get textdata/input data antrian and tabledata
        const ranges = [
            "'Write Antrian'!A:A",
            "'Write Table'!A:A",
            "'Write Antrian'!R1:R1"  //Getting antrian ID counter
        ]
        const allRequest = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: ranges });
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
            ],
            valueInputOption: "RAW",
        }
        const response = await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource,
        });
        // Assign Transaksi ID and Row number (Row number for edits)
            // Getting posted Antrian Number
        const newAntrianNumRange = `'Write Antrian'!A${startAntrianRow}:A${startAntrianRow}` 
        const requestNewAntrianNum = await sheets.spreadsheets.values.get({spreadsheetId, range: newAntrianNumRange});
        const getNewAntrianNum = requestNewAntrianNum.data.values;
        const newAntrianNum = getNewAntrianNum[0][0]
            // Getting posted Table row numbers
        const postedTableRow = tabledata.length - 1;
            // Writing it to desired table
        const idAndRowNum = [ `TRANS_ID:${newAntrianNum}`, postedTableRow ];
        const idAndRowNumRange = `'Write Table'!X${startTableRow}:Y${startTableRow}`;
        resource = { values: [idAndRowNum] }
        const writeIdAndRowNum = await sheets.spreadsheets.values.update({spreadsheetId, range: idAndRowNumRange, valueInputOption: "RAW", resource,})

        // Coloring Gsheet Table header & giving borders
        resource = "";
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
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
        const updateColor = await sheets.spreadsheets.batchUpdate({spreadsheetId, resource: batchUpdateRequest});
        return (res.status(200).json({message: "Data sent successfully."}))
    } else {
        return res.status(400).json({message: "Invalid Data."})
    }
})


// Find, get, and return existing data based on user input
app.get("/bendahara/data-transaksi", async (req, res) => {
    try {
        const transaksiKeyword = req.query.tableKeyword;
        // Finding keyword range with data from X & Y columns on Write Table Sheet
        const matchRange = "'Write Table'!X:Y";
        const matchResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: matchRange });
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
        const keywordTableRespose = await sheets.spreadsheets.values.get({ 
            spreadsheetId, 
            range: keywordTableRange, 
            majorDimension: "ROWS",  // Ensure data is returned row-wise
            valueRenderOption: "UNFORMATTED_VALUE",  // Ensures empty cells are included
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
        console.error(error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})

// Patch/Updates table data based on edited data from user
app.patch("/bendahara/edit-table", async (req, res) => {
    const {textdata, tabledata, tablePosition, antriPosition, lastTableEndRow} = req.body;
    if (!textdata || !tabledata || !tablePosition || !antriPosition || !lastTableEndRow) {
        return res.status(400).json({message: "Invalid Data."})  
    }
    try {
        
        // Setting antrian data range
        textdata.unshift(fullDateFormat);
        const antriResponse = await sheets.spreadsheets.values.get({spreadsheetId, range: "'Write Antrian'!A3:A"});
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
        // Get Sheet IDs
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const antriSheetId = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Antrian").properties.sheetId;
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

        // Update Table Data (Preserves Formatting)
        requests.push({
            pasteData: {
                coordinate: {
                    sheetId: tableSheetId,
                    rowIndex: startTableRow - 1, //Zero Based Index
                    columnIndex: 0, //Start from A
                },
                data: tabledata.map(row => row.join("\t")).join("\n"),
                type: "PASTE_VALUES", // Keeps formatting
                delimiter: "\t",
            },
        });

        // Update Antrian Data (Preserves Formatting)
        requests.push({
            pasteData: {
                coordinate: {
                    sheetId: antriSheetId,
                    rowIndex: antriRow - 1, //Zero based index
                    columnIndex: 1, //Start from B
                },
                data: textdata.join("\t"),
                type: "PASTE_VALUES",
                delimiter: "\t",
            },
        });

        // Update Row number info
        requests.push({
            pasteData: {
                coordinate: {
                    sheetId: tableSheetId,
                    rowIndex: startTableRow - 1, //Zero based index
                    columnIndex: 24, //Start from Y
                },
                data: `${tabledata.length - 1}`,
                type: "PASTE_VALUES",
                delimiter: "\t",
            },
        });

        // Execute Batch Update
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests },
        });

        console.log("✅ Update successful!");

        res.status(200).json({ message: "Table updated successfully." });

    } catch (error) {
        console.error("Error processing request:", error);
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
         const matchResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: matchRange });
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
            // Find Sheets ID
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
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
        // Send the batch update request
        const result = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: batchRequest
        });
        console.log("Successfully delete data.")
        res.status(200).json({ message: "Table Deleted successfully." });

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ message: "Server error." });
    }
})

// Handling interaction with PEMBAYARAN BP 2025 Sheet
// Cari SPM
app.patch("/bendahara/cari-spm", async (req, res) => {
    try {
        const { data } = req.body;
        const cariRange = "'DASHBOARD'!D8"
        await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetIdCariSPM,
            range: cariRange,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[data]] },
        })
        res.status(200).json({ message: "Table Deleted successfully." });
    } catch (error) {
        console.log("Error fetching data.", error)
        res.status(500).json({error: "Failed to update cell." });
    }
})
// SPM Belum Bayar
app.get("/bendahara/spm-belum-bayar", async (req, res) => {
    try {
        const range = "'MACHINE DB'!AE3:AM"
        const response = await sheets.spreadsheets.values.get({ 
            spreadsheetId: spreadsheetIdCariSPM, 
            range,
        })
        const result = response.data.values;
        res.json({ data: result })
    } catch (error) {
        console.log("Error fetching data.", error)
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
            valueInputOption: "USER_ENTERED",
        }
        const postResponse = await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetIdCariSPM,
            resource,
        });
        try {
            const getResponse = await sheets.spreadsheets.values.get({ 
                spreadsheetId: spreadsheetIdCariSPM, 
                range: "'MACHINE DB'!AT3:BD",
            })
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
            console.log("Failed fecthing results.", error)
            res.status(500).json({error: "Failed fecthing results." });
        }
    } catch (error) {
        console.log("Failed handling data.", error)
        res.status(500).json({error: "Failed handling data." });
    }
})

//Kelola-Pengajuan handlers
app.get("/bendahara/kelola-ajuan", async (req, res) => {
    const datePrefixes = [MonthDateFormat, PrevMonthDate];
      try {
        // Fetch entire column B from Google Sheets
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Write Antrian'!B:B",
        })
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
        // Fetch full row data for the selected month
        const rowRanges = reversedRows.map(row => `'Write Antrian'!A${row.rowIndex}:P${row.rowIndex}`); // Adjust range if needed
        const batchGetResponse = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: rowRanges,
        });

        let rowData = batchGetResponse.data.valueRanges.map(range => range.values[0]);
        const num_Columns = 16;
        rowData = rowData.map(row => {
            while (row.length < num_Columns) {
                row.push("");
            }
            return row;
        })
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
            console.log("Error fetching data.", error)
      } 
})

//Aksi-Pengajuan Handler
app.post("/bendahara/aksi-ajuan", async (req, res) => {
    const {no_antri, ajuan_verifikasi, tgl_verifikasi, status_pajak, sedia_anggaran, tgl_setuju, drpp, spp, spm} = req.body;
    console.log(req.body);
    try {
        const getAntrianResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Write Antrian'!A:A"
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
            [`'Write Antrian'!O${rowIndex}`, ajuanVerifikasiValue], // Condition for column O
        ];

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: "USER_ENTERED", // Keep number formatting
                data: updateData.map(([range, value]) => ({
                    range,
                    values: [[value]]
                }))
            }
        });

        res.json({ message: "Data updated successfully!" });

    } catch (error) {
        console.error("Error updating Google Sheet:", error);
        res.status(500).json({ error: "Failed to update data." });
    }
})

// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})