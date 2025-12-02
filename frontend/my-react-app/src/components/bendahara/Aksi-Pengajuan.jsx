import React, { useState, useEffect } from "react";
import axios from "axios";
import PropTypes from "prop-types";
//Import components;
import { columns, infoHeadData } from "./head-data.js";
import { TableKelola, TableInfoAntri } from "../../ui/tables.jsx";
import LoadingAnimate, { LoadingScreen } from "../../ui/loading.jsx";
import Popup from "../../ui/Popup.jsx";

function AksiPengajuan(props) {

    //States
    const [isLoading, setIsLoading] = useState(false)
    const [isTableLoading, setIsTableLoading] = useState(false)
    const [isPopup, setIsPopup] = useState(false)
    const [tableData, setTableData] = useState([])
    const [antriData, setAntriData] = useState({
        no_antri: "",
        ajuan_verifikasi: "",
        tgl_verifikasi: "",
        status_pajak: "",
        sedia_anggaran: "",
        tgl_setuju: "",
        drpp: "",
        spp: "",
        spm: "",
        catatan: "",
        lampiran: "",
    })
    const [documentData, setDocumentData] = useState([{
        drpp: "", nominal: "", spp: "", spm: "",
    }])
    //State for aju-verif select
    const [verifValue, setVerifValue] = useState("FALSE")
    const [drppProcess, setDrppProcess] = useState(false)

    //Options Data
    const optionPajak = [
        {label: "", color: "white", textcolor: "white"},
        {label: "OK", color: "#9FFFC3", textcolor: "#0F9043"},
        {label: "Belum ada bukti potong", color: "#C7B6A7", textcolor: "#5E4C3B"},
        {label: "Belum ada faktur pajak", color: "#3D3630", textcolor: "#C7B6A7"},
        {label: "Jenis pajak salah", color: "#F3B5B5", textcolor: "#8B0808"}, 
        {label: "Perhitungan Salah", color: "#EB2727", textcolor: "#EEC6C6"},]

    const optionAnggaran = [
        {label: "", color: "white", textcolor: "white"},
        {label: "OK", color: "#9FFFC3", textcolor: "#0F9043"},
        {label: "Pagu Minus", color: "#EB2727", textcolor: "#EEC6C6"},
    ]

    async function fetchAntrianTable() {
        try {
            setIsTableLoading(true)
            const tableKeyword = `TRANS_ID:${props.fulldata[0]}`
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/data-transaksi`, { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                setIsTableLoading(false)
            }
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    async function fetchMonitoringData() {
        try {
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/get-ajuan`, {
                params: { trans_id: props.fulldata[0], spm: props.fulldata[10] },
            });
            if (response.status === 200) {
                const firstDRPP = response.data.data[0].drpp;
                if (firstDRPP !== '') {
                    setDocumentData(response.data.data || []);
                    setDrppProcess(true);
                }
            }
        } catch (error) {
            console.error("Error fetching monitoring data", error);
        }
    }


    useEffect(() => {
        fetchAntrianTable();
        fetchMonitoringData();
        setAntriData({
            no_antri: props.fulldata[0],
            ajuan_verifikasi: props.fulldata[14] === "" ? "FALSE" : "TRUE",
            tgl_verifikasi: props.fulldata[15],
            status_pajak: props.fulldata[12] ,
            sedia_anggaran: props.fulldata[13],
            tgl_setuju: props.fulldata[6],
            drpp: props.fulldata[8],
            spp: props.fulldata[9],
            spm: props.fulldata[10],
            catatan: props.fulldata[16],
            lampiran: props.fulldata[19],
        });
    }, [])

    //Automatically change background color for select tag
    useEffect(() => {
        setVerifValue(antriData.ajuan_verifikasi)
        if (antriData.sedia_anggaran) {
            const selectElement = document.getElementById("anggaran");
            if (selectElement) {
                selectAnggaranBackgroundColor(selectElement);
            }
        }
        if (antriData.status_pajak) {
            const selectElement = document.getElementById("sts-pajak");
            if (selectElement) {
                selectPajakBackgroundColor(selectElement);
            }
        }
    }, [antriData]);

    //Number format generator
    function numberFormats(num) {
        if (!num) {
            return "";
        }
        // Remove all non-numeric characters (except numbers)
        const numericValue = num.toString().replace(/\D/g, "");

        // Format with periods as thousand separators
        return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    //Handle Select Tag style change
    function selectPajakBackgroundColor(select) {
        const selectedOption = select.options[select.selectedIndex];
        const findColor = optionPajak.find(data => data.label === selectedOption.value)
        select.style.backgroundColor = findColor.color;
        select.style.color= findColor.textcolor;
    }
    function selectAnggaranBackgroundColor(select) {
        const selectedOption = select.options[select.selectedIndex];
        const findColor = optionAnggaran.find(data => data.label === selectedOption.value)
        select.style.backgroundColor = findColor.color;
        select.style.color= findColor.textcolor;
    }

    //Handle Input Change
    function handleInputChange(event){
        const {name, value} = event
        if (name === "ajuan_verifikasi") {
            setVerifValue(value)
        }
        setAntriData((prevdata) => ({...prevdata, 
            [name]: value 
        }));

    }

    function handleDocInputChange(event, index) {
        const { name, value } = event;
        let formattedValue = value;
        if (name === "nominal") {
            formattedValue = numberFormats(value);
        }
        const updatedRows = [...documentData];
        updatedRows[index][name] = name === "nominal" ? formattedValue : value;
        setDocumentData(updatedRows);
    }

    function dateDoubleClick(event) {

        if (event.name === "tgl_verifikasi") {
            setAntriData((prevdata) => ({...prevdata,
                [event.name]: ""
            }));
        }
        if (event.name === "tgl_setuju") {
            setAntriData((prevdata) => ({...prevdata,
                [event.name]: ""
            }));
        }
    }

    // Add and Delete Row For Document inputs
    function addNewRow(e) {
        e.preventDefault();
        setDocumentData([...documentData, { drpp: "", nominal: "", spp: "", spm: "" }]);
    }

    function deleteRow(e) {
        e.preventDefault();
        if (documentData.length === 1) return; // Prevent deleting the last row
        setDocumentData(prevRows => prevRows.slice(0, -1));
    }


    //Handle Popup
    function handlePopup() {
        if (!isPopup) {
            setIsPopup(true);
        } else {
            setIsPopup(false);
        }
    }

    //Compile Info Antrian table data
    const infoTableData = [
        props.fulldata[0], 
        props.fulldata[2],
        props.fulldata[3],
        props.fulldata[1],
        props.fulldata[7],
        props.fulldata[11],
        props.fulldata[4],
        props.fulldata[5],
    ]

    //Submit Handler
    async function handleOnSubmit(){
        const drppArray = documentData.map(row => row.drpp).join(", ");
        const sppArray = documentData.map(row => row.spp).filter(spp => spp.trim() !== "");
        const sppString = [...new Set(sppArray)].join(", ");

        const spmArray = documentData.map(row => row.spm).filter(spm => spm.trim() !== "");
        const spmString = [...new Set(spmArray)].join(", ");

        const updatedAntriData = {
            ...antriData,
            drpp: drppArray, 
            spp: sppString,
            spm: spmString,
        };

        const nominalArray = documentData.map(row => row.nominal).join(", ");
        const spmArrayString = documentData.map(row => row.spp).join(", ");
        let monitoringDrppData = null
        if (drppProcess) {
            monitoringDrppData = {
                trans_id: props.fulldata[0],
                satker: props.fulldata[11],
                nominal: nominalArray,
                jenis: props.fulldata[3],
                spmDrpp: spmArrayString,
            }
        }

        const sendData = {
            updatedAntriData,
            monitoringDrppData,
        }

        try {
            handlePopup();
            setIsLoading(true);
            const result = await axios.post(`${import.meta.env.VITE_API_URL}/bendahara/aksi-ajuan`, sendData)
            if (result.status === 200) {
                props.changeComponent("kelola-pengajuan")
                setIsLoading(false)
            }
        } catch (error) {
            console.log("Failed sending Data.", error)
        }
    }

    return (
        <div className="aksi-pengajuan-container">
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Informasi Antrian</h2>
                <TableInfoAntri header={infoHeadData} body={infoTableData}/>
                <form>
                <div className="aksi-content-label">
                    <label htmlFor="aju-verif">Sedang Di Verifikasi?</label>
                    <select id="aju-verif" className="type-btn" name="ajuan_verifikasi" value={verifValue} onChange={e => handleInputChange(e.target)}>
                        <option value="FALSE">Belum</option>
                        <option value="TRUE">Iya</option>
                    </select>
                    <label htmlFor="tgl-verif">Tanggal Selesai Verifikasi</label>
                    <input id="tgl-verif" className="type-btn" type="date" name="tgl_verifikasi" defaultValue={antriData.tgl_verifikasi} onChange={e => handleInputChange(e.target)} onDoubleClick={e=> dateDoubleClick(e.target)} />
                    <label htmlFor="sts-pajak">Status Pajak</label>
                    <select id="sts-pajak" className="type-btn" name="status_pajak" value={!props.fulldata ? null : antriData.status_pajak} onChange={(e) => (selectPajakBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionPajak.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="anggaran">Ketersediaan Anggaran</label>
                    <select id="anggaran" className="type-btn" name="sedia_anggaran" value={!props.fulldata ? null : antriData.sedia_anggaran} onChange={(e) => (selectAnggaranBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionAnggaran.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="tgl-acc">Tanggal Disetujui</label>
                    <input id="tgl-acc" className="type-btn" type="date" name="tgl_setuju" defaultValue={antriData.tgl_setuju} onChange={e => handleInputChange(e.target)} onDoubleClick={e=>dateDoubleClick(e.target)}/>
                    <label htmlFor="catatan">Catatan</label>
                    <textarea id="catatan" className="type-btn span-row" name="catatan" defaultValue={antriData.catatan} onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="buat-drpp">Buat DRPP?</label>
                    <input id="buat-drpp" className="type-btn" type="checkbox" name="buat_drpp" checked={drppProcess === true} defaultValue={antriData.tgl_setuju} onChange={() => !drppProcess ? setDrppProcess(true) : setDrppProcess(false)}/>
                </div>

                <div className="lampiran-aksi-pengajuan">
                    <p>Lampiran: <span className={"padd-span-bend"}/>{ antriData.lampiran !== "" ?
                        <a href={antriData.lampiran} target={"_blank"} rel="noopener noreferrer">Klik disini</a>: <a>-</a> }
                    </p>
                </div>
                { drppProcess &&
                <div className="aksi-content-docs">
                    <div className="docs-label">
                        <label htmlFor="drpp">Nomor DRPP</label>
                        <label htmlFor="nominal">Nominal</label>
                        <label htmlFor="spp">Nomor SPP</label>
                        <label htmlFor="spm">Nomor SPM</label>
                    </div>
                {documentData.map((row, index) => (
                    <div key={index} className="docs-input">
                        <input id="drpp" className="docs-btn" type="text" name="drpp" value={row.drpp} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="nominal" className="docs-btn" type="text" name="nominal" value={row.nominal} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="spp" className="docs-btn" type="text" name="spp" value={row.spp} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="spm" className="docs-btn" type="text" name="spm" value={row.spm} onChange={e => handleDocInputChange(e.target, index)}/>
                    </div>
                ))}
                    <div>
                        <button className="add-row-btn" onClick={(e) => addNewRow(e)}>Tambah Baris</button>
                        <button className="add-row-btn" onClick={(e) => deleteRow(e)} disabled={documentData.length === 1}>Hapus Baris</button>
                    </div>
                </div>
                }
                <div className="form-submit aksi-submit">
                    <input className={"button-reject"} type="button" value="Kembali" onClick={() => props.changeComponent("kelola-pengajuan")}/>
                    <input type="button" value="Simpan" onClick={handlePopup} />
                </div>
                </form>
            </div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Ajuan</h2>
                {isTableLoading ? <LoadingAnimate /> : 
                <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData} />
                }
            </div>
            {isPopup && <Popup type="submit" whenClick={handleOnSubmit} cancel={handlePopup}/>}
            {isLoading && <LoadingScreen />}
        </div>
    )
}

// Define PropTypes
AksiPengajuan.propTypes = {
    fulldata: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ])).isRequired, // Must be an array containing strings or numbers
    changeComponent: PropTypes.func.isRequired, // Must be a function
};


export default AksiPengajuan;
