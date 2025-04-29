
//Import Components
import { Card } from "../../ui/cards.jsx"
import { TableInfoAntri } from "../../ui/tables.jsx";
import LoadingAnimate from "../../ui/loading.jsx";
import React, {useState} from "react";

export default function KelolaPJK() {
    //State
    const [isLoading, setIsLoading] = useState(false);


    //Titles for card
    const cardTitles = [
        {title: "PJK Belum Dikumpulkan", content: 0},
        {title: "Ditolak", content: 1},
        {title: "Lengkap Dengan Catatan", content: 2},
        {title: "Lengkap", content: 3}
    ]

    //Table Head
    const tableHead = [
        "No.", "Unit Kerja", "No. SPM", "Tanggal SP2D", "Bulan SP2D", "Jenis SPM", "Nominal", "Jenis Belanja", "Status Verifikasi"
    ]

    return (
        <div>
            <div className="pengajuan-filter">
                <form className="filter-form">
                    <label className="filter-label1">Filter dengan:</label>
                    <div className="filter-select">
                        <select>
                            <option value=""/>
                            <option value="month">Bulan</option>
                            <option value="date">Tanggal</option>
                        </select>
                    </div>
                    <label className="filter-label2">Opsi Filter:</label>
                    <input className="filter-input1"/>
                </form>
            </div>
            <div className={"card-wrap pjk-card"}>
                {cardTitles.map((card, index) => (
                    <Card key={index} title={card.title} content={card.content}/>
                ))}
            </div>
            <div className={"bg-card pjk-table"}>
                <TableInfoAntri header={tableHead} body={tableHead} />
            </div>
        </div>
    )
}