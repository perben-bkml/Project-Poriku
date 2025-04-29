import React, { useState, useContext, useEffect } from "react";
// Import Components
import DaftarPengajuan from "../components/bendahara/Daftar-Pengajuan.jsx";
import BuatPengajuan from "../components/bendahara/Buat-Pengajuan.jsx";
import LihatAntrian from "../components/bendahara/Lihat-Antrian.jsx";
import InfoSPMBendahara from "../components/bendahara/SPM-Bend.jsx";
import KelolaPengajuan from "../components/bendahara/Kelola-Pengajuan.jsx";
import AksiPengajuan from "../components/bendahara/Aksi-Pengajuan.jsx";
import MonitoringDrpp from "../components/bendahara/Monitoring-Drpp.jsx";
import AksiDrpp from "../components/bendahara/Aksi-Drpp.jsx";
// Import Context
import { AuthContext } from "../lib/AuthContext";
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
import LogoutIcon from '@mui/icons-material/Logout';
import MonitorIcon from '@mui/icons-material/Monitor';

function BendaharaPage(props) {
    const whatMenu = props.menu;

    // Use Context
    const { user, logout } = useContext(AuthContext)
    // States
    const [buttonSelect, setButtonSelect] = useState("");
    const [savedPagination, setSavedPagination] = useState(null);
    const [antrianData, setAntrianData] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [alertMessage, setAlertMessage] = useState("");
    const [aksiData, setAksiData] = useState([]);
    const [drppData, setDrppData] = useState([]);


    // Set buttonSelect when page renders
    useEffect(() => {
        //Get locally saved storage saved button
        const storedButton = localStorage.getItem("selectedButton");
        if (storedButton) {
            setButtonSelect(storedButton);
        } else {
            if (user.role === "admin" || user.role === "master admin") {
                setButtonSelect("kelola-pengajuan");
            }
            if (user.role === "user") {
                setButtonSelect("daftar-pengajuan")
            }
        }
    }, [])
    

    // Dash button add and remove class to make it selected
    function handleButtonClick(event) {
        const allButton = document.querySelectorAll(".dash-content button");
        allButton.forEach((btn) => btn.classList.remove("btn-selected"));
        const detectButton = document.getElementsByName(event.name)[0];
        detectButton.classList.add("btn-selected")

        setButtonSelect(event.name)
        //Store button select locally
        localStorage.setItem("selectedButton", event.name);
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
                return <AksiPengajuan fulldata={aksiData} changeComponent={setButtonSelect}/>
            case "monitoring-drpp":
                return <MonitoringDrpp changeComponent={setButtonSelect} aksiData={setDrppData} />
            case "aksi-drpp":
                return <AksiDrpp fulldata={drppData} changeComponent={setButtonSelect} />
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
                        { user.role === "admin" || user.role === "master admin" ?
                        <button className={`dash-button ${buttonSelect === "kelola-pengajuan" ? "btn-selected" : "hidden"}`} name="kelola-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><MenuBookIcon fontSize="small"/><span className="padd-span-bend"/>Kelola Pengajuan</button>
                        : null}
                        { user.role === "admin" || user.role === "master admin" ?
                        <button className={`dash-button ${buttonSelect === "monitoring-drpp" ? "btn-selected" : "hidden"}`} name="monitoring-drpp" onClick={(e)=> handleButtonClick(e.target)}><MonitorIcon fontSize="small"/><span className="padd-span-bend"/>Monitoring DRPP</button>
                        : null}
                        { user.role === "user" || user.role === "master admin" ?
                        <button className={`dash-button ${buttonSelect === "daftar-pengajuan" ? "btn-selected" : ""}`} name="daftar-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                        : null}
                        <button className={`dash-button ${buttonSelect === "buat-pengajuan" ? "btn-selected" : ""}`} name="buat-pengajuan" onClick={(e)=> handleButtonClick(e.target)}><AddCircleOutlinedIcon fontSize="small" /><span className="padd-span-bend"/>Buat Pengajuan</button>
                        <button className={`dash-button ${buttonSelect === "lihat-antrian" ? "btn-selected" : ""}`} name="lihat-antrian" onClick={(e)=> handleButtonClick(e.target)}><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
                        <button className={`dash-button ${buttonSelect === "SPM-bendahara" ? "btn-selected" : ""}`} name="SPM-bendahara" onClick={(e)=> handleButtonClick(e.target)}><FindInPageIcon fontSize="small"/><span className="padd-span-bend"/>SPM Bendahara</button>
                        <button className={`dash-button dash-bottom ${buttonSelect === "logout-option" ? "btn-selected" : ""}`} name="logout-option" onClick={logout}><LogoutIcon fontSize="small"/><span className="padd-span-bend"/>Log out</button>
                    </div>
                    <div className="dash-user">
                        <Avatar sx={{width: 40, height: 40}} alt="bakamla-logo" src="../../public/assets/bakamla_logo.png" />
                        <span className="padd-span-bend"></span>
                        <p>{user.name}</p>
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

export default BendaharaPage;