import React from "react";
// Import Components
import DaftarPengajuan from "../components/Daftar-Pengajuan";
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import Avatar from "@mui/material/Avatar";

function Bendahara() {
    const contentTitle = ["Daftar Pengajuan", "Lihat Antrian"]


    return (
        <div className="bendahara-home">
            <div className="dash-title">
                <h2>Menu<br /> Bendahara</h2>
            </div>
            <div className="page-content">
                <h1 className="content-title">{contentTitle[0]}</h1>
                <DaftarPengajuan />
            </div>
            <div className="dash-content">
                <button><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                <button><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
            </div>
            <div className="dash-user">
                <Avatar sx={{width: 35, height: 35}} alt="bakamla-logo" src="../../public/assets/bakamla_logo.png" />
                <span className="padd-span-bend"></span>
                <p>Biro Umum</p>
            </div>
        </div>
    )
}

export default Bendahara;