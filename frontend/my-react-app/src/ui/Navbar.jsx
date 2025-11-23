import React, {useContext} from "react"
import { NavLink, useLocation } from "react-router-dom"
import {AuthContext} from "../lib/AuthContext.jsx";


export function NewNavbar(){
    // Auth Context
    const { logout } = useContext(AuthContext);

    // Get current location
    const location = useLocation();

    // Helper function to determine if button should be active
    const isActive = (path) => {
        return location.pathname === path ? 'home-button home-button-clicked' : 'home-button';
    };

    return(
        <div className={"home-navbar-content"}>
            <NavLink to="/home"><button className={isActive('/home')}>Home Page</button></NavLink>
            <NavLink to="/menu-bendahara"><button className={isActive('/menu-bendahara')}>Menu Bendahara</button></NavLink>
            <NavLink to="/menu-verifikasi"><button className={isActive('/menu-verifikasi')}>Menu Verifikasi</button></NavLink>
            <a href={`${import.meta.env.VITE_LOGIN_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                <button className="home-button home-button-external">Login SIPKU</button>
            </a>
            <a href={`${import.meta.env.VITE_UNGGAH_SIPKU_URL}`} target="_blank" rel="noopener noreferrer">
                <button className="home-button home-button-external">Unggah PJK</button>
            </a>
            <button className='home-button home-button-logout' onClick={logout}>Log Out</button>
        </div>
    )
}