import React, { useState } from "react";

function DaftarPengajuan(){

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
                    <select name="filter-select" onChange={handleFilterChange}>
                        <option value=""/>
                        <option value="month">Bulan</option>
                        <option value="date">Tanggal</option>
                    </select>
                    <label className="filter-label2">Opsi Filter:</label>
                    <input className="filter-input1" type={filterSelect === "" ? "hidden" : filterSelect } onChange={handleInputChange} />
                </form>
            </div>
            <div className="pengajuan-content">

            </div>
        </div>
    )
}

export default DaftarPengajuan;