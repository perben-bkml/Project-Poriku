import React, { useState, useEffect } from "react";

// import icons material ui
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

function Popup(props) {
    const [popupType, setPopupType] = useState(true)
    // Handling Popup to delete bendahara pengajuan
    useEffect(() => {
        if (props.type === "delete") {
            setPopupType(false)
        }
    })

    return (
        <div className="popup-wrapper">
            <div className="popup">
                <div className="popup-text">
                    {popupType ? <h2>Apakah anda yakin data sudah benar?</h2> : <h2>Apakah anda yakin untuk menghapus data?</h2>}
                </div>
                <div className="popup-btn">
                    <CheckCircleIcon sx={{ color: "green", height:"45px", width:"45px" }} onClick={popupType? props.whenClick : props.whenDel}/>
                    <CancelIcon sx={{ color: "red", height:"45px", width:"45px" }} onClick={popupType? props.cancel : props.whenCancel}/>
                </div>
            </div>
        </div>

    )
}

export default Popup;

