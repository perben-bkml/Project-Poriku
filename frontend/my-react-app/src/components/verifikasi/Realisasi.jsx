import {useEffect, useMemo, useState} from 'react';
import apiClient from "../../lib/apiClient";
//Import Components
import LoadingAnimate from "../../ui/loading.jsx";
import {PopupAlert} from "../../ui/Popup.jsx";
import {monthNames} from "./head-data.js";
//Import Tables
import {TableAnggaran, TableRealisasi, TableRealisasiJenisBelanja} from "../../ui/tables.jsx";

// Mirrors columns B, C and D of the Code_Anggaran sheet. Adding a fund source means
// adding it here and in FUND_KEYS on the backend - nothing else is hardcoded.
const FUNDS = [
    {key: "rupiahMurni", label: "Rupiah Murni"},
    {key: "sbsn", label: "SBSN"},
    {key: "pln", label: "PLN"},
];

const JENIS_BELANJA = ["51", "52", "53"];

// One fetch holds the whole year broken down per month, so moving the month filter
// is pure arithmetic on data already in memory - no second request.
function formatRupiah(nominal) {
    return `Rp ${Math.round(nominal).toLocaleString('id-ID')}`;
}

// Realisasi is only meaningful once a ceiling exists - "-" beats a fake 0.00%
function formatPercent(belanja, anggaran) {
    if (!anggaran) return "-";
    return `${((belanja / anggaran) * 100).toFixed(2)}%`;
}

// Spending from January up to and including the selected month. An empty filter
// means the whole year, which also covers rows whose Tanggal SP2D is unreadable.
function belanjaUpToMonth(entry, monthValue) {
    if (!monthValue) return entry.belanja.total;
    const lastMonth = parseInt(monthValue, 10);
    return entry.monthly
        .filter(bucket => bucket.month <= lastMonth)
        .reduce((sum, bucket) => sum + bucket.total, 0);
}

function jenisUpToMonth(bucket, monthValue) {
    if (!bucket) return 0;
    if (!monthValue) return bucket.total;
    return bucket.monthly.slice(0, parseInt(monthValue, 10)).reduce((sum, nominal) => sum + nominal, 0);
}

export default function Realisasi() {
    //State
    const [isLoading, setIsLoading] = useState(false);
    // Per row status, so saving one satker never touches another row's typed value
    const [rowStatus, setRowStatus] = useState({});
    const [data, setData] = useState(null);
    const [monthFilter, setMonthFilter] = useState(() => {
        const saved = localStorage.getItem('realisasi-month-filter');
        return saved ? JSON.parse(saved) : "";
    });
    const [draftBudget, setDraftBudget] = useState({});
    const [alert, setAlert] = useState(null);
    const [hideZeroBudget, setHideZeroBudget] = useState(() => {
        const saved = localStorage.getItem('realisasi-hide-zero-budget');
        return saved ? JSON.parse(saved) : false;
    });

    function toggleHideZeroBudget() {
        setHideZeroBudget(prev => {
            localStorage.setItem('realisasi-hide-zero-budget', JSON.stringify(!prev));
            return !prev;
        });
    }

    function showAlert(severity, message) {
        setAlert({severity, message});
        setTimeout(() => setAlert(null), 4000);
    }

    //Fetch Data
    async function fetchRealisasi() {
        try {
            setIsLoading(true);
            const response = await apiClient.get('/verifikasi/realisasi-anggaran');
            if (response.status === 200) {
                setData(response.data);
                // Drop any half typed edits - the sheet is the source of truth again
                setDraftBudget({});
            }
        } catch (error) {
            console.error("Error fetching realisasi anggaran.", error);
            showAlert("error", "Gagal memuat data realisasi anggaran.");
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchRealisasi();
    }, []);

    //Handle Filter Changes
    function handleMonthChange(event) {
        const value = event.target.value;
        setMonthFilter(value);
        localStorage.setItem('realisasi-month-filter', JSON.stringify(value));
    }

    //Handle Anggaran Edit
    function handleDraftChange(satker, field, value) {
        // Keep digits only - the sheet stores plain numbers
        const digits = value.replace(/[^0-9]/g, "");
        setDraftBudget(prev => ({...prev, [satker]: {...prev[satker], [field]: digits}}));
        // Typing again clears the previous result badge on that row
        setRowStatus(prev => (prev[satker] ? {...prev, [satker]: undefined} : prev));
    }

    // Fold a saved row back into state by hand instead of refetching. A refetch would
    // replace the whole table and throw away every other row still being typed into.
    function applySavedBudget(satker, saved) {
        setData(prev => {
            if (!prev) return prev;
            const anggaran = {total: 0};
            const savedNominal = {};
            FUNDS.forEach(({key}) => {
                const nominal = parseInt(saved[key], 10) || 0;
                anggaran[key] = nominal;
                anggaran.total += nominal;
                savedNominal[key] = saved[key];
                savedNominal[`${key}Nominal`] = nominal;
            });

            const budgets = prev.budgets.map(budget => budget.satker === satker
                ? {...budget, ...savedNominal}
                : budget);
            const summary = prev.summary.map(entry => entry.satker === satker ? {...entry, anggaran} : entry);
            // Grand total has to follow the row that just changed
            const totalAnggaran = summary.reduce((totals, entry) => {
                const next = {...totals, total: totals.total + entry.anggaran.total};
                FUNDS.forEach(({key}) => { next[key] = totals[key] + entry.anggaran[key]; });
                return next;
            }, FUNDS.reduce((seed, {key}) => ({...seed, [key]: 0}), {total: 0}));

            return {...prev, budgets, summary, totals: {...prev.totals, anggaran: totalAnggaran}};
        });
    }

    async function handleSaveBudget(budget) {
        const draft = draftBudget[budget.satker] || {};
        const payload = {satker: budget.satker};
        FUNDS.forEach(({key}) => { payload[key] = draft[key] ?? budget[key]; });

        try {
            setRowStatus(prev => ({...prev, [budget.satker]: "saving"}));
            const response = await apiClient.patch('/verifikasi/code-anggaran', payload);
            if (response.status === 200) {
                // Trust the values the sheet echoed back, not the ones typed
                applySavedBudget(budget.satker, response.data.data);
                // Only this row's draft is dropped, the rest keep whatever is typed in them
                setDraftBudget(prev => {
                    const next = {...prev};
                    delete next[budget.satker];
                    return next;
                });
                setRowStatus(prev => ({...prev, [budget.satker]: "saved"}));
                setTimeout(() => setRowStatus(prev => ({...prev, [budget.satker]: undefined})), 3000);
            }
        } catch (error) {
            console.error("Error saving anggaran.", error);
            setRowStatus(prev => ({...prev, [budget.satker]: "error"}));
            showAlert("error", error.response?.data?.message || `Gagal menyimpan anggaran ${budget.satker}.`);
        }
    }

    const visibleEntries = useMemo(() => {
        if (!data) return [];
        return hideZeroBudget ? data.summary.filter(entry => entry.anggaran.total > 0) : data.summary;
    }, [data, hideZeroBudget]);

    // Recompute only when the data or the month actually changes
    const rows = useMemo(() => visibleEntries.map(entry => {
        const belanja = belanjaUpToMonth(entry, monthFilter);
        return {
            satker: entry.satker,
            matched: entry.matched,
            anggaran: entry.anggaran.total,
            belanja,
            realisasi: entry.anggaran.total - belanja,
            persen: formatPercent(belanja, entry.anggaran.total),
            // Bar is capped at 100% so an overspend cannot break the layout
            barWidth: entry.anggaran.total ? Math.min((belanja / entry.anggaran.total) * 100, 100) : 0,
            overspent: entry.anggaran.total > 0 && belanja > entry.anggaran.total,
        };
    }), [visibleEntries, monthFilter]);

    // Totals follow the rows on screen, so the table always adds up to what is shown
    const grandTotal = useMemo(() => {
        const anggaran = rows.reduce((sum, row) => sum + row.anggaran, 0);
        const belanja = rows.reduce((sum, row) => sum + row.belanja, 0);
        return {anggaran, belanja, realisasi: anggaran - belanja, persen: formatPercent(belanja, anggaran)};
    }, [rows]);

    const jenisRows = useMemo(() => visibleEntries.map(entry => {
        const values = JENIS_BELANJA.map(jenis => jenisUpToMonth(entry.byJenisBelanja[jenis], monthFilter));
        // Total counts every jenis, so an unexpected code is never dropped
        const total = Object.keys(entry.byJenisBelanja)
            .reduce((sum, jenis) => sum + jenisUpToMonth(entry.byJenisBelanja[jenis], monthFilter), 0);
        return {satker: entry.satker, values, total};
    }), [visibleEntries, monthFilter]);

    const jenisTotals = useMemo(() => ({
        values: JENIS_BELANJA.map((_, index) => jenisRows.reduce((sum, row) => sum + row.values[index], 0)),
        total: jenisRows.reduce((sum, row) => sum + row.total, 0),
    }), [jenisRows]);

    // Derived from summary rather than read off the response, so filling a ceiling in
    // clears its warning immediately. Same rule the backend applies to needsBudgetInput.
    const budgetBlockers = useMemo(() => {
        if (!data) return [];
        const blockers = [];
        data.summary.forEach(entry => {
            FUNDS.forEach(({key: fund, label}) => {
                if (entry.belanja[fund] <= 0) return;
                if (!entry.matched) {
                    blockers.push({satker: entry.satker, totalBelanja: entry.belanja[fund],
                        message: `${entry.satker} belum terdaftar di Code_Anggaran.`});
                } else if (entry.anggaran[fund] === 0) {
                    blockers.push({satker: entry.satker, totalBelanja: entry.belanja[fund],
                        message: `Anggaran ${label} untuk ${entry.satker} masih 0, mohon diisi terlebih dahulu.`});
                }
            });
        });
        return blockers;
    }, [data]);

    if (isLoading && !data) return <LoadingAnimate/>;
    if (!data) return null;

    const monthLabel = monthFilter
        ? `s.d. ${monthNames.find(month => month.value === monthFilter)?.title}`
        : "Satu tahun penuh";

    return (
        <div>
            {/* Filter */}
            <div className="pengajuan-filter filter-monitoring" style={{marginBottom: '30px'}}>
                <h3 className="wide-card-title">Filter</h3>
                <label className="filter-label2">Bulan:</label>
                <div className="filter-select filter-select2">
                    <select value={monthFilter} onChange={handleMonthChange}>
                        {monthNames.map((month, index) => (
                            <option key={index} value={month.value}>{month.title || "Semua Bulan"}</option>
                        ))}
                    </select>
                </div>
                <span style={{marginLeft: '20px', fontSize: '1rem', opacity: 0.7}}>
                    Belanja dihitung dari 1 Januari {monthFilter ? `sampai akhir bulan terpilih (${monthLabel})` : "sampai akhir tahun"}.
                </span>
            </div>

            {/* Anything blocking a correct realisasi figure is stated before the numbers */}
            {budgetBlockers.length > 0 &&
                <div className="bg-card" style={{padding: '20px 30px', marginBottom: '20px', borderLeft: '6px solid #BD1404'}}>
                    <h3 style={{margin: '0 0 10px'}}>Anggaran belum lengkap</h3>
                    <p style={{margin: '0 0 10px', fontSize: '0.95rem'}}>
                        Unit kerja berikut sudah membelanjakan dana tetapi anggarannya masih 0, sehingga persentase
                        realisasinya belum bisa dihitung. Mohon isi anggarannya terlebih dahulu.
                    </p>
                    <ul style={{margin: 0, paddingLeft: '20px', fontSize: '0.95rem'}}>
                        {budgetBlockers.map((item, index) => (
                            <li key={index}>{item.message} (belanja {formatRupiah(item.totalBelanja)})</li>
                        ))}
                    </ul>
                </div>
            }

            {data.warnings.unknownSumberDana.length > 0 &&
                <div className="bg-card" style={{padding: '20px 30px', marginBottom: '20px', borderLeft: '6px solid #E8A700'}}>
                    <h3 style={{margin: '0 0 10px'}}>Sumber Dana tidak dikenali</h3>
                    <ul style={{margin: 0, paddingLeft: '20px', fontSize: '0.95rem'}}>
                        {data.warnings.unknownSumberDana.map((item, index) => (
                            <li key={index}>
                                {item.sumberDana} - {item.rows} baris, {formatRupiah(item.totalBelanja)} belum masuk
                                hitungan {FUNDS.map(fund => fund.label).join(", ")}.
                            </li>
                        ))}
                    </ul>
                </div>
            }

            {/* Anggaran editor - writes straight to the Code_Anggaran sheet */}
            <div className="bg-card" style={{marginBottom: '30px', paddingBottom: '25px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '30px'}}>
                    <h2 className="wide-card-title" style={{paddingTop: '20px'}}>Anggaran per Unit Kerja</h2>
                    <div style={{marginTop: '20px', textAlign: 'right'}}>
                        <input type="button" value={isLoading ? "Memuat..." : "Muat Ulang"} disabled={isLoading}
                               onClick={fetchRealisasi} style={{cursor: isLoading ? 'wait' : 'pointer'}}/>
                        {Object.keys(draftBudget).length > 0 &&
                            <p style={{margin: '5px 0 0', fontSize: '0.8rem', color: '#BD1404'}}>
                                Isian yang belum disimpan akan hilang.
                            </p>}
                    </div>
                </div>
                <TableAnggaran funds={FUNDS} budgets={data.budgets} draftBudget={draftBudget} rowStatus={rowStatus}
                               onDraftChange={handleDraftChange} onSave={handleSaveBudget}/>
            </div>

            {/* Realisasi table, doubling as the bar chart */}
            <div className="bg-card" style={{paddingBottom: '25px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '30px', paddingBottom: '15px'}}>
                    <h2 className="wide-card-title" style={{paddingTop: '20px'}}>Realisasi Anggaran</h2>
                    <input type="button" style={{marginTop: '20px', cursor: 'pointer'}}
                           value={hideZeroBudget ? "Tampilkan Semua Unit Kerja" : "Sembunyikan Unit Kerja Tanpa Anggaran"}
                           onClick={toggleHideZeroBudget}/>
                </div>
                {isLoading ? <LoadingAnimate/> :
                    <TableRealisasi rows={rows} grandTotal={grandTotal}/>
                }
                {data.warnings.invalidTanggal.length > 0 &&
                    <p style={{margin: '15px 30px 0', fontSize: '0.9rem', opacity: 0.75}}>
                        Catatan: {data.warnings.invalidTanggal.length} baris SPM tidak punya Tanggal SP2D yang terbaca,
                        sehingga hanya ikut terhitung pada tampilan satu tahun penuh.
                    </p>
                }

                <h2 className="wide-card-title" style={{paddingTop: '35px', paddingBottom: '15px'}}>
                    Realisasi per Jenis Belanja
                </h2>
                {isLoading ? <LoadingAnimate/> :
                    <TableRealisasiJenisBelanja jenisBelanja={JENIS_BELANJA} rows={jenisRows} totals={jenisTotals}/>
                }
            </div>

            {alert && <PopupAlert isAlert={true} severity={alert.severity} message={alert.message}/>}
        </div>
    );
}
