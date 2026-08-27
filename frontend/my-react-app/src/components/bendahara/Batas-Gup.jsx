import { useState, useEffect, useCallback, useMemo } from "react";
import apiClient from "../../lib/apiClient";
import { formatTanggalPanjang, monthNames } from "./head-data.js";

// Same month the bendahara's Cek Sisa GUP grid draws: the selected year plus the current
// calendar month, so both sides always mean the same bucket
function bulanBerjalan() {
    const year = localStorage.getItem('poriku-selected-year') || new Date().getFullYear().toString();
    return `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
}

function BatasGup() {
    const bulan = useMemo(bulanBerjalan, []);
    const [tanggal, setTanggal] = useState("");
    const [tersimpan, setTersimpan] = useState("");
    const [sibuk, setSibuk] = useState(true);
    const [pesan, setPesan] = useState("");

    // The date picker is clamped to the month so a batas can never land outside it
    const rentang = useMemo(() => {
        const [year, monthNumber] = bulan.split("-").map(Number);
        const akhir = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
        return { min: `${bulan}-01`, max: `${bulan}-${akhir}` };
    }, [bulan]);

    useEffect(() => {
        (async () => {
            try {
                const response = await apiClient.get('/bendahara/batas-gup', { params: { month: bulan } });
                setTanggal(response.data.tanggal);
                setTersimpan(response.data.tanggal);
            } catch (error) {
                console.error("Gagal memuat batas GUP.", error);
                setPesan("Gagal memuat batas tanggal.");
            } finally {
                setSibuk(false);
            }
        })();
    }, [bulan]);

    const simpan = useCallback(async (nilai) => {
        setSibuk(true);
        setPesan("");
        try {
            await apiClient.put('/bendahara/batas-gup', { month: bulan, tanggal: nilai });
            setTanggal(nilai);
            setTersimpan(nilai);
            setPesan(nilai ? "Batas tanggal tersimpan." : "Batas tanggal dihapus.");
        } catch (error) {
            console.error("Gagal menyimpan batas GUP.", error);
            setPesan(error.response?.data?.message || "Gagal menyimpan batas tanggal.");
        } finally {
            setSibuk(false);
        }
    }, [bulan]);

    return (
        <div className="gup-panel batas-panel">
            <div className="gup-panel-head">
                <h2 className="gup-title">Tanggal Maksimal GUP Bulan Ini</h2>
                <span className="gup-legend-month">
                    {monthNames[Number(bulan.slice(5))].title} {bulan.slice(0, 4)}
                </span>
            </div>
            <div className="gup-body batas-body">
                <div className="batas-row">
                    <input type="date" className="batas-input" value={tanggal} disabled={sibuk}
                        min={rentang.min} max={rentang.max} aria-label="Tanggal maksimal GUP"
                        onChange={event => setTanggal(event.target.value)} />
                    <button type="button" className="gup-toggle" disabled={sibuk || !tanggal || tanggal === tersimpan}
                        onClick={() => simpan(tanggal)}>Simpan</button>
                    {tersimpan && <button type="button" className="gup-reload batas-hapus" disabled={sibuk}
                        onClick={() => simpan("")}>Hapus batas</button>}
                </div>
                {tersimpan
                    ? <p className="gup-note gup-note-batas">
                        Tanggal yang ditentukan: {" "}
                        <strong className="gup-batas-tanggal">{formatTanggalPanjang(tersimpan)}</strong>
                    </p>
                    : <p className="gup-note">Belum ada batas. Seluruh hari kerja bulan ini terbuka untuk pengajuan GUP.</p>}
                {pesan && <p className="gup-note batas-pesan">{pesan}</p>}
            </div>
        </div>
    );
}

export default BatasGup;
