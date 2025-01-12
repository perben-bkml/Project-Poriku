import React from "react"

function Home() {
    const satkerName = "Biro Umum";

    return (
        <div className="home-content">
            <div className="welcome-title">
                <h1>Selamat datang di Poriku,</h1>
                <h1>{satkerName}!</h1>
            </div>
            <div className="welcome-buttons">
                <button>Menu Bendahara</button>
                <button>Menu Verifikasi</button>
                <button>Login SIPKU</button>
            </div>
        </div>
    )
}

export default Home;