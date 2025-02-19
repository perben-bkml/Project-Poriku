import React, { useState, useEffect } from "react";

// import icons material ui
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import Alert from '@mui/material/Alert';
import Fade from "@mui/material/Fade";

function Popup(props) {
    const [popupType, setPopupType] = useState(true)
    // Handling Popup to delete bendahara pengajuan
    useEffect(() => {
        if (props.type === "delete") {
            setPopupType(false)
        }
    })

    const ketentuanPopupText = () => {
        return (
            <div className="ketentuan-text">
                <h2>Kepada Yth. Admin PPK dan BPP,</h2>
                <p>Mohon untuk mengisi data pengajuan pada aplikasi ini setiap kali melakukan pengajuan pencairan dana kepada Bendahara.
                Harap memastikan pengisian dilakukan dengan benar sesuai instruksi yang tercantum dan memperhatikan beberapa ketentuan di bawah berikut.
                </p>
                <h3>Waktu Pemrosesan Pengajuan</h3>
                <ul>
                    <li><strong>Pengajuan yang diterima sebelum pukul 15.00 WIB akan diproses paling cepat 1 (satu) hari kerja setelah formulir diterima. </strong>
                        Contoh: Formulir diisi pada hari Senin pukul 10.00 WIB, maka pengajuan akan diverifikasi pada hari Senin dan bisa masuk antrian GUP paling cepat hari Selasa.</li>
                    <br/>
                    <li><strong>Pengajuan yang diisi setelah pukul 15.00 WIB akan dianggap diterima pada hari kerja berikutnya. </strong>
                        Contoh: Jika formulir diisi pada hari Senin pukul 15.30 WIB, maka pengajuan tersebut akan dianggap masuk pada hari Selasa, sehingga akan diverifikasi pada hari Selasa dan diproses masuk antrian GUP paling cepat Rabu.</li>
                    <br/>
                    <li>Perlu diperhatikan, <strong>dalam hal terjadi kendala diluar kendali (seperti aplikasi SAKTI yang bermasalah), waktu pemrosesan pengajuan akan mundur</strong> hingga kondisi kembali seperti semula.</li>
                </ul>
            </div>
        )
    }

    return (
        <div className="popup-wrapper" onClick={props.type === "ketentuan-bendahara" ? props.whenClick : null}>
            <div className={`popup ${props.type === "ketentuan-bendahara" && "ketentuan"}`}>
                <div className="popup-text">
                    {props.type !== "ketentuan-bendahara"? (
                        popupType ? <h2>Apakah anda yakin data sudah benar?</h2> : <h2>Apakah anda yakin untuk menghapus data?</h2>
                    )
                    :(ketentuanPopupText())}
                    
                </div>
                <div className="popup-footer">
                    {props.type !== "ketentuan-bendahara" && (
                    <div className="popup-btn">
                        <CheckCircleIcon sx={{ color: "green", height:"45px", width:"45px" }} onClick={popupType? props.whenClick : props.whenDel}/>
                        <CancelIcon sx={{ color: "red", height:"45px", width:"45px" }} onClick={popupType? props.cancel : props.whenCancel}/>
                    </div>
                    )}

                </div>
            </div>
        </div>

    )
}

export default Popup;

export function PopupAlert(props) {
    return (
        <div style={{
            position: "fixed",
            top: "100px",
            right: "16px",
            zIndex: 1300, // Ensure it's above other components
        }}>
            <Fade in={props.isAlert}>
                <Alert severity={props.severity}  
                    sx={{ width: "280px"}}>
                    {props.message}
                </Alert>
            </Fade>
        </div>
    )
}