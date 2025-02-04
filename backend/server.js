import express from "express";
import cors from "cors";
import { google } from "googleapis";
import bodyParser from "body-parser";
import fs from "fs";

// Date

// Initialize tools
const app = express();
const d = new Date().getFullYear();
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

        // Set Pagination Range
        const startGetAntrianRow = ((page - 1) * limit + 1) + 2;  //Calculate start row with 1-based index, +2 because row starts from A3
        const endGetAntrianRow = startGetAntrianRow + Number(limit) -1;
        const getShowAntrianRange = `'Write Antrian'!A${startGetAntrianRow}:H${endGetAntrianRow}`;
        // Combine Pagination range
        const antrianRanges = [
            "'Write Antrian'!A3:A",  //all antrian range
            getShowAntrianRange,
        ];
        const getAntrianResponses = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: antrianRanges, });
        const allAntrianRow = getAntrianResponses.data.valueRanges[0].values || [];
        const realAllAntrianRows = allAntrianRow.length; //Finding out how many antrian rows exist

        const paginatedAntrian = getAntrianResponses.data.valueRanges[1].values || []; //Get data with pagination
        console.log(realAllAntrianRows)
        res.json({ data: paginatedAntrian, realAllAntrianRows })

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
        textdata.unshift(d);
        const antrianColumnCount = textdata.length;
        const antrianColumnEnd = String.fromCharCode(65 + antrianColumnCount);
        const antrianRange = `'Write Antrian'!B${antriPosition}:${antrianColumnEnd}${antriPosition}`
        // Setting table data range
        const startTableRow = tablePosition;
        const endTableRow = startTableRow + tabledata.length -1;
        const tableColumnCount = tabledata[0].length;
        const tableColumnEnd = String.fromCharCode(65 + tableColumnCount - 1); //Convert to letter
        const tableRange = `'Write Table'!A${startTableRow}:${tableColumnEnd}${endTableRow}`;
        // Getting existing tabledata to compare and adjust row number changes
        const oldTableRange = `'Write Table'!A${startTableRow}:${tableColumnEnd}${lastTableEndRow}`;
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
                    rowIndex: antriPosition - 1, //Zero based index
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
         let keywordTableRow = null;
         let keywordAntrian = null;
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
         console.log(keywordAntrian)
         console.log(keywordRow)
         console.log(keywordTableRow);

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ message: "Server error." });
    }
})

// Ports
app.listen(3000, () => {
    console.log("Server is live on port 3000!")
})