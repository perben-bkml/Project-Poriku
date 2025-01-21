import React from "react";

// import icons material ui
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

function Popup(props) {
    return (
        <div className="popup-wrapper">
            <div className="popup">
                <div className="popup-text">
                    <h2>Apakah anda yakin data sudah benar?</h2>   
                </div>
                <div className="popup-btn">
                    <CheckCircleIcon sx={{ color: "green", height:"45px", width:"45px" }} onClick={props.whenClick}/>
                    <CancelIcon sx={{ color: "red", height:"45px", width:"45px" }} onClick={props.cancel}/>
                </div>
            </div>
        </div>

    )
}

export default Popup;

