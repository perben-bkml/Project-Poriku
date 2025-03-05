import React, { useState, useEffect } from "react";
import axios from "axios";
//Import components;
import { columns } from "./head-data";
import { TableKelola } from "../ui/tables";
import LoadingAnimate from "../ui/loading";

function AksiPengajuan(props) {
    
    //States
    const [isLoading, setIsLoading] = useState(false)
    const [tableData, setTableData] = useState([])
    const [antriData, setAntriData] = useState({
        ajuan_verifikasi: "",
        tgl_verifikasi: "",
        status_pajak: "",
        sedia_anggaran: "",
        tgl_setuju: "",
        drpp: "",
        spp: "",
        spm: "",
    })  

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

    if (tableData == [] || !props.fulldata) {
        return <LoadingAnimate />
    }

    async function fetchAntrianTable() {
        try {
            setIsLoading(true);
            const tableKeyword = `TRANS_ID:${props.fulldata[0]}`
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
            }
            setIsLoading(false);
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    useEffect(() => {
        fetchAntrianTable();
        console.log(props.fulldata)
    }, [])

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
        setAntriData({...antriData, 
            [name]: value 
        })
    }

    //Submit Handler
    async function handleOnSubmit(event){
        event.preventDefault()
        console.log(antriData)
    }

    return (
        <div className="aksi-pengajuan-container">
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Informasi Antrian</h2>
                <div className="aksi-content-grab-data">
                    <h4>No. Antri:</h4>
                    <p>Test</p>
                    <h4>Nama:</h4>
                    <p>Test</p>
                    <h4>Jenis:</h4>
                    <p>Test</p>
                    <h4>Tgl. Antri:</h4>
                    <p>Test</p>
                    <h4>Status:</h4>
                    <p>Test</p>
                    <h4>Satker:</h4>
                    <p>Test</p>
                    <h4>Nominal:</h4>
                    <p>test</p>
                    <h4>Tgl. Request:</h4>
                    <p>Test</p>
                </div>
                <form onSubmit={e => handleOnSubmit(e)}>
                <div className="aksi-content-label">
                    <label htmlFor="aju-verif">Sedang Di Verifikasi?</label>
                    <select id="aju-verif" className="type-btn" name="ajuan_verifikasi" onChange={e => handleInputChange(e.target)}> 
                        <option value="FALSE">Belum</option>
                        <option value="TRUE">Iya</option>
                    </select>
                    <label htmlFor="tgl-verif">Tanggal Selesai Verifikasi</label>
                    <input id="tgl-verif" className="type-btn" type="date" name="tgl_verifikasi"  onChange={e => handleInputChange(e.target)} />
                    <label htmlFor="sts-pajak">Status Pajak</label>
                    <select id="sts-pajak" className="type-btn" name="status_pajak" onChange={(e) => (selectPajakBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionPajak.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="anggaran">Ketersediaan Anggaran</label>
                    <select id="anggaran" className="type-btn" name="sedia_anggaran" onChange={(e) => (selectAnggaranBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionAnggaran.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="tgl-acc">Tanggal Disetujui</label>
                    <input id="tgl-acc" className="type-btn" type="date" name="tgl_setuju" onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="drpp">Nomor DRPP</label>
                    <input id="drpp" className="type-btn" type="number" name="drpp" onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="spp">Nomor SPP</label>
                    <input id="spp" className="type-btn" type="number" name="spp" onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="spm">Nomor SPM</label>
                    <input id="spm" className="type-btn" type="number" name="spm" onChange={e => handleInputChange(e.target)}/>
                </div>
                <div className="form-submit aksi-submit">
                    <input type="submit" value="Kembali" />
                    <input type="submit" value="Simpan" />
                </div>
                </form>
            </div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Ajuan</h2>
                <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData} />
            </div>
        </div>
    )
}

export default AksiPengajuan;