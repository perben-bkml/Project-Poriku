import React, {useEffect, useState} from "react";
import axios from "axios";
//Import Components
import { Card } from "../../ui/cards.jsx"
import { TableInfoPJK } from "../../ui/tables.jsx";
import LoadingAnimate from "../../ui/loading.jsx";
import Pagination from "@mui/material/Pagination";
import { PopupAlert } from "../../ui/Popup.jsx";
//Other Data
import { satkerNames, tableHead } from "./head-data.js";

export default function KelolaPJK() {
    //State
    const [isLoading, setIsLoading] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [filterSelect, setFilterSelect] = useState("");
    const [filterData, setFilterData] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [dashboardData, setDashboardData] = useState([]);
    const [tableData, setTableData] = useState([]);
    const [currentPage, setCurrentPage] = useState(() => {
        const savedPage = localStorage.getItem('kelola-pjk-pagination');
        const pageNumber = savedPage ? parseInt(savedPage, 10) : 1;
        // Ensure page number is valid (will be validated against totalPages in useEffect)
        return pageNumber > 0 ? pageNumber : 1;
    });
    const [totalPages, setTotalPages] = useState(0);
    const [spmSearch, setSpmSearch] = useState("");
    const [cariSpm, setCariSpm] = useState("");
    const [pageInput, setPageInput] = useState("");


    //Fetch data with filter
    async function fetchData(data, page, status, cari) {
        const rowsPerPage = 10;
        let satkerPrefix = data;
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/verifikasi/data-pjk`, { params:{ satkerPrefix, filterKeyword: status, page: page, limit: rowsPerPage, searchKeyword: cari }});
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
        fetchData(filterData, currentPage, statusFilter, cariSpm);
    }, [filterData, currentPage, statusFilter, cariSpm]);

    // Validate currentPage against totalPages
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(1);
            localStorage.setItem('kelola-pjk-pagination', '1');
        }
    }, [totalPages, currentPage]);


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
            setStatusFilter("")
            setFilterData("");
        }
    }
    function handleFilterSelectChange(event) {
        const option = event.target.value;
        setFilterData(option);
        if (option === "") {
            setStatusFilter("");
        }
        // Reset pagination when filter changes
        setCurrentPage(1);
        localStorage.removeItem('kelola-pjk-pagination');
    }
    function handleStatusSelectChange(event) {
        const option = event.target.value;
        setStatusFilter(option);
        // Reset pagination when filter changes
        setCurrentPage(1);
        localStorage.removeItem('kelola-pjk-pagination');
    }
    //Pagination
    function handlePaginationChange(event, value) {
        // Validate page number is within bounds
        if (value >= 1 && value <= totalPages) {
            setCurrentPage(value);
            localStorage.setItem('kelola-pjk-pagination', value.toString());
        }
    }

    // SPM Search
    function handleSpmChange(event) {
        const option = event.target.value;
        setSpmSearch(option);
    }
    function handleCariSearch() {
        setCariSpm(spmSearch);
    }
    function handleSearchBlur(event) {
        if (event.target.name === 'spm') {
            if (spmSearch.length === 0) {
                setCariSpm("");
            }
        } else {
            setSpmSearch("");
            setCariSpm("");
        }

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
            localStorage.setItem('kelola-pjk-pagination', pageNumber.toString());
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
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label1">Filter dengan:</label>
                    <div className="filter-select">
                        <select onChange={handleFilterChange}>
                            <option value=""/>
                            <option value="text">Satker</option>
                            <option value="allFilter">Satker dan Status</option>
                        </select>
                    </div>
                    <label className="filter-label2" hidden={filterSelect === ""}>Nama Satker:</label>
                    <div className="filter-select filter-select2 ">
                        <select hidden={filterSelect === ""} value={filterData} onChange={handleFilterSelectChange}>
                            {satkerNames.map((satker, index) => (
                                <option key={index} value={satker.value}>{satker.title}</option>
                            ))}
                        </select>
                    </div>
                    <label className="filter-label2" hidden={filterSelect !== "allFilter"} >Status PJK:</label>
                    <div className="filter-select filter-select2 ">
                        <select hidden={filterSelect !== "allFilter"} value={statusFilter} onChange={handleStatusSelectChange}>
                            <option value=""/>
                            <option value="Belum Dikumpulkan">Belum Dikumpulkan</option>
                            <option value="Ditolak">Ditolak</option>
                            <option value="Lengkap dengan catatan">Lengkap (Catatan)</option>
                            <option value="Lengkap">Lengkap</option>
                        </select>
                    </div>

                </form>
            </div>
            <div className={"card-wrap"}>
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card.title} content={card.content}/>
                ))}
            </div>
            <div className={'pengajuan-filter filter-search'}>
                <label className="filter-label1">Cari:</label>
                <input className="cari-input" type={'text'} name={'spm'} placeholder={'SPM...'} value={spmSearch}
                       onChange={handleSpmChange} onBlur={(e) => handleSearchBlur(e)}/>
                <button className='cari spm-button' onClick={handleCariSearch} >Go</button>
                <button className='cari spm-button' onClick={(e) => {handleSearchBlur(e);}} >Hapus</button>
            </div>
            <div className={"bg-card pjk-table"}>
                {isLoading ? <LoadingAnimate /> :
                    <TableInfoPJK header={tableHead} body={tableData} />
                }
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap'}}>
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
                    <div className="goto-page" style={{marginRight: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
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
