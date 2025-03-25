import React, { useState, useEffect } from "react";
import axios from "axios";
// Import components
import Pengajuan from "../ui/Pengajuan-Info";
import Popup from "../ui/Popup";
import { PopupAlert } from "../ui/Popup";
// Import material UI
import Pagination from '@mui/material/Pagination';
// Import Progress Material UI
import CircularProgress from '@mui/material/CircularProgress';
import PropTypes from "prop-types";


function DaftarPengajuan(props){
    // States
    const [antrianData, setAntrianData] = useState([]);
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
        // if (props.userPagination) {
        //     setCurrentPage(props.userPagination);
        // }
        if (props.alertMessage) {
            setIsAlert(true);
            setAlertMessage({message: props.alertMessage, severity: "success"});
            setTimeout(() => setIsAlert(false), 3000);
        }
    }, [props.userPagination, props.alertMessage]);

    // Fetching antrian data from Google Sheets
    const rowsPerPage = 5;
    async function fetchAntrianData (page) {
        try {
            setAntrianData([]);
            setIsLoading(true);
            const response = await axios.get("http://localhost:3000/bendahara/antrian", { params:{ page, limit: rowsPerPage }});
            if (response.status === 200){
                const { data: responseResult, realAllAntrianRows } = response.data;
                setIsLoading(false);
                setAntrianData(responseResult);
                setTotalPages(Math.ceil(realAllAntrianRows / rowsPerPage)); //Calculate total page based on real data on gsheet
            }
        } catch (error) {
            console.error("Error fetching data.", error);
        }
    }
    useEffect(() => {
        fetchAntrianData(currentPage);
    }, [currentPage]);

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
        // Send data to backend to be deleted
        try {
            setAntrianData([]);
            setIsLoading(true);
            const tableKeyword = delData.keyword
            const response = await axios.delete("http://localhost:3000/bendahara/delete-ajuan", { params: { tableKeyword } })
            if (response.status === 200){
                fetchAntrianData(currentPage);
                setIsAlert(true);
                setAlertMessage({message: "Pengajuan berhasil dihapus.", severity: "success"});
                setTimeout(() => setIsAlert(false), 3000);
            }
        } catch (error) {
            console.log("Failed to send data.", error)
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
            const response = await axios.get("http://localhost:3000/bendahara/filter-date", { params:{ datePrefix, page: 1, limit: rowsPerPage }});
            if (response.status === 200){
                const { data: rowData, totalPages } = response.data;
                setAntrianData(rowData);
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