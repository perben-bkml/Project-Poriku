import React, {useEffect, useState} from 'react';
import axios from "axios";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
import { userSatkerNames } from "../verifikasi/head-data.js";
import { placeholderTable, cardTitles, pajakStatus, monthNames } from "./head-data.js";
//Import Table
import {TableKelola} from "../../ui/tables.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';


export default function MonitoringDrpp(props) {

    //State
    const [fullDRPPData, setFullDRPPData] = useState([])
    const [monitoringData, setMonitoringData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(() => {
        const savedPage = localStorage.getItem('monitoring-drpp-pagination');
        const pageNumber = savedPage ? parseInt(savedPage, 10) : 1;
        // Ensure page number is valid (will be validated against totalPages in useEffect)
        return pageNumber > 0 ? pageNumber : 1;
    });
    const [totalPages, setTotalPages] = useState(0);
    const [cardContent, setCardContent] = useState([0, 0, 0, 0, 0]);
    const [filterSelect, setFilterSelect] = useState(() => {
        const savedFilter = localStorage.getItem('monitoring-drpp-filter');
        return savedFilter ? JSON.parse(savedFilter) : {
            satker: "",
            pungutan: "",
            setoran: "",
            month: ""
        };
    });
    const [cariInput, setCariInput] = useState({
        spm: "",
        spby: "",
        drpp: "",
        bupot: "",
    })
    const [cariSelect, setCariSelect] = useState({});
    const [pageInput, setPageInput] = useState("");

    //Fetch Data
    const rowsPerPage = 10;
    async function fetchMonitoringData (page, status, search) {
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/monitoring-drpp`, { params:{ page, limit: rowsPerPage, filterKeyword: status, cariNomor: search }});
            if (response.status === 200){
                const { data: responseResult, realAllDRPPRows, countData, fullData } = response.data;
                setMonitoringData(responseResult);
                setFullDRPPData(fullData);
                setTotalPages(Math.ceil(realAllDRPPRows / rowsPerPage));
                setCardContent(countData);
            }
            setIsLoading(false);
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }

    useEffect(() => {
        fetchMonitoringData(currentPage, filterSelect, cariSelect);
    }, [currentPage, filterSelect, cariSelect]);

    // Validate currentPage against totalPages
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(1);
            localStorage.setItem('monitoring-drpp-pagination', '1');
        }
    }, [totalPages, currentPage]);

    // Handle Pagination
    function handlePaginationChange (event, value) {
        // Validate page number is within bounds
        if (value >= 1 && value <= totalPages) {
            setCurrentPage(value);
            localStorage.setItem('monitoring-drpp-pagination', value.toString());
        }
    }

    // Handle Filter Changes
    function handleFilterChange (event) {
        if (cariInput.spm !== "" || cariInput.spby !== "" || cariInput.drpp !== "" || cariInput.bupot !== "") {
            setCariInput({ spm: "", spby: "", drpp: "", bupot: ""})
            setCariSelect({});
        }
        // Reset pagination when filter changes
        setCurrentPage(1);
        localStorage.removeItem('monitoring-drpp-pagination');
        const newFilter = {...filterSelect, [event.target.name]: event.target.value};
        setFilterSelect(newFilter);
        localStorage.setItem('monitoring-drpp-filter', JSON.stringify(newFilter));
    }

    // Handle Cari Input Changes
    function handleCariChange (event) {
        const eventName = event.target.name;
        const eventValue = event.target.value.toString();
        
        if (eventName === "spm") {
            setCariInput({spm: eventValue, spby: "", drpp: "", bupot: ""});
        } else if (eventName === "spby") {
            setCariInput({spm: "", spby: eventValue, drpp: "", bupot: ""});
        } else if (eventName === "drpp") {
            setCariInput({spm: "", spby: "", drpp: eventValue, bupot: ""});
        } else {
            setCariInput({spm: "", spby: "", drpp: "", bupot: eventValue});
        }
    }

    // Handle Cari input request when onBlur
    function handleCariSearch () {
        setCariSelect(cariInput)
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
            localStorage.setItem('monitoring-drpp-pagination', pageNumber.toString());
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
            <div className="card-wrap" >
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card} content={cardContent[index]} />
                ))}
            </div>
            <div className="pengajuan-filter filter-monitoring">
                <h3 className="wide-card-title">Filter</h3>
                    <label className="filter-label2">Satker:</label>
                    <div className="filter-select filter-select2">
                        <select value={filterSelect.satker} name={"satker"} onChange={event => handleFilterChange(event)}>
                        {userSatkerNames.map((satker, index) => (
                            <option key={index} value={satker.title}>{satker.value}</option>
                        ))}
                        </select>
                    </div>
                    <label className="filter-label2">Pungutan:</label>
                    <div className="filter-select filter-select2">
                        <select value={filterSelect.pungutan} name={"pungutan"} onChange={event => handleFilterChange(event)}>
                            {pajakStatus.map((pajak, index) => (
                                <option key={index} value={pajak}>{pajak}</option>
                            ))}
                        </select>
                    </div>
                    <label className="filter-label2">Setoran:</label>
                    <div className="filter-select filter-select2">
                        <select value={filterSelect.setoran} name={"setoran"} onChange={event => handleFilterChange(event)}>
                            {pajakStatus.map((pajak, index) => (
                                <option key={index} value={pajak}>{pajak}</option>
                            ))}
                        </select>
                    </div>
                    <br /><br /><br />
                    <label className="filter-label2">Bulan: </label>
                    <div className="filter-select filter-select2">
                        <select value={filterSelect.month} name={"month"} onChange={event => handleFilterChange(event)}>
                            {monthNames.map((month, index) => (
                                <option key={index} value={month.value}>{month.title}</option>
                            ))}
                        </select>
                    </div>

                    <div className={"filter-search"}>
                        <h3 className="wide-card-title">Cari</h3>
                        <input className={'cari-input'} type={"number"} name={"drpp"} value={cariInput.drpp} placeholder={"DRPP..."}
                               onWheel={ e => e.currentTarget.blur()} onChange={e => handleCariChange(e)} />
                        <input className={'cari-input'} type={"number"} name={"spm"} value={cariInput.spm} placeholder={"SPM..."}
                               onWheel={ e => e.currentTarget.blur()} onChange={e => handleCariChange(e)} />
                        <input className={'cari-input'} type={"number"} name={"spby"} value={cariInput.spby} placeholder={"SPBY..."}
                               onWheel={ e => e.currentTarget.blur()} onChange={e => handleCariChange(e)} />
                        <input className={'cari-input'} type={"text"} name={"bupot"} value={cariInput.bupot} placeholder={"Faktur/Bupot..."}
                               onWheel={ e => e.currentTarget.blur()} onChange={e => handleCariChange(e)} />
                        <button className='cari spm-button' onClick={handleCariSearch} >Go</button>
                    </div>

            </div>
            <div className="bg-card">
                {isLoading ? <LoadingAnimate /> :
                <div className="lihat-antri-table" >
                    <TableKelola type="monitor" header={placeholderTable} content={monitoringData} fullContent={fullDRPPData} changeComponent={props.changeComponent} aksiData={props.aksiData} />
                </div>
                }
                <div className="lihat-antri-pagination" style={{
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
        </div>
    )
}
