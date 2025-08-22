import React, {useEffect, useState} from 'react';
import axios from "axios";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
import { userSatkerNames } from "../verifikasi/head-data.js";
import { placeholderTable, cardTitles, pajakStatus } from "./head-data.js";
//Import Table
import {TableKelola} from "../../ui/tables.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';


export default function MonitoringDrpp(props) {

    //State
    const [fullDRPPData, setFullDRPPData] = useState([])
    const [monitoringData, setMonitoringData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [cardContent, setCardContent] = useState([0, 0, 0, 0, 0]);
    const [filterSelect, setFilterSelect] = useState({
        satker: "",
        pungutan: "",
        setoran: ""
    });
    const [cariInput, setCariInput] = useState({
        spm: "",
        spby: "",
        drpp: "",
        bupot: "",
    })
    const [cariSelect, setCariSelect] = useState({});

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

    // Handle Pagination
    function handlePaginationChange (event, value) {
        setCurrentPage(value);
    }

    // Handle Filter Changes
    function handleFilterChange (event) {
        if (cariInput.spm !== "" || cariInput.spby !== "" || cariInput.drpp !== "" || cariInput.bupot !== "") {
            setCariInput({ spm: "", spby: "", drpp: "", bupot: ""})
            setCariSelect({});
        }
        setFilterSelect({...filterSelect, [event.target.name]: event.target.value});
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
                <div className="lihat-antri-pagination" >
                    <Pagination className="pagination" size="medium" count={totalPages} onChange={handlePaginationChange} />
                </div>
            </div>
        </div>
    )
}
