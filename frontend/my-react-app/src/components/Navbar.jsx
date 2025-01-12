import React from "react"
import { NavLink } from "react-router-dom"
import "../../public/styles/component.css"

function Navbar(){
    return(
        <div className="Nav-bar">
            <img className="poriku-1" src="../../public/assets/Poriku_Cat1.png" alt="Poriku Logo 1" />
            <div className="Nav-link">
                <p>Menu Bendahara</p>
                <p>Menu Verifikasi</p>
                <p><button className="Nav-SIPKU">LOGIN SIPKU</button></p>
            </div>
        </div>
    )
}

export default Navbar;