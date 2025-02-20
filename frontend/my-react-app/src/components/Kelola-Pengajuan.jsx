import React from 'react';
//Import components
import { Card, WideTableCard } from '../ui/cards';

function KelolaPengajuan() {

    const cardTitle = ["Belum di Verifikasi", "Sudah di Verifikasi", "Diajukan Hari Ini", "Total Bulan Ini", "Selesai Bulan Ini"]

    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {cardTitle.map((data, index) => (
                    <Card key={index} title={data} content="999"/>
                ))}
            </div>
            <WideTableCard title="Pengajuan Belum Verifikasi"/>
            <WideTableCard title="Sudah Verifikasi"/>
            <WideTableCard title="Ajuan Hari Ini"/>
            <WideTableCard title="Sudah Diajukan Bulan Ini"/>
        </div>
    )
};

export default KelolaPengajuan;