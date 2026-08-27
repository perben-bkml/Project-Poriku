import { useState, useMemo, useCallback } from "react";
import apiClient from "../../lib/apiClient";
import LoadingAnimate from "../../ui/loading.jsx";
import { formatRupiah, sisaGupBands, hariKerja, sisaGupHeadData, monthNames } from "./head-data.js";

const bandOf = (sisa) => sisaGupBands.find(band => sisa >= band.min);
const juta = (nominal) => `${Math.round(nominal / 1000000)} jt`;

// Every date is built in UTC. new Date("2026-08-01") parses as UTC midnight and renders in
// the browser's zone, which shifts the weekday for anyone west of Greenwich.
const iso = (year, month, day) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Weekdays of the month, each tagged with the column it belongs in (0 = Senin)
function weekdaysOf(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const days = [];
    for (let day = 1; day <= new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); day++) {
        const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        days.push({ tanggal: iso(year, monthNumber, day), day, column: weekday - 1 });
    }
    return days;
}

function CekSisaGup() {
    const [terbuka, setTerbuka] = useState(false);
    const [data, setData] = useState(null);
    const [memuat, setMemuat] = useState(false);
    const [gagal, setGagal] = useState(false);
    const [terpilih, setTerpilih] = useState("");

    const muat = useCallback(async () => {
        setMemuat(true);
        setGagal(false);
        const year = localStorage.getItem('poriku-selected-year') || new Date().getFullYear().toString();
        const month = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        try {
            const response = await apiClient.get('/bendahara/sisa-gup', { params: { month } });
            setData(response.data);
        } catch (error) {
            console.error("Gagal memuat sisa GUP.", error);
            setGagal(true);
        } finally {
            setMemuat(false);
        }
    }, []);

    // Fetch on the first open only; toggling and picking dates never hit the network again
    const toggle = useCallback(() => {
        setTerbuka(open => {
            if (!open && !data && !memuat) muat();
            return !open;
        });
    }, [data, memuat, muat]);

    const muatUlang = useCallback(() => { setTerpilih(""); muat(); }, [muat]);

    const days = useMemo(() => {
        if (!data) return [];
        return weekdaysOf(data.month).map(day => {
            const used = data.days[day.tanggal]?.used || 0;
            return { ...day, used, sisa: data.limit - used };
        });
    }, [data]);

    const detail = terpilih ? days.find(day => day.tanggal === terpilih) : null;
    const rincian = detail ? [...(data.days[terpilih]?.rows || [])].sort((a, b) => b.nominal - a.nominal) : [];
    const diabaikan = data
        ? Object.entries({
            "tanpa tanggal": data.diabaikan.tanpaTanggal,
            "jatuh di akhir pekan": data.diabaikan.akhirPekan,
            "nominal tidak terbaca": data.diabaikan.nominalTidakValid,
        }).filter(([, count]) => count > 0)
        : [];

    return (
        <div className="gup-panel">
            <div className="gup-panel-head">
                <h2 className="gup-title">Cek Sisa GUP Bulan Ini</h2>
                <button type="button" className="gup-toggle" onClick={toggle} aria-expanded={terbuka}>
                    {terbuka ? "Tutup" : "Lihat Sisa GUP"}
                </button>
            </div>

            {terbuka && <div className="gup-body">
                {memuat && <LoadingAnimate size="42px" />}
                {!memuat && gagal && <p className="gup-note">Gagal memuat data. Coba lagi.</p>}
                {!memuat && !gagal && data && <>
                    <div className="gup-legend">
                        <span className="gup-legend-month">
                            {monthNames[Number(data.month.slice(5))].title} {data.month.slice(0, 4)}
                        </span>
                        {sisaGupBands.map(band => (
                            <span className="gup-legend-item" key={band.className}>
                                <span className={`gup-legend-dot ${band.className}`} />{band.label}
                            </span>
                        ))}
                        <button type="button" className="gup-reload" onClick={muatUlang}>Muat ulang</button>
                    </div>

                    <div className="gup-grid">
                        {hariKerja.map(hari => <div className="gup-weekday" key={hari}>{hari}</div>)}
                        {days.length > 0 && Array.from({ length: days[0].column }, (_, index) =>
                            <div className="gup-cell-empty" key={`pad-${index}`} />)}
                        {days.map(day => (
                            <button type="button" key={day.tanggal}
                                className={`gup-cell ${bandOf(day.sisa).className}${day.tanggal === terpilih ? " gup-cell-active" : ""}`}
                                aria-pressed={day.tanggal === terpilih}
                                aria-label={`${day.tanggal}, sisa ${formatRupiah(day.sisa)}`}
                                onClick={() => setTerpilih(current => current === day.tanggal ? "" : day.tanggal)}>
                                <span className="gup-cell-day">{day.day}</span>
                                <span className="gup-cell-sisa">{juta(day.sisa)}</span>
                            </button>
                        ))}
                    </div>

                    {diabaikan.length > 0 &&
                        <p className="gup-note">
                            Terdapat {diabaikan.map(([label, count]) => `${count} pengajuan ${label}`).join(", ")} yang tidak masuk pada perkiraan sisa GUP di atas.
                        </p>}

                        <p className={"gup-note"}>
                            Catatan: Mohon menghubungi admin keuangan untuk konfirmasi ketersediaan GUP di tanggal yang dipilih.
                        </p>

                    {detail && <div className="gup-detail">
                        <div className="gup-detail-head">
                            <strong>{detail.tanggal}</strong>
                            <span>Terpakai {formatRupiah(detail.used)}</span>
                            <span className={detail.sisa < 0 ? "gup-lebih" : ""}>
                                {detail.sisa < 0 ? "Melebihi batas " : "Sisa "}{formatRupiah(Math.abs(detail.sisa))}
                            </span>
                        </div>
                        {rincian.length === 0
                            ? <p className="gup-note">Belum ada pengajuan GUP untuk tanggal ini.</p>
                            : <table className="gup-table">
                                <thead>
                                    <tr>{sisaGupHeadData.map(head => <th key={head}>{head}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {rincian.map((row, index) => (
                                        <tr key={`${row.unitKerja}-${index}`}>
                                            <td>{row.unitKerja || "—"}</td>
                                            <td className="gup-num">{formatRupiah(row.nominal)}</td>
                                            <td>{row.status || "—"}
                                                {row.sumber === "request" && <span className="gup-tag">belum disetujui</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>}
                    </div>}
                </>}
            </div>}
        </div>
    );
}

export default CekSisaGup;
