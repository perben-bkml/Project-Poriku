import React, {useContext} from "react"
import { NavLink } from "react-router-dom"
import {AuthContext} from "../lib/AuthContext.jsx";


export default function Navbar(){
    return(
        <div className="Nav-bar">
            <div className="poriku-1">
                <NavLink to="/home"><img src="/assets/Poriku_Cat1.svg" alt="Poriku Logo 1" width="180" height="80" fetchPriority="high" loading="eager" /></NavLink>
            </div>
            <div className="Nav-link">
                <p><NavLink to="/menu-bendahara">Menu Bendahara</NavLink></p>
                <p><NavLink to="/menu-verifikasi">Menu Verifikasi</NavLink></p>
                <p>
                    <a href={`${import.meta.env.VITE_LOGIN_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                        <button className="Nav-SIPKU">Login SIPKU</button>
                    </a>
                </p>
            </div>
        </div>
    )
}

export function NewNavbar(){
    // Auth Context
    const { logout } = useContext(AuthContext);

    return(
        <div className={"home-navbar-content"}>
            <NavLink to="/home"><button className='home-button home-button-clicked'>Home Page</button></NavLink>
            <NavLink to="/menu-bendahara"><button className='home-button'>Menu Bendahara</button></NavLink>
            <NavLink to="/menu-verifikasi"><button className='home-button'>Menu Verifikasi</button></NavLink>
            <a href={`${import.meta.env.VITE_LOGIN_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                <button className="home-button">Login SIPKU</button>
            </a>
            <a href={`${import.meta.env.VITE_UNGGAH_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                <button className="home-button">Unggah PJK</button>
            </a>
            <button className='home-button' onClick={logout}>Log Out</button>
        </div>
    )
}