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
import PembayaranBp from "../components/bendahara/Pembayaran-Bp.jsx";
import PembayaranTup from "../components/bendahara/Pembayaran-Tup.jsx";
import KelolaKkp from "../components/bendahara/Kelola-Kkp.jsx";
import LayananGaji from "../components/bendahara/Layanan-Gaji.jsx";
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
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CalculateIcon from '@mui/icons-material/Calculate';
import RequestPageIcon from '@mui/icons-material/RequestPage';

// Single source of truth for both the sidebar and the access check, so the two cannot
// drift. "master admin" is never listed - it opens everything.
const MENU_ROLES = {
    // Admin gets the daftar read only: every satker, view detail, no edit or delete
    "daftar-pengajuan": ["user", "admin"],
    "buat-pengajuan": ["user"],
    "detail-pengajuan": ["user", "admin"],
    "edit-pengajuan": ["user"],
    "lihat-antrian": ["user"],
    "SPM-bendahara": ["user", "admin"],
    "kelola-pengajuan": ["admin"],
    "aksi-pengajuan": ["admin"],
    "monitoring-drpp": ["admin"],
    "aksi-drpp": ["admin"],
    "monitor-data-gaji": ["admin", "admin_gaji"],
    // The permintaan rows carry NIP, pangkat and jabatan for named staff, so a plain
    // admin is left out here even though Monitor Data Gaji lets one read
    "layanan-gaji": ["admin_gaji"],
    "pembayaran-bp": ["admin"],
    "pembayaran-tup": ["admin"],
    // SBM is reference data an admin maintains and only an admin calculates against
    "kelola-kkp": ["admin", "user"],   // a user only gets the kalkulator half of the screen
    // Writing dokumen gaji stays with the roles the backend lets write it
    "input-dokumen-gaji": ["admin_gaji"],
    "edit-dokumen-gaji": ["admin_gaji"],
};

// Verifikasi accounts do not handle DRPP, so those screens are closed to them whatever
// their role. Matched on the login username, so the check has to sit above the master
// admin short circuit in canOpen. Twin of DRPP_ROUTES in server.js.
const DRPP_MENUS = ["monitoring-drpp", "aksi-drpp"];
const tanpaDrpp = (username) => String(username ?? "").toLowerCase().includes("verifikasi");

const AKRONIM = ["bp", "tup", "drpp", "spm", "pjk", "kkp"];

// Sidebar entries in display order. Menus reached from a parent screen are absent.
const MENU_BUTTONS = [
    {name: "kelola-pengajuan", label: "Kelola Pengajuan", Icon: MenuBookIcon},
    {name: "monitoring-drpp", label: "Monitoring DRPP", Icon: MonitorIcon},
    {name: "daftar-pengajuan", label: "Daftar Pengajuan", Icon: AssignmentIcon},
    {name: "buat-pengajuan", label: "Buat Pengajuan", Icon: AddCircleOutlinedIcon},
    {name: "lihat-antrian", label: "Lihat Antrian", Icon: ChecklistIcon},
    {name: "SPM-bendahara", label: "SPM Bendahara", Icon: FindInPageIcon},
    {name: "monitor-data-gaji", label: "Monitor Data Gaji", Icon: PaymentsIcon},
    {name: "layanan-gaji", label: "Layanan Gaji", Icon: RequestPageIcon},
    {name: "pembayaran-bp", label: "Pembayaran BP", Icon: ReceiptLongIcon},
    // labelUser: a user sees only the SBM kalkulator inside this screen, so the menu is
    // named for what they can actually do there rather than for the admin screen it is part of
    {name: "kelola-kkp", label: "Kelola KKP", labelUser: "Kalkulator SBM Jaldis", Icon: CalculateIcon},
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
    // The Cari term from Monitoring DRPP, so Aksi DRPP can mark the cell that matched
    const [drppSorot, setDrppSorot] = useState(null);
    // Which Dokumen Gaji row the edit form should load, set by Monitor-Perubahan-Gaji
    const [dokumenGajiData, setDokumenGajiData] = useState(null);


    const canOpen = (menu) => !(DRPP_MENUS.includes(menu) && tanpaDrpp(user.username))
        && (user.role === "master admin" || (MENU_ROLES[menu] || []).includes(user.role));
    const labelMenu = (item) => (user.role === "user" && item.labelUser) || item.label;
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
          // Acronyms stay as the sidebar spells them, the rest get a capital first letter
          .map(word => AKRONIM.includes(word.toLowerCase())
              ? word.toUpperCase()
              : word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "); // Join the words with a space
        return newText
      }

    // The heading follows whatever the sidebar calls the menu. Menus opened from a parent
    // screen are not in MENU_BUTTONS, so the name itself stays the fallback.
    function judulMenu() {
        // Same guard renderComponent uses, or a menu the viewer cannot open still leaves its
        // heading behind - a blocked screen has to be invisible, not an empty page titled with it
        if (!canOpen(buttonSelect)) return "";
        const item = MENU_BUTTONS.find(entry => entry.name === buttonSelect);
        return item ? labelMenu(item) : formatText(buttonSelect);
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
                return <MonitoringDrpp changeComponent={setButtonSelect} aksiData={setDrppData} sorotData={setDrppSorot} />
            case "aksi-drpp":
                return <AksiDrpp fulldata={drppData} sorot={drppSorot} changeComponent={setButtonSelect} />
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
            case "pembayaran-bp":     return <PembayaranBp changeComponent={setButtonSelect} />
            case "pembayaran-tup":    return <PembayaranTup changeComponent={setButtonSelect} />
            case "kelola-kkp":        return <KelolaKkp />
            case "layanan-gaji":      return <LayananGaji />
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
                        {visibleButtons.map((item) => (
                            <button key={item.name} name={item.name} onClick={() => handleButtonClick(item.name)}
                                    className={`dash-button ${buttonSelect === item.name ? "btn-selected" : ""}`}>
                                <item.Icon fontSize="small"/><span className="padd-span-bend"/>{labelMenu(item)}
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
                    <h1 className="content-title">{judulMenu()}</h1>
                    {renderComponent()}
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default BendaharaPage;
