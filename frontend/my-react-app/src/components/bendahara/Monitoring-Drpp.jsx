import React, {useEffect, useState} from 'react';
import apiClient from "../../lib/apiClient";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
import { userSatkerNames } from "../verifikasi/head-data.js";
import { placeholderTable, spmKey, buktiSetorLabel, cardTitles, pajakStatus, monthNames, formatRibuan, jenisPajakOptions } from "./head-data.js";
//Import Table
import {TableKelola} from "../../ui/tables.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';
import PropTypes from 'prop-types';


// One search field is active at a time; adding a row here is enough to wire it up
const CARI_INPUTS = [
    { name: "drpp", type: "number", placeholder: "DRPP..." },
    { name: "spm", type: "number", placeholder: "SPM..." },
    { name: "spby", type: "number", placeholder: "SPBY..." },
    { name: "bupot", type: "text", placeholder: "Faktur/Bupot..." },
    { name: "uraian", type: "text", placeholder: "Uraian..." },
    // text, not number: type="number" rejects the separator dots
    { name: "nominal", type: "text", inputMode: "numeric", placeholder: "Nominal..." },
    { name: "penerima", type: "text", placeholder: "Penerima..." },
];
const CARI_KOSONG = Object.fromEntries(CARI_INPUTS.map(input => [input.name, ""]));

const FILTER_KOSONG = { satker: "", pungutan: "", setoran: "", month: "", jenisPajak: "" };

const asOptions = (list, value, label) => list.map(item => ({ value: item[value], label: item[label] }));
const FILTER_SELECTS = [
    { name: "satker", label: "Satker:", options: asOptions(userSatkerNames, "title", "value") },
    { name: "pungutan", label: "Pungutan:", options: pajakStatus.map(status => ({ value: status, label: status })) },
    { name: "setoran", label: "Setoran:", options: pajakStatus.map(status => ({ value: status, label: status })) },
    { name: "month", label: "Bulan:", options: asOptions(monthNames, "value", "title") },
    { name: "jenisPajak", label: "Jenis Pajak:", options: jenisPajakOptions },
];

export default function MonitoringDrpp(props) {

    //State
    const [fullDRPPData, setFullDRPPData] = useState([])
    const [monitoringData, setMonitoringData] = useState([]);
    const [buktiSetor, setBuktiSetor] = useState({});
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
        return {...FILTER_KOSONG, ...(savedFilter ? JSON.parse(savedFilter) : {})};
    });
    const [cariInput, setCariInput] = useState(CARI_KOSONG)
    const [cariSelect, setCariSelect] = useState({});
    const [pageInput, setPageInput] = useState("");

    //Fetch Data
    const rowsPerPage = 10;
    async function fetchMonitoringData (page, status, search) {
        try {
            setIsLoading(true);
            const response = await apiClient.get('/bendahara/monitoring-drpp', { params:{ page, limit: rowsPerPage, filterKeyword: status, cariNomor: search }});
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

    // Publish the active search so Aksi-Drpp can mark the cell that matched. The value
    // lives in 'Write Table', not in the DRPP row, so it cannot be shown on this screen.
    useEffect(() => {
        const aktif = Object.entries(cariSelect).find(([, value]) => value);
        props.sorotData?.(aktif ? { field: aktif[0], term: aktif[1] } : null);
    }, [cariSelect]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        apiClient.get('/bendahara/pembayaran-bp/bukti-setor')
            .then(response => setBuktiSetor(response.data.data || {}))
            .catch(error => console.log("Failed fetching Bukti Setor.", error));
    }, []);

    // Validate currentPage against totalPages
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(1);
            localStorage.setItem('monitoring-drpp-pagination', '1');
        }
    }, [totalPages, currentPage]);

    const tableContent = monitoringData.map(row => [...row.slice(0, 7),
        spmKey(row[5]) ? buktiSetorLabel(buktiSetor[spmKey(row[5])]) : "-", ...row.slice(7)]);

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
        if (Object.values(cariInput).some(Boolean)) {
            setCariInput(CARI_KOSONG);
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
        const { name, value, selectionStart } = event.target;
        if (name !== "nominal") {
            setCariInput({...CARI_KOSONG, [name]: value.toString()});
            return;
        }
        // Nominal is shown with thousand separators; every match still runs on digits only,
        // so the dots never reach the comparison
        const rapi = formatRibuan(value);
        setCariInput({...CARI_KOSONG, nominal: rapi});
        // Rewriting the value parks the caret at the end, which fights anyone editing
        // mid-number, so put it back after the same count of digits
        const input = event.target;
        const digitKe = value.slice(0, selectionStart).replace(/\D/g, "").length;
        requestAnimationFrame(() => {
            let pos = 0;
            for (let dilihat = 0; pos < rapi.length && dilihat < digitKe; pos++) {
                if (rapi[pos] >= "0" && rapi[pos] <= "9") dilihat++;
            }
            input.setSelectionRange(pos, pos);
        });
    }

    // Handle Cari input request when onBlur
    function handleCariSearch () {
        setCurrentPage(1);
        localStorage.removeItem('monitoring-drpp-pagination');
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
            <div className="pengajuan-filter filter-monitoring filter-drpp">
                <h3 className="wide-card-title">Filter</h3>
                    <div className="filter-drpp-grid">
                        {FILTER_SELECTS.map(({ name, label, options }) => (
                            <div className="filter-drpp-item" key={name}>
                                <label className="filter-label2" htmlFor={`filter-${name}`}>{label}</label>
                                <div className="filter-select filter-select2">
                                    <select id={`filter-${name}`} name={name} value={filterSelect[name]}
                                            onChange={event => handleFilterChange(event)}>
                                        {options.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="filter-search cari-drpp">
                        <h3 className="wide-card-title">Cari</h3>
                        <div className="cari-drpp-grid">
                            {CARI_INPUTS.map(({ name, type, inputMode, placeholder }) => (
                                <input key={name} className="cari-input" type={type} inputMode={inputMode}
                                       name={name} value={cariInput[name]} placeholder={placeholder}
                                       onWheel={e => e.currentTarget.blur()} onChange={e => handleCariChange(e)} />
                            ))}
                            <button className="cari spm-button" onClick={handleCariSearch}>Go</button>
                        </div>
                    </div>

            </div>
            <div className="bg-card">
                {isLoading ? <LoadingAnimate /> :
                <div className="lihat-antri-table" >
                    <TableKelola type="monitor" header={placeholderTable} content={tableContent} fullContent={fullDRPPData} changeComponent={props.changeComponent} aksiData={props.aksiData} />
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

// Only the prop this screen's highlight feature added; the rest predate it
MonitoringDrpp.propTypes = {
    sorotData: PropTypes.func,
};
