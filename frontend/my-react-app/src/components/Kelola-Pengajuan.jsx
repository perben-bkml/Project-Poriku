import React from 'react';
//Import components
import { Card } from '../ui/cards';

function KelolaPengajuan() {

    const cardTitle = ["Belum di Verifikasi", "Sudah di Verifikasi", "Diajukan Hari Ini", "Total Bulan Ini", "Selesai Bulan Ini"]

    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {cardTitle.map((data, index) => (
                    <Card key={index} title={data} content="999"/>
                ))}
            </div>
        </div>
    )
};

export default KelolaPengajuan;