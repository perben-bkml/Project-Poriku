import {useContext, useEffect, useMemo, useState} from "react"
import { AuthContext } from "../lib/AuthContext";
import apiClient from "../lib/apiClient";
import LoadingAnimate from "../ui/loading.jsx"
import { NewNavbar } from "../ui/Navbar.jsx"

function Home() {
    //Auth Context
    const { user } = useContext(AuthContext);
    const satkerName = user.name;
    const userRole = user.role;

    //State
    const [dashboard, setDashboard] = useState(null);

    // Year state (load from localStorage or default to current year)
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(() => {
        const saved = localStorage.getItem('poriku-selected-year');
        return saved || currentYear.toString();
    });

    // Handle year change
    const handleYearChange = (e) => {
        const newYear = e.target.value;
        setSelectedYear(newYear);
        localStorage.setItem('poriku-selected-year', newYear);
        window.location.reload(); // Reload to apply year change
    };

    async function fetchDashboard() {
        try {
            const response = await apiClient.get('/home/dashboard');
            if (response.status === 200) setDashboard(response.data);
        } catch (error) {
            console.error("Error fetching dashboard.", error);
        }
    }

    useEffect(() => {
        fetchDashboard();
    }, [])

    const dashboardSections = useMemo(() => dashboard ? [
        {title: "Data Pengajuan", cards: [
            {label: "Belum", value: dashboard.pengajuan.belum},
            {label: "Sedang Verif", value: dashboard.pengajuan.sedang},
            {label: "Sudah Verif", value: dashboard.pengajuan.sudah},
        ]},
        {title: "Data SPM", cards: [
            {label: "Total", value: dashboard.spm.total},
            {label: "UP", value: dashboard.spm.up},
            {label: "LS", value: dashboard.spm.ls},
        ]},
    ] : [], [dashboard]);


    return (
        <div className="home-content">
            <div className={"home-navbar"}>
                <NewNavbar />
            </div>
            <div className="welcome-title slide-up">
                <h1 className={"welcome-title-text"} style={{fontSize: "2.5rem", fontWeight:"100"}}>Selamat datang di Poriku </h1>
                <h2 className={"welcome-title-text"} style={{fontSize: "2.5rem", fontWeight:"600"}}>{satkerName}</h2>

                {/* Year Selector */}
                <div className={"welcome-title-year"}>
                    <label htmlFor="year-select">
                        Tahun:
                    </label>
                    <select
                        id="year-select"
                        value={selectedYear}
                        onChange={handleYearChange}
                    >
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                    </select>
                </div>

                <h3 className={"welcome-title-text"} style={{fontStyle: "italic", fontSize: "1.9rem", fontWeight:"500", marginTop:"20px"}}>
                    {userRole === "master admin" ? "Super User"
                        : userRole === "admin" ? "Staff Bagian Keuangan "
                        : userRole === "admin_gaji" ? "Admin Gaji"
                        : "Admin PPK Unit Kerja"}</h3>

            </div>
            <div className="home-dashboard">
                <div className="home-dashboard-right">
                    {!dashboard ? <LoadingAnimate /> :
                        dashboardSections.map(section => (
                            <div key={section.title} className="dashboard-counts">
                                <h3 className="dashboard-title">{section.title}</h3>
                                <div className="dashboard-counts-row">
                                    {section.cards.map(card => (
                                        <div key={card.label} className="dashboard-count-card">
                                            <span className="dashboard-count-value">{card.value}</span>
                                            <span className="dashboard-count-label">{card.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

export default Home;
