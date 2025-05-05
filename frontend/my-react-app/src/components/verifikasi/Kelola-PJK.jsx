import React, {useEffect, useState} from "react";
import axios from "axios";
//Import Components
import { Card } from "../../ui/cards.jsx"
import { TableInfoPJK } from "../../ui/tables.jsx";
import LoadingAnimate from "../../ui/loading.jsx";
import Pagination from "@mui/material/Pagination";
//Other Data
import { satkerNames, tableHead } from "./head-data.js";

export default function KelolaPJK() {
    //State
    const [isLoading, setIsLoading] = useState(false);
    const [filterSelect, setFilterSelect] = useState("");
    const [filterData, setFilterData] = useState("");
    const [dashboardData, setDashboardData] = useState([]);
    const [tableData, setTableData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);


    //Fetch data with filter
    async function fetchData(data, page) {
        const rowsPerPage = 10;
        let satkerPrefix = data;
        try {
            setIsLoading(true);
            const response = await axios.get("http://localhost:3000/verifikasi/data-pjk", { params:{ satkerPrefix, page: page, limit: rowsPerPage }});
            if (response.status === 200){
                const { data: rowData, totalPages, countData } = response.data;
                setDashboardData(countData);
                setTableData(rowData)
                setTotalPages(totalPages);
                setIsLoading(false);
            }
        } catch (error) {
            console.error("Error fetching data.", error);
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchData(filterData, currentPage);
    }, [filterData, currentPage]);


    //Titles for card
    const cardTitles = [
        {title: "Total PJK", content: dashboardData[0]},
        {title: "PJK Belum Dikumpulkan", content: dashboardData[1]},
        {title: "Ditolak", content: dashboardData[2]},
        {title: "Lengkap Dengan Catatan", content: dashboardData[3]},
        {title: "Lengkap", content: dashboardData[4]}
    ]


    //Filter Change
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
        if (option === "") {
            setFilterData("");
        }
    }
    function handleFilterSelectChange(event) {
        const option = event.target.value;
        setFilterData(option);

    }
    //Pagination
    function handlePaginationChange(event, value) {
        setCurrentPage(value);
    }

    return (
        <div>
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label1">Filter dengan:</label>
                    <div className="filter-select">
                        <select onChange={handleFilterChange}>
                            <option value=""/>
                            <option value="text">Satker</option>
                        </select>
                    </div>
                    <label className="filter-label2" hidden={filterSelect === ""} >Nama Satker:</label>
                    <div className="filter-select filter-select2 ">
                        <select hidden={filterSelect === ""} value={filterData} onChange={handleFilterSelectChange}>
                            {satkerNames.map((satker, index) => (
                                <option key={index} value={satker.value}>{satker.title}</option>
                            ))}
                        </select>
                    </div>
                </form>
            </div>
            { isLoading ? <LoadingAnimate /> :
            <div className={"card-wrap"}>
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card.title} content={card.content}/>
                ))}
            </div>
            }
            <div className={"bg-card pjk-table"}>
                {isLoading ? <LoadingAnimate /> :
                    <TableInfoPJK header={tableHead} body={tableData} />
                }
                <Pagination className="pagination" size="medium" count={totalPages} page={currentPage} onChange={handlePaginationChange} />
            </div>
        </div>
    )
}