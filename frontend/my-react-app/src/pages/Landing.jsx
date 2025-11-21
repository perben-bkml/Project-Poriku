import React, { useContext } from 'react'
import {NavLink} from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";
import {LoadingScreen} from "../ui/loading";
import Avatar from "@mui/material/Avatar";

export default function Landing() {
    //Auth Context
    const { isAuthenticated, isLoading } = useContext(AuthContext);

    if (isLoading) return <LoadingScreen />;

    return (
        <div className='landing-page'>
            <div className='landing-page-ship'>
                <Avatar className='landing-page-bakamla' sx={{width: 90, height: 90}} alt="bakamla-logo" src="/assets/bakamla_logo.svg" />
                <img className='landing-page-ship-img slide-right' src={"/assets/Main Menu/Kapal.svg"} alt="Kapal Bakamla" />
            </div>
            <div className='landing-title slide-down'>
                <div className={'landing-page-tulip'}>
                    <img className='landing-page-tulip-logo' src={"/assets/Main Menu/Logo tulip biru.svg"} alt="Tulip Bakamla" />
                </div>
                <h1 className={'landing-h1'}>PO{<h1 className={'landing-h1 h1-unique'}>RI</h1>}KU</h1>
                <p className={'landing-p'}>Portal Informasi Keuangan</p>
                <div className="landing-buttons slide-down">
                    <NavLink to="/layanan-gaji"><button className='page-button-landing'>Layanan Gaji</button></NavLink>
                    <NavLink to={isLoading && isAuthenticated ? "/home" : "/login"}><button className='page-button-landing'>Login</button></NavLink>
                </div>
                <div className={'landing-page-decoration'}>
                    <img className='landing-page-hut-ri' src={"/assets/Main Menu/Logo HUT RI 80.svg"} alt="Hut Republik Indonesia" />
                </div>
            </div>
        </div>
    )
}