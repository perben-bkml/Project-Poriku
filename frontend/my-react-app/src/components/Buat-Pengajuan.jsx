import React, { useState } from "react";
import * as math from "mathjs";

// Import Table Material UI
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

function BuatPengajuan() {
    // Default column data. Will be stored elsewhere(?).
    const columns = [ 
        { id:"num", label: "No.", minWidth: 5 },
        { id:"kegiatan", label: "Nama Kegiatan", minWidth: 160 },
        { id:"mak", label: "Kode MAK", minWidth: 120 },
        { id:"spby", label: "Nomor SPBY", minWidth: 120 },
        { id:"tagihan", label: "Nilai Tagihan", minWidth: 90 },
        { id:"dpp", label: "DPP", minWidth: 80 },
        { id:"ppn", label: "PPN", minWidth: 65 },
        { id:"bpt ppn", label: "Nomor Bukti Pungut PPN", minWidth: 85 },
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
    const columnsWithNumber = [4, 5, 6, 8, 10, 12, 14, 16];
    //State
    const emptyCell = Array(21).fill("");
    const [tableData, setTableData] = useState([emptyCell]);
    const [rowNum, setRowNum] = useState(1);

    function handleRowChange(event) {
        const userRowValue = parseInt(event.target.value);
        setRowNum(userRowValue);

        if (userRowValue > tableData.length) {
            const newRows = Array.from({ length: userRowValue - tableData.length }, () => [...emptyCell] );
            setTableData([...tableData, ...newRows]);
        } else if (userRowValue < tableData.length) {
            setTableData(tableData.slice(0, userRowValue))
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
            const result = math.evaluate(equ);
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

    return (
        <div className="buat-pengajuan bg-card">
            <div className="pengajuan-desc">
                <p>Ketentuan Pengajuan Pencairan GUP/TUP (Wajib Dibaca!):</p>
                <button>Baca Ketentuan</button>
            </div>
            <div className="pengajuan-content">
                <form className="pengajuan-form">
                    <div className="pengajuan-form-textdata">
                        <label htmlFor="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name" required/>
                        <label htmlFor="ajuan">Jenis Pengajuan:</label>
                        <select name="ajuan" id="ajuan">
                            <option value="gup">GUP</option>
                            <option value="ptup">PTUP</option>
                        </select>
                        <label htmlFor="aju-number">Jumlah Total Pengajuan:</label>
                        <input type="number" id="aju-number" placeholder="Hanya diisi angka"/>
                        <label htmlFor="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date"/>
                    </div>
                    <div className="pengajuan-form-tabledata">
                        <div className="pengajuan-form-tableinfo">
                            <p style={{fontWeight: 600, fontSize: "1.1rem"}}>Input Data Pengajuan</p>
                            <label>Tentukan Jumlah Row Tabel:</label>
                            <input type="number" value={rowNum} onChange={handleRowChange} min="0" />
                        </div>
                        <TableContainer className="table-container" sx={{maxHeight: 620}}>
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
                                                <TableCell className="table-cell" key={colIndex} sx={{minHeight:20, minWidth: columns[colIndex].minWidth, padding:"8px"}}>
                                                    <textarea value={cell} onChange={(input) => handleCellChange(rowIndex, colIndex, input.target.value, input.target)}
                                                        onBlur={(input) => handleCellBlur(rowIndex, colIndex, input.target.value)}/>
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </div>
                    <div className="form-submit">
                        <input type="submit" value="Kirim Pengajuan" />
                    </div>
                </form>
            </div>
        </div>
    )
}

export default BuatPengajuan;