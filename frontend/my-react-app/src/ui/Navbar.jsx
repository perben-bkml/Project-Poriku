import React from "react"
import { NavLink } from "react-router-dom"


function Navbar(){
    return(
        <div className="Nav-bar">
            <NavLink to="/home"><img className="poriku-1" src="../../public/assets/Poriku_Cat1.png" alt="Poriku Logo 1" /></NavLink>
            <div className="Nav-link">
                <p><NavLink to="/menu-bendahara">Menu Bendahara</NavLink></p>
                <p><NavLink to="/menu-verifikasi">Menu Verifikasi</NavLink></p>
                <p><button className="Nav-SIPKU">Login SIPKU</button></p>
            </div>
        </div>
    )
}

export default Navbar;