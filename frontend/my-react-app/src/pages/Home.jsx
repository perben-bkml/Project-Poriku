import React from "react"
import { NavLink } from "react-router-dom";

function Home() {
    const satkerName = "Biro Umum";

    return (
        <div className="home-content">
            <div className="welcome-title">
                <h1>Selamat datang di Poriku,</h1>
                <h1>{satkerName}!</h1>
            </div>
            <div className="welcome-buttons">
                <NavLink to="/menu-bendahara"><button>Menu Bendahara</button></NavLink>
                <NavLink to="/menu-verifikasi"><button>Menu Verifikasi</button></NavLink>
                <button>Login SIPKU</button>
            </div>
        </div>
    )
}

export default Home;