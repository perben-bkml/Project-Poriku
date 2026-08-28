import React, { useState, useEffect } from "react";
import apiClient from "../../lib/apiClient";

// Import components
import { columns2, daftarStatusStyle, isStatusLabel, HEAD_CELL, BODY_CELL, kolomGaya, dash, rowsPerPageOptions } from './head-data.js'
import LoadingAnimate from "../../ui/loading.jsx";

// Import Material UI Table & Pagination
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Pagination from '@mui/material/Pagination';

function LihatAntrian() {

    // States
    const [antrianData, setAntrianData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [rowsPerPage, setRowsPerPage] = useState(rowsPerPageOptions[0]);

    // Server side paging, so a rows-per-halaman change refetches rather than re-slicing.
    // limit is an argument so this closes over no reactive state and the effect below can
    // list its real dependencies.
    async function fetchAntrianData (page, limit) {
        try {
            setIsLoading(true);
            const response = await apiClient.get('/bendahara/antrian', { params:{ page, limit, username: null, flow: "gup" }});
            if (response.status === 200){
                const { data: responseResult, realAllAntrianRows } = response.data;
                setAntrianData(responseResult.map(row => row.slice(0, columns2.length)));
                setTotalPages(Math.ceil(realAllAntrianRows / limit)); //Calculate total page based on real data on gsheet
            }
            setIsLoading(false);
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }

    useEffect( () => {
        fetchAntrianData(currentPage, rowsPerPage)
    }, [currentPage, rowsPerPage])

    // Handle Pagination
    function hanldePaginationChange (event, value) {
        setCurrentPage(value);
    }

    function handleRowsPerPageChange (event) {
        setRowsPerPage(Number(event.target.value));
        setCurrentPage(1);
    }

    return (
        <div className="bg-card">
            <div className="dp-table-card">
                <div className="dp-toolbar">
                    <span className="dp-toolbar-info">
                        {isLoading ? "Memuat data\u2026" : totalPages > 0 ? `Halaman ${currentPage} dari ${totalPages}` : "Tidak ada antrian"}
                    </span>
                    <label className="dp-perpage">
                        Baris per halaman
                        <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                            {rowsPerPageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                    </label>
                </div>
            {isLoading ? <LoadingAnimate /> :
            <div className="dp-scroll">
                <TableContainer sx={{ backgroundColor: "#fdfdfd" }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                            {columns2.map((cols) => (
                                <TableCell key={cols.id} sx={{...HEAD_CELL, minWidth: cols.minWidth,
                                    ...(kolomGaya(cols.label)?.textAlign ? {textAlign: "right"} : null)}}>{cols.label}</TableCell>
                            ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {antrianData.map((rows, rowIndex) => (
                                <TableRow key={rowIndex} sx={{'&:hover td': {backgroundColor: '#F7FAFF'}}}>
                                    {rows.map((cells, cellIndex) => (
                                        <TableCell key={cellIndex} sx={{...BODY_CELL, ...kolomGaya(columns2[cellIndex]?.label)}}>
                                            {cellIndex === 0 && String(cells ?? "").trim()
                                                ? <span className="dp-id">{cells}</span>
                                                : isStatusLabel(columns2[cellIndex]?.label) && String(cells ?? "").trim()
                                                ? <span className="dp-status" style={{
                                                    backgroundColor: daftarStatusStyle(cells).bg,
                                                    color: daftarStatusStyle(cells).fg }}>{cells}</span>
                                                : dash(cells)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
            }
            {totalPages > 1 &&
                <Pagination className="dp-pagination" size="medium" count={totalPages}
                            page={currentPage} onChange={hanldePaginationChange} />}
            </div>
        </div>
    )

}

export default LihatAntrian;
