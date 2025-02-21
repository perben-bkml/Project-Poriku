import React from 'react';
//Import components
import { Card, WideTableCard } from '../ui/cards';

function KelolaPengajuan() {

    const cardTitle = ["Belum di Verifikasi", "Sudah di Verifikasi", "Diajukan Hari Ini", "Total Bulan Ini", "Selesai Bulan Ini"];
    
    const headData1 = ["Timestamp", "Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "Status"];
    const headData2 = ["Timestamp", "Nama", "Jenis", "Nominal", "Tanggal Verifikasi", "Tanggal Acc.", "Pajak", "Anggaran", "Unit Kerja", "Status"];
    const headData3 = ["Nama", "Jenis", "Nominal", "Tanggal Acc.", "Unit Kerja", "Status"];
    const headData4 = ["Nama", "Jenis", "Nominal", "Req. Tanggal", "Unit Kerja", "DRPP", "SPP", "SPM"];

    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {cardTitle.map((data, index) => (
                    <Card key={index} title={data} content="999"/>
                ))}
            </div>
            <WideTableCard title="Pengajuan Belum Verifikasi" tableHead={headData1}/>
            <WideTableCard title="Sudah Verifikasi" tableHead={headData2}/>
            <WideTableCard title="Ajuan Hari Ini" tableHead={headData3}/>
            <WideTableCard title="Sudah Diajukan Bulan Ini" tableHead={headData4}/>
        </div>
    )
};

export default KelolaPengajuan;