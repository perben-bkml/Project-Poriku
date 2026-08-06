import {useContext, useEffect, useState} from 'react';
import apiClient from "../../lib/apiClient";
import {AuthContext} from "../../lib/AuthContext.jsx";
//Import Components
import LoadingAnimate, {LoadingScreen} from "../../ui/loading.jsx";
import {monthNames, statusPegawaiOptions, dokumenGajiHeadData, rowsPerPageOptions} from "./head-data.js";
//Import Table
import {TableDokumenGaji} from "../../ui/tables.jsx";
import {SubmitButton} from "../../ui/buttons.jsx";
import Popup, {PopupAlert} from "../../ui/Popup.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';

export default function MonitorPerubahanGaji(props) {
    // Use Context - only "admin_gaji" and "master admin" may open the input form,
    // plain "admin" gets the monitor read-only
    const {user} = useContext(AuthContext);
    const canInputData = user.role === "admin_gaji" || user.role === "master admin";

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
    const [isDeniedAlert, setIsDeniedAlert] = useState(false);
    // Result of an edit/delete done from this page, as {severity, message}
    const [actionAlert, setActionAlert] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

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

    //Handle Input Data - blocked for every role except admin_gaji
    function handleInputData() {
        if (!canInputData) {
            setIsDeniedAlert(true);
            setTimeout(() => setIsDeniedAlert(false), 3000);
            return;
        }
        props.changeComponent('input-dokumen-gaji');
    }

    function showActionAlert(severity, message) {
        setActionAlert({severity, message});
        setTimeout(() => setActionAlert(null), 5000);
    }

    // Row layout is [No., Tanggal Terima, Tanggal Surat, Nomor Surat, Nama, Status,
    // Keterangan, Link, sheet row number]. Only the sheet row number plus the No. and
    // Nomor Surat it should still hold are handed on - the server re-checks those two
    // before writing, and the form fetches the rest itself rather than editing a stale copy.
    function handleEditRow(row) {
        props.editData({rowNumber: row[8], no: row[0], nomorSurat: row[3]});
        props.changeComponent('edit-dokumen-gaji');
    }

    async function handleDeleteRow() {
        const row = deleteTarget;
        setDeleteTarget(null);
        try {
            setIsDeleting(true);
            const response = await apiClient.delete(`/dokumen-gaji/${row[8]}`, {
                params: {expectedNo: row[0], expectedNomorSurat: row[3]}
            });
            showActionAlert("success", response.data?.message || "Dokumen Berhasil Dihapus");
            // Deleting renumbers every row below it, so nothing here can be reused
            await fetchDokumenGaji(currentPage, rowsPerPage, filterSelect);
        } catch (error) {
            console.error("Gagal menghapus dokumen.", error);
            showActionAlert("error", error.response?.data?.message || "Penghapusan Gagal, Coba Lagi");
        } finally {
            setIsDeleting(false);
        }
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
                        <TableDokumenGaji header={dokumenGajiHeadData} content={tableData}
                                          onEdit={canInputData ? handleEditRow : null}
                                          onDelete={canInputData ? setDeleteTarget : null}/>
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
                                  onClick={handleInputData}/>
                </div>
            </div>
            {deleteTarget && <Popup type="delete" whenCancel={() => setDeleteTarget(null)} whenDel={handleDeleteRow}/>}
            {isDeleting && <LoadingScreen/>}
            {actionAlert && <PopupAlert isAlert={!!actionAlert} severity={actionAlert.severity} message={actionAlert.message}/>}
            {isAlert && !actionAlert && <PopupAlert isAlert={isAlert} severity="success" message={props.alertMessage}/>}
            {isDeniedAlert && !isAlert && !actionAlert &&
                <PopupAlert isAlert={isDeniedAlert} severity="error" message="Akses ditolak, hanya admin gaji yang bisa."/>}
        </div>
    );
}
