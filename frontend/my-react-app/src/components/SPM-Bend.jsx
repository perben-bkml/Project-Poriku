import React, { useState, useEffect, cloneElement } from 'react';
import axios from 'axios';
// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
// Other Material UI components
import CircularProgress from '@mui/material/CircularProgress';

function InfoSPMBendahara() {
    // State
    const [sheetTimer, setSheetTimer] = useState(Date.now());
    const [notPaidSPM, setNotPaidSPM] = useState([]);
    const [rincianSearch, setRincianSearch] = useState({
        startDate: "",
        endDate: "",
        selectJenis: "GUP", //Default select option
        selectStatus: "DANA BELUM MASUK", //Default select option
        satkerName: "BIRO UMUM"
    })
    const [rincianData, setRincianData] = useState([]);
    const [isLoading1, setIsLoading1] = useState(false);
    const [isLoading2, setIsLoading2] = useState(false);
    // Other holders
    const jenisSPM = ["GUP", "GUP NIHIL", "GUP KKP JKT", "GUP KKP ZOBAR", "GUP KKP ZOTIM", "GUP KKP JALDIS", "TUP", "GTUP NIHIL", "PENGEMBALIAN TUP", "LS JALDIS", "LS HONORARIUM", "UP"];
    const statusSPM = ["DANA BELUM MASUK", "DANA DI REK BPP", "SELESAI", "TUP ON GOING"];

    // Fetch data SPM yang belum selesai dibayarkan
    async function fetchNotPaidSPM() {
        try {
            setIsLoading1(true);
            const response = await axios.get("http://localhost:3000/bendahara/spm-belum-bayar")
            if (response.status === 200){
                setNotPaidSPM(response.data.data)
                setIsLoading1(false);
            }

        } catch (error) {
            console.log("Failed fetching data.", error)
        }
    }
    useEffect(() =>{
        fetchNotPaidSPM()
    }, [])

    // Cari Nomor SPM
    async function handleCariBtn() {
        try {
            let cariSPM = document.getElementsByName("cari-input")[0].value;
            if (cariSPM !== "") {
                const response = await axios.patch("http://localhost:3000/bendahara/cari-spm", {data: cariSPM});
                if (response.status === 200){
                    setSheetTimer(Date.now());
                }
            } else {
                null;
            }
        } catch (error) {
            console.log("Error sending data.", error)
        }
    }

    // Handle rincian data
    function handleChange1(event) {
        setRincianSearch({
            ...rincianSearch,
            [event.target.name]: event.target.value,
        });
    };

    // Cari Rincian SPM
    async function handleRincianSubmit(event) {
        event.preventDefault();
        try {
            setIsLoading2(true);
            const response = await axios.post("http://localhost:3000/bendahara/cari-rincian", rincianSearch)
            if (response.status === 200) {
                setRincianData(response.data.data);
                setIsLoading2(false);
            }
        } catch (error) {
            console.log("Error Sending Rincian.", error)
        }
    }


    return (
        <div className='spm-bend-container'>
            <div className='bg-card spm-bend'>
                <div className='cari spm-container'>
                    <h2 className='spm-titles'>Cari SPM </h2>
                    <label className='cari-label'>Masukkan Nomor SPM: </label>
                    <input className='cari-input' name='cari-input' type="number" placeholder='Nomor SPM'></input>
                    <button className='cari spm-button' onClick={handleCariBtn}>Cari</button>
                    <button className='cari spm-button' onClick={() => setSheetTimer(Date.now())}>Refresh</button>
                </div>
                <div className='embed-container'>
                    <iframe 
                        className='cari-spm'
                        key={sheetTimer}
                        src={`https://docs.google.com/spreadsheets/d/e/2PACX-1vSR6HX2hJILNVE3RJjvDNVK27mvdScy09EzM1wnwi1J42CMUi1H9eI02VwKfLcKdndCZQIUPTXqDkAJ/pub?output=html&gid=1715874875&range=C9:K10&amp;single=true&amp;widget=true&amp;headers=false&nocache=${sheetTimer}`}
                    ></iframe>
                </div>
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>SPM Yang Belum Selesai Dibayarkan</h2>
                {isLoading1 ? <div className="loading-antri"><CircularProgress size="60px" thickness={4}/></div>:
                <TableContainer sx={{ maxWidth: "94%", margin: "auto", marginTop:"20px", marginBottom:"20px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: "#1a284b" }}>
                                {notPaidSPM.length > 0 && notPaidSPM[0].map((col, colIndex) => (
                                    <TableCell className="table-cell head-data" key={colIndex} sx={{fontWeight: 550, color:"white"}} align="center">{col}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {notPaidSPM.length > 0 && notPaidSPM.slice(1).map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <TableCell className="table-cell" key={cellIndex}>{cell}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                }
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>Rincian SPM Melalui Bendahara</h2>
                <form id="filter-form" className='rincian-filter' onSubmit={handleRincianSubmit}>
                    <h3 className='rincian-filter-title'>Tanggal</h3>
                    <h3 className='rincian-filter-title'>Jenis</h3>
                    <div className='rincian-filter-details'>
                        <label>Dari:</label>
                        <input type='date' name="startDate" value={rincianSearch.startDate} onChange={handleChange1} required></input>
                        <label>Sampai:</label>
                        <input type='date' name="endDate" value={rincianSearch.endDate} onChange={handleChange1} required></input>
                    </div>
                    <div className='rincian-filter-details'>
                        <label>Jenis SPM:</label>
                        <select name="selectJenis" value={rincianSearch.selectJenis} onChange={handleChange1} id="selJenis">
                            {jenisSPM.map((data, index) => (
                                <option value={data} key={index}>{data}</option>
                            ))}
                        </select>
                        <label>Status:</label>
                        <select name="selectStatus" value={rincianSearch.selectStatus} onChange={handleChange1} id="selStatus">
                            {statusSPM.map((data, index) => (
                                <option value={data} key={index}>{data}</option>
                            ))}
                        </select>
                    </div>
                </form>
                <input type="submit" className='spm-button rincian' form="filter-form" value="Cari" style={{marginBottom: "20px"}}/>
                {isLoading2 ? <div className="loading-antri"><CircularProgress size="60px" thickness={4}/></div>:
                    <TableContainer sx={{ maxWidth: "94%", margin: "auto", marginTop:"10px", marginBottom:"20px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: "#1a284b" }}>
                                    {rincianData.length > 0 && rincianData[0].map((col, colIndex) => (
                                        <TableCell className="table-cell head-data" key={colIndex} sx={{fontWeight: 550, color:"white"}} align="center">{col}</TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                            {rincianData.length > 0 && rincianData.slice(1).map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <TableCell className="table-cell" key={cellIndex}>{cell}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                }
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>Informasi Rekening Koran</h2>
                <div className='embed-container embed2'>
                    <iframe 
                        className='cari-spm rincian-spm'
                        src={`https://docs.google.com/spreadsheets/d/e/2PACX-1vSR6HX2hJILNVE3RJjvDNVK27mvdScy09EzM1wnwi1J42CMUi1H9eI02VwKfLcKdndCZQIUPTXqDkAJ/pub?output=html&gid=1715874875&range=B48:H70&amp;single=true&amp;widget=true&amp;headers=false`}
                    ></iframe>
                </div>
            </div>
        </div>
    )
}

export default InfoSPMBendahara;