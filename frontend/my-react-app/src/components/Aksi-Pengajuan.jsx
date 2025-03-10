import React, { useState, useEffect } from "react";
import axios from "axios";
//Import components;
import { columns, infoHeadData } from "./head-data";
import { TableKelola, TableInfoAntri } from "../ui/tables";
import LoadingAnimate, { LoadingScreen } from "../ui/loading";
import Popup from "../ui/Popup";

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
    })
    //State for aju-verif select
    const [verifValue, setVerifValue] = useState("FALSE")

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
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                setIsTableLoading(false)
            }
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    useEffect(() => {
        fetchAntrianTable();
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
    }, [antriData.sedia_anggaran, antriData.status_pajak]);

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
        };
        setAntriData((prevdata) => ({...prevdata, 
            [name]: value 
        }));

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
        try {
            handlePopup();
            setIsLoading(true);
            const result = await axios.post("http://localhost:3000/bendahara/aksi-ajuan", antriData)
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
                    <input id="tgl-verif" className="type-btn" type="date" name="tgl_verifikasi" defaultValue={antriData.tgl_verifikasi} onChange={e => handleInputChange(e.target)} />
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
                    <input id="tgl-acc" className="type-btn" type="date" name="tgl_setuju" defaultValue={antriData.tgl_setuju} onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="drpp">Nomor DRPP</label>
                    <input id="drpp" className="type-btn" type="text" name="drpp" placeholder={antriData.drpp} onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="spp">Nomor SPP</label>
                    <input id="spp" className="type-btn" type="number" name="spp" placeholder={antriData.spp} onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="spm">Nomor SPM</label>
                    <input id="spm" className="type-btn" type="number" name="spm" placeholder={antriData.spm} onChange={e => handleInputChange(e.target)}/>
                </div>
                <div className="form-submit aksi-submit">
                    <input type="button" value="Kembali" onClick={() => props.changeComponent("kelola-pengajuan")}/>
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

export default AksiPengajuan;