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
        catatan: '',
    })
    const [coloredRow, setColoredRow] = useState([]);

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
        { value: 'Tidak Ada Pajak', label: 'Tidak Ada Pajak', color: "white", textcolor: "black" },
        { value: 'Pajak Manual', label: 'Pajak Manual', color: "#3D3630", textcolor: "#C7B6A7" },
    ]

    async function fetchAntrianTable() {
        try {
            setIsTableLoading(true)
            const tableKeyword = `TRANS_ID:${props.fulldata[1]}`
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/data-transaksi`, { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                if (response.data.keywordRowPos) {
                    const tablePos = { startRow: response.data.keywordRowPos, endRow: response.data.keywordEndRow }
                    const result = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/cek-drpp`, { params: tablePos} )
                    if (result.status === 200) {
                        setColoredRow(result.data.data || []);
                        setIsTableLoading(false)
                    }
                }
                else {
                    setIsTableLoading(false)
                }

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
            catatan: props.fulldata[10],
        });
    }, [])

    useEffect(() => {
        if (pajakStatus.pungutan) {
            const selectElement = document.getElementById("pungut");
            if (selectElement) {
                selectOptionBackgroundColor(selectElement);
            }
        };
        if (pajakStatus.setoran) {
            const selectElement = document.getElementById("setor");
            if (selectElement) {
                selectOptionBackgroundColor(selectElement);
            }
        };
        if (tableData.length > 0) {
            setColoredRow(() => tableData.map(() => [""]));
        }
    }, [pajakStatus.pungutan, tableData]);

    //Handle Select Changes
    function handleInputChange(event){
        const {name, value} = event
        setPajakStatus((prevdata) => ({...prevdata,
            [name]: value
        }));
    }

    //Handle colored row data
    function addColorData(rowIndex, value) {
        setColoredRow(prev => {
            const newData = [...prev];
            const current = newData[rowIndex]?.[0];
            newData[rowIndex] = current === value ? [""] : [value]; // toggle logic
            return newData;
        });
    }

    //Handle submit button
    async function handleSubmit(){
        let numbers = { data: props.fulldata[0] };
        const processedColoredRow = Array.from({ length: coloredRow.length }, (_, i) => 
            coloredRow[i] && coloredRow[i].length > 0 ? coloredRow[i] : [""]
        );
        let colorData = { data: processedColoredRow, id: `TRANS_ID:${props.fulldata[1]}` };
        const sendData = {
            numbers,
            pajakStatus,
            colorData
        }
        try {
            handlePopup()
            setIsLoading(true)
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/bendahara/aksi-drpp`, sendData)
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
                    <label htmlFor="catatan">Catatan</label>
                    <textarea id="catatan" className="type-btn span-row" name="catatan" defaultValue={pajakStatus.catatan} onChange={e => handleInputChange(e.target)}/>
                </div>
                <div className='form-submit'>
                    <SubmitButton value='Simpan' name="submit-all" onClick={handlePopup} />

                </div>
            </div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Transaksi</h2>
                {isTableLoading ? <LoadingAnimate /> :
                <TableKelola type="aksi-drpp" header={columns} content={tableData} fullContent={tableData} coloredRow={coloredRow} addColorData={addColorData} />}
                <div className='form-submit'>
                    <SubmitButton value='Kembali' name="submit-all" onClick={() => props.changeComponent('monitoring-drpp')} />
                </div>
            </div>
            {isPopup && (<Popup whenClick={handleSubmit} cancel={handlePopup} type="submit"/>)}
            {isLoading && <LoadingScreen />}
        </div>
    )
}
