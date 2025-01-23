import express from "express";
import cors from "cors";
import { google } from "googleapis";
import bodyParser from "body-parser";
import fs from "fs";

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
    if (textdata && tabledata) {
        // Handle textdata/input data antrian
        const allAntrianRange = "'Write Antrian'!A:A"
        const request = await sheets.spreadsheets.values.get({spreadsheetId, range: allAntrianRange})
        const antrianRows = request.data.values;
        const lastFilledRows = antrianRows.length || 0;
        // Posting on Write Antrian
        const startRow = lastFilledRows + 1;
        const columnCount = textdata.length;
        const columnEnd = String.fromCharCode(65 + columnCount - 1); //Convert to letter
        const newAntrianRange = `'Write Antrian'!A${startRow}:${columnEnd}${startRow}`
        // Update Gsheet
        const resource = { values: [textdata] }
        const valueInputOption = 'RAW'
        
        const response = await sheets.spreadsheets.values.update({spreadsheetId, range: newAntrianRange, valueInputOption, resource,});
        return (res.status(200).json({message: "Data sent successfully."}), response)
    } else {
        return res.status(400).json({message: "Invalid Data."})
    }
})




// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})