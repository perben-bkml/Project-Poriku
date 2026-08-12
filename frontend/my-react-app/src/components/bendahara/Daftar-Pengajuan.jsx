import React, {useState, useEffect, useContext} from "react";
import apiClient from "../../lib/apiClient";
// Import components
import Pengajuan from "../../ui/Pengajuan-Info.jsx";
import Popup from "../../ui/Popup.jsx";
import { PopupAlert } from "../../ui/Popup.jsx";
import { AuthContext } from "../../lib/AuthContext";
// Import material UI
import Pagination from '@mui/material/Pagination';
// Import Progress Material UI
import CircularProgress from '@mui/material/CircularProgress';
import PropTypes from "prop-types";


const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT = 15;

function DaftarPengajuan(props){
    //Context
    const { user } = useContext(AuthContext)

    // States
    const [antrianData, setAntrianData] = useState([]);
    const [pending, setPending] = useState(new Set());
    const [currentPage, setCurrentPage] = useState(props.userPagination || 1);
    const [totalPages, setTotalPages] = useState(0);
    const [filterSelect, setFilterSelect] = useState("")
    const [isDelPopup, setIsDelPopup] = useState(false);
    const [delData, setDelData] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState({
        message: "",
        severity: ""
    });

    // Early pagination leftof
    useEffect( () => {
        if (props.alertMessage) {
            setIsAlert(true);
            setAlertMessage({message: props.alertMessage, severity: "success"});
            setTimeout(() => setIsAlert(false), 3000);
        }
    }, [props.userPagination, props.alertMessage]);

    // Fetching antrian data from Google Sheets
    const rowsPerPage = 5;
    // quiet skips the blank-and-spinner, for refreshes that only resync a list already on screen
    async function fetchAntrianData (page, { quiet = false } = {}) {
        try {
            if (!quiet) {
                setAntrianData([]);
                setIsLoading(true);
            }
            const response = await apiClient.get('/bendahara/antrian', { params:{ page, limit: rowsPerPage, username: user.name }});
            if (response.status === 200){
                const { data: responseResult, realAllAntrianRows } = response.data;
                setIsLoading(false);
                setAntrianData(responseResult.reverse());
                setPending(new Set((response.data.pending || []).map(String)));
                setTotalPages(Math.ceil(realAllAntrianRows / rowsPerPage)); //Calculate total page based on real data on gsheet
            }
        } catch (error) {
            console.error("Error fetching data.", error);
            setIsLoading(false); // otherwise a failed fetch leaves the spinner up for good
        }
    }
    useEffect(() => {
        fetchAntrianData(currentPage);
    }, [currentPage]);

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
    }, [pending, currentPage]);

    // Handling Pagination Change
    function handlePaginationChange(event, value) {
        setCurrentPage(value);
    }

    // Handle delete button Popup
    function handleDelPopup(passedData){
        if (!isDelPopup) {
            setIsDelPopup(true);
            setDelData(passedData);
        } else {
            setIsDelPopup(false);
        }
    }
    // Handle delete daftar-pengajuan
    async function handleDelPengajuan(){
        // Closing delete popup
        handleDelPopup();
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
                setIsAlert(true);
                setAlertMessage(response.data?.warning
                    ? {message: response.data.message, severity: "warning"}
                    : {message: "Pengajuan berhasil dihapus.", severity: "success"});
                setTimeout(() => setIsAlert(false), 3000);
            }
            fetchAntrianData(currentPage, { quiet: true });
        } catch (error) {
            console.log("Failed to send data.", error)
            setIsAlert(true);
            setAlertMessage({message: "Pengajuan gagal dihapus.", severity: "error"});
            setTimeout(() => setIsAlert(false), 3000);
            fetchAntrianData(currentPage, { quiet: true }); // puts the row back
        }

    }

    // Handling Filters
    function handleFilterChange(event) {
        const option = event.target.value;
        setFilterSelect(option);
        if (option === "") {
            fetchAntrianData(props.userPagination || currentPage)
        }
    }

    async function handleFilterInputChange(event) {
        const datePrefix = event.target.value;
        try {
            setAntrianData([]);
            setIsLoading(true);
            const response = await apiClient.get('/bendahara/filter-date', { params:{ datePrefix, page: 1, limit: rowsPerPage, username: user.name }});
            if (response.status === 200){
                const { data: rowData, totalPages } = response.data;
                setAntrianData(rowData);
                setPending(new Set((response.data.pending || []).map(String)));
                setTotalPages(totalPages); //Calculate total page based on real data on gsheet
            }
            setIsLoading(false);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                setAlertMessage({message: "Data tidak ditemukan.", severity: "error"});
                setIsAlert(true);
                setIsLoading(false);
                setTimeout(() => setIsAlert(false), 3000);
            } else {
                setAlertMessage({message: "An error occurred while fetching data. Please try again.", severity: "error"});
                setIsAlert(true);
                setIsLoading(false);
                setTimeout(() => setIsAlert(false), 3000);
            }
        }
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
                    <input className="filter-input1" type={filterSelect === "" ? "hidden" : filterSelect } onChange={handleFilterInputChange} />
                </form>
            </div>
            <div className="pengajuan-content">
                {isLoading && <div className="loading-daftar"><CircularProgress size="60px" thickness={4}/></div>}
                {[...antrianData].reverse().map((data, index) => 
                    <Pengajuan 
                    key={index} 
                    numbers={data[0]}
                    createDate={data[1]}
                    accDate={data[6]}
                    status={data[7]}
                    drpp={data[8]}
                    userPagination={currentPage}
                    // Below will be passed to Lihat-EditPengajuan
                    invisible={props.invisible}
                    antriName={data[2]}
                    antriType={data[3]}
                    antriSum={data[4]}
                    antriDate={data[5]}
                    handleDelPopup={handleDelPopup}
                    fileLink={data[19]}
                    flow={data[20]}
                    pjkLink={data[21]}
                    spp={data[9]}
                    catatan={data[16]}
                    pjkCatatan={data[22]}
                    hasilVerif={data[23]}
                    hasilVerifPending={pending.has(String(data[24]))}
                    />)}
            </div>
            <Pagination className="pagination" size="medium" count={totalPages} page={currentPage} onChange={handlePaginationChange} />
            {isDelPopup && <Popup type="delete" whenCancel={handleDelPopup} whenDel={handleDelPengajuan}/>}
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
