import React, { useState, useEffect } from 'react';
import axios from 'axios';
//Import components
import { Card, WideTableCard } from '../../ui/cards.jsx';
import { headData1, headData2, headData3, headData4 } from './head-data.js';
import PropTypes from "prop-types";

function KelolaPengajuan(props) {
    //States
    const [dalamAntri, setDalamAntri] = useState([])
    const [sedangVerif, setSedangVerif] = useState([])
    const [sudahVerif, setSudahVerif] = useState([])
    const [ajuHariIni, setAjuHariIni] = useState([])
    const [selesaiBulanIni, setSelesaiBulanIni] = useState([])
    const [fullData, setFullData] = useState([])

    async function getAjuanData(){
        try {
            const response = await axios.get("http://localhost:3000/bendahara/kelola-ajuan")
            if (response.status === 200) {
                const ajuanData = response.data.data;
                setFullData(ajuanData)
                setDalamAntri(ajuanData[0].map(row => [
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                    row[11],
                    row[7],
                ]));
                setSedangVerif(ajuanData[1].map(row => [
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[14],
                    row[6],
                    row[12],
                    row[13],
                    row[11],
                    row[7],
                ]));
                setSudahVerif(ajuanData[2].map(row => [
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[14],
                    row[6],
                    row[12],
                    row[13],
                    row[11],
                    row[7],
                ]));
                setAjuHariIni(ajuanData[3].map(row => [
                    row[0],
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[11],
                    row[7],
                ]));
                setSelesaiBulanIni([...ajuanData[4].map(row => [
                    row[0],
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[11],
                    row[8],
                    row[9],
                    row[10],
                ]), ...ajuanData[5].map(row => [
                    row[0],
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[11],
                    row[8],
                    row[9],
                    row[10],
                ])]);
            }
        } catch (error) {
            console.log(error)
        }
    }

    useEffect(() => {
        getAjuanData()
    }, [])

    const cardTitle = [
        {title: "Dalam Antrian", content: dalamAntri.length}, 
        {title: "Sedang di Verifikasi", content: sedangVerif.length}, 
        {title: "Sudah di Verifikasi", content: sudahVerif.length}, 
        {title: "Diajukan Hari Ini", content: ajuHariIni.length}, 
        {title: "Selesai Bulan Ini", content: selesaiBulanIni.length},
    ];

    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {cardTitle.map((data, index) => (
                    <Card key={index} title={data.title} content={data.content}/>
                ))}
            </div>
            <WideTableCard title="Pengajuan Belum Verifikasi" tableHead={headData1} tableContent={dalamAntri} fullContent={fullData[0]} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            <WideTableCard title="Sedang Verifikasi" tableHead={headData2} tableContent={sedangVerif} fullContent={fullData[1]} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            <WideTableCard title="Sudah Verifikasi" tableHead={headData2} tableContent={sudahVerif} fullContent={fullData[2]} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            <WideTableCard title="Ajuan Hari Ini" tableHead={headData3} tableContent={ajuHariIni} fullContent={fullData[3]} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            <WideTableCard title="Sudah Diajukan Bulan Ini" tableHead={headData4} tableContent={selesaiBulanIni} fullContent={Array.isArray(fullData[4]) ? [...fullData[4], ...fullData[5]] : []} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
        </div>
    )
}

KelolaPengajuan.propTypes = {
    changeComponent: PropTypes.func.isRequired,
    aksiData: PropTypes.func.isRequired,
};

export default KelolaPengajuan;