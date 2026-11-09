import { useState, useEffect, useMemo } from 'react';
import apiClient from '../../lib/apiClient';
import PropTypes from "prop-types";
import { WideTableCard } from '../../ui/cards.jsx';
import { pjkHeadData, pjkHeadDataMulai, formatNomorSpp, spmKey, STATUS_DIPERBAIKI, jenisPengajuan, jenisValueFromLabel, subjenisPengajuan, pjkStatusOptions, pjkKelengkapanOptions, monitorPjkHead, pjkRepairStatusLabel } from "../bendahara/head-data.js";
import { userSatkerNames } from "./head-data.js";
import { unduhExcel, selAngka, selTeks } from "../../lib/excel.js";
import { PopupAlert } from "../../ui/Popup.jsx";

// Column indices on 'Write Antrian Verif'; 18 is the source id the backend appends past R
// Rows are already in hand, so the filters run locally and cost no additional Sheets read
const normalSatker = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const DOK_VERIF = 15;
const TANGGAL_SP2D = 17;
const SOURCE_ID = 18;
// Appended after sourceId (18) and Tanggal Perbaikan (19); not the raw sheet's T index.
const SUBJENIS = 20;
const DEADLINE = 21, REPAIR_STATUS = 22;
const INFO_COLUMNS = [0, SOURCE_ID, 1, 6, 2, 3, SUBJENIS, 4, 8, 9, 10];
const MULAI_COLUMNS = [...INFO_COLUMNS, 11];
const SPP = 6;
const NOMINAL = 4;
const SUBSTANSI = 9, KELENGKAPAN = 10;
const UNIT_KERJA = 8;
// Same column N used by Aksi-Verif-PJK's catatan field; already included in the API rows.
const CATATAN = 13;

// Informasi Pengajuan has nothing verified yet, so it is the one section without the link
const DOK_HEAD = "Dok. Verifikasi";
const INFO_DOK_COLUMNS = [...INFO_COLUMNS, DOK_VERIF];
const MULAI_DOK_COLUMNS = [...MULAI_COLUMNS, DOK_VERIF];

const SPP_AT = INFO_COLUMNS.indexOf(SPP) + 1;
const SUDAH_COLUMNS = [...INFO_DOK_COLUMNS.slice(0, SPP_AT), TANGGAL_SP2D, ...INFO_DOK_COLUMNS.slice(SPP_AT)];
const SUDAH_HEAD = [...pjkHeadData.slice(0, SPP_AT), "Tanggal SP2D", ...pjkHeadData.slice(SPP_AT), DOK_HEAD];
const SUDAH_LEBAR = [6, 8, 20, 11, 13, 24, 24, 42, 16, 24, 13, 13, 46, 60];
const MONITOR_COLUMNS = [...SUDAH_COLUMNS, DEADLINE, REPAIR_STATUS];
const MONITOR_HEAD = [...SUDAH_HEAD, ...monitorPjkHead];
const MONITOR_LEBAR = [...SUDAH_LEBAR.slice(0, -1), 20, 24, 60];

// Generation takes 6-8s; the cap stops a wedged job polling forever
const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT = 15;

// A rejected verdict parks the row until the verifikator revisits it
const ditolak = row => [row[SUBSTANSI], row[KELENGKAPAN]]
    .some(value => String(value ?? "").trim() === "Ditolak");

// Tanggal Perbaikan, appended after the source id rather than at its own column S so no index
// above shifts. Filled means the satker has saved a change since this verdict was written.
const PERBAIKAN = 19;
const diperbaiki = row => ditolak(row) && String(row[PERBAIKAN] ?? "").trim() !== "";

const TAB_KEY = 'pengujianPjkTab';

function PengujianPJK(props) {
    const [sections, setSections] = useState([[], [], [], []]);
    const [pending, setPending] = useState(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [activeTitle, setActiveTitle] = useState(() => localStorage.getItem(TAB_KEY) || "");
    const [isExporting, setIsExporting] = useState(false);
    const [cariInput, setCariInput] = useState("");
    const [cariNomor, setCariNomor] = useState("");
    const [unitKerja, setUnitKerja] = useState("");
    const [jenis, setJenis] = useState("");
    const [subjenis, setSubjenis] = useState("");
    const [substansiFilter, setSubstansiFilter] = useState("");
    const [kelengkapanFilter, setKelengkapanFilter] = useState("");
    const [loadError, setLoadError] = useState("");
    const subjenisOptions = subjenisPengajuan[jenis] || [];

    // quiet skips the spinner, for the background swap-in once a PDF lands
    async function fetchPjk({quiet = false} = {}) {
        try {
            setLoadError("");
            if (!quiet) setIsLoading(true);
            const response = await apiClient.get('/verifikasi/pengujian-pjk');
            if (response.status === 200) {
                setSections(response.data.data);
                setPending(new Set((response.data.pending || []).map(String)));
            }
        } catch (error) {
            console.error("Error fetching PJK data", error);
            setLoadError(error.response?.data?.message || error.response?.data?.error || "Gagal memuat pengujian PJK.");
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
        if (index === REPAIR_STATUS) return pjkRepairStatusLabel(row[index]);
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

    const tables = useMemo(() => {
        const filterRows = rows => rows.filter(row =>
            (!cariNomor || spmKey(row[SPP]) === spmKey(cariNomor))
            && (!unitKerja || normalSatker(row[UNIT_KERJA]) === normalSatker(unitKerja))
            && (!jenis || jenisValueFromLabel(row[3]) === jenis)
            && (!subjenis || normalSatker(row[SUBJENIS]) === normalSatker(subjenis))
            && (!substansiFilter || normalSatker(row[SUBSTANSI]) === normalSatker(substansiFilter))
            && (!kelengkapanFilter || normalSatker(row[KELENGKAPAN]) === normalSatker(kelengkapanFilter)));
        return [
            {title: "Informasi Pengajuan", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[0],
                empty: "Tidak ada pengajuan yang perlu diuji."},
            {title: "Sedang Di Verifikasi", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS, rows: sections[1].filter(row => !ditolak(row)),
                empty: "Tidak ada pengajuan yang sedang diverifikasi."},
            {title: "Pengajuan Bermasalah", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS,
                rows: sections[1].filter(row => ditolak(row) && !diperbaiki(row)), alert: true,
                empty: "Tidak ada pengajuan bermasalah."},
            {title: STATUS_DIPERBAIKI, head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS,
                rows: sections[1].filter(diperbaiki),
                empty: "Tidak ada pengajuan yang telah diperbaiki."},
            {title: "Sudah Verifikasi", head: SUDAH_HEAD, columns: SUDAH_COLUMNS, cari: true,
                rows: filterRows(sections[2]),
                empty: "Tidak ada pengajuan yang sudah diverifikasi.", unduh: true},
            {title: "Monitor PJK", head: MONITOR_HEAD, columns: MONITOR_COLUMNS, cari: true,
                rows: filterRows(sections[3] || []), lebar: MONITOR_LEBAR,
                empty: "Tidak ada PJK yang sudah SP2D dengan status OK Catatan.", unduh: true},
        ];
    }, [sections, cariNomor, unitKerja, jenis, subjenis, substansiFilter, kelengkapanFilter]);

    const active = tables.find(table => table.title === activeTitle) || tables[0];

    async function unduhTabel() {
        setIsExporting(true);
        try {
            const baris = active.rows.map(row => [
                ...active.columns.map(index =>
                    index === NOMINAL ? selAngka(row[index]) : {...selTeks(cellText(row, index), index === SPP), wrap: index === 3 || index === SUBJENIS}),
                {...selTeks(row[CATATAN]), wrap: true},
            ]);
            const now = new Date();
            const tanggal = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
                .map(part => String(part).padStart(2, "0")).join("-");
            const title = active.title.endsWith("PJK") ? active.title : `${active.title} PJK`;
            await unduhExcel(`${title} ${tanggal}.xlsx`, [...active.head, "Catatan"], baris, active.lebar || SUDAH_LEBAR);
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
            <div className="pjk-filter-fields">
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-cari-spp">Cari Nomor SPP</label>
                    <input id="pjk-cari-spp" className="type-btn bar-cari-nomor" type="text" inputMode="numeric"
                           value={cariInput} placeholder="mis. 00041"
                           onChange={event => setCariInput(event.target.value)}/>
                </div>
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-jenis">Jenis</label>
                    <select id="pjk-jenis" className="type-btn" value={jenis}
                            onChange={event => { setJenis(event.target.value); setSubjenis(""); }}>
                        <option value="">Semua Jenis</option>
                        {jenisPengajuan.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                </div>
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-subjenis">Subjenis</label>
                    <select id="pjk-subjenis" className="type-btn" value={subjenis}
                            disabled={subjenisOptions.length === 0}
                            onChange={event => setSubjenis(event.target.value)}>
                        <option value="">Semua Subjenis</option>
                        {subjenisOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </div>
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-unit">Unit Kerja</label>
                    <select id="pjk-unit" className="type-btn" value={unitKerja}
                            onChange={event => setUnitKerja(event.target.value)}>
                        <option value="">Semua Unit Kerja</option>
                        {userSatkerNames.slice(1).map(item => (
                            <option key={item.value} value={item.title}>{item.title}</option>
                        ))}
                    </select>
                </div>
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-substansi">Substansi</label>
                    <select id="pjk-substansi" className="type-btn" value={substansiFilter}
                            onChange={event => setSubstansiFilter(event.target.value)}>
                        <option value="">Semua Status</option>
                        {pjkStatusOptions.map(option => <option key={option.label} value={option.label}>{option.label}</option>)}
                    </select>
                </div>
                <div className="pjk-filter-field">
                    <label htmlFor="pjk-kelengkapan">Kelengkapan</label>
                    <select id="pjk-kelengkapan" className="type-btn" value={kelengkapanFilter}
                            onChange={event => setKelengkapanFilter(event.target.value)}>
                        <option value="">Semua Status</option>
                        {pjkKelengkapanOptions.map(option => <option key={option.label} value={option.label}>{option.label}</option>)}
                    </select>
                </div>
            </div>
            <div className="pjk-filter-actions">
                <button className="spm-button" type="submit">Cari</button>
                {(cariNomor || unitKerja || jenis || subjenis || substansiFilter || kelengkapanFilter) &&
                    <button className="spm-button pjk-filter-reset" type="button"
                            onClick={() => {
                                setCariInput(""); setCariNomor(""); setUnitKerja("");
                                setJenis(""); setSubjenis(""); setSubstansiFilter(""); setKelengkapanFilter("");
                            }}>Reset</button>}
            </div>
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
            {loadError && <PopupAlert severity="error" message={loadError}/>}
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
