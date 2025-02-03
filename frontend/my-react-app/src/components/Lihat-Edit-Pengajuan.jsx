import React, { useState, useEffect } from "react";
import * as math from "mathjs";
import axios from "axios";

// Import Components
import Popup from "./Popup";
import columns from "./columns";

// Import Table Material UI
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { TableFooter } from "@mui/material";

function EditPengajuan(props) {
    //Determining to see if we "lihat" or "edit"
    const [componentType, setComponentType] = useState("")
    useEffect(() => {
        setComponentType(props.type);
    }, [props.type] )

    //Determining if the edited cell is on row Nilai Tagihan, DPP, etc.
    const columnsWithNumber = [4, 5, 6, 7, 9, 11, 13, 15, 17];
    //State
    const [rowNum, setRowNum] = useState(1);
    const emptyCell = Array(21).fill("");
    const initialRow = [1, ...emptyCell];
    const [tableData, setTableData] = useState([initialRow]);
    const [mouseSelectRange, setMouseSelectRange] = useState({start: null, end:null});
    const [isSelecting, setIsSelecting] = useState(false);
    //State for reading and edit tabledata
    const [keywordRowPos, setKeywordRowPos] = useState("");
    const [keywordEndRow, setKeywordEndRow] = useState("");
    //Popup State
    const [isPopup, setIsPopup] = useState(false);
    //Container to send keyword row position

    //Fetching table data from backend to be shown
    async function fetchAntrianTable() {
        try {
            const tableKeyword = `TRANS_ID:${props.passedData[0]}`
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            setTableData(response.data.data || []);
            setRowNum(response.data.data.length);
            setKeywordRowPos(response.data.keywordRowPos)
            setKeywordEndRow(response.data.keywordEndRow)
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }
    useEffect(() => {
        fetchAntrianTable();
    }, [props.keyword])


    //Handle how many rows the user wants
    function handleRowChange(event) {
        const userRowValue = parseInt(event.target.value)
        setRowNum(userRowValue);
    }
    function handleRowBlur(event) {
        const userRowValue = parseInt(event.target.value);
        setRowNum(userRowValue);
        if (userRowValue > tableData.length) {
            const newRows = Array.from({ length: userRowValue - tableData.length }, (_, index) => 
                [tableData.length + index + 1, ...emptyCell] );
            setTableData([...tableData, ...newRows]);
        } else if (userRowValue < tableData.length) {
            setTableData(tableData.slice(0, userRowValue).map((row, index) => [index + 1, ...row.slice(1)]))
        }
    }
    //Number format generator
    function numberFormats(num) {
        if (!num) {
            return "";
        } else {
            return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
        }
    }
    
    //Function handling Math equations
    function evaluateEquation(equation) {
        try {
            //Remove = as leading equation like excel
            const equ = equation.trim().startsWith("=") ? equation.slice(1) : equation;
            //Evaluate/count equations
            const result = Math.ceil(math.evaluate(equ));
            //Returning formatted result
            return numberFormats(result.toString());
        } catch {
            return "Rumus tidak valid."
        }
    }
    // Handling text area changes
    function handleCellChange(cellrowIndex, cellcolumnIndex, value, textareaRef) {
        const updatedData = [...tableData];
        updatedData[cellrowIndex][cellcolumnIndex] = value;
        setTableData(updatedData);
        //Adjust cell height
        textareaRef.style.height = "auto";
        textareaRef.style.height = textareaRef.scrollHeight + "px";
    }
    function handleCellBlur (cellrowIndex, cellcolumnIndex, value) {
        //This will detect if the content inside the textarea is normal number or a math equation
        let updatedValue = value;
        if (columnsWithNumber.includes(cellcolumnIndex)) {
            if (value.startsWith("=")) {
                updatedValue = evaluateEquation(value);
            } else {
                const numericValue = value.replace(/[^\d]/g, "");
                updatedValue = numberFormats(numericValue);
            }
        }
        const updatedData = [...tableData];
        updatedData[cellrowIndex][cellcolumnIndex] = updatedValue;
        setTableData(updatedData);
    }

    // The following function will make us able to select cells with mouse
    function handleCellMouseDown(rowIndex, colIndex) {
        setMouseSelectRange({start: {row: rowIndex, col: colIndex}, end: {row: rowIndex, col: colIndex}});
        setIsSelecting(true);
    }
    function handleCellMouseOver(rowIndex, colIndex) {
        if (isSelecting) {
            setMouseSelectRange((prevdata) => ({
                ...prevdata,
                end: {row: rowIndex, col: colIndex},
            }));
        }
    }
    function handleCellMouseUp(){
        setIsSelecting(false)
    }
    function isCellSelected(rowIndex, colIndex) {
        if (!mouseSelectRange.start || !mouseSelectRange.end) return false;

        const { start, end } = mouseSelectRange;
        const rowStart = Math.min(start.row, end.row);
        const rowEnd = Math.max(start.row, end.row);
        const colStart = Math.min(start.col, end.col);
        const colEnd = Math.max(start.col, end.col);

        return rowIndex >= rowStart && rowIndex <= rowEnd && colIndex >= colStart && colIndex <= colEnd;
    }
    // Deleting all selected textarea contents
    function clearSelectedCells() {
        if (!mouseSelectRange.start || !mouseSelectRange.end) return;

        const updatedData = [...tableData];
        const { start, end } = mouseSelectRange;

        const rowStart = Math.min(start.row, end.row);
        const rowEnd = Math.max(start.row, end.row);
        const colStart = Math.min(start.col, end.col);
        const colEnd = Math.max(start.col, end.col);

        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                updatedData[row][col] = ""; // Clear content
            }
        }

        setTableData(updatedData);
    }

    // This functions enable to navigate through cells with arrow
    function focusCell(row, col) {
        // Add and remove highlighted cell style class
        const allTextArea = document.querySelectorAll(".table-container textarea");
        allTextArea.forEach((cell) => cell.classList.remove("selected-cell"));
        const allCell = document.querySelectorAll(".table-container .table-cell");
        allCell.forEach((cell) => cell.classList.remove("selected-cell"))

        // Focusing on the selected cell
        const textarea = document.querySelector(
            `.table-container textarea[data-row="${row}"][data-col="${col}"]`
        );
        const cell = document.querySelector(
            `.table-container .table-cell[data-row="${row}"][data-col="${col}"]`
        );

        if (textarea) {
            textarea.focus();
            textarea.classList.add("selected-cell")
            cell.classList.add("selected-cell")
        };
    }
        //Adding new row on the bottom of the page when pressing enter
    function addNewRow() {
        const newRow = [tableData.length + 1, ...emptyCell];
        setRowNum(rowNum + 1);
        setTableData([...tableData, newRow]);
    }

    // Function to adjust cell height after pasting
    function adjustAllHeight() {
        const textareas = document.querySelectorAll(".table-container textarea");
        textareas.forEach((textarea) => {
            textarea.style.height = "auto"; // Reset height to calculate proper scrollHeight
            textarea.style.height = textarea.scrollHeight + "px"; // Set height based on content
        });
    }

    // Handle pasting data to cell
    function handlePaste(event, startRow, startCol) {
        event.preventDefault();
    
        const clipboardData = event.clipboardData.getData("text/plain");
        const rows = clipboardData.split("\n").map((row) => row.split("\t"));
    
        const updatedData = [...tableData];
    
        rows.forEach((row, i) => {
            row.forEach((cell, j) => {
                const targetRow = startRow + i;
                const targetCol = startCol + j;
                if (targetRow < updatedData.length && targetCol < updatedData[0].length) {
                    updatedData[targetRow][targetCol] = cell.trim();
                }
            });
        });
        setTableData(updatedData);
        setTimeout(adjustAllHeight, 0);
    }

    // Handling keyboard presses
    function handleCellKeyDown(event, rowIndex, colIndex) {
        const numRows = tableData.length;
        const numCols = tableData[0].length;
    
        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                if (rowIndex > 0) {focusCell(rowIndex - 1, colIndex)};
                break;
            case "ArrowDown":
                event.preventDefault();
                if (rowIndex < numRows - 1) {focusCell(rowIndex + 1, colIndex)};
                break;
            case "ArrowLeft":
                event.preventDefault();
                if (colIndex > 0) {focusCell(rowIndex, colIndex - 1)};
                break;
            case "ArrowRight":
                event.preventDefault();
                if (colIndex < numCols - 1) {focusCell(rowIndex, colIndex + 1)};
                break;
            case "Enter":
                event.preventDefault();
                if (rowIndex < numRows - 1) {
                    focusCell(rowIndex + 1, colIndex);
                } else {
                    addNewRow();
                    focusCell(rowIndex + 1, colIndex);
                }
                break;
            case "Tab":
                event.preventDefault();
                if (colIndex < numCols - 1) {
                    focusCell(rowIndex, colIndex + 1);
                } else if (rowIndex < numRows - 1) {
                    focusCell(rowIndex + 1, 0);
                }
                break;
            case "Delete":
                event.preventDefault();
                clearSelectedCells();
                break;
            default:
                break;
        }
    }

    // Handle footer table that sums up numbers
    function calculateColumnTotal(columnIndex) {
        return tableData.reduce((sum, row) => {
            const value = parseInt(row[columnIndex].replace(/[^\d]/g, ""), 10);
            return sum + (isNaN(value) ? 0 : value);
        }, 0);
    }
    // Determining what columns that will accept numbers
    const summableColumns = {
        tagihan: 4,
        dpp: 5,
        dppLain: 6,
        ppn: 7,
        pph21: 9,
        pph22: 11,
        pph23: 13,
        pphf: 15,
        terima: 17,
    };

    // Handle Popups
    function handlePopup() {
        if (!isPopup) {
            setIsPopup(true);
        } else {
            setIsPopup(false);
        }
    }

    // Handle form submits
    async function handleSubmit(event){
        event.preventDefault();
        setIsPopup(false);
        // Converting column info into data, then insert in existing tableData
        const tableHead = columns.map(col => col.label)
        const sendTable = [[...tableHead], ...tableData]
        // Grabbing input & select tag values
        let inputNama = document.getElementsByName("nama-pengisi")[0].value;
        const selectAjuan = document.getElementsByName("ajuan")[0].value;
        let inputJumlah = document.getElementsByName("jumlah-ajuan")[0].value;
        const inputTanggal = document.getElementsByName("tanggal-ajuan")[0].value
        if (inputNama === "") {
            inputNama = props.passedData[1];
        }
        if (inputJumlah === "") {
            inputJumlah = props.passedData[3]
        }

        const inputArray = [inputNama, selectAjuan, inputJumlah, inputTanggal];
        // Sending to backend
        const requestData = {
            textdata: inputArray,
            tabledata: sendTable,
            tablePosition: keywordRowPos,
            antriPosition: parseInt(props.passedData[5]) + 2,
            lastTableEndRow: keywordEndRow,
            };
        try {
            const response = await axios.patch("http://localhost:3000/bendahara/edit-table" , requestData)
            if (response.status === 200){
                props.changeComponent("daftar-pengajuan")
            }
        } catch (err) {
            console.log("Failed to send data.", err)
        }

    }

    return (
        <div className="buat-pengajuan bg-card" onMouseUp={handleCellMouseUp}>
            <div className="pengajuan-desc">
                <p>Antrian Pengajuan Nomor: <span/> {props.passedData[5]}</p>
                <p>Tanggal Pengajuan: <span/> {props.passedData[6]}</p>
                <p>Tanggal Disetujui: <span/> {props.passedData[5]}</p>
                <p>Status Pengajuan: <span/> {props.passedData[5]}</p>
            </div>
            <div className="pengajuan-content">
                <form className="pengajuan-form" onSubmit={handleSubmit}>
                    <div className="pengajuan-edit-textdata pengajuan-form-textdata">
                        <label htmlFor="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name" name="nama-pengisi" required readOnly={componentType === "lihat"} placeholder={props.passedData[1]} />
                        <label htmlFor="ajuan">Jenis Pengajuan:</label>
                        <select name="ajuan" id="ajuan" disabled={componentType === "lihat"}>
                            <option value={props.passedData[2]}>{props.passedData[2].toUpperCase()}</option>
                            <option value={props.passedData[2] === "gup"? "ptup": "gup"}>{props.passedData[2] === "gup" ? "PTUP" : "GUP"}</option>
                        </select>
                        <label htmlFor="aju-number">Jumlah Total Pengajuan:</label>
                        <input type="text" id="aju-number" placeholder={props.passedData[3]} name="jumlah-ajuan"
                            onChange={(e)=> e.target.value = numberFormats(e.target.value.replace(/[^\d]/g, ""))} 
                            required
                            readOnly={componentType === "lihat"}
                            />
                        <label htmlFor="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date" name="tanggal-ajuan" readOnly={componentType === "lihat"} defaultValue={props.passedData[4]}/>
                    </div>
                    <div className="pengajuan-form-tabledata">
                        <div className="pengajuan-form-tableinfo">
                            <p style={{fontWeight: 600, fontSize: "1.1rem"}}>Input Data Pengajuan</p>
                            <label>Tentukan Jumlah Row Tabel:</label>
                            <input 
                                type="number"
                                value={rowNum > 0 ? rowNum : ""}
                                onChange={handleRowChange}
                                onBlur={handleRowBlur}
                                min="0" 
                                readOnly={componentType === "lihat"}
                                />
                        </div>
                        <TableContainer className="table-container" sx={{maxHeight: 595}}>
                            <Table stickyHeader aria-label="sticky table">
                                <TableHead className="table-head">
                                    <TableRow className="table-row"> 
                                        {columns.map((cols) => (
                                            <TableCell className="table-cell head-data" key={cols.id} sx={{fontWeight: "bold", minWidth: cols.minWidth}} align="center">{cols.label}</TableCell>                                            
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tableData.map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {row.map((cell, colIndex) => (
                                                <TableCell className={`table-cell ${isCellSelected(rowIndex, colIndex) ? "selected-cell" : ""}`}
                                                    key={colIndex}
                                                    data-row={rowIndex}
                                                    data-col={colIndex}
                                                    onMouseDown={()=>handleCellMouseDown(rowIndex, colIndex)}
                                                    onMouseOver={()=>handleCellMouseOver(rowIndex, colIndex)}
                                                    sx={{minHeight:20, minWidth: columns[colIndex].minWidth, padding:"8px"}}
                                                    align={colIndex === 0 ? "center" : "left"}>
                                                    <textarea 
                                                        className={`${isCellSelected(rowIndex, colIndex) ? "selected-cell" : ""}`}
                                                        value={cell}
                                                        data-row={rowIndex}
                                                        data-col={colIndex}
                                                        onChange={(input) => handleCellChange(rowIndex, colIndex, input.target.value, input.target)}
                                                        onBlur={(input) => handleCellBlur(rowIndex, colIndex, input.target.value)}
                                                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, colIndex)}
                                                        onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                                                        readOnly={componentType === "lihat"}
                                                        />
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        {columns.map((col, colIndex) => (
                                            <TableCell className="table-footer-cell" key={colIndex}>
                                                {Object.values(summableColumns).includes(colIndex) ? numberFormats(calculateColumnTotal(colIndex).toString()) : ""}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </TableContainer>
                    </div>
                    <div className="form-submit">
                        <input type="button" value="Kembali Ke Daftar" name="submit-all" onClick={props.invisible("daftar-pengajuan", {})}/>
                        <input type="button" value="Simpan Perubahan" name="submit-all" onClick={handlePopup} hidden={componentType === "lihat"}/>
                    </div>
                </form>
            </div>
            {isPopup && <Popup whenClick={handleSubmit} cancel={handlePopup}/>}
        </div>
    )
}

export default EditPengajuan;