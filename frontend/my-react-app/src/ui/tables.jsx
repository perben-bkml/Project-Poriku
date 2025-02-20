import React, { useState, Fragment } from 'react';
// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
// Other Material UI
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { IconButton } from '@mui/material';
import Collapse from '@mui/material/Collapse';

// SPM-Bend.jsx
export function TableSpmBendahara(props) {
    return (
        <TableContainer sx={{ maxWidth: "94%", margin: "auto", marginTop:"20px", marginBottom:"20px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
        <Table>
            <TableHead>
                <TableRow sx={{ backgroundColor: "#1a284b" }}>
                    {props.tableData.length > 0 && props.tableData[0].map((col, colIndex) => (
                        <TableCell className="table-cell head-data" key={colIndex} sx={{fontWeight: 550, color:"white"}} align="center">{col}</TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {props.tableData.length > 0 && props.tableData.slice(1).map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                            <TableCell className="table-cell" key={cellIndex}>{cell}</TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </TableContainer>
    )
}

//Kelola-Pengajuan.jsx
export function TableKelola(props) {

    //Container
    const headData = ["Timestamp", "Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "Status"]
    const bodyData = [["2025-02-20", "Alex", "GUP", "10,000,000", "2025-02-24", "Biro Umum", "Dalam Antrian"], ["2025-02-21", "Jane", "PTUP", "20,000,000", "2025-02-26", "Biro Umum", "Dalam Antrian"] ]

    function Row(props) {
        //State
        const [isOpen, setIsOpen] = useState(false);
        return (
            <Fragment>
                <TableRow>
                    <TableCell>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                    </TableCell>
                    {props.rowData.map((data, index) => (
                        <TableCell key={index} >{data}</TableCell>
                    ))}
                </TableRow>
                <TableRow>
                    <TableCell sx ={{ paddingBottom: 0, paddingTop: 0, border: "none" }} colSpan={bodyData.length + 1}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <h2>Test</h2>
                        </Collapse>
                    </TableCell>
                </TableRow>
            </Fragment>
        )
    }

    return (
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)" }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ backgroundColor: "#1a284b" }}>
                        <TableCell sx={{width: "30px"}}></TableCell>
                    {headData.map((data, index) => (
                        <TableCell key={index} sx={{ fontSize:"1rem", fontWeight: 550, color: "white"}}>{data}</TableCell>
                    ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {bodyData.map((row, index) => (
                        <Row key={index} rowData={row}/>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}