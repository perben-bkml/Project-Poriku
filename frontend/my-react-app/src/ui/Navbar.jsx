import React from "react"
import { NavLink } from "react-router-dom"


function Navbar(){
    return(
        <div className="Nav-bar">
            <div className="poriku-1">
                <NavLink to="/home"><img src="/assets/Poriku_Cat1.svg" alt="Poriku Logo 1" width="180" height="80" fetchPriority="high" loading="eager" /></NavLink>
            </div>
            <div className="Nav-link">
                <p><NavLink to="/menu-bendahara">Menu Bendahara</NavLink></p>
                <p><NavLink to="/menu-verifikasi">Menu Verifikasi</NavLink></p>
                <p>
                    <a href="https://quickconnect.to/sipku" target="_blank" rel="noopener noreferrer">
                        <button className="Nav-SIPKU">Login SIPKU</button>
                    </a>
                </p>
            </div>
        </div>
    )
}

export default Navbar;