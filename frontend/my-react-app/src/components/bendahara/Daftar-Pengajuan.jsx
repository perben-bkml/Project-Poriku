import {useState, useEffect, useContext, useMemo, useCallback, useRef} from "react";
import apiClient from "../../lib/apiClient";
// Import components
import Popup, { PopupAlert } from "../../ui/Popup.jsx";
import { TableDaftarPengajuan } from "../../ui/tables.jsx";
import { rowsPerPageOptions, monthNames } from "./head-data.js";
import { AuthContext } from "../../lib/AuthContext";
import PropTypes from "prop-types";

const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT = 15;
const ALERT_MS = 3000;
const TAB_KEY = 'daftarTabBendahara';

// kategori is resolved server-side so the split counts every row, not just this page
const TABS = [
    { kategori: "gup", label: "GUP/PTUP" },
    { kategori: "ls", label: "LS (Langsung)" },
];

// Canonical 'Write Antrian' indices. 20+ are appended server-side past ANTRIAN_ROW_WIDTH,
// so every index below keeps its meaning on both antrian sheets.
function toTableRow(data, pending, lastPage) {
    const drpp = String(data[8] ?? "").trim();
    // Lampiran (19) is the Bupot on a GUP/PTUP row and the PJK on every other jenis, whose
    // PJK index the server just copies from it. Same split Buat-Pengajuan.jsx makes.
    const isGup = data[20] === "gup";
    return {
        key: `${data[20]}-${data[0]}`,
        id: data[0],
        jenis: String(data[3] ?? "").toUpperCase(),
        nominal: data[4],
        tglAjuan: data[1],
        tglProses: data[6],
        drpp: data[8],
        status: data[7],
        spp: data[9],
        spm: data[10],
        pajak: data[12],
        anggaran: data[13],
        mulaiVerif: data[14],
        selesaiVerif: data[15],
        catatan: data[16],
        isGup,
        bupot: isGup ? data[19] : "",
        pjk: data[21] || (isGup ? "" : data[19]),
        pjkCatatan: data[22],
        hasilVerif: data[23],
        hasilVerifPending: pending.has(String(data[24])),
        // A row already carried onto a DRPP is locked - editing or deleting it would leave
        // the DRPP pointing at a row that no longer matches
        canModify: drpp === "",
        // Shape Bendahara-Page's handleInvisibleComponent destructures
        passData: {
            lastPage, keyword: data[0], antriNum: data[0], antriName: data[2], antriType: data[3],
            antriSum: data[4], antriDate: data[5], createDate: data[1], accDate: data[6],
            status: data[7], fileLink: data[19], flow: data[20], pjkLink: data[21],
            spp: data[9], catatan: data[16], pjkCatatan: data[22],
        },
    };
}

function DaftarPengajuan(props){
    //Context
    const { user } = useContext(AuthContext)

    // States
    const [antrianData, setAntrianData] = useState([]);
    const [pending, setPending] = useState(new Set());
    const [currentPage, setCurrentPage] = useState(props.userPagination || 1);
    const [rowsPerPage, setRowsPerPage] = useState(rowsPerPageOptions[0]);
    const [totalPages, setTotalPages] = useState(0);
    const [filterSelect, setFilterSelect] = useState("")
    const [datePrefix, setDatePrefix] = useState("");
    const [kategori, setKategori] = useState(() => {
        const saved = localStorage.getItem(TAB_KEY);
        return TABS.some(tab => tab.kategori === saved) ? saved : TABS[0].kategori;
    });
    const [isDelPopup, setIsDelPopup] = useState(false);
    const [delData, setDelData] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState({ message: "", severity: "" });
    const alertTimer = useRef(null);
    // Lives as long as the screen does, so it cannot go stale across a menu switch
    const cacheRef = useRef(new Map());

    const showAlert = useCallback((message, severity) => {
        setAlertMessage({ message, severity });
        setIsAlert(true);
        clearTimeout(alertTimer.current);
        alertTimer.current = setTimeout(() => setIsAlert(false), ALERT_MS);
    }, []);
    useEffect(() => () => clearTimeout(alertTimer.current), []);

    // Early pagination leftof
    useEffect(() => {
        if (props.alertMessage) showAlert(props.alertMessage, "success");
    }, [props.userPagination, props.alertMessage, showAlert]);

    const applyResult = useCallback((result) => {
        setAntrianData(result.data);
        setPending(new Set(result.pending));
        setTotalPages(result.totalPages);
    }, []);

    // One loader for both sources: a date filter has to survive a page or rows-per-page
    // change, so the endpoint is picked here rather than at the input.
    // quiet skips the blank-and-spinner, for refreshes that only resync a list already on screen.
    // Every view is served from cache first and revalidated behind it, so switching back to a
    // tab or page costs no Sheets read - the route re-reads both antrian sheets on every call.
    const fetchAntrianData = useCallback(async (page, { quiet = false } = {}) => {
        const key = `${kategori}|${page}|${rowsPerPage}|${datePrefix}`;
        // A quiet refresh only ever follows a change, and a delete shifts rows across pages
        if (quiet) cacheRef.current.clear();
        const cached = quiet ? null : cacheRef.current.get(key);
        if (cached) {
            applyResult(cached);
        } else if (!quiet) {
            setAntrianData([]);
            setIsLoading(true);
        }

        const params = { page, limit: rowsPerPage, username: user.name, kategori };
        try {
            const { data } = datePrefix
                ? await apiClient.get('/bendahara/filter-date', { params: { ...params, datePrefix } })
                : await apiClient.get('/bendahara/antrian', { params });
            const result = {
                data: data.data || [],
                pending: (data.pending || []).map(String),
                // The filter route counts pages itself; the plain list reports total rows
                totalPages: data.totalPages ?? Math.ceil((data.realAllAntrianRows || 0) / rowsPerPage),
            };
            cacheRef.current.set(key, result);
            applyResult(result);
        } catch (error) {
            cacheRef.current.delete(key);
            // 404 on the filter route means nothing matched that date, not a failed request
            const notFound = error.response?.status === 404;
            if (notFound) {
                applyResult({ data: [], pending: [], totalPages: 0 });
                if (!quiet) showAlert("Data tidak ditemukan.", "error");
            } else {
                console.error("Error fetching data.", error);
                // A failed revalidation leaves the cached rows up rather than blanking a working view
                if (!cached) {
                    applyResult({ data: [], pending: [], totalPages: 0 });
                    if (!quiet) showAlert("Gagal memuat data. Silakan coba lagi.", "error");
                }
            }
        } finally {
            setIsLoading(false); // otherwise a failed fetch leaves the spinner up for good
        }
    }, [datePrefix, rowsPerPage, kategori, user.name, showAlert, applyResult]);

    useEffect(() => {
        fetchAntrianData(currentPage);
    }, [currentPage, fetchAntrianData]);

    useEffect(() => {
        if (!pending.size) return;
        let attempts = 0;
        const timer = setInterval(async () => {
            if (++attempts > POLL_LIMIT) return clearInterval(timer);
            try {
                const { data } = await apiClient.get('/verifikasi/hasil-verif/pending');
                const stillPending = new Set((data.pending || []).map(String));
                if ([...pending].some(id => !stillPending.has(id))) fetchAntrianData(currentPage, { quiet: true });
            } catch { /* keep waiting */ }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [pending, currentPage, fetchAntrianData]);

    const rows = useMemo(
        () => antrianData.map(data => toTableRow(data, pending, currentPage)),
        [antrianData, pending, currentPage]
    );

    // Handling Pagination Change
    const handlePaginationChange = useCallback((event, value) => setCurrentPage(value), []);

    const selectTab = useCallback((value) => {
        setKategori(value);
        localStorage.setItem(TAB_KEY, value);
        setCurrentPage(1);
    }, []);

    const handleRowsPerPageChange = useCallback((value) => {
        setRowsPerPage(value);
        setCurrentPage(1); // the page count changes underneath, so an old page number is meaningless
    }, []);

    const { invisible } = props;
    const openDetail = useCallback((row) => invisible("detail-pengajuan", row.passData)(), [invisible]);
    const openEdit = useCallback((row) => invisible("edit-pengajuan", row.passData)(), [invisible]);

    // Handle delete button Popup
    const askDelete = useCallback((row) => {
        setDelData(row.passData);
        setIsDelPopup(true);
    }, []);
    const closeDelPopup = useCallback(() => setIsDelPopup(false), []);

    // Handle delete daftar-pengajuan
    async function handleDelPengajuan(){
        // Closing delete popup
        setIsDelPopup(false);
        const removed = delData;

        // Drop the row on the spot so the list reacts immediately, then let the request and
        // the resync happen behind it. Blanking the whole list and waiting made a delete feel
        // like a page load.
        setAntrianData(prev => prev.filter(row =>
            !(String(row[0]) === String(removed.keyword) && row[20] === removed.flow)
        ));

        // Send data to backend to be deleted
        try {
            // Ids are numbered per sheet, so the flow has to say which sheet to delete from
            const response = await apiClient.delete('/bendahara/delete-ajuan', { params: { tableKeyword: removed.keyword, flow: removed.flow } })
            if (response.status === 200){
                // The rows go even if their Drive files did not - do not call that a clean success
                response.data?.warning
                    ? showAlert(response.data.message, "warning")
                    : showAlert("Pengajuan berhasil dihapus.", "success");
            }
            fetchAntrianData(currentPage, { quiet: true });
        } catch (error) {
            console.log("Failed to send data.", error)
            showAlert("Pengajuan gagal dihapus.", "error");
            fetchAntrianData(currentPage, { quiet: true }); // puts the row back
        }
    }

    // Handling Filters
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
        setDatePrefix(""); // a prefix from the other mode would outlive the input that made it
        setCurrentPage(option === "" ? (props.userPagination || 1) : 1);
    }

    function handleFilterInputChange(event) {
        setDatePrefix(event.target.value);
        setCurrentPage(1);
    }

    // The spreadsheet is scoped to one year, so the month alone gives the YYYY-MM prefix the
    // route matches on. Read from the key apiClient sends, or filter and fetch disagree.
    function handleFilterMonthChange(event) {
        const month = event.target.value;
        const year = localStorage.getItem('poriku-selected-year') || new Date().getFullYear().toString();
        setDatePrefix(month ? `${year}-${month}` : "");
        setCurrentPage(1);
    }

    return (
        <div className="pengajuan bg-card">
        {isAlert && <PopupAlert isAlert={isAlert} severity={alertMessage.severity} message={alertMessage.message} />}
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label1">Filter dengan:</label>
                    <div className="filter-select">
                        <select onChange={handleFilterChange}>
                            <option value=""/>
                            <option value="month">Bulan</option>
                            <option value="date">Tanggal</option>
                        </select>
                    </div>
                    <label className="filter-label2">Opsi Filter:</label>
                    {filterSelect === "month" &&
                        <select className="filter-input1" onChange={handleFilterMonthChange}>
                            {monthNames.map(month =>
                                <option key={month.value} value={month.value}>{month.title}</option>)}
                        </select>}
                    {filterSelect === "date" &&
                        <input className="filter-input1" type="date" onChange={handleFilterInputChange} />}
                </form>
            </div>
            <div>
            <div className="dp-tabs" role="tablist">
                {TABS.map(tab => (
                    <button key={tab.kategori} type="button" role="tab" aria-selected={tab.kategori === kategori}
                        onClick={() => selectTab(tab.kategori)}
                        className={`kelola-tab${tab.kategori === kategori ? " kelola-tab-active" : ""}`}>
                        {tab.label}
                    </button>
                ))}
            </div>
            <TableDaftarPengajuan
                rows={rows}
                loading={isLoading}
                page={currentPage}
                totalPages={totalPages}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={rowsPerPageOptions}
                onPageChange={handlePaginationChange}
                onRowsPerPageChange={handleRowsPerPageChange}
                onView={openDetail}
                onEdit={openEdit}
                onDelete={askDelete}
            />
            </div>
            {isDelPopup && <Popup type="delete" whenCancel={closeDelPopup} whenDel={handleDelPengajuan}/>}
        </div>
    )
}

//Proptypes
DaftarPengajuan.propTypes = {
    alertMessage: PropTypes.string,
    invisible: PropTypes.func,
    userPagination: PropTypes.number,
};

export default DaftarPengajuan;
