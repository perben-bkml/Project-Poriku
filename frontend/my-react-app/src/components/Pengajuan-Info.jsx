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
                <p>ID Pengajuan</p>
                <Avatar sx={{ bgcolor: "#0a0f1b", width: 28, height: 28, fontSize:"1rem", marginTop: "5px", marginLeft:"33px"}}>{props.numbers}</Avatar>
            </div>
            <div className="info tanggal">
                <p>Tanggal Pengajuan:</p>
                <p className="info data">2000</p>
            </div>
            <div className="info status">
                <p>Status Pengajuan:</p>
                <p className="info data">Sudah</p>
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