import React, { useContext } from 'react'
import {NavLink} from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";

export default function Landing() {
    //Auth Context
    const { isAuthenticated } = useContext(AuthContext);

    return (
        <div className='landing-page'>
            <div className='landing-title slide-down'>
                <h1>Portal Informasi Keuangan</h1>
                <h1>Bakamla RI</h1>
            </div>
            <div className="landing-buttons slide-down">
                <NavLink to={isAuthenticated ? "/home" : "/login"}><button className='page-button'>Layanan Ajuan</button></NavLink>
                <NavLink to="/"><button className='page-button'>Layanan Gaji</button></NavLink>
            </div>
        </div>
    )
}