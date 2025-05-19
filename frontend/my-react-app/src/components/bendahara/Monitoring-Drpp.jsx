import React, {useEffect, useState} from 'react';
import axios from "axios";
import PropTypes from "prop-types";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {Card} from "../../ui/cards.jsx";
//Import Table
import {TableKelola} from "../../ui/tables.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';


export default function MonitoringDrpp(props) {
    //Placeholder
    const placeholderTable = ["No.", "ID Number", "Tanggal", "Satker", "DRPP", "SPM", "Nominal", "Pungut Pajak", "Setor Pajak", "Jenis Tagihan" ]

    //State
    const [monitoringData, setMonitoringData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [cardContent, setCardContent] = useState([0, 0, 0, 0]);

    //Fetch Data
    const rowsPerPage = 10;
    async function fetchMonitoringData (page) {
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/monitoring-drpp`, { params:{ page, limit: rowsPerPage }});
            if (response.status === 200){
                const { data: responseResult, realAllDRPPRows, countData } = response.data;
                setMonitoringData(responseResult);
                setTotalPages(Math.ceil(realAllDRPPRows / rowsPerPage));
                setCardContent(countData);
            }
            setIsLoading(false);
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }

    useEffect(() => {
        fetchMonitoringData(currentPage);
    }, [currentPage]);

    // Handle Pagination
    function handlePaginationChange (event, value) {
        setCurrentPage(value);
    }

    //Card titles
    const cardTitles = ["Belum Pungut", "Sudah Pungut", "Belum Setor", "Sudah Setor"]

    return (
        <div>
            <div className="card-wrap" >
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card} content={cardContent[index]} />
                ))}
            </div>
            <div className="bg-card">

                {isLoading ? <LoadingAnimate /> :
                    <div className="lihat-antri-table" >
                        <TableKelola type="monitor" header={placeholderTable} content={monitoringData} fullContent={monitoringData} changeComponent={props.changeComponent} aksiData={props.aksiData} />
                    </div>
                }
                <div className="lihat-antri-pagination" >
                    <Pagination className="pagination" size="medium" count={totalPages} onChange={handlePaginationChange} />
                </div>
            </div>
        </div>
    )
}
