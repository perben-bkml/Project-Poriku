import React, { useState } from "react";
// Import components
import Pengajuan from "./Pengajuan-Info"
// Import material UI
import Pagination from '@mui/material/Pagination';


function DaftarPengajuan(){

    const testArray = ["1", "2", "3", "4", "5",]

    const [filterSelect, setFilterSelect] = useState("")

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
                {testArray.reverse().map((data, index) => <Pengajuan key={index} numbers={data}/>)}
            </div>
            <Pagination className="pagination" size="medium" count={5} />
        </div>
    )
}

export default DaftarPengajuan;