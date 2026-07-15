import React, {useContext, useState} from "react"
import { NavLink, useLocation } from "react-router-dom"
import {AuthContext} from "../lib/AuthContext.jsx";
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import {TableNotif} from "./tables.jsx";

export function NewNavbar(){
    // Auth Context
    const { logout } = useContext(AuthContext);

    // Get current location
    const location = useLocation();

    // Helper function to determine if button should be active
    const isActive = (path) => {
        return location.pathname === path ? 'home-button home-button-clicked' : 'home-button';
    };

    // Notification message state
    const [isNotificationActive, setIsNotificationActive] = useState(false);
    const [isNotifPopup, setIsNotifPopup] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPage, setTotalPage] = useState(0);

    // Notification pop up container
    function NotifPopup() {
        const list = [
            ['Header', 'fix'],
            ['Header 2', 'Body 2'],
            ['Header 3', 'Body 3'],
            ['Header 4', 'Body 4'],
            ['Header 5', 'Body 5']
        ]

        return (
            <div className="notif-popup-container">
                <div className="notif-popup-header">
                    <div className="notif-arrows"><KeyboardDoubleArrowLeftIcon fontSize="small" sx={{visibility: currentPage === 1 ? 'hidden':'visible'}} onClick={() => setCurrentPage(currentPage - 1)} /></div>
                    <h4>Notifikasi</h4>
                    <div className="notif-arrows"><KeyboardDoubleArrowRightIcon fontSize="small" onClick={() => setCurrentPage(currentPage + 1)} /></div>
                </div>
                <div className="notif-popup-body">
                    <TableNotif content={list}  />
                </div>
            </div>
        )
    }

    // Notification click handler
    function notifOnClick(){
        setIsNotifPopup(!isNotifPopup);
        isNotifPopup && setCurrentPage(1);
    }


    return(
        <div className="full-navbar">
            <div className="notif-wrapper">
                <div className={`navbar-notification ${isNotificationActive ? 'notif-red' : 'notif-white'}`} onClick={notifOnClick}>
                    {isNotificationActive ?
                        <NotificationsActiveIcon fontSize='large' sx={{color: '#FA3E3E'}}/> :
                        <NotificationsIcon fontSize='large' sx={{color: 'white'}} />
                    }
                </div>
                {isNotifPopup ?
                    <NotifPopup /> :
                    null
                }
            </div>
            <div className={"home-navbar-content"}>
                <NavLink to="/home"><button className={isActive('/home')}>Home Page</button></NavLink>
                <NavLink to="/menu-bendahara"><button className={isActive('/menu-bendahara')}>Menu Bendahara</button></NavLink>
                <NavLink to="/menu-verifikasi"><button className={isActive('/menu-verifikasi')}>Menu Verifikasi</button></NavLink>
                <a href={`${import.meta.env.VITE_LOGIN_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                    <button className="home-button home-button-external">Login SIPKU</button>
                </a>
                <a href={`${import.meta.env.VITE_UNGGAH_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                    <button className="home-button home-button-external">Unggah PJK</button>
                </a>
                <button className='home-button home-button-logout' onClick={logout}>Log Out</button>
            </div>
        </div>

    )
}