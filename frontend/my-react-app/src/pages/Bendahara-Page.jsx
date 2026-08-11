import React, { useState, useContext, useEffect } from "react";
import { NavLink } from "react-router-dom"
// Import Components
import DaftarPengajuan from "../components/bendahara/Daftar-Pengajuan.jsx";
import BuatPengajuan from "../components/bendahara/Buat-Pengajuan.jsx";
import LihatAntrian from "../components/bendahara/Lihat-Antrian.jsx";
import InfoSPMBendahara from "../components/bendahara/SPM-Bend.jsx";
import KelolaPengajuan from "../components/bendahara/Kelola-Pengajuan.jsx";
import AksiPengajuan from "../components/bendahara/Aksi-Pengajuan.jsx";
import MonitoringDrpp from "../components/bendahara/Monitoring-Drpp.jsx";
import AksiDrpp from "../components/bendahara/Aksi-Drpp.jsx";
import MonitorPerubahanGaji from "../components/bendahara/Monitor-Perubahan-Gaji.jsx";
import KirimDokumenGaji from "../components/bendahara/Kirim-Dokumen-Gaji.jsx";
// Import Context
import { AuthContext } from "../lib/AuthContext";
// Import Static Component
import {NewNavbar} from '../ui/Navbar'
import Footer from '../ui/Footer'
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import Avatar from "@mui/material/Avatar";
import FindInPageIcon from '@mui/icons-material/FindInPage';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MonitorIcon from '@mui/icons-material/Monitor';
import PaymentsIcon from '@mui/icons-material/Payments';

// Single source of truth for both the sidebar and the access check, so the two cannot
// drift. "master admin" is never listed - it opens everything.
const MENU_ROLES = {
    "daftar-pengajuan": ["user"],
    "buat-pengajuan": ["user"],
    "detail-pengajuan": ["user"],
    "edit-pengajuan": ["user"],
    "lihat-antrian": ["user"],
    "SPM-bendahara": ["user", "admin"],
    "kelola-pengajuan": ["admin"],
    "aksi-pengajuan": ["admin"],
    "monitoring-drpp": ["admin"],
    "aksi-drpp": ["admin"],
    "monitor-data-gaji": ["admin", "admin_gaji"],
    // Writing dokumen gaji stays with the roles the backend lets write it
    "input-dokumen-gaji": ["admin_gaji"],
    "edit-dokumen-gaji": ["admin_gaji"],
};

// Sidebar entries in display order. Menus reached from a parent screen are absent.
const MENU_BUTTONS = [
    {name: "kelola-pengajuan", label: "Kelola Pengajuan", Icon: MenuBookIcon},
    {name: "monitoring-drpp", label: "Monitoring DRPP", Icon: MonitorIcon},
    {name: "daftar-pengajuan", label: "Daftar Pengajuan", Icon: AssignmentIcon},
    {name: "buat-pengajuan", label: "Buat Pengajuan", Icon: AddCircleOutlinedIcon},
    {name: "lihat-antrian", label: "Lihat Antrian", Icon: ChecklistIcon},
    {name: "SPM-bendahara", label: "SPM Bendahara", Icon: FindInPageIcon},
    {name: "monitor-data-gaji", label: "Monitor Data Gaji", Icon: PaymentsIcon},
];

function BendaharaPage(props) {
    const whatMenu = props.menu;

    // Use Context
    const { user } = useContext(AuthContext)
    // States
    const [buttonSelect, setButtonSelect] = useState("");
    const [savedPagination, setSavedPagination] = useState(null);
    const [antrianData, setAntrianData] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [alertMessage, setAlertMessage] = useState("");
    const [aksiData, setAksiData] = useState([]);
    const [drppData, setDrppData] = useState([]);
    // Which Dokumen Gaji row the edit form should load, set by Monitor-Perubahan-Gaji
    const [dokumenGajiData, setDokumenGajiData] = useState(null);


    const canOpen = (menu) => user.role === "master admin" || (MENU_ROLES[menu] || []).includes(user.role);
    const visibleButtons = MENU_BUTTONS.filter(item => canOpen(item.name));

    // Set buttonSelect when page renders
    useEffect(() => {
        // A stored menu can outlive the session that set it, so re-check the role
        const storedButton = localStorage.getItem("selectedButtonBendahara");
        setButtonSelect(storedButton && canOpen(storedButton) ? storedButton : (visibleButtons[0]?.name || ""));
    }, [])

    // Enable scrolling for this page
    useEffect(() => {
        document.body.classList.add('scrollable-page');

        return () => {
            document.body.classList.remove('scrollable-page');
        };
    }, []);

    function handleButtonClick(name) {
        setButtonSelect(name);
        //Store button select locally
        localStorage.setItem("selectedButtonBendahara", name);
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
    function handleInvisibleComponent(compType, {lastPage, keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate, accDate, status, fileLink, flow, pjkLink, spp, catatan, pjkCatatan}) {
        const rowData = [keyword, antriName, antriType, antriSum, antriDate, antriNum, createDate, accDate, status, fileLink, flow, pjkLink, spp, catatan, pjkCatatan];
        if (!lastPage) {
            return () => {
                setButtonSelect(compType);
                setAntrianData(rowData)
            }
        } else {
            return () =>{
                setButtonSelect(compType);
                setSavedPagination(lastPage);
                setAntrianData(rowData)
                setAlertMessage(null);
            }
        }
    }
    // Rendering Components
    function renderComponent() {
        // Never render a menu the role is not allowed to open, however buttonSelect got set
        if (!canOpen(buttonSelect)) return null;
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
            case "monitor-data-gaji":
                return <MonitorPerubahanGaji changeComponent={setButtonSelect} alertMessage={alertMessage} editData={setDokumenGajiData} />
            case "input-dokumen-gaji":
                return <KirimDokumenGaji type="buat" changeComponent={setButtonSelect} alertMessage={setAlertMessage} />
            case "edit-dokumen-gaji":
                return <KirimDokumenGaji type="edit" passedData={dokumenGajiData} changeComponent={setButtonSelect} alertMessage={setAlertMessage} />
            default:
                return null;
        }
    }
    return (
        <div className="main-page">
            <div className={"main-page-navbar"}>
                <NavLink to="/home"><div className={"main-page-logo"}>
                    <img style={{width: "60px", height:"60px"}} src={"/assets/Main Page/tulip putih.svg"} alt="Tulip Bakamla" />
                    <div>
                        <h1 className={'main-navbar-h1'}>PORIKU</h1>
                        <p className={'main-navbar-p'}>Portal Informasi Keuangan</p>
                    </div>
                </div></NavLink>
                <div style={{display:"flex", justifyContent:"flex-end", marginRight:"40px", marginTop:"5px"}}>
                    <NewNavbar />
                </div>
            </div>
            <div className={`bendahara-home ${isSidebarOpen ? "" : "sidebar-hidden"}`}>
                <div className={`dash-tab ${isSidebarOpen ? "" : "hidden-sidebar"}`}>
                    <div className="dash-title">
                        <h2>{whatMenu}</h2>
                        {/* Button inside dash-title when sidebar is open */}
                        <button 
                            className="toggle-sidebar-btn inside-sidebar" 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                            ❮❮
                        </button>
                    </div>
                    <div className="dash-content">
                        {visibleButtons.map(({name, label, Icon}) => (
                            <button key={name} name={name} onClick={() => handleButtonClick(name)}
                                    className={`dash-button ${buttonSelect === name ? "btn-selected" : ""}`}>
                                <Icon fontSize="small"/><span className="padd-span-bend"/>{label}
                            </button>
                        ))}
                    </div>
                    <div className="dash-user">
                        <Avatar sx={{width: 40, height: 40}} alt="bakamla-logo" src="/assets/bakamla_logo.svg" />
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
