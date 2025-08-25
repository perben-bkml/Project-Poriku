import React, {useContext} from "react"
import { NavLink } from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";

function Home() {
    //Auth Context
    const { user } = useContext(AuthContext);
    const satkerName = user.name;

    return (
        <div className="home-content">
            <div className="welcome-title slide-up">
                <h1>Selamat datang di Poriku,</h1>
                <h1>{satkerName}!</h1>
            </div>
            <div className="welcome-buttons slide-up">
                    <NavLink to="/menu-bendahara"><button className='page-button'>Menu Bendahara</button></NavLink>
                    <NavLink to="/menu-verifikasi"><button className='page-button'>Menu Verifikasi</button></NavLink>
                    <a href="https://sipku.sg4.quickconnect.to/porikudrive/" target="_blank" rel="noopener noreferrer">
                        <button className="page-button" style={{backgroundColor: "rgb(8, 13, 20)"}}>Login SIPKU</button>
                    </a>
                    <a href="https://sipku.quickconnect.to/sharing/Fu7TsobvY" target="_blank" rel="noopener noreferrer">
                        <button className="page-button" style={{backgroundColor: "rgb(8, 13, 20)"}}>Unggah PJK</button>
                    </a>
            </div>
        </div>
    )
}

export default Home;