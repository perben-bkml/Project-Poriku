import React from "react";
// Material UI icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import { createTheme } from "@mui/material";

function Bendahara() {
    return (
        <div className="bendahara-home">
            <div className="dash-title">
                <h2>Menu<br /> Bendahara</h2>
            </div>
            <div className="page-content">
                <h1>Test Page</h1>
            </div>
            <div className="dash-content">
                <button><AssignmentIcon fontSize="small"/><span className="padd-span-bend"/>Daftar Pengajuan</button>
                <button><ChecklistIcon fontSize="small"/><span className="padd-span-bend"/>Lihat Antrian</button>
            </div>
        </div>
    )
}

export default Bendahara;