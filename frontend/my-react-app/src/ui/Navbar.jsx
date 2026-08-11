import {useContext, useState} from "react"
import { NavLink, useLocation } from "react-router-dom"
import {AuthContext} from "../lib/AuthContext.jsx";
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import {NotifPopup, useNotifications} from "./NotifPopup.jsx";

export function NewNavbar(){
    // Auth Context
    const { user, logout } = useContext(AuthContext);

    // Get current location
    const location = useLocation();

    // Helper function to determine if button should be active
    const isActive = (path) => {
        return location.pathname === path ? 'home-button home-button-clicked' : 'home-button';
    };

    // Notification state and handlers
    const {
        isNotificationActive,
        isLoading,
        notifData,
        currentPage,
        maxAllowedPage,
        setCurrentPage,
        handlePageChange,
        handleMarkAsRead,
    } = useNotifications(user);
    const [isNotifPopup, setIsNotifPopup] = useState(false);

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
                        <NotificationsIcon fontSize='large' sx={{color: 'white', opacity: isLoading ? 0.5 : 1}} />
                    }
                </div>
                {isNotifPopup ?
                    <NotifPopup
                        notifData={notifData}
                        isLoading={isLoading}
                        currentPage={currentPage}
                        maxAllowedPage={maxAllowedPage}
                        onPageChange={handlePageChange}
                        onMarkAsRead={handleMarkAsRead}
                    /> :
                    null
                }
            </div>
            <div className={"home-navbar-content"}>
                <NavLink to="/home"><button className={isActive('/home')}>Home Page</button></NavLink>
                <NavLink to="/menu-bendahara"><button className={isActive('/menu-bendahara')}>Pengajuan</button></NavLink>
                <NavLink to="/menu-verifikasi"><button className={isActive('/menu-verifikasi')}>Verifikasi</button></NavLink>
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
