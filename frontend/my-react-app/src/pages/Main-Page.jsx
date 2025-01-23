import React, { useState } from "react";
// Import Components
import DaftarPengajuan from "../components/Daftar-Pengajuan";
import BuatPengajuan from "../components/Buat-Pengajuan";
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import Avatar from "@mui/material/Avatar";

function MainPage(props) {
    const whatMenu = props.menu;
    const getSubMenu = props.submenu;

    // const [contentTitle, setContentTitle] = useState("")
    const [buttonSelect, setButtonSelect] = useState(getSubMenu)


    // Dash button add and remove class to make it selected
    function handleButtonClick(event) {
        const allButton = document.querySelectorAll(".dash-content button");
        allButton.forEach((btn) => btn.classList.remove("btn-selected"));
        const detectButton = document.getElementsByName(event.name)[0];
        detectButton.classList.add("btn-selected")

        setButtonSelect(event.name)
        formatText(event.name)
    }
    //Just converting into title name
    function formatText(input) {
        const newText = input.split("-") // Split the string by "-"
          .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
          .join(" "); // Join the words with a space
        return newText
      }

    function renderComponent() {
        switch (buttonSelect) {
            case "daftar-pengajuan":
                return <DaftarPengajuan />;
            case "buat-pengajuan":
                return <BuatPengajuan changeComponent={setButtonSelect}/>;
            default:
                return null;
        }
    }

    return (
        <div>
            <Navbar />
            <div className="bendahara-home">
                <div className="dash-tab">
                    <div className="dash-title">
                        <h2>Menu<br /> {whatMenu}</h2>
                    </div>
                    <div className="dash-content">
                        <button className={`dash-button ${buttonSelect === "daftar-pengajuan" ? "btn-selected" : ""}`} name="daftar-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "buat-pengajuan" ? "btn-selected" : ""}`} name="buat-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AddCircleOutlinedIcon fontSize="small" /><span className="padd-span-bend"/>Buat Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "lihat-pengajuan" ? "btn-selected" : ""}`} name="lihat-antrian" onClick={(e)=> handleButtonClick(e.target)}><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
                    </div>
                    <div className="dash-user">
                        <Avatar sx={{width: 40, height: 40}} alt="bakamla-logo" src="../../public/assets/bakamla_logo.png" />
                        <span className="padd-span-bend"></span>
                        <p>Biro Umum</p>
                    </div>
                </div>
                <div className="page-content">
                    <h1 className="content-title">{formatText(buttonSelect)}</h1>
                    {renderComponent()}
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default MainPage;