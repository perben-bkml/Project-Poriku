import React, {useContext, useEffect, useState} from "react"
import { AuthContext } from "../lib/AuthContext";
import {userSatkerNames} from "../components/verifikasi/head-data.js";
import axios from "axios";
import LoadingAnimate from "../ui/loading.jsx"
import { NewNavbar } from "../ui/Navbar.jsx"

function Home() {
    //Auth Context
    const { user } = useContext(AuthContext);
    const satkerName = user.name;
    const userRole = user.role;

    //State
    const [dashboardData, setDashboardData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    //PJK dashboard items
    const cardTitles = [
        {title: "Total PJK", content: dashboardData[0], bgColor: "#00449C"},
        {title: "Belum Terkumpul", content: dashboardData[1], bgColor: "#BD1404"},
        {title: "Tertolak", content: dashboardData[2], bgColor: "#811105"},
        {title: "Lengkap Dengan Catatan", content: dashboardData[3], bgColor: "#016FFC"},
        {title: "Lengkap", content: dashboardData[4], bgColor: "#00449C"}
    ]

    function PjkCards(props) {
        return(
            <div className={"dashboard-pjk-card"}>
                <div className={"dashboard-pjk-card-icon"} style={{backgroundColor: props.bgColor}}>{props.content}</div>
                <p className={"dashboard-pjk-card-text"}>{props.title}</p>
            </div>
        )
    }

    async function fetchData() {
        const rowsPerPage = 10;
        let satkerPrefix = userSatkerNames.find(item => item.title === user.name)?.value || "";
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/verifikasi/data-pjk`, { params:{ satkerPrefix, filterKeyword: "", page: 1, limit: rowsPerPage, monthKeyword: "" }});
            if (response.status === 200){
                const { data: rowData, totalPages, countData, message } = response.data;
                setDashboardData(countData);
                setIsLoading(false);
                // if (message === false) {
                //     setIsAlert(true);
                //     setTimeout(() => setIsAlert(false), 3000);
                // }
            }
        } catch (error) {
            console.error("Error fetching data.", error);
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])


    return (
        <div className="home-content">
            <div className={"home-navbar"}>
                <NewNavbar />
            </div>
            <div className="welcome-title slide-up">
                <h1 className={"welcome-title-text"} style={{fontSize: "2.5rem", fontWeight:"100"}}>Selamat datang di Poriku </h1>
                <h2 className={"welcome-title-text"} style={{fontSize: "2.5rem", fontWeight:"600"}}>{satkerName}</h2>
                <h3 className={"welcome-title-text"} style={{fontStyle: "italic", fontSize: "1.9rem", fontWeight:"500", marginTop:"20px"}}>
                    {userRole != "master admin"? (userRole == "admin" ? "Staff Bagian Keuangan ": "Admin PPK Unit Kerja"  ) : "Super User"}</h3>

            </div>
            <div className="home-dashboard">
                <div className="home-dashboard-left">
                    <h3 className={"dashboard-title"}>Status PJK</h3>
                    {isLoading ? <LoadingAnimate /> :
                    <div className={"dashboard-status-pjk"}>
                        {cardTitles.map((card, index) => (
                            <PjkCards key={index} title={card.title} content={card.content} bgColor={card.bgColor} />
                            ))
                        }
                    </div>
                    }
                </div>
                <div className="home-dashboard-right">
                    <h3 className={"dashboard-title"} style={{fontStyle: "italic", fontSize: "1.9rem", opacity:"0.3"}}>
                        Nantikan tampilan dashboard terbaru...</h3>
                </div>
            </div>
        </div>
    )
}

export default Home;