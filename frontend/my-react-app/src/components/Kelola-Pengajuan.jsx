import React, { useState, useEffect } from 'react';
import axios from 'axios';
//Import components
import { Card, WideTableCard } from '../ui/cards';
import LoadingAnimate from '../ui/loading';

function KelolaPengajuan() {
    //States
    const [dalamAntri, setDalamAntri] = useState([])
    const [sedangVerif, setSedangVerif] = useState([])
    const [sudahVerif, setSudahVerif] = useState([])
    const [ajuHariIni, setAjuHariIni] = useState([])
    const [selesaiBulanIni, setSelesaiBulanIni] = useState([])

    const cardTitle = ["Dalam Antrian", "Sudah di Verifikasi", "Diajukan Hari Ini", "Total Bulan Ini", "Selesai Bulan Ini"];
    
    const headData1 = ["Timestamp", "Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "Status"];
    const headData2 = ["Timestamp", "Nama", "Jenis", "Nominal", "Tanggal Verifikasi", "Tanggal Acc.", "Pajak", "Anggaran", "Unit Kerja", "Status"];
    const headData3 = ["Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "Status"];
    const headData4 = ["Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "DRPP", "SPP", "SPM"];

    async function getAjuanData(){
        try {
            const response = await axios.get("http://localhost:3000/bendahara/kelola-ajuan")
            if (response.status === 200) {
                const ajuanData = response.data.data;
                // console.log([ajuanData[0].map(row => [
                //     row[1],
                //     row[2],
                //     row[3],
                //     row[4],
                //     row[5],
                //     row[11],
                //     row[7],
                // ])])
                setDalamAntri(ajuanData[0].map(row => [
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                    row[11],
                    row[7],
                ]));
                setSedangVerif(ajuanData[1].map(row => [
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
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[11],
                    row[7],
                ]));
                setSelesaiBulanIni([...ajuanData[4].map(row => [
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[11],
                    row[8],
                    row[9],
                    row[10],
                ]), ...ajuanData[5].map(row => [
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


    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {cardTitle.map((data, index) => (
                    <Card key={index} title={data} content="999"/>
                ))}
            </div>
            <WideTableCard title="Pengajuan Belum Verifikasi" tableHead={headData1} tableContent={dalamAntri}/>
            <WideTableCard title="Sedang Verifikasi" tableHead={headData2} tableContent={sedangVerif}/>
            <WideTableCard title="Sudah Verifikasi" tableHead={headData2} tableContent={sudahVerif}/>
            <WideTableCard title="Ajuan Hari Ini" tableHead={headData3} tableContent={ajuHariIni}/>
            <WideTableCard title="Sudah Diajukan Bulan Ini" tableHead={headData4} tableContent={selesaiBulanIni}/>
        </div>
    )
};

export default KelolaPengajuan;