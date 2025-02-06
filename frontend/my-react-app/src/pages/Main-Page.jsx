import React, { useState, useEffect } from "react";
// Import Components
import DaftarPengajuan from "../components/Daftar-Pengajuan";
import BuatPengajuan from "../components/Buat-Pengajuan";
import EditPengajuan from "../components/Lihat-Edit-Pengajuan";
import LihatAntrian from "../components/Lihat-Antrian";
// Import Static Component
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

    // States
    const [buttonSelect, setButtonSelect] = useState(getSubMenu);
    const [savedPagination, setSavedPagination] = useState(null);
    const [antrianData, setAntrianData] = useState([]);


    // Dash button add and remove class to make it selected
    function handleButtonClick(event) {
        const allButton = document.querySelectorAll(".dash-content button");
        allButton.forEach((btn) => btn.classList.remove("btn-selected"));
        const detectButton = document.getElementsByName(event.name)[0];
        detectButton.classList.add("btn-selected")

        setButtonSelect(event.name)
        formatText(event.name)
        setSavedPagination(null);
    }
    //Just converting into title name
    function formatText(input) {
        const newText = input.split("-") // Split the string by "-"
          .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
          .join(" "); // Join the words with a space
        return newText
      }

    // Handle invisible component (invisible on button)
    function handleInvisibleComponent(compType, {lastPage, keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate}) {
        if (!lastPage) {
            return () => {
                setButtonSelect(compType);
                setAntrianData([keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate])
            }
        } else {
            return () => {
                setButtonSelect(compType);
                setSavedPagination(lastPage);
                setAntrianData([keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate])
            }
        }   
    }
    // Rendering Components
    function renderComponent() {
        switch (buttonSelect) {
            case "daftar-pengajuan":
                return <DaftarPengajuan invisible={handleInvisibleComponent} userPagination={savedPagination}/>;
            case "buat-pengajuan":
                return <BuatPengajuan changeComponent={setButtonSelect}/>;
            case "detail-pengajuan":
                return <EditPengajuan type="lihat" invisible={handleInvisibleComponent} passedData={antrianData} changeComponent={setButtonSelect}/>
            case "edit-pengajuan":
                return <EditPengajuan type="edit" invisible={handleInvisibleComponent} passedData={antrianData} changeComponent={setButtonSelect}/>
            case "lihat-antrian":
                return <LihatAntrian />
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
                        <button className={`dash-button ${buttonSelect === "lihat-antrian" ? "btn-selected" : ""}`} name="lihat-antrian" onClick={(e)=> handleButtonClick(e.target)}><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
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