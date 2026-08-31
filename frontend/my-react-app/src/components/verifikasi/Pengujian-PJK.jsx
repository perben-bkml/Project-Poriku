import { useState, useEffect, useMemo } from 'react';
import apiClient from '../../lib/apiClient';
import PropTypes from "prop-types";
import { WideTableCard } from '../../ui/cards.jsx';
import { pjkHeadData, pjkHeadDataMulai, formatNomorSpp, spmKey } from "../bendahara/head-data.js";
import { userSatkerNames } from "./head-data.js";
import { unduhExcel, selAngka, selTeks } from "../../lib/excel.js";

// Column indices on 'Write Antrian Verif'; 18 is the source id the backend appends past R
// Rows are already in hand, so both controls filter locally and cost no Sheets read
const normalSatker = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const DOK_VERIF = 15;
const TANGGAL_SP2D = 17;
const SOURCE_ID = 18;
const INFO_COLUMNS = [0, SOURCE_ID, 1, 6, 2, 3, 4, 8, 9, 10];
const MULAI_COLUMNS = [...INFO_COLUMNS, 11];
const SPP = 6;
const NOMINAL = 4;
const SUBSTANSI = 9, KELENGKAPAN = 10;
const UNIT_KERJA = 8;

// Informasi Pengajuan has nothing verified yet, so it is the one section without the link
const DOK_HEAD = "Dok. Verifikasi";
const INFO_DOK_COLUMNS = [...INFO_COLUMNS, DOK_VERIF];
const MULAI_DOK_COLUMNS = [...MULAI_COLUMNS, DOK_VERIF];

const SPP_AT = INFO_COLUMNS.indexOf(SPP) + 1;
const SUDAH_COLUMNS = [...INFO_DOK_COLUMNS.slice(0, SPP_AT), TANGGAL_SP2D, ...INFO_DOK_COLUMNS.slice(SPP_AT)];
const SUDAH_HEAD = [...pjkHeadData.slice(0, SPP_AT), "Tanggal SP2D", ...pjkHeadData.slice(SPP_AT), DOK_HEAD];
const SUDAH_LEBAR = [6, 8, 20, 11, 13, 24, 20, 16, 24, 13, 13, 46];

// Generation takes 6-8s; the cap stops a wedged job polling forever
const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT = 15;

// A rejected verdict parks the row until the verifikator revisits it
const ditolak = row => [row[SUBSTANSI], row[KELENGKAPAN]]
    .some(value => String(value ?? "").trim() === "Ditolak");

const TAB_KEY = 'pengujianPjkTab';

function PengujianPJK(props) {
    const [sections, setSections] = useState([[], [], []]);
    const [pending, setPending] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [activeTitle, setActiveTitle] = useState(() => localStorage.getItem(TAB_KEY) || "");
    const [isExporting, setIsExporting] = useState(false);
    const [cariInput, setCariInput] = useState("");
    const [cariNomor, setCariNomor] = useState("");
    const [unitKerja, setUnitKerja] = useState("");

    // quiet skips the spinner, for the background swap-in once a PDF lands
    async function fetchPjk({quiet = false} = {}) {
        try {
            if (!quiet) setIsLoading(true);
            const response = await apiClient.get('/verifikasi/pengujian-pjk');
            if (response.status === 200) {
                setSections(response.data.data);
                setPending(new Set((response.data.pending || []).map(String)));
            }
        } catch (error) {
            console.error("Error fetching PJK data", error);
        } finally {
            if (!quiet) setIsLoading(false);
        }
    }

    useEffect(() => { fetchPjk(); }, []);

    // Only runs while a PDF is generating. The endpoint reads server memory, not the sheet.
    useEffect(() => {
        if (!pending.size) return;
        let attempts = 0;
        const timer = setInterval(async () => {
            if (++attempts > POLL_LIMIT) return clearInterval(timer);
            try {
                const {data} = await apiClient.get('/verifikasi/hasil-verif/pending');
                const stillPending = new Set((data.pending || []).map(String));
                if ([...pending].some(id => !stillPending.has(id))) fetchPjk({quiet: true});
            } catch { /* keep waiting */ }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [pending]);

    // The plain text of a cell, so the table and the Excel export cannot drift apart
    const cellText = (row, index) => {
        if (index === SPP) return formatNomorSpp(row[index]);
        if (index === SOURCE_ID) return row[index] || "-";
        if (index === DOK_VERIF) return pending.has(String(row[0])) ? "Sedang dibuat" : (row[index] || "-");
        return row[index];
    };

    const project = (rows, columns) => rows.map(row => columns.map(index => {
        if (index === DOK_VERIF) {
            if (pending.has(String(row[0]))) return <span key={index} style={{color: '#8A6100'}}>Sedang dibuat…</span>;
            return row[index]
                ? <a key={index} href={row[index]} target="_blank" rel="noopener noreferrer">Lihat Dokumen</a>
                : "-";
        }
        return cellText(row, index);
    }));

    const tables = useMemo(() => [
        {title: "Informasi Pengajuan", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[0],
            empty: "Tidak ada pengajuan yang perlu diuji."},
        {title: "Sedang Di Verifikasi", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS, rows: sections[1].filter(row => !ditolak(row)),
            empty: "Tidak ada pengajuan yang sedang diverifikasi."},
        {title: "Pengajuan Bermasalah", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS, rows: sections[1].filter(ditolak), alert: true,
            empty: "Tidak ada pengajuan bermasalah."},
        {title: "Sudah Verifikasi", head: SUDAH_HEAD, columns: SUDAH_COLUMNS, cari: true,
            rows: sections[2].filter(row =>
                (!cariNomor || spmKey(row[SPP]) === spmKey(cariNomor))
                && (!unitKerja || normalSatker(row[UNIT_KERJA]) === normalSatker(unitKerja))),
            empty: "Tidak ada pengajuan yang sudah diverifikasi.", unduh: true},
    ], [sections, cariNomor, unitKerja]);

    const active = tables.find(table => table.title === activeTitle) || tables[0];

    async function unduhTabel() {
        setIsExporting(true);
        try {
            const baris = active.rows.map(row => active.columns.map(index =>
                index === NOMINAL ? selAngka(row[index]) : selTeks(cellText(row, index), index === SPP)));
            const now = new Date();
            const tanggal = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
                .map(part => String(part).padStart(2, "0")).join("-");
            await unduhExcel(`${active.title} PJK ${tanggal}.xlsx`, active.head, baris, SUDAH_LEBAR);
        } catch (error) {
            console.error("Gagal membuat file Excel", error);
        } finally {
            setIsExporting(false);
        }
    }

    const selectTab = (title) => {
        setActiveTitle(title);
        localStorage.setItem(TAB_KEY, title);
    };

    // Rendered by both the table card and the empty card: a filter that matched nothing is
    // exactly when it has to stay reachable
    const cariBar = active.cari ? (
        <form className="bar-cari bar-cari-pjk"
              onSubmit={event => (event.preventDefault(), setCariNomor(cariInput.trim()))}>
            <label htmlFor="pjk-cari-spp">Cari Nomor SPP</label>
            <input id="pjk-cari-spp" className="type-btn bar-cari-nomor" type="text" inputMode="numeric"
                   value={cariInput} placeholder="mis. 00041"
                   onChange={event => setCariInput(event.target.value)}/>
            <label htmlFor="pjk-unit">Unit Kerja</label>
            <select id="pjk-unit" className="type-btn" value={unitKerja}
                    onChange={event => setUnitKerja(event.target.value)}>
                <option value="">Semua Unit Kerja</option>
                {userSatkerNames.slice(1).map(item => (
                    <option key={item.value} value={item.title}>{item.title}</option>
                ))}
            </select>
            <button className="spm-button" type="submit">Cari</button>
            {(cariNomor || unitKerja) &&
                <button className="spm-button" type="button"
                        onClick={() => (setCariInput(""), setCariNomor(""), setUnitKerja(""))}>Reset</button>}
        </form>
    ) : null;

    // Rendered by both the table card and the empty card, so the actions never vanish
    const aksi = (
        <div className="wide-card-actions">
            {active.unduh &&
                <input className="btn-aksi btn-aksi-wide" type="button"
                       value={isExporting ? "Menyiapkan..." : "Unduh Excel"}
                       disabled={isLoading || isExporting || active.rows.length === 0}
                       onClick={unduhTabel}/>}
            <input className="btn-aksi btn-aksi-wide" type="button" value={isLoading ? "Memuat..." : "Muat Ulang"}
                   disabled={isLoading} onClick={() => fetchPjk()}
                   style={{cursor: isLoading ? 'wait' : 'pointer'}}/>
        </div>
    );

    return (
        <div className='kelola-container'>
            <div className='kelola-tabs' role='tablist'>
                {tables.map(table => {
                    const isActive = table.title === active.title;
                    return (
                        <button key={table.title} type='button' role='tab' aria-selected={isActive}
                            onClick={() => selectTab(table.title)}
                            className={`kelola-tab${isActive ? " kelola-tab-active" : ""}`
                                + `${table.alert && table.rows.length ? " kelola-tab-alert" : ""}`}>
                            <span className='kelola-tab-label'>{table.title}</span>
                            <span className='kelola-tab-count'>{isLoading ? "-" : table.rows.length}</span>
                        </button>
                    );
                })}
            </div>
            {!isLoading && active.rows.length === 0 ? (
                <div className='bg-card wide-card'>
                    <div className='wide-card-head'>
                        <h2 className='wide-card-title'>{active.title}</h2>
                        {aksi}
                    </div>
                    {cariBar}
                    <p className='kelola-empty'>{active.empty}</p>
                </div>
            ) : (
                <WideTableCard key={active.title} title={active.title} feature="PJK" actions={aksi}
                    toolbar={cariBar}
                    aksiLabel="Verif" aksiTarget="aksi-verif-PJK"
                    tableHead={active.head}
                    tableContent={project(active.rows, active.columns)}
                    fullContent={active.rows} loading={isLoading}
                    changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            )}
        </div>
    )
}

PengujianPJK.propTypes = {
    changeComponent: PropTypes.func.isRequired,
    aksiData: PropTypes.func.isRequired,
};

export default PengujianPJK;
