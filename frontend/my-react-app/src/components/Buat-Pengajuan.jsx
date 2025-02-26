import React, { useState, useEffect } from "react";
import * as math from "mathjs";
import axios from "axios";

// Import Components
import Popup from "../ui/Popup";
import { columns } from "./head-data";
import LoadingAnimate, { LoadingScreen } from "../ui/loading";
import { SubmitButton } from "../ui/buttons";

// Import Table Material UI
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { TableFooter } from "@mui/material";

function BuatPengajuan(props) {
    //Determining if this component is being used for viewing, editing, or creating new pengajuan
    const [componentType, setComponentType] = useState("")
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
    //State for "formula mode"
    const [targetReference, setTargetReference] = useState(null);
    const [currentEditableCell, setCurrentEditableCell] = useState(null);
    const [isFormulaMode, setIsFormulaMode] = useState(false);
    const [currentTextareaRef, setCurrentTextareaRef] = useState(null);
    //Popup State
    const [isPopup, setIsPopup] = useState(false);
    const [isKetentuan, setIsKetentuan] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoading2, setIsLoading2] = useState(false);

    //Fetching table data from backend to be shown
    async function fetchAntrianTable() {
        try {
            setIsLoading2(true);
            const tableKeyword = `TRANS_ID:${props.passedData[0]}`
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                setRowNum(response.data.data.length);
                setKeywordRowPos(response.data.keywordRowPos)
                setKeywordEndRow(response.data.keywordEndRow)
            }
            setIsLoading2(false);
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }
    useEffect(() => {
        const newComponentType = props.type;
        setComponentType(newComponentType);
    
        if (newComponentType !== "buat") {
            fetchAntrianTable();
        }
    }, [props.type]);

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
            return num.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        }
    }
    
    //Function handling Math equations
    function evaluateEquation(equation, rowIndex, colIndex) {
        try {
            //Remove = and , as leading equation like excel
            const equ = equation.trim().startsWith("=") ? equation.slice(1) : equation;
            const sanitizeEqu = equ.replace(/\./g, "")
            const sanitizeEqu2 = sanitizeEqu.replace(/,/g, "");
            //Evaluate/count equations
            const result = Math.ceil(math.evaluate(sanitizeEqu2));
            let stringResult = numberFormats(result.toString());
            if (stringResult == "NaN") {
                stringResult = "";
            }
            //Returning formatted result
            const newData = [...tableData];
            newData[rowIndex][colIndex] = stringResult;
            setTableData(newData);
        } catch {
            return "Rumus tidak valid."
        }
    }

    // Handling text area changes
    function handleCellChange(cellrowIndex, cellcolumnIndex, value, textareaRef) {
        handleDppCount(cellrowIndex, cellcolumnIndex);
        if (value.startsWith("=")) {
            setIsFormulaMode(true);
            setCurrentEditableCell({ row: cellrowIndex, col: cellcolumnIndex });
            setCurrentTextareaRef(textareaRef);
        } else {
            setIsFormulaMode(false);
            setCurrentEditableCell(null);
            setCurrentTextareaRef(null);
        }

        const updatedData = [...tableData];
        updatedData[cellrowIndex][cellcolumnIndex] = value;
        setTableData(updatedData);
        //Adjust cell height
        textareaRef.style.height = "auto";
        textareaRef.style.height = textareaRef.scrollHeight + "px";
    }

    function handleCellBlur (cellrowIndex, cellcolumnIndex, value) {
        // Check if the value starts with "=" (formula mode)
        if (value.startsWith("=")) {
            // No formatting should occur in formula mode
            return;
        }

        // Only format if the value is numeric
        const numericValue = value.replace(/,/g, ""); // Remove any existing commas
        if (!isNaN(numericValue) && numericValue.trim() !== "") {
            // Format the number with commas for thousands
            const formattedValue = numberFormats(numericValue);

            // Update the table data with the formatted value
            const updatedData = [...tableData];
            updatedData[cellrowIndex][cellcolumnIndex] = formattedValue;
            setTableData(updatedData);
        }   
    }

    // Handling formula mode
    function handleCellClick(rowIndex, colIndex) {
        if (isFormulaMode && targetReference) {
            if (currentEditableCell.col !== colIndex || currentEditableCell.row !== rowIndex){
                const targetCellValue = tableData[rowIndex][colIndex] || "";
                
                const originData = [...tableData];
                const originCellData = originData[currentEditableCell.row][currentEditableCell.col] || "=";
                
                // Check if the last character is an operator
                const lastChar = originCellData[originCellData.length - 1];
                const isLastCharOperator = /[\+\-\*\/=]$/.test(lastChar);

                let updatedFormula;

                if (isLastCharOperator) {
                    // Append the new cell reference if the last character is an operator
                    updatedFormula = originCellData + targetCellValue;
                } else {
                    // Find the position of the last operator or "="
                    const lastOperatorMatch = originCellData.match(/[\+\-\*\/=]/g);
                    const lastOperatorPos = lastOperatorMatch
                        ? originCellData.lastIndexOf(lastOperatorMatch[lastOperatorMatch.length - 1]) + 1
                        : originCellData.length;

                    // Replace the value after the last operator
                    updatedFormula = originCellData.substring(0, lastOperatorPos) + targetCellValue;
                }

                // Update the table with the new formula
                originData[currentEditableCell.row][currentEditableCell.col] = updatedFormula;
                setTableData(originData);

                // Retain focus on the current editing cell
                if (currentTextareaRef) {
                    currentTextareaRef.focus();
                    currentTextareaRef.setSelectionRange(updatedFormula.length, updatedFormula.length);
                }
      
            }
        }
    }

    // Handle Automatic DPP & DPP Nilai lain calculation
    function handleDppCount(rowIndex, colIndex) {
        if (colIndex === 5) {
            const getNilaiTagihan = [...tableData][rowIndex][4];
            
        }
    }

    // The following function will make us able to select many cells with mouse
    function handleCellMouseDown(rowIndex, colIndex) {
        if (!isFormulaMode){
            setMouseSelectRange({start: {row: rowIndex, col: colIndex}, end: {row: rowIndex, col: colIndex}});
            setIsSelecting(true);
            focusCell(rowIndex, colIndex)
        } 
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
                if (!isFormulaMode){
                    if (rowIndex > 0) {focusCell(rowIndex - 1, colIndex)};
                }
                break;
            case "ArrowDown":
                event.preventDefault();
                if (!isFormulaMode){
                    if (rowIndex < numRows - 1) {focusCell(rowIndex + 1, colIndex)};
                }
                break;
            case "ArrowLeft":
                event.preventDefault();
                if (!isFormulaMode){
                    if (colIndex > 0) {focusCell(rowIndex, colIndex - 1)};
                }
                break;
            case "ArrowRight":
                event.preventDefault();
                if (!isFormulaMode){
                    if (colIndex < numCols - 1) {focusCell(rowIndex, colIndex + 1)};
                }
                break;
            case "Enter":
                event.preventDefault();
                evaluateEquation(event.target.value, rowIndex, colIndex)
                setIsFormulaMode(false);
                setCurrentEditableCell(null); 
                setTargetReference(null);
                if (rowIndex < numRows - 1) {
                    focusCell(rowIndex + 1, colIndex);
                }
                break;
            case "Tab":
                event.preventDefault();
                if (isFormulaMode) {
                    evaluateEquation(event.target.value, rowIndex, colIndex)
                    setIsFormulaMode(false);
                    setCurrentEditableCell(null); 
                    setTargetReference(null);
                }
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
            const cellValue = row[columnIndex];
    
            // Ensure the value is a string before calling replace
            const stringValue = typeof cellValue === "string" ? cellValue : String(cellValue || "0");
    
            // Remove non-digit characters and convert to number
            const value = parseInt(stringValue.replace(/[^\d]/g, ""), 10);
    
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

    function handleKetentuanPopup() {
        if (!isKetentuan) {
            setIsKetentuan(true);
        } else {
            setIsKetentuan(false);
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
        const inputNama = document.getElementsByName("nama-pengisi")[0].value;
        const selectAjuan = document.getElementsByName("ajuan")[0].value;
        const inputJumlah = document.getElementsByName("jumlah-ajuan")[0].value;
        const inputTanggal = document.getElementsByName("tanggal-ajuan")[0].value
        const inputArray = [inputNama, selectAjuan, inputJumlah, inputTanggal];
        // Set loading state
        setIsLoading(true);
        // Sending to backend
        try {
            const response = await axios.post("http://localhost:3000/bendahara/buat-ajuan" , {
                textdata: inputArray,
                tabledata: sendTable,
            })
            if (response.status === 200){
                props.alertMessage("Data berhasil dibuat.")
                props.changeComponent("daftar-pengajuan")
            }
            setIsLoading(false);
        } catch (err) {
            console.log("Failed to send data.", err)
        }
    }

    //Handle form submits when editing
    async function handleSubmitEdit(event){
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
            antriPosition: parseInt(props.passedData[5]),
            lastTableEndRow: keywordEndRow,
            };
        try {
            setIsLoading(true);
            const response = await axios.patch("http://localhost:3000/bendahara/edit-table" , requestData)
            if (response.status === 200){
                props.alertMessage("Data berhasil diubah.");
                props.changeComponent(props.fallbackTo);
            }
            setIsLoading(false);
        } catch (err) {
            console.log("Failed to send data.", err)
        }
    }
    return (
        <div className="buat-pengajuan bg-card" onMouseUp={handleCellMouseUp}>
            {componentType === "buat" ? (
            <div className="pengajuan-desc">
                <p>Ketentuan Pengajuan Pencairan GUP/TUP (Wajib Dibaca!):</p>
                <button onClick={handleKetentuanPopup}>Baca Ketentuan</button>
            </div> )
            :
            (props.passedData && (<div className="pengajuan-desc">
                <p>Nomor Antrian: <span/> {props.passedData[5]}</p>
                <p>Tanggal Pengajuan: <span/> {props.passedData[6]}</p>
                <p>Tanggal Disetujui: <span/> {props.passedData[7]}</p>
                <p>Status Pengajuan: <span/> {props.passedData[8]}</p>
            </div>))
            }
            <div className="pengajuan-content">
                <form className="pengajuan-form" onSubmit={componentType === "buat" ? handleSubmit : handleSubmitEdit}>
                    <div className="pengajuan-form-textdata">
                        <label htmlFor="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name" name="nama-pengisi" 
                            readOnly={componentType === "lihat"}
                            placeholder={componentType === "buat"? null : (props.passedData && props.passedData[1]) }
                            required/>
                        <label htmlFor="ajuan">Jenis Pengajuan:</label>
                        {componentType === "buat" ?
                        <select name="ajuan" id="ajuan">
                            <option value="gup">GUP</option>
                            <option value="ptup">PTUP</option>
                        </select>
                        :
                        (props.passedData && (<select name="ajuan" id="ajuan" disabled={componentType === "lihat"}>
                            <option value={props.passedData[2]}>{props.passedData[2].toUpperCase()}</option>
                            <option value={props.passedData[2] === "gup"? "ptup": "gup"}>{props.passedData[2] === "gup" ? "PTUP" : "GUP"}</option>
                        </select>))
                        }
                        <label htmlFor="aju-number">Jumlah Total Pengajuan:</label>
                        <input type="text" id="aju-number" placeholder={componentType === "buat"? "Di isi angka" : (props.passedData && props.passedData[3])} name="jumlah-ajuan" 
                            onChange={(e)=> e.target.value = numberFormats(e.target.value.replace(/[^\d]/g, ""))}
                            readOnly={componentType === "lihat"} 
                            required/>
                        <label htmlFor="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date" name="tanggal-ajuan"
                            readOnly={componentType === "lihat"}
                            defaultValue={componentType === "buat"? null : (props.passedData && props.passedData[4])}/>
                    </div>
                    <div className="pengajuan-form-tabledata">
                        <div className="pengajuan-form-tableinfo">
                            <p>Input Data Pengajuan</p>
                            <label>Tentukan Jumlah Row Tabel:</label>
                            <input type="number" value={rowNum > 0 ? rowNum : ""} 
                                onChange={handleRowChange} onBlur={handleRowBlur} 
                                readOnly={componentType === "lihat"} min="0" />
                        </div>
                        {isLoading2 ? <LoadingAnimate /> :
                        <TableContainer className="table-container" sx={{maxHeight: 750}}>
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
                                                    onClick={() => {
                                                        setTargetReference({ row: rowIndex, col: colIndex });
                                                        handleCellClick(rowIndex, colIndex);
                                                    }}
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
                                                        readOnly={
                                                            currentEditableCell !== null && (currentEditableCell.row !== rowIndex || currentEditableCell.col !== colIndex)
                                                            }
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
                        }  
                    </div>
                    {componentType === "buat" ?
                    <div className="form-submit">
                        <SubmitButton value="Kirim Pengajuan" name="submit-all" onClick={handlePopup}/>
                    </div>
                    :
                    <div className="form-submit">
                        <SubmitButton value="Kembali Ke Daftar" name="submit-all" onClick={ 
                           props.invisible && props.invisible(props.fallbackTo, props.passedData)
                        }/>
                        <SubmitButton value="Simpan Perubahan" name="submit-all" onClick={handlePopup} hidden={componentType === "lihat" ? true : false}/>
                    </div>    
                        }
                </form>
            </div>
            {isKetentuan && (<Popup whenClick={() => setIsKetentuan(false)} type="ketentuan-bendahara"/>)}
            {isPopup && (<Popup whenClick={componentType === "buat"? handleSubmit : handleSubmitEdit} cancel={handlePopup} type="submit"/>)}
            {isLoading && <LoadingScreen />}
        </div>
    )
}

export default BuatPengajuan;