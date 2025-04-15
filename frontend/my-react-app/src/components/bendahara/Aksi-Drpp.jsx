import React, {useEffect, useState} from "react";
import axios from "axios";
//Import components
import LoadingAnimate, { LoadingScreen } from "../../ui/loading.jsx";
import Popup from "../../ui/Popup.jsx";
import { TableInfoAntri, TableKelola } from "../../ui/tables.jsx";
import {columns, drppHeadData} from "./head-data.js";
import {SubmitButton} from "../../ui/buttons.jsx";



export default function AksiDrpp(props) {
    //States
    const [isLoading, setIsLoading] = useState(false)
    const [isTableLoading, setIsTableLoading] = useState(false)
    const [isPopup, setIsPopup] = useState(false)
    const [tableData, setTableData] = useState([])
    const [pajakStatus, setPajakStatus] = useState({
        pungutan: '',
        setoran: '',
    })

    //Setting Tablekelola data
    const drppData = [
        props.fulldata[0],
        props.fulldata[2],
        props.fulldata[3],
        props.fulldata[4],
        props.fulldata[5],
        props.fulldata[6],
        props.fulldata[7],
        props.fulldata[8],
        props.fulldata[9],
    ]

    //Select options
    const options = [
        { value: 'Belum', label: 'Belum', color: "#C7B6A7", textcolor: "#5E4C3B" },
        { value: 'Sudah', label: 'Sudah', color: "#9FFFC3", textcolor: "#0F9043" },
        { value: 'Ada Masalah', label: 'Ada Masalah', color: "#EB2727", textcolor: "#EEC6C6" },
        { value: 'Tidak Ada Pajak', label: 'Tidak Ada Pajak', color: "#F3B5B5", textcolor: "#8B0808" },
        { value: 'Pajak Manual', label: 'Pajak Manual', color: "#3D3630", textcolor: "#C7B6A7" },
    ]

    async function fetchAntrianTable() {
        try {
            setIsTableLoading(true)
            const tableKeyword = `TRANS_ID:${props.fulldata[1]}`
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                setIsTableLoading(false)
            }
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    //Handle Select Option colors
    function selectOptionBackgroundColor(select) {
        const selectedOption = select.options[select.selectedIndex];
        const findColor = options.find(data => data.label === selectedOption.value)
        select.style.backgroundColor = findColor.color;
        select.style.color= findColor.textcolor;
    }

    useEffect(() => {
        fetchAntrianTable();
        setPajakStatus({
            pungutan: props.fulldata[7],
            setoran: props.fulldata[8],
        });
    }, [])

    useEffect(() => {
        if (pajakStatus.pungutan) {
            const selectElement = document.getElementById("pungut");
            if (selectElement) {
                selectOptionBackgroundColor(selectElement);
            }
        }
        if (pajakStatus.setoran) {
            const selectElement = document.getElementById("setor");
            if (selectElement) {
                selectOptionBackgroundColor(selectElement);
            }
        }
    }, [pajakStatus.pungutan]);

    //Handle Select Changes
    function handleInputChange(event){
        const {name, value} = event
        setPajakStatus((prevdata) => ({...prevdata,
            [name]: value
        }));
    }

    //Handle submit button
    async function handleSubmit(){
        let numbers = { data: props.fulldata[0] };
        const sendData = {
            numbers,
            pajakStatus
        }
        try {
            handlePopup()
            setIsLoading(true)
            const response = await axios.post("http://localhost:3000/bendahara/aksi-drpp", sendData)
            if (response.status === 200) {
                setIsLoading(false)
                props.changeComponent("monitoring-drpp")
            }
        } catch (error) {
            console.log("Failed updating data.", error)
        }
    }

    //Handle Popup
    function handlePopup() {
        if (!isPopup) {
            setIsPopup(true);
        } else {
            setIsPopup(false);
        }
    }

    return (
        <div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Informasi DRPP</h2>
                <TableInfoAntri header={drppHeadData} body={drppData} />
                <div className="aksi-content-label drpp-content">
                    <label htmlFor='pungut'>Pungutan Pajak</label>
                    <select id='pungut' className='type-btn' name='pungutan' value={!props.fulldata ? null : pajakStatus.pungutan} onChange={(e) => (selectOptionBackgroundColor(e.target), handleInputChange(e.target))}>
                        {options.map ((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.value}>{data.label}</option>
                            ))}
                    </select>
                    <label htmlFor='setor'>Setoran Pajak</label>
                    <select id='setor' className='type-btn' name='setoran' value={!props.fulldata ? null : pajakStatus.setoran} onChange={(e) => (selectOptionBackgroundColor(e.target), handleInputChange(e.target))}>
                        {options.map ((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.value}>{data.label}</option>
                        ))}
                    </select>
                </div>
                <div className='form-submit'>
                    <SubmitButton value='Simpan' name="submit-all" onClick={handlePopup} />

                </div>
            </div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Transaksi</h2>
                {isTableLoading ? <LoadingAnimate /> :
                <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData} />}
                <div className='form-submit'>
                    <SubmitButton value='Kembali' name="submit-all" onClick={() => props.changeComponent('monitoring-drpp')} />
                </div>
            </div>
            {isPopup && (<Popup whenClick={handleSubmit} cancel={handlePopup} type="submit"/>)}
            {isLoading && <LoadingScreen />}
        </div>
    )
}