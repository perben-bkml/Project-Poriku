import React, {useCallback, useContext, useEffect, useState} from "react"
import { NavLink, useLocation } from "react-router-dom"
import {AuthContext} from "../lib/AuthContext.jsx";
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import {TableNotif} from "./tables.jsx";
import apiClient from "../lib/apiClient.js";

export function NewNavbar(){
    // Auth Context
    const { user, logout } = useContext(AuthContext);

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
    const [totalPossibleRows, setTotalPossibleRows] = useState(1);
    const [notifData, setNotifData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [queryPage, setQueryPage] = useState(1);
    const [statusColPosition, setStatusColPosition] = useState('');
    const maxAllowedPage = Math.ceil(totalPossibleRows / 5);

    // Fetch notification data from Google Sheets
    const rowsToFetch = 30;
    const fetchNotifications = useCallback(async (page) => {
        if (!user || !user.name) return;
        setIsLoading(true);
        try {
            const response = await apiClient.get('/notification', { params:{ page, limit: rowsToFetch, name: user.name, role: user.role }});
            if (response.status === 200) {
                const { data, rowCount, status, statusPosition } = response.data;
                const safeRowCount = rowCount || 1;
                setNotifData(data);
                setTotalPossibleRows(safeRowCount);
                setStatusColPosition(statusPosition);
                // Check for read status
                const noIndex = status.findIndex(row => row[0] === 'no');
                if (noIndex === -1 ){
                    setIsNotificationActive(false);
                } else {
                    setIsNotificationActive(true);
                }


            }
        } catch(error) {
            console.error("Error fetching data.", error)
        } finally {
            setIsLoading(false);
        }
    }, [user]);
    useEffect(() => {
        fetchNotifications(queryPage);
    }, [queryPage]);

    // Page change handler
    function handlePageChange(direction){

        if (direction === 'prev') {
            setCurrentPage(prev => {
                const newPage = Math.max(prev - 1, 1);
                setQueryPage(Math.floor(newPage / 6) + 1);
                return newPage;
            });
        } else if (direction === 'next') {
            setCurrentPage(prev => {
                const newPage = Math.min(prev + 1, maxAllowedPage);
                setQueryPage(Math.floor(newPage / 6) + 1);
                return newPage;
            });
        }


    }

    // Handle mark as read
    async function handleMarkAsRead(notifId) {
        const sendData = {
            notifId,
            statusColPosition,
        }

        try {
            const result = await apiClient.post('/notification/mark-read', sendData)
            if (result.status === 200) {
                setNotifData(prevData =>
                    prevData.map(row => {
                        if (row[0] === notifId) {
                            const updatedRow = [...row];
                            updatedRow[3] = 'yes';
                            return updatedRow;
                        }
                        return row;
                    })
                );
            }
        } catch (error) {
            console.log("Failed update read status.", error);
        }

    }


    // Notification pop up container
    function NotifPopup() {
        const itemsPerPage = 5;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        // Show only 5 data at a time
        const displayedData = notifData.slice(startIndex, endIndex);

        return (
            <div className="notif-popup-container">
                <div className="notif-popup-header">
                    <div className="notif-arrows"><KeyboardDoubleArrowLeftIcon fontSize="small" sx={{visibility: currentPage === 1 ? 'hidden':'visible'}} onClick={() => handlePageChange('prev')} /></div>
                    <h4>Notifikasi</h4>
                    <div className="notif-arrows"><KeyboardDoubleArrowRightIcon fontSize="small" sx={{visibility: currentPage === maxAllowedPage ? 'hidden':'visible'}} onClick={() => handlePageChange('next')} /></div>
                </div>
                <div className="notif-popup-body">
                    {isLoading ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                            Loading notifications...
                        </div>
                    ) : notifData.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                            No new notifications
                        </div>
                    ) : (
                        <TableNotif content={displayedData} onMarkAsRead={handleMarkAsRead} />
                    )}
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
                        <NotificationsIcon fontSize='large' sx={{color: 'white', opacity: isLoading ? 0.5 : 1}} />
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