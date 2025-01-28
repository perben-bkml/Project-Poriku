import React, { useState, useEffect } from "react";
import axios from "axios";
// Import components
import Pengajuan from "./Pengajuan-Info"
// Import material UI
import Pagination from '@mui/material/Pagination';


function DaftarPengajuan(){
    // States
    const [antrianData, setAntrianData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [filterSelect, setFilterSelect] = useState("")

    // Fetching antrian data from Google Sheets
    const rowsPerPage = 5;
    async function fetchAntrianData (page) {
        try {
            const response = await axios.get("http://localhost:3000/bendahara/antrian", { params:{ page, limit: rowsPerPage }});
            const { data: responseResult, realAllAntrianRows } = response.data;
            setAntrianData(responseResult);
            setTotalPages(Math.ceil(realAllAntrianRows / rowsPerPage)); //Calculate total page based on real data on gsheet
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }
    useEffect(() => {
        fetchAntrianData(currentPage); 
    }, [currentPage])

    // Handling Pagination Change
    function hanldePaginationChange (event, value) {
        setCurrentPage(value);
    }

    // const testArray = ["9999", "2", "3", "4", "5",]

    // Handling Filters
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
        console.log(option);
    }

    function handleInputChange(event) {
        const inputs = event.target.value;
        console.log(inputs);
    }

    return (
        <div className="pengajuan bg-card">
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label1">Filter dengan:</label>
                    <div className="filter-select">
                        <select onChange={handleFilterChange}>
                            <option value=""/>
                            <option value="month">Bulan</option>
                            <option value="date">Tanggal</option>
                        </select>
                    </div>
                    <label className="filter-label2">Opsi Filter:</label>
                    <input className="filter-input1" type={filterSelect === "" ? "hidden" : filterSelect } onChange={handleInputChange} />
                </form>
            </div>
            <div className="pengajuan-content">
                {antrianData.reverse().map((data, index) => 
                    <Pengajuan 
                    key={index} 
                    numbers={data[0]}
                    createDate={data[1]}
                    accDate={data[6]}
                    status={data[7]}
                    />)}
            </div>
            <Pagination className="pagination" size="medium" count={totalPages} onChange={hanldePaginationChange} />
        </div>
    )
}

export default DaftarPengajuan;