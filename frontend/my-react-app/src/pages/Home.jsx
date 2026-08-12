import React, {useContext, useEffect, useMemo, useState} from "react"
import { AuthContext } from "../lib/AuthContext";
import {monthNames} from "../components/verifikasi/head-data.js";
import apiClient from "../lib/apiClient";
import { PILOT, isPilotUser } from "../lib/pilot.js";
import LoadingAnimate from "../ui/loading.jsx"
import { NewNavbar } from "../ui/Navbar.jsx"
import { RealisasiCircle } from "../ui/cards.jsx"
import { TableRealisasiLite } from "../ui/tables.jsx"

function Home() {
    //Auth Context
    const { user } = useContext(AuthContext);
    const satkerName = user.name;
    const userRole = user.role;
    const isAdmin = ["admin", "master admin", "admin_gaji"].includes(userRole);
    // Pilot hold: the counters are shown to the admin roles and to the pilot satker for
    // now. The route stays open to role="user" and scopes itself to their own satker, so
    // flipping the flag off is all that is needed to hand the dashboard back to everyone.
    const showDashboard = isAdmin || isPilotUser(user) || !PILOT.hideHomeDashboardFromUser;

    //State
    const [realisasi, setRealisasi] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [monthFilter, setMonthFilter] = useState(() => {
        const saved = localStorage.getItem('home-realisasi-month');
        return saved ? JSON.parse(saved) : "";
    });

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

    // The route already scopes itself to the viewer: role="user" gets only its own
    // satker, admin roles get every unit kerja rolled into totals.
    async function fetchRealisasi() {
        try {
            setIsLoading(true);
            const response = await apiClient.get('/verifikasi/realisasi-anggaran');
            if (response.status === 200) setRealisasi(response.data);
        } catch (error) {
            console.error("Error fetching realisasi.", error);
        } finally {
            setIsLoading(false);
        }
    }

    async function fetchDashboard() {
        try {
            const response = await apiClient.get('/home/dashboard');
            if (response.status === 200) setDashboard(response.data);
        } catch (error) {
            console.error("Error fetching dashboard.", error);
        }
    }

    useEffect(() => {
        fetchRealisasi();
        if (showDashboard) fetchDashboard();
    }, [showDashboard])

    function handleMonthChange(event) {
        setMonthFilter(event.target.value);
        localStorage.setItem('home-realisasi-month', JSON.stringify(event.target.value));
    }

    const liteData = useMemo(() => {
        if (!realisasi) return null;
        const {anggaran, belanja, monthly} = realisasi.totals;
        const spent = monthFilter
            ? monthly.filter(bucket => bucket.month <= parseInt(monthFilter, 10)).reduce((sum, bucket) => sum + bucket.total, 0)
            : belanja.total;
        const persenAngka = anggaran.total ? (spent / anggaran.total) * 100 : 0;
        return {
            anggaran: anggaran.total,
            belanja: spent,
            sisa: anggaran.total - spent,
            persenAngka,
            persen: anggaran.total ? `${persenAngka.toFixed(2)}%` : "-",
            kosong: realisasi.summary.length === 0,
        };
    }, [realisasi, monthFilter]);

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
            <div className={`home-dashboard${showDashboard ? "" : " home-dashboard-solo"}`}>
                <div className="home-dashboard-left">
                    <h3 className={"dashboard-title"}>
                        {isAdmin ? "Realisasi Anggaran" : `Realisasi Anggaran ${satkerName}`}
                    </h3>
                    <div className="dashboard-realisasi">
                        <div className="dashboard-realisasi-filter">
                            <label htmlFor="realisasi-month">Bulan:</label>
                            <select id="realisasi-month" value={monthFilter} onChange={handleMonthChange}>
                                {monthNames.map((month, index) => (
                                    <option key={index} value={month.value}>{month.title || "Semua Bulan"}</option>
                                ))}
                            </select>
                            <span className="dashboard-realisasi-note">Berdasarkan Data Bagian Keuangan</span>
                        </div>
                        {isLoading || !liteData ? <LoadingAnimate /> :
                            liteData.kosong ?
                                <p className="dashboard-realisasi-empty">
                                    Data anggaran untuk {satkerName} belum tersedia.
                                </p> :
                                <div className="dashboard-realisasi-body">
                                    <RealisasiCircle percent={liteData.persenAngka} />
                                    <TableRealisasiLite anggaran={liteData.anggaran} belanja={liteData.belanja}
                                                        sisa={liteData.sisa} persen={liteData.persen} />
                                </div>
                        }
                    </div>
                </div>
                {showDashboard && <div className="home-dashboard-right">
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
                </div>}
            </div>
        </div>
    )
}

export default Home;