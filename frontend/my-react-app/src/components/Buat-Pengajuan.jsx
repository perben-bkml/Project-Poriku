import React, { useState } from "react";
import * as math from "mathjs";

// Import Table Material UI
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { TableFooter } from "@mui/material";

function BuatPengajuan() {
    // Default column data. Will be stored elsewhere(?).
    const columns = [ 
        { id:"num", label: "No.", minWidth: 5 },
        { id:"kegiatan", label: "Nama Kegiatan", minWidth: 160 },
        { id:"mak", label: "Kode MAK", minWidth: 120 },
        { id:"spby", label: "Nomor SPBY", minWidth: 120 },
        { id:"tagihan", label: "Nilai Tagihan", minWidth: 90 },
        { id:"dpp", label: "DPP", minWidth: 80 },
        { id:"dpplain", label: "DPP Nilai Lain", minWidth: 80 },
        { id:"ppn", label: "PPN", minWidth: 65 },
        { id:"bpt ppn", label: "Nomor Faktur PPN", minWidth: 85 },
        { id:"pph21", label: "PPh 21", minWidth: 65 },
        { id:"bpt-pph21", label: "Nomor Bupot PPh 21", minWidth: 87 },
        { id:"pph22", label: "PPh 22", minWidth: 65 },
        { id:"bpt-pph22", label: "Nomor Bupot PPh 22", minWidth: 87 },
        { id:"pph23", label: "PPh 23", minWidth: 65 },
        { id:"bpt-pph23", label: "Nomor Bupot PPh 23", minWidth: 87 },
        { id:"pphf", label: "PPh Final", minWidth: 65 },
        { id:"bpt-pphf", label: "Nomor Bupot PPh Final", minWidth: 87 },
        { id:"terima", label: "Nilai Terima", minWidth: 90 },
        { id:"penerima", label: "Penerima", minWidth: 80 },
        { id:"bank", label: "Bank", minWidth: 50 },
        { id:"rek", label: "Rekening", minWidth: 80 },
        { id:"npwp", label: "NPWP", minWidth: 80 },
    ];
            //Determining if the edited cell is on row Nilai Tagihan, DPP, etc.
    const columnsWithNumber = [4, 5, 6, 7, 9, 11, 13, 15, 17];
    //State
    const [rowNum, setRowNum] = useState(1);
    const emptyCell = Array(21).fill("");
    const initialRow = [1, ...emptyCell];
    const [tableData, setTableData] = useState([initialRow]);
   

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
    const [mouseSelectRange, setMouseSelectRange] = useState({start: null, end:null});
    const [isSelecting, setIsSelecting] = useState(false);

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

    // This functions enable to navigate through cells with arrow
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

    // Handle form submits
    function handleSubmit(event){
        event.preventDefault();
        // Grabbing input & select tag values
        const inputNama = document.getElementsByName("nama-pengisi")[0].value;
        const selectAjuan = document.getElementsByName("ajuan")[0].value;
        const inputJumlah = document.getElementsByName("jumlah-ajuan")[0].value;
        const inputTanggal = document.getElementsByName("tanggal-ajuan")[0].value
        const inputArray = [inputNama, selectAjuan, inputJumlah, inputTanggal];
        console.log(inputArray);
        // Grabbing table data values
        console.log(tableData);
    }

    return (
        <div className="buat-pengajuan bg-card" onMouseUp={handleCellMouseUp}>
            <div className="pengajuan-desc">
                <p>Ketentuan Pengajuan Pencairan GUP/TUP (Wajib Dibaca!):</p>
                <button>Baca Ketentuan</button>
            </div>
            <div className="pengajuan-content">
                <form className="pengajuan-form" onSubmit={handleSubmit}>
                    <div className="pengajuan-form-textdata">
                        <label htmlFor="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name" name="nama-pengisi"required/>
                        <label htmlFor="ajuan">Jenis Pengajuan:</label>
                        <select name="ajuan" id="ajuan">
                            <option value="gup">GUP</option>
                            <option value="ptup">PTUP</option>
                        </select>
                        <label htmlFor="aju-number">Jumlah Total Pengajuan:</label>
                        <input type="text" id="aju-number" placeholder="Di isi angka" name="jumlah-ajuan" onChange={(e)=> e.target.value = numberFormats(e.target.value.replace(/[^\d]/g, ""))} required/>
                        <label htmlFor="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date" name="tanggal-ajuan"/>
                    </div>
                    <div className="pengajuan-form-tabledata">
                        <div className="pengajuan-form-tableinfo">
                            <p style={{fontWeight: 600, fontSize: "1.1rem"}}>Input Data Pengajuan</p>
                            <label>Tentukan Jumlah Row Tabel:</label>
                            <input type="number" value={rowNum > 0 ? rowNum : ""} onChange={handleRowChange} onBlur={handleRowBlur} min="0" />
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
                                                        onPaste={(event) => handlePaste(event, rowIndex, colIndex)}/>
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
                        <input type="submit" value="Kirim Pengajuan" name="submit-all" />
                        <input type="submit" value="Simpan Draft" name="save-draft" />
                    </div>
                </form>
            </div>
        </div>
    )
}

export default BuatPengajuan;