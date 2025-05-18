import React, { useContext } from 'react'
import {NavLink} from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";
import {LoadingScreen} from "../ui/loading";

export default function Landing() {
    //Auth Context
    const { isAuthenticated, isLoading } = useContext(AuthContext);

    if (isLoading) return <LoadingScreen />;

    return (
        <div className='landing-page'>
            <div className='landing-title slide-down'>
                <h1>Portal Informasi Keuangan</h1>
                <h1>Bakamla RI</h1>
            </div>
            <div className="landing-buttons slide-down">
                <NavLink to={isLoading && isAuthenticated ? "/home" : "/login"}><button className='page-button'>Layanan Ajuan</button></NavLink>
                <NavLink to="/layanan-gaji"><button className='page-button'>Layanan Gaji</button></NavLink>
            </div>
        </div>
    )
}