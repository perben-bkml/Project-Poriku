import React from "react";
// Import Icons
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import Avatar from '@mui/material/Avatar';

function Pengajuan(props) {

    return (
        <div className="pengajuan-info">
            <div className="info nomor">
                <p>No. Pengajuan</p>
                <Avatar className="info-avatar" sx={{ bgcolor: "#0a0f1b", width: 38, height: 38, fontSize:"0.9rem", marginTop: "2px", marginLeft:"35px"}}>{props.numbers}</Avatar>
            </div>
            <div className="info tanggal">
                <p>Tanggal Pengajuan:</p>
                <p className="info data">{props.createDate}</p>
            </div>
            <div className="info setuju">
                <p>Tanggal yang Disetujui:</p>
                <p className="info data">{props.accDate}</p>
            </div>
            <div className="info status">
                <p>Status Pengajuan:</p>
                <p className="info data">{props.status}</p>
            </div>
            <div className="info-ubah">
                <RemoveRedEyeIcon sx={{fontSize: 30}}/>
                <EditIcon sx={{fontSize: 30}} />
                <DeleteForeverIcon sx={{fontSize: 30}} />

            </div>
        </div>
    )
}

export default Pengajuan;