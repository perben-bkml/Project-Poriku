import React from "react"
import {NavLink} from "react-router-dom";

export default function NotFound() {
    return (
        <div className='landing-page'>
            <div className='landing-title slide-down'>
                <h1>Maaf, halaman tidak ditemukan</h1>
                <h1>(404)</h1>
            </div>
            <div className="landing-buttons slide-down">
                <NavLink to="/"><button className='page-button'>Halaman Utama</button></NavLink>
            </div>
        </div>
    )
}