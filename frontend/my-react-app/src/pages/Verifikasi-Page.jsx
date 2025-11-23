import React, { useState, useContext, useEffect } from "react";
// Import Components
import KelolaPJK from "../components/verifikasi/Kelola-PJK.jsx";
import FormVerifikasi from "../components/verifikasi/Form-Verifikasi.jsx";
import MonitorPJK from "../components/verifikasi/Monitor-PJK.jsx";
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
import {NavLink} from "react-router-dom";

function VerifikasiPage(props) {
    const whatMenu = props.menu;

    // Use Context
    const { user, logout } = useContext(AuthContext)
    // States
    const [buttonSelect, setButtonSelect] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);


    // Set buttonSelect when page renders
    useEffect(() => {
        //Get locally saved storage saved button
        const storedButton = localStorage.getItem("selectedButtonVerif");
        if (storedButton) {
            setButtonSelect(storedButton);
        } else {
            if (user.role === "admin" || user.role === "master admin") {
                setButtonSelect("kelola-PJK");
            }
            if (user.role === "user") {
                setButtonSelect("monitor-PJK")
            }
        }
    }, [])

    // Enable scrolling for this page
    useEffect(() => {
        document.body.classList.add('scrollable-page');

        return () => {
            document.body.classList.remove('scrollable-page');
        };
    }, []);

    // Dash button add and remove class to make it selected
    function handleButtonClick(event) {
        const allButton = document.querySelectorAll(".dash-content button");
        allButton.forEach((btn) => btn.classList.remove("btn-selected"));
        const detectButton = document.getElementsByName(event.name)[0];
        detectButton.classList.add("btn-selected")

        setButtonSelect(event.name)
        //Store button select locally
        localStorage.setItem("selectedButtonVerif", event.name);
        formatText(event.name)
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
        switch (buttonSelect) {
            case "kelola-PJK":
                return <KelolaPJK />;
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
                        <button className={`dash-button ${buttonSelect === "kelola-PJK" ? "btn-selected" : "hidden"}`} name="kelola-PJK" onClick={(e)=> handleButtonClick(e.target)}><DashboardIcon fontSize="small"/><span className="padd-span-bend"/>Kelola PJK</button>
                        : null}
                        { user.role === "admin" || user.role === "master admin" ?
                        <button className={`dash-button ${buttonSelect === "form-verifikasi" ? "btn-selected" : "hidden"}`} name="form-verifikasi" onClick={(e)=> handleButtonClick(e.target)}><ChecklistRtlIcon fontSize="small"/><span className="padd-span-bend"/>Form Verifikasi</button>
                        : null}
                        { user.role === "user" || user.role === "master admin" ?
                        <button className={`dash-button ${buttonSelect === "monitor-PJK" ? "btn-selected" : "hidden"}`} name="monitor-PJK" onClick={(e)=> handleButtonClick(e.target)}><ScreenSearchDesktopIcon fontSize="small"/><span className="padd-span-bend"/>Monitor PJK</button>
                        : null}
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
