import React, {useState} from "react";
// Import Components
import DaftarPengajuan from "../components/Daftar-Pengajuan";
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import Avatar from "@mui/material/Avatar";

function MainPage(props) {
    const whatMenu = props.menu;

    const contentTitle = ["Daftar Pengajuan", "Lihat Antrian"]

    return (
        <div>
            <Navbar />
            <div className="bendahara-home">
                <div className="dash-tab">
                    <div className="dash-title">
                        <h2>Menu<br /> {whatMenu}</h2>
                    </div>
                    <div className="dash-content">
                        <button><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                        <button><AddCircleOutlinedIcon fontSize="small" /><span className="padd-span-bend"/>Buat Pengajuan</button>
                        <button><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
                    </div>
                    <div className="dash-user">
                        <Avatar sx={{width: 40, height: 40}} alt="bakamla-logo" src="../../public/assets/bakamla_logo.png" />
                        <span className="padd-span-bend"></span>
                        <p>Biro Umum</p>
                    </div>
                </div>
                <div className="page-content">
                    <h1 className="content-title">{contentTitle[0]}</h1>
                    <DaftarPengajuan />
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default MainPage;