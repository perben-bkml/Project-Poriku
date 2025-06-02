import React, { useState, useEffect, useContext } from 'react';
// Import Head Data
import { jenisSPM, statusSPM, satkerNames } from './head-data.js';
// Import Made UI
import { TableSpmBendahara } from '../../ui/tables.jsx';
import LoadingAnimate from '../../ui/loading.jsx';
// Import Functions
import { fetchNotPaidSPM, handleCariBtn, handleRincianSubmit } from '../../lib/fetches.js';
import { AuthContext } from '../../lib/AuthContext.jsx';

function InfoSPMBendahara() {
    // Use Context
    const { user } = useContext(AuthContext);

    // State
    const [sheetTimer, setSheetTimer] = useState(Date.now());
    const [notPaidSPM, setNotPaidSPM] = useState([]);
    const [rincianSearch, setRincianSearch] = useState({
        startDate: "",
        endDate: "",
        selectJenis: "GUP", //Default select option
        selectStatus: "DANA BELUM MASUK", //Default select option
        satkerName: ""
    })
    const [rincianData, setRincianData] = useState([]);
    const [isLoading1, setIsLoading1] = useState(false);
    const [isLoading2, setIsLoading2] = useState(false);

    // Fetch data SPM yang belum selesai dibayarkan on page load
    useEffect(() => {
        fetchNotPaidSPM(setNotPaidSPM, setIsLoading1);
        if (user.role === "user") {
            let satkerPrefix = satkerNames.find(item => item.title === user.name).value || "";
            setRincianSearch(prev => ({
                ...prev,
                satkerName: satkerPrefix,
            }))
        }
    }, []);

    // Handle rincian data
    function handleChange1(event) {
        setRincianSearch({
            ...rincianSearch,
            [event.target.name]: event.target.value,
        });
    }

    // Satker Option for admin
    function SatkerOption() {
        return (
            <div className='rincian-filter-details rincian-filter-satker'>
                <label>Satker:</label>
                <select name="satkerName" value={rincianSearch.satkerName} onChange={handleChange1} id="satkerName">
                    {satkerNames.map((data, index) => (
                        <option value={data.value} key={index}>{data.title}</option>
                    ))}
                </select>
            </div>
        )
    }


    return (
        <div className='spm-bend-container'>
            <div className='bg-card spm-bend'>
                <div className='cari spm-container'>
                    <h2 className='spm-titles'>Cari SPM </h2>
                    <label className='cari-label'>Masukkan Nomor SPM: </label>
                    <input className='cari-input' name='cari-input' type="number" placeholder='Tulis disini'></input>
                    <button className='cari spm-button' onClick={() => handleCariBtn(setSheetTimer)}>Cari</button>
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
                {isLoading1 ? <LoadingAnimate />:
                    <TableSpmBendahara tableData={notPaidSPM}/>
                }
            </div>
            <div className='bg-card spm-bend'>
                <h2 className='spm-titles'>Rincian SPM Melalui Bendahara</h2>
                <form id="filter-form" className='rincian-filter' onSubmit={(e) => handleRincianSubmit(e, setIsLoading2, setRincianData, rincianSearch)}>
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
                    { user.role === "admin" || user.role === "master admin" ?
                        <SatkerOption /> : null
                    }
                </form>
                <input type="submit" className='spm-button rincian' form="filter-form" value="Cari" style={{marginBottom: "20px"}}/>
                {isLoading2 ? <LoadingAnimate />:
                    <TableSpmBendahara tableData={rincianData}/>
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