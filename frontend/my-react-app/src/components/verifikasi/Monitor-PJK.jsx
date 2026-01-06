import React, {useState, useContext, useEffect} from "react";
import apiClient from "../../lib/apiClient";

//Context
import { AuthContext } from "../../lib/AuthContext.jsx";

//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
import {TableInfoPJK} from "../../ui/tables.jsx";
import {tableHead, userSatkerNames, monthNames} from "./head-data.js";
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
    const [currentPage, setCurrentPage] = useState(() => {
        const savedPage = localStorage.getItem('monitor-pjk-pagination');
        const pageNumber = savedPage ? parseInt(savedPage, 10) : 1;
        // Ensure page number is valid (will be validated against totalPages in useEffect)
        return pageNumber > 0 ? pageNumber : 1;
    });
    const [totalPages, setTotalPages] = useState(0);
    const [filterSelect, setFilterSelect] = useState(() => {
        const savedFilter = localStorage.getItem('monitor-pjk-filter-select');
        return savedFilter ? JSON.parse(savedFilter) : "";
    });
    const [monthFilter, setMonthFilter] = useState(() => {
        const savedMonth = localStorage.getItem('monitor-pjk-month-filter');
        return savedMonth ? JSON.parse(savedMonth) : "";
    });
    const [pageInput, setPageInput] = useState("");


    //Titles for card
    const cardTitles = [
        {title: "Total PJK", content: dashboardData[0]},
        {title: "PJK Belum Dikumpulkan", content: dashboardData[1]},
        {title: "Ditolak", content: dashboardData[2]},
        {title: "Lengkap Dengan Catatan", content: dashboardData[3]},
        {title: "Lengkap", content: dashboardData[4]}
    ]

    //Fetch data based on user
    async function fetchData(page, status, month) {
        const rowsPerPage = 10;
        let satkerPrefix = userSatkerNames.find(item => item.title === user.name).value || "";
        try {
            setIsLoading(true);
            const response = await apiClient.get('/verifikasi/data-pjk', { params:{ satkerPrefix, filterKeyword: status, page: page, limit: rowsPerPage, monthKeyword: month }});
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
        fetchData(currentPage, filterSelect, monthFilter);
    }, [currentPage, filterSelect, monthFilter]);

    // Validate currentPage against totalPages
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(1);
            localStorage.setItem('monitor-pjk-pagination', '1');
        }
    }, [totalPages, currentPage]);


    //Pagination
    function handlePaginationChange(event, value) {
        // Validate page number is within bounds
        if (value >= 1 && value <= totalPages) {
            setCurrentPage(value);
            localStorage.setItem('monitor-pjk-pagination', value.toString());
        }
    }

    //Filter Change
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
        localStorage.setItem('monitor-pjk-filter-select', JSON.stringify(option));
        if (option === "") {
            localStorage.removeItem('monitor-pjk-filter-select');
        }
        // Reset pagination when filter changes
        setCurrentPage(1);
        localStorage.removeItem('monitor-pjk-pagination');
    }

    function handleMonthFilterChange(event) {
        const option = event.target.value;
        setMonthFilter(option);
        localStorage.setItem('monitor-pjk-month-filter', JSON.stringify(option));
        // Reset pagination when filter changes
        setCurrentPage(1);
        localStorage.removeItem('monitor-pjk-pagination');
    }

    // Handle page input change
    function handlePageInputChange (event) {
        const value = event.target.value;
        // Only allow numbers
        if (/^\d*$/.test(value)) {
            setPageInput(value);
        }
    }

    // Handle go to page
    function handleGoToPage () {
        const pageNumber = parseInt(pageInput, 10);
        if (pageNumber >= 1 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
            localStorage.setItem('monitor-pjk-pagination', pageNumber.toString());
            setPageInput(""); // Clear input after successful navigation
        } else {
            // Reset input if invalid
            setPageInput("");
        }
    }

    // Handle Enter key press in page input
    function handlePageInputKeyDown (event) {
        if (event.key === 'Enter') {
            handleGoToPage();
        }
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
                            <option value="PJK Belum Diverifikasi">Belum Dikumpulkan</option>
                            <option value="Ditolak">Ditolak</option>
                            <option value="Lengkap dengan catatan">Lengkap (Catatan)</option>
                            <option value="Lengkap">Lengkap</option>
                        </select>
                    </div>
                    <label className="filter-label2">Bulan: </label>
                    <div className="filter-select filter-select2">
                        <select value={monthFilter} onChange={handleMonthFilterChange}>
                            {monthNames.map((month, index) => (
                                <option key={index} value={month.value}>{month.title}</option>
                            ))}
                        </select>
                    </div>
                </form>
            </div>
            <div className={"bg-card pjk-table"}>
                {isLoading ? <LoadingAnimate /> :
                    <TableInfoPJK header={tableHead} body={tableData} />
                }
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    padding: '20px 0'
                }}>
                    <div></div>
                    <Pagination 
                        className="pagination" 
                        size="medium" 
                        count={totalPages} 
                        page={currentPage} 
                        onChange={handlePaginationChange}
                        showFirstButton={true}
                        showLastButton={true}
                        siblingCount={1}
                        boundaryCount={1}
                    />
                    <div className="goto-page" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        justifySelf: 'end',
                        paddingRight: '20px'
                    }}>
                        <span>Go to page:</span>
                        <input 
                            type="text" 
                            value={pageInput}
                            onChange={handlePageInputChange}
                            onKeyDown={handlePageInputKeyDown}
                            placeholder={`1-${totalPages}`}
                            style={{
                                width: '60px',
                                padding: '4px 8px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                textAlign: 'center'
                            }}
                        />
                        <button 
                            onClick={handleGoToPage}
                            disabled={!pageInput || totalPages === 0}
                            style={{
                                padding: '4px 12px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                backgroundColor: '#f5f5f5',
                                cursor: pageInput && totalPages > 0 ? 'pointer' : 'not-allowed'
                            }}
                        >
                            Go
                        </button>
                    </div>
                </div>
            </div>
            {isAlert && <PopupAlert isAlert={isAlert} message="Data tidak ditemukan." severity="error" />}
        </div>
    )
}
