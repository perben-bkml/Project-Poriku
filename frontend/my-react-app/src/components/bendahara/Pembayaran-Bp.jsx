 import {useContext, useEffect, useMemo, useRef, useState} from 'react';
import apiClient from "../../lib/apiClient";
import {BackgroundTaskContext} from "../../lib/BackgroundTasks";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {monthNames, pembayaranBpHeadData, rowsPerPageOptions} from "./head-data.js";
//Import Table
import {TablePembayaranBp} from "../../ui/tables.jsx";
import PembayaranBpForm from "./Pembayaran-Bp-Form.jsx";
import {SubmitButton} from "../../ui/buttons.jsx";
import Popup, {PopupAlert} from "../../ui/Popup.jsx";
//Import Pagination
import Pagination from '@mui/material/Pagination';
//Other
import debounce from 'lodash.debounce';

const EMPTY_OPTIONS = {unitKerja: [], jenis: [], statusBayar: [], statusPajak: []};

export default function PembayaranBp() {

    //State
    const [tableData, setTableData] = useState([]);
    const [options, setOptions] = useState(EMPTY_OPTIONS);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(() => {
        const saved = localStorage.getItem('pembayaran-bp-rows');
        return saved ? parseInt(saved, 10) : 10;
    });
    // Bulan is kept apart from the other filters and stored under its own key, because it
    // is the only one the server may choose for us. Persisting it alongside the others
    // would pin whichever month happened to be on screen when a different filter was
    // touched, and the screen would still open on it months later.
    const [bulan, setBulan] = useState(() => localStorage.getItem('pembayaran-bp-bulan'));
    const [filterSelect, setFilterSelect] = useState(() => {
        const saved = localStorage.getItem('pembayaran-bp-filter');
        return saved ? JSON.parse(saved) : {unitKerja: "", jenis: "", statusBayar: "", statusPajak: ""};
    });
    const [cariInput, setCariInput] = useState(() => localStorage.getItem('pembayaran-bp-cari') || "");
    // null = closed, {mode, record} = open
    const [panel, setPanel] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [actionAlert, setActionAlert] = useState(null);
    const {lastCompleted} = useContext(BackgroundTaskContext);
    const [cari, setCari] = useState(() => localStorage.getItem('pembayaran-bp-cari') || "");

    // Adopting the month the server picked changes state the fetch effect watches. Without
    // this the adoption would fetch the very same rows a second time on every first open.
    const skipNextFetch = useRef(false);

    //Fetch Data
    // quiet refreshes rows in place instead of blanking the table
    async function fetchPembayaranBp(page, limit, month, filter, keyword, {quiet = false} = {}) {
        try {
            if (!quiet) setIsLoading(true);
            const params = {page, limit, cari: keyword, ...filter};
            // Omitted entirely rather than sent empty: no bulan asks the server for the
            // current month, an empty bulan explicitly asks for every month.
            if (month !== null) params.bulan = month;

            const response = await apiClient.get('/bendahara/pembayaran-bp', {params});
            if (response.status === 200) {
                const {data, totalRows, options: sheetOptions, bulan: usedBulan} = response.data;
                setTableData(data);
                setTotalPages(Math.ceil(totalRows / limit));
                setOptions(sheetOptions || EMPTY_OPTIONS);
                // Show the month the server settled on, but do not store it - only an
                // explicit pick from the dropdown is worth remembering
                if (month === null) {
                    skipNextFetch.current = true;
                    setBulan(usedBulan);
                }
            }
        } catch (error) {
            console.error("Error fetching data Pembayaran BP.", error);
        } finally {
            if (!quiet) setIsLoading(false);
        }
    }

    useEffect(() => {
        if (skipNextFetch.current) {
            skipNextFetch.current = false;
            return;
        }
        fetchPembayaranBp(currentPage, rowsPerPage, bulan, filterSelect, cari);
    }, [currentPage, rowsPerPage, bulan, filterSelect, cari]);

    // a background save may have landed a row this table should show
    useEffect(() => {
        if (lastCompleted?.tag === "pembayaran-bp" && lastCompleted.status === "done") {
            fetchPembayaranBp(currentPage, rowsPerPage, bulan, filterSelect, cari, {quiet: true});
        }
    }, [lastCompleted]);

    function showActionAlert(severity, message) {
        setActionAlert({severity, message});
        setTimeout(() => setActionAlert(null), 5000);
    }

    async function handleDeleteRow() {
        const row = deleteTarget;
        setDeleteTarget(null);
        try {
            const response = await apiClient.delete('/bendahara/pembayaran-bp', {
                // re-checked server side, so a shifted row is refused
                params: {rowNumber: row.rowNumber, expectedNo: row.no, expectedNomorSpm: row.nomorSpm},
            });
            showActionAlert("success", response.data?.message || "Data Berhasil Dihapus");
            await fetchPembayaranBp(currentPage, rowsPerPage, bulan, filterSelect, cari, {quiet: true});
        } catch (error) {
            console.error("Gagal menghapus data Pembayaran BP.", error);
            showActionAlert("error", error.response?.data?.message || "Penghapusan Gagal, Coba Lagi");
        }
    }

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

    //Handle Bulan
    function handleBulanChange(event) {
        const {value} = event.target;
        setBulan(value);
        setCurrentPage(1);
        localStorage.setItem('pembayaran-bp-bulan', value);
    }

    //Handle Filter Changes
    function handleFilterChange(event) {
        const {name, value} = event.target;
        const newFilter = {...filterSelect, [name]: value};
        setFilterSelect(newFilter);
        setCurrentPage(1);
        localStorage.setItem('pembayaran-bp-filter', JSON.stringify(newFilter));
    }

    // Every keystroke would be a fresh read of the whole sheet, so the search waits for
    // the typing to stop before it asks
    const applyCari = useMemo(() => debounce((value) => {
        setCari(value);
        setCurrentPage(1);
        localStorage.setItem('pembayaran-bp-cari', value);
    }, 500), []);

    useEffect(() => () => applyCari.cancel(), [applyCari]);

    function handleCariChange(event) {
        setCariInput(event.target.value);
        applyCari(event.target.value);
    }

    //Handle rows per page
    function handleRowsPerPageChange(event) {
        const value = parseInt(event.target.value, 10);
        setRowsPerPage(value);
        setCurrentPage(1);
        localStorage.setItem('pembayaran-bp-rows', value.toString());
    }

    return (
        <div>
            <div className="pengajuan-filter filter-monitoring">
                <h3 className="wide-card-title">Filter</h3>
                <label className="filter-label2">Bulan:</label>
                <div className="filter-select filter-select2">
                    <select value={bulan ?? ""} name="bulan" onChange={handleBulanChange}>
                        {monthNames.map((month, index) => (
                            <option key={index} value={month.value}>{month.title}</option>
                        ))}
                    </select>
                </div>
                <label className="filter-label2">Unit Kerja:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.unitKerja} name="unitKerja" onChange={handleFilterChange}>
                        <option value=""></option>
                        {options.unitKerja.map((unit, index) => (
                            <option key={index} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
                <label className="filter-label2">Jenis:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.jenis} name="jenis" onChange={handleFilterChange}>
                        <option value=""></option>
                        {options.jenis.map((jenis, index) => (
                            <option key={index} value={jenis}>{jenis}</option>
                        ))}
                    </select>
                </div>
                <br /><br /><br />
                <label className="filter-label2">Status Bayar:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.statusBayar} name="statusBayar" onChange={handleFilterChange}>
                        <option value=""></option>
                        {options.statusBayar.map((status, index) => (
                            <option key={index} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
                <label className="filter-label2">Status Pajak:</label>
                <div className="filter-select filter-select2">
                    <select value={filterSelect.statusPajak} name="statusPajak" onChange={handleFilterChange}>
                        <option value=""></option>
                        {options.statusPajak.map((status, index) => (
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

                <div className={"filter-search"}>
                    <h3 className="wide-card-title">Cari</h3>
                    <input className={'cari-input'} type={"text"} name={"cari"} value={cariInput}
                           placeholder={"Nomor SPM..."} onChange={handleCariChange} />
                </div>
            </div>

            <div className="bg-card">
                {isLoading ? <LoadingAnimate/> :
                    <div className="lihat-antri-table">
                        <TablePembayaranBp header={pembayaranBpHeadData} content={tableData}
                                           onEdit={row => setPanel({mode: "edit", record: row})}
                                           onDelete={setDeleteTarget}/>
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
                    <SubmitButton value='Tambah Data' name='tambah-pembayaran-bp'
                                  onClick={() => setPanel({mode: "buat", record: null})}/>
                </div>
            </div>
            {panel && <PembayaranBpForm mode={panel.mode} record={panel.record}
                                        onClose={() => setPanel(null)}/>}
            {deleteTarget && <Popup type="delete" whenCancel={() => setDeleteTarget(null)} whenDel={handleDeleteRow}/>}
            {actionAlert && <PopupAlert isAlert={!!actionAlert} severity={actionAlert.severity} message={actionAlert.message}/>}
        </div>
    );
}
