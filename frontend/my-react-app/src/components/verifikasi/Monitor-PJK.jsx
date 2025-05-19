import React, {useState, useContext, useEffect} from "react";
import axios from "axios";

//Context
import { AuthContext } from "../../lib/AuthContext.jsx";

//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
import {TableInfoPJK} from "../../ui/tables.jsx";
import {tableHead, userSatkerNames} from "./head-data.js";
import Pagination from "@mui/material/Pagination";
import { PopupAlert } from "../../ui/Popup.jsx";


export default function MonitorPJK() {
    //Use Context
    const { user } = useContext(AuthContext);

    //State
    const [isLoading, setIsLoading] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [dashboardData, setDashboardData] = useState([]);
    const [tableData, setTableData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [filterSelect, setFilterSelect] = useState("");


    //Titles for card
    const cardTitles = [
        {title: "Total PJK", content: dashboardData[0]},
        {title: "PJK Belum Dikumpulkan", content: dashboardData[1]},
        {title: "Ditolak", content: dashboardData[2]},
        {title: "Lengkap Dengan Catatan", content: dashboardData[3]},
        {title: "Lengkap", content: dashboardData[4]}
    ]

    //Fetch data based on user
    async function fetchData(page, status) {
        const rowsPerPage = 10;
        let satkerPrefix = userSatkerNames.find(item => item.title === user.name).value || "";
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/verifikasi/data-pjk`, { params:{ satkerPrefix, filterKeyword: status, page: page, limit: rowsPerPage }});
            if (response.status === 200){
                const { data: rowData, totalPages, countData, message } = response.data;
                setDashboardData(countData);
                setTableData(rowData)
                setTotalPages(totalPages);
                setIsLoading(false);
                if (message === false) {
                    setIsAlert(true);
                    setTimeout(() => setIsAlert(false), 3000);
                }
            }
        } catch (error) {
            console.error("Error fetching data.", error);
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchData(currentPage, filterSelect);
    }, [currentPage, filterSelect]);


    //Pagination
    function handlePaginationChange(event, value) {
        setCurrentPage(value);
    }

    //Filter Change
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
    }

    return (
        <div>
            <div className={"card-wrap"}>
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card.title} content={card.content}/>
                ))}
            </div>
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label2">Filter:</label>
                    <div className="filter-select filter-select2">
                        <select value={filterSelect} onChange={handleFilterChange}>
                            <option value=""/>
                            <option value="Belum Dikumpulkan">Belum Dikumpulkan</option>
                            <option value="Ditolak">Ditolak</option>
                            <option value="Lengkap dengan catatan">Lengkap (Catatan)</option>
                            <option value="Lengkap">Lengkap</option>
                        </select>
                    </div>
                </form>
            </div>
            <div className={"bg-card pjk-table"}>
                {isLoading ? <LoadingAnimate /> :
                    <TableInfoPJK header={tableHead} body={tableData} />
                }
                <Pagination className="pagination" size="medium" count={totalPages} page={currentPage} onChange={handlePaginationChange} />
            </div>
            {isAlert && <PopupAlert isAlert={isAlert} message="Data tidak ditemukan." severity="error" />}
        </div>
    )
}
