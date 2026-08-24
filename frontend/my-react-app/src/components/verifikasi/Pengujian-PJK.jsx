import { useState, useEffect, useMemo } from 'react';
import apiClient from '../../lib/apiClient';
import PropTypes from "prop-types";
import { WideTableCard } from '../../ui/cards.jsx';
import { pjkHeadData, pjkHeadDataMulai, formatNomorSpp } from '../bendahara/head-data.js';

// Column indices on 'Write Antrian Verif'; 16 is the source id the backend appends
const DOK_VERIF = 15;
const SOURCE_ID = 16;
const INFO_COLUMNS = [0, SOURCE_ID, 1, 6, 2, 3, 4, 8, 9, 10];
const MULAI_COLUMNS = [...INFO_COLUMNS, 11];
const SPP = 6;
const SUBSTANSI = 9, KELENGKAPAN = 10;

// Informasi Pengajuan has nothing verified yet, so it is the one section without the link
const DOK_HEAD = "Dok. Verifikasi";
const INFO_DOK_COLUMNS = [...INFO_COLUMNS, DOK_VERIF];
const MULAI_DOK_COLUMNS = [...MULAI_COLUMNS, DOK_VERIF];

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

    const project = (rows, columns) => rows.map(row => columns.map(index => {
        if (index === SPP) return formatNomorSpp(row[index]);
        if (index === SOURCE_ID) return row[index] || "-";
        if (index === DOK_VERIF) {
            if (pending.has(String(row[0]))) return <span key={index} style={{color: '#8A6100'}}>Sedang dibuat…</span>;
            return row[index]
                ? <a key={index} href={row[index]} target="_blank" rel="noopener noreferrer">Lihat Dokumen</a>
                : "-";
        }
        return row[index];
    }));

    const tables = useMemo(() => [
        {title: "Informasi Pengajuan", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[0],
            empty: "Tidak ada pengajuan yang perlu diuji."},
        {title: "Sedang Di Verifikasi", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS, rows: sections[1].filter(row => !ditolak(row)),
            empty: "Tidak ada pengajuan yang sedang diverifikasi."},
        {title: "Pengajuan Bermasalah", head: [...pjkHeadDataMulai, DOK_HEAD], columns: MULAI_DOK_COLUMNS, rows: sections[1].filter(ditolak), alert: true,
            empty: "Tidak ada pengajuan bermasalah."},
        {title: "Sudah Verifikasi", head: [...pjkHeadData, DOK_HEAD], columns: INFO_DOK_COLUMNS, rows: sections[2],
            empty: "Tidak ada pengajuan yang sudah diverifikasi."},
    ], [sections]);

    const active = tables.find(table => table.title === activeTitle) || tables[0];

    const selectTab = (title) => {
        setActiveTitle(title);
        localStorage.setItem(TAB_KEY, title);
    };

    return (
        <div className='kelola-container'>
            <div className="pjk-toolbar">
                <input className="btn-aksi btn-aksi-wide" type="button" value={isLoading ? "Memuat..." : "Muat Ulang"}
                       disabled={isLoading} onClick={() => fetchPjk()}
                       style={{cursor: isLoading ? 'wait' : 'pointer'}}/>
            </div>
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
                    <h2 className='wide-card-title'>{active.title}</h2>
                    <p className='kelola-empty'>{active.empty}</p>
                </div>
            ) : (
                <WideTableCard key={active.title} title={active.title} feature="PJK"
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
