import {useEffect, useState} from 'react';
import apiClient from "../../lib/apiClient";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {monthNames, statusPegawaiOptions, dokumenGajiHeadData, rowsPerPageOptions} from "./head-data.js";
//Import Table
import {TableDokumenGaji} from "../../ui/tables.jsx";
import {SubmitButton} from "../../ui/buttons.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';

export default function MonitorPerubahanGaji(props) {
    //State
    const [tableData, setTableData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(() => {
        const saved = localStorage.getItem('monitor-perubahan-gaji-rows');
        return saved ? parseInt(saved, 10) : 10;
    });
    const [filterSelect, setFilterSelect] = useState(() => {
        const saved = localStorage.getItem('monitor-perubahan-gaji-filter');
        return saved ? JSON.parse(saved) : {month: "", statusPegawai: ""};
    });
    const [isAlert, setIsAlert] = useState(false);

    // Success message handed over by Kirim-Dokumen-Gaji before it unmounted
    useEffect(() => {
        if (props.alertMessage) {
            setIsAlert(true);
            setTimeout(() => setIsAlert(false), 5000);
        }
    }, [props.alertMessage]);

    //Fetch Data
    async function fetchDokumenGaji(page, limit, filter) {
        try {
            setIsLoading(true);
            const response = await apiClient.get('/bendahara/monitor-perubahan-gaji', {
                params: {page, limit, month: filter.month, statusPegawai: filter.statusPegawai}
            });
            if (response.status === 200) {
                const {data, totalRows} = response.data;
                setTableData(data);
                setTotalPages(Math.ceil(totalRows / limit));
            }
        } catch (error) {
            console.error("Error fetching dokumen gaji.", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchDokumenGaji(currentPage, rowsPerPage, filterSelect);
    }, [currentPage, rowsPerPage, filterSelect]);

    // Keep the page in range when filters shrink the result set
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    //Handle Pagination
    function handlePaginationChange(event, value) {
        if (value >= 1 && value <= totalPages) {
            setCurrentPage(value);
        }
    }

    //Handle Filter Changes
    function handleFilterChange(event) {
        const {name, value} = event.target;
        const newFilter = {...filterSelect, [name]: value};
        setFilterSelect(newFilter);
        setCurrentPage(1);
        localStorage.setItem('monitor-perubahan-gaji-filter', JSON.stringify(newFilter));
    }

    //Handle rows per page
    function handleRowsPerPageChange(event) {
        const value = parseInt(event.target.value, 10);
        setRowsPerPage(value);
        setCurrentPage(1);
        localStorage.setItem('monitor-perubahan-gaji-rows', value.toString());
    }

    return (
        <div>
            <div className="pengajuan-filter filter-monitoring" style={{marginBottom: '50px'}}>
                <h3 className="wide-card-title">Filter</h3>
                <label className="filter-label2">Bulan:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.month} name="month" onChange={handleFilterChange}>
                        {monthNames.map((month, index) => (
                            <option key={index} value={month.value}>{month.title}</option>
                        ))}
                    </select>
                </div>
                <label className="filter-label2">Status Pegawai:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.statusPegawai} name="statusPegawai" onChange={handleFilterChange}>
                        <option value=""></option>
                        {statusPegawaiOptions.map((status, index) => (
                            <option key={index} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
                <label className="filter-label2">Baris:</label>
                <div className="filter-select filter-select2">
                    <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                        {rowsPerPageOptions.map((rows, index) => (
                            <option key={index} value={rows}>{rows}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-card">
                {isLoading ? <LoadingAnimate/> :
                    <div className="lihat-antri-table">
                        <TableDokumenGaji header={dokumenGajiHeadData} content={tableData}/>
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
                    />
                    <div></div>
                </div>
                <div className='form-submit'>
                    <SubmitButton value='Input Data' name='input-dokumen-gaji'
                                  onClick={() => props.changeComponent('input-dokumen-gaji')}/>
                </div>
            </div>
            {isAlert && <PopupAlert isAlert={isAlert} severity="success" message={props.alertMessage}/>}
        </div>
    );
}
