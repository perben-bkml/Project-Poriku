import React, { useState, useEffect } from "react";
import axios from "axios";

// Import components
import { columns2 } from './head-data.js'
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

    // Fetching antrian data from Google Sheets
    const rowsPerPage = 10;
    async function fetchAntrianData (page) {
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/antrian`, { params:{ page, limit: rowsPerPage, username: null }});
            if (response.status === 200){
                const { data: responseResult, realAllAntrianRows } = response.data;
                setAntrianData(responseResult.map(row => row.slice(0, -4)));
                setTotalPages(Math.ceil(realAllAntrianRows / rowsPerPage)); //Calculate total page based on real data on gsheet
            }
            setIsLoading(false);
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }

    useEffect( () => {
        fetchAntrianData(currentPage)
    }, [currentPage])

    // Handle Pagination
    function hanldePaginationChange (event, value) {
        setCurrentPage(value);
    }

    return (
        <div className="bg-card">
            {isLoading ? <LoadingAnimate /> :
            <div className="lihat-antri-table">
                <TableContainer sx={{ margin: "auto", marginTop:"10px", marginBottom:"10px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: "#1a284b" }}>
                            {columns2.map((cols) => (
                                <TableCell className="table-cell head-data" key={cols.id} sx={{fontWeight: 550, minWidth: cols.minWidth, fontSize:"1.1rem", color:"white", border:"none"}} align="center">{cols.label}</TableCell>                                            
                            ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {antrianData.map((rows, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {rows.map((cells, cellIndex) => (
                                        <TableCell className="table-cell" key={cellIndex}>{cells}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
            }
            <div className="lihat-antri-pagination">
                <Pagination className="pagination" size="medium" count={totalPages} onChange={hanldePaginationChange} />
            </div>
        </div>
    )

}

export default LihatAntrian;
