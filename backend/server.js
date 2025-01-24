import express from "express";
import cors from "cors";
import { google } from "googleapis";
import bodyParser from "body-parser";
import fs from "fs";

// Date

// Initialize tools
const app = express();
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
// Write data from table on sheet
app.post("/bendahara/ajuan-table", async (req, res) => {
    const {textdata, tabledata} = req.body;
    console.log(tabledata)
    if (textdata && tabledata) {
        // Handle textdata/input data antrian
        const allAntrianRange = "'Write Antrian'!A:A"
        const request = await sheets.spreadsheets.values.get({spreadsheetId, range: allAntrianRange})
        const antrianRows = request.data.values;
        const lastFilledRows = antrianRows.length || 0;
        // Handle tabledata
        const allTableRange = "'Write Table'!A:A"
        const request2 = await sheets.spreadsheets.values.get({spreadsheetId, range: allTableRange})
        const tableRows = request2.data.values;
        const lastTableRows = tableRows.length || [];
        // Posting on Write Antrian
        const startAntrianRow = lastFilledRows + 1;
        const antrianColumnCount = textdata.length;
        const antrianColumnEnd = String.fromCharCode(65 + antrianColumnCount - 1); //Convert to letter
        const newAntrianRange = `'Write Antrian'!A${startAntrianRow}:${antrianColumnEnd}${startAntrianRow}`
        // Posting on Write Table
        const startTableRow = lastTableRows + 3;
        const endTableRow = startTableRow + tabledata.length -1;
        const tableColumnCount = tabledata[0].length;
        const tableColumnEnd = String.fromCharCode(65 + tableColumnCount - 1); //Convert to letter
        const newTableRange = `'Write Table'!A${startTableRow}:${tableColumnEnd}${endTableRow}`
        // Update Gsheet Antrian
        var resource = { values: [textdata] }
        const valueInputOption = 'RAW'
        const response = await sheets.spreadsheets.values.update({spreadsheetId, range: newAntrianRange, valueInputOption, resource,});
        // Update Gsheet Table
        resource = { values: tabledata }
        const response2 = await sheets.spreadsheets.values.update({spreadsheetId, range: newTableRange, valueInputOption, resource,});
        // Coloring Gsheet Table header
        resource = "";
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = sheetInfo.data.sheets.find((s) => s.properties.title === "Write Table");
        const sheetId = sheet.properties.sheetId
        const batchUpdateRequest = {
            requests: [
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
                                    red: 0.678, // RGB for blue (light)
                                    green: 0.847,
                                    blue: 1.0,
                                },
                            },
                        },
                        fields: "userEnteredFormat.backgroundColor",
                    },
                },
            ],
        };
        const updateColor = await sheets.spreadsheets.batchUpdate({spreadsheetId, resource: batchUpdateRequest});
        return (res.status(200).json({message: "Data sent successfully."}), response, response2, updateColor)
    } else {
        return res.status(400).json({message: "Invalid Data."})
    }
})




// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})