import React, { useState, useEffect } from "react";
// Import Components
import DaftarPengajuan from "../components/Daftar-Pengajuan";
import BuatPengajuan from "../components/Buat-Pengajuan";
import LihatAntrian from "../components/Lihat-Antrian";
import InfoSPMBendahara from "../components/SPM-Bend";
import KelolaPengajuan from "../components/Kelola-Pengajuan";
import AksiPengajuan from "../components/Aksi-Pengajuan";
// Import Static Component
import Navbar from '../ui/Navbar'
import Footer from '../ui/Footer'
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import Avatar from "@mui/material/Avatar";
import FindInPageIcon from '@mui/icons-material/FindInPage';
import MenuBookIcon from '@mui/icons-material/MenuBook';

function MainPage(props) {
    const whatMenu = props.menu;

    // States
    const [buttonSelect, setButtonSelect] = useState(props.submenu);
    const [savedPagination, setSavedPagination] = useState(null);
    const [antrianData, setAntrianData] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [alertMessage, setAlertMessage] = useState("");
    const [aksiData, setAksiData] = useState([]);


    // Dash button add and remove class to make it selected
    function handleButtonClick(event) {
        const allButton = document.querySelectorAll(".dash-content button");
        allButton.forEach((btn) => btn.classList.remove("btn-selected"));
        const detectButton = document.getElementsByName(event.name)[0];
        detectButton.classList.add("btn-selected")

        setButtonSelect(event.name)
        formatText(event.name)
        setSavedPagination(null);
        setAlertMessage("");
    }
    //Just converting into title name
    function formatText(input) {
        const newText = input.split("-") // Split the string by "-"
          .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
          .join(" "); // Join the words with a space
        return newText
      }

    // Handle invisible component (invisible on button)
    function handleInvisibleComponent(compType, {lastPage, keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate, accDate, status}) {
        if (!lastPage) {
            return () => {
                setButtonSelect(compType);
                setAntrianData([keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate, accDate, status])
            }
        } else {
            return () =>{
                setButtonSelect(compType);
                setSavedPagination(lastPage);
                setAntrianData([keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate, accDate, status])
                setAlertMessage(null);
            }
        }   
    }
    // Rendering Components
    function renderComponent() {
        switch (buttonSelect) {
            case "kelola-pengajuan":
                return <KelolaPengajuan changeComponent={setButtonSelect} aksiData={setAksiData} />
            case "aksi-pengajuan":
                return <AksiPengajuan fulldata={aksiData}/>
            case "daftar-pengajuan":
                return <DaftarPengajuan invisible={handleInvisibleComponent} userPagination={savedPagination} alertMessage={alertMessage} />;
            case "buat-pengajuan":
                return <BuatPengajuan type="buat" changeComponent={setButtonSelect} alertMessage={setAlertMessage} />;
            case "detail-pengajuan":
                return <BuatPengajuan type="lihat" invisible={handleInvisibleComponent} passedData={antrianData} changeComponent={setButtonSelect} fallbackTo="daftar-pengajuan" />
            case "edit-pengajuan":
                return <BuatPengajuan type="edit" invisible={handleInvisibleComponent} passedData={antrianData} changeComponent={setButtonSelect} alertMessage={setAlertMessage} fallbackTo="daftar-pengajuan"/>
            case "lihat-antrian":
                return <LihatAntrian />
            case "SPM-bendahara":
                return <InfoSPMBendahara /> 
            default:
                return null;
        }
    }
    return (
        <div>
            <Navbar />
            <div className={`bendahara-home ${isSidebarOpen ? "" : "sidebar-hidden"}`}>
                <div className={`dash-tab ${isSidebarOpen ? "" : "hidden-sidebar"}`}>
                    <div className="dash-title">
                        <h2>Menu<br /> {whatMenu}</h2>
                        {/* Button inside dash-title when sidebar is open */}
                        <button 
                            className="toggle-sidebar-btn inside-sidebar" 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                            ❮❮
                        </button>
                    </div>
                    <div className="dash-content">
                        <button className={`dash-button ${buttonSelect === "kelola-pengajuan" ? "btn-selected" : ""}`} name="kelola-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><MenuBookIcon fontSize="small"/><span className="padd-span-bend"/>Kelola Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "daftar-pengajuan" ? "btn-selected" : ""}`} name="daftar-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "buat-pengajuan" ? "btn-selected" : ""}`} name="buat-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AddCircleOutlinedIcon fontSize="small" /><span className="padd-span-bend"/>Buat Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "lihat-antrian" ? "btn-selected" : ""}`} name="lihat-antrian" onClick={(e)=> handleButtonClick(e.target)}><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
                        <button className={`dash-button ${buttonSelect === "SPM-bendahara" ? "btn-selected" : ""}`} name="SPM-bendahara" onClick={(e)=> handleButtonClick(e.target)}><FindInPageIcon fontSize="small"/><span className="padd-span-bend"/>SPM Bendahara</button>
                    </div>
                    <div className="dash-user">
                        <Avatar sx={{width: 40, height: 40}} alt="bakamla-logo" src="../../public/assets/bakamla_logo.png" />
                        <span className="padd-span-bend"></span>
                        <p>Biro Umum</p>
                    </div>
                </div>
                {/* Button outside when sidebar is hidden */}
                {!isSidebarOpen && (
                    <button 
                        className="toggle-sidebar-btn outside-sidebar" 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        ❯❯
                    </button>
                )}
                <div className={`page-content ${isSidebarOpen ? "" : "full-width"}`}>
                    <h1 className="content-title">{formatText(buttonSelect)}</h1>
                    {renderComponent()}
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default MainPage;