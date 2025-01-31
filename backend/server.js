import express from "express";
import cors from "cors";
import { google } from "googleapis";
import bodyParser from "body-parser";
import fs from "fs";

// Date

// Initialize tools
const app = express();
const d = new Date();
// Middleware
app.use(express.json());
app.use(cors());

// Credentials
const credentials = JSON.parse(fs.readFileSync("./credentials/project-import-gsheet-keu-27df045eec2e.json"))
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    SCOPES
);

// Gsheet API Setup
const sheets = google.sheets({ version: "v4", auth })
const spreadsheetId = "1IepWjVRt8qKtZ2X3UxPIyPZC_TziOXU9iqF9UQreFDk";

//Endpoints
// Render data antrian
app.get("/bendahara/antrian", async (req, res) => {
    try {
        const { page = 1, limit = 5 } = req.query;

        // Finding out how many antrian rows exist
        const getAllAntrianRange = "'Write Antrian'!A3:A"
        const getAllAntrianRows = await sheets.spreadsheets.values.get({spreadsheetId, range: getAllAntrianRange,});
        const allAntrianRows = getAllAntrianRows.data.values || [];
        const realAllAntrianRows = allAntrianRows.length;

        // Get data with pagination
        const startGetAntrianRow = ((page - 1) * limit + 1) + 2;  //Calculate start row with 1-based index, +2 because row starts from A3
        const endGetAntrianRow = startGetAntrianRow + Number(limit) -1;
        const getShowAntrianRange = `'Write Antrian'!A${startGetAntrianRow}:H${endGetAntrianRow}`;
        const getAntrianResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: getShowAntrianRange, });

        const getPaginatedAntrian = getAntrianResponse.data.values || [];

        res.json({ data: getPaginatedAntrian, realAllAntrianRows })

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})


// Write data from table on sheet
app.post("/bendahara/ajuan-table", async (req, res) => {
    const {textdata, tabledata} = req.body;
    if (textdata && tabledata) {
        // Handle textdata/input data antrian
        const allAntrianRange = "'Write Antrian'!A:A"
        const request = await sheets.spreadsheets.values.get({spreadsheetId, range: allAntrianRange})
        const antrianRows = request.data.values;
        const lastFilledRows = antrianRows.length || 0;
        // Add date to beginning of textdata array
        textdata.unshift(d);
        // Handle tabledata
        const allTableRange = "'Write Table'!A:A"
        const request2 = await sheets.spreadsheets.values.get({spreadsheetId, range: allTableRange})
        const tableRows = request2.data.values;
        const lastTableRows = tableRows.length || [];
        // Posting on Write Antrian
        const startAntrianRow = lastFilledRows + 1;
        const antrianColumnCount = textdata.length;
        const antrianColumnEnd = String.fromCharCode(65 + antrianColumnCount); //Convert to letter. No -1 because we start writing from B.
        const newAntrianRange = `'Write Antrian'!B${startAntrianRow}:${antrianColumnEnd}${startAntrianRow}`
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
    // This part still has no frontend handler
app.get("/bendahara/data-transaksi", async (req, res) => {
    try {
        const transaksiKeyword = req.query;
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
        let endKeywordTableRow = keywordTableRow - 1; //Adjusting matchResponseRows data so it target rows instead of telling how many rows exist.
        const keywordTableRange = `'Write Table'!A${keywordRow}:V${endKeywordTableRow}`;
        const keywordTableRespose = await sheets.spreadsheets.values.get({ spreadsheetId, range: keywordTableRange });
        const keywordTableData = keywordTableRespose.data.values || [];
        // Return back to only the grabbed table to frontend
        res.json({ data: keywordTableData })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch data." });
    }
})


// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})