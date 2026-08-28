import React, { useState, useContext, useEffect } from "react";
// Import Components
import KelolaPJK from "../components/verifikasi/Kelola-PJK.jsx";
import PengujianPJK from "../components/verifikasi/Pengujian-PJK.jsx";
import AksiVerifPJK from "../components/verifikasi/Aksi-Verif-PJK.jsx";
import FormVerifikasi from "../components/verifikasi/Form-Verifikasi.jsx";
import MonitorPJK from "../components/verifikasi/Monitor-PJK.jsx";
import Realisasi from "../components/verifikasi/Realisasi.jsx";
// Import Context
import { AuthContext } from "../lib/AuthContext";
// Import Static Component
import {NewNavbar} from '../ui/Navbar'
import Footer from '../ui/Footer'
// Material UI icons
import Avatar from "@mui/material/Avatar";
import DashboardIcon from '@mui/icons-material/Dashboard';
import ScreenSearchDesktopIcon from '@mui/icons-material/ScreenSearchDesktop';
import ChecklistRtlIcon from '@mui/icons-material/ChecklistRtl';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import PaymentsIcon from '@mui/icons-material/Payments';
import {NavLink} from "react-router-dom";

// Single source of truth for both the sidebar and the access check, so the two cannot
// drift. "master admin" is never listed - it opens everything.
const MENU_ROLES = {
    "monitor-PJK": ["user"],
    "realisasi": ["admin", "admin_gaji"],
    "kelola-PJK": ["admin"],
    "pengujian-PJK": ["admin"],
    "aksi-verif-PJK": ["admin"],
    "form-verifikasi": ["admin"],
};

// Sidebar entries in display order. Menus reached from a parent screen are absent.
const MENU_BUTTONS = [
    {name: "realisasi", label: "Realisasi", Icon: PaymentsIcon},
    {name: "pengujian-PJK", label: "Pengujian PJK", Icon: FactCheckIcon},
    {name: "kelola-PJK", label: "Kelola PJK", Icon: DashboardIcon},
    {name: "form-verifikasi", label: "Form Verifikasi", Icon: ChecklistRtlIcon},
    {name: "monitor-PJK", label: "Monitor PJK", Icon: ScreenSearchDesktopIcon},
];

function VerifikasiPage(props) {
    const whatMenu = props.menu;

    // Use Context
    const { user, logout } = useContext(AuthContext)
    // States
    const [buttonSelect, setButtonSelect] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [pjkData, setPjkData] = useState([]);


    const canOpen = (menu) => user.role === "master admin" || (MENU_ROLES[menu] || []).includes(user.role);
    const visibleButtons = MENU_BUTTONS.filter(item => canOpen(item.name));

    // Set buttonSelect when page renders
    useEffect(() => {
        // A stored menu can outlive the session that set it, so re-check the role
        const storedButton = localStorage.getItem("selectedButtonVerif");
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
        localStorage.setItem("selectedButtonVerif", name);
    }
    //Just converting into title name
    function formatText(input) {
        const newText = input.split("-") // Split the string by "-"
          .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
          .join(" "); // Join the words with a space
        return newText
      }


    // Rendering Components
    function renderComponent() {
        // Never render a menu the role is not allowed to open, however buttonSelect got set
        if (!canOpen(buttonSelect)) return null;
        switch (buttonSelect) {
            case "realisasi":
                return <Realisasi />;
            case "kelola-PJK":
                return <KelolaPJK />;
            case "pengujian-PJK":
                return <PengujianPJK changeComponent={setButtonSelect} aksiData={setPjkData} />;
            case "aksi-verif-PJK":
                return <AksiVerifPJK fulldata={pjkData} changeComponent={setButtonSelect} />;
            case "form-verifikasi":
                return <FormVerifikasi changeComponent={setButtonSelect}/>;
            case "monitor-PJK":
                return <MonitorPJK />;
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

export default VerifikasiPage;
