import {useContext, useEffect, useMemo, useState} from "react"
import { AuthContext } from "../lib/AuthContext";
import apiClient from "../lib/apiClient";
import LoadingAnimate from "../ui/loading.jsx"
import { NewNavbar } from "../ui/Navbar.jsx"
import { RealisasiCircle } from "../ui/cards.jsx";
import {formatRupiah} from "../components/bendahara/head-data.js";

function Home() {
    //Auth Context
    const { user } = useContext(AuthContext);
    const satkerName = user.name;
    const userRole = user.role;

    //State
    const [dashboard, setDashboard] = useState(null);
    const [anggaran, setAnggaran] = useState(null);
    const [anggaranError, setAnggaranError] = useState("");

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

    useEffect(() => {
        const controller = new AbortController();
        async function fetchAnggaran() {
            try {
                // The API scopes units by the authenticated viewer, just as in Anggaran.jsx.
                const response = await apiClient.get('/anggaran', {signal: controller.signal});
                setAnggaran(response.data);
            } catch (error) {
                if (!controller.signal.aborted) {
                    setAnggaranError(error.response?.data?.message || "Gagal memuat realisasi anggaran.");
                }
            }
        }
        fetchAnggaran();
        return () => controller.abort();
    }, []);

    const ringkasan = useMemo(() => {
        if (!anggaran) return null;
        // Sum only unit totals: MAK and akun repeat the same budget at lower levels.
        const totals = anggaran.anggaran.reduce((sum, unit) => ({
            pagu: sum.pagu + unit.pagu,
            terpakai: sum.terpakai + unit.terpakai,
        }), {pagu: 0, terpakai: 0});
        return {...totals, sisa: totals.pagu - totals.terpakai,
            persen: totals.pagu ? totals.terpakai / totals.pagu * 100 : 0};
    }, [anggaran]);

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
                <div className="home-dashboard-left">
                    <h3 className="dashboard-title">
                        {userRole === "user" ? `Realisasi Anggaran ${satkerName}` : "Realisasi Anggaran"}
                    </h3>
                    <div className="dashboard-realisasi" aria-live="polite">
                        {anggaranError ? <p className="dashboard-realisasi-empty" role="alert">{anggaranError}</p> :
                            !ringkasan ? <LoadingAnimate /> :
                                anggaran.anggaran.length === 0 ?
                                    <p className="dashboard-realisasi-empty">
                                        {userRole === "user" ? `Data anggaran untuk ${satkerName}` : "Data anggaran"} tahun {selectedYear} belum tersedia.
                                    </p> : <>
                                        <div className="dashboard-realisasi-body">
                                            <RealisasiCircle percent={ringkasan.persen}/>
                                            <dl className="dashboard-realisasi-totals">
                                                {[
                                                    ["Pagu Anggaran", formatRupiah(ringkasan.pagu)],
                                                    ["Terpakai", formatRupiah(ringkasan.terpakai)],
                                                    ["Sisa Anggaran", formatRupiah(ringkasan.sisa)],
                                                    ["Persentase", ringkasan.pagu ? `${ringkasan.persen.toFixed(2)}%` : "-"],
                                                ].map(([label, value]) => <div key={label}>
                                                    <dt>{label}</dt><dd>{value}</dd>
                                                </div>)}
                                            </dl>
                                        </div>
                                        <p className="dashboard-realisasi-note">
                                            {anggaran.sinkron?.disegarkanPada
                                                ? `Realisasi diperbarui ${new Date(anggaran.sinkron.disegarkanPada).toLocaleString("id-ID")}`
                                                : "Realisasi belum pernah dihitung. Periksa data pada menu Anggaran."}
                                        </p>
                                    </>}
                    </div>
                </div>
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
