import {useCallback, useEffect, useState} from "react"
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import {TableNotif} from "./tables.jsx";
import apiClient from "../lib/apiClient.js";

// Rows shown per popup page, and rows pulled per backend request.
// One fetch therefore covers PAGES_PER_FETCH popup pages.
const ITEMS_PER_PAGE = 5;
const ROWS_TO_FETCH = 30;
const PAGES_PER_FETCH = ROWS_TO_FETCH / ITEMS_PER_PAGE;

// Notification state, fetching and handlers. Kept as a hook because the navbar
// bell needs isNotificationActive/isLoading while the popup itself is unmounted.
export function useNotifications(user) {
    const [isNotificationActive, setIsNotificationActive] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPossibleRows, setTotalPossibleRows] = useState(1);
    const [notifData, setNotifData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [queryPage, setQueryPage] = useState(1);
    const [statusColPosition, setStatusColPosition] = useState('');
    const maxAllowedPage = Math.ceil(totalPossibleRows / ITEMS_PER_PAGE);

    // Fetch notification data from Google Sheets
    const fetchNotifications = useCallback(async (page) => {
        if (!user || !user.name) return;
        setIsLoading(true);
        try {
            const response = await apiClient.get('/notification', { params:{ page, limit: ROWS_TO_FETCH, name: user.name, role: user.role }});
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
                setQueryPage(Math.floor(newPage / PAGES_PER_FETCH) + 1);
                return newPage;
            });
        } else if (direction === 'next') {
            setCurrentPage(prev => {
                const newPage = Math.min(prev + 1, maxAllowedPage);
                setQueryPage(Math.floor(newPage / PAGES_PER_FETCH) + 1);
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

    return {
        isNotificationActive,
        isLoading,
        notifData,
        currentPage,
        maxAllowedPage,
        setCurrentPage,
        handlePageChange,
        handleMarkAsRead,
    };
}

// Notification pop up container
export function NotifPopup({ notifData, isLoading, currentPage, maxAllowedPage, onPageChange, onMarkAsRead }) {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    // Show only 5 data at a time
    const displayedData = notifData.slice(startIndex, endIndex);

    return (
        <div className="notif-popup-container">
            <div className="notif-popup-header">
                <div className="notif-arrows"><KeyboardDoubleArrowLeftIcon fontSize="small" sx={{visibility: currentPage === 1 ? 'hidden':'visible'}} onClick={() => onPageChange('prev')} /></div>
                <h4>Notifikasi</h4>
                <div className="notif-arrows"><KeyboardDoubleArrowRightIcon fontSize="small" sx={{visibility: currentPage === maxAllowedPage ? 'hidden':'visible'}} onClick={() => onPageChange('next')} /></div>
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
                    <TableNotif content={displayedData} onMarkAsRead={onMarkAsRead} />
                )}
            </div>
        </div>
    )
}
