import { useState, useEffect, useMemo } from 'react';
import apiClient from '../../lib/apiClient';
//Import components
import { WideTableCard } from '../../ui/cards.jsx';
import BatasGup from './Batas-Gup.jsx';
import { headData1, headData2, headData3, headData4, headDataPjk } from './head-data.js';
import PropTypes from "prop-types";

// Pajak (12) or Anggaran (13) answered with anything but OK - the bendahara flagged
// something, so the row waits here instead of among the ones still being verified
const bermasalah = row => [row[12], row[13]]
    .map(value => String(value ?? "").trim())
    .some(value => value !== "" && value !== "OK");

// Each tab groups the original per-status tables it used to show as its own always-visible
// card; source/columns index into the 'Write Antrian' row exactly as before the tab UI
const SECTIONS = [
    {card: "Dalam Antrian", tables: [
        {title: "Pengajuan Belum Verifikasi", head: headData1,
            source: data => data[0], columns: [0, 1, 2, 3, 4, 5, 11, 7],
            empty: "Tidak ada pengajuan dalam antrian."},
    ]},
    {card: "Sedang Diverifikasi", tables: [
        {title: "Sedang Verifikasi Bendahara", head: headData2,
            source: data => (data[1] || []).filter(row => !bermasalah(row)), columns: [0, 1, 2, 3, 4, 14, 6, 12, 13, 11, 7],
            empty: "Tidak ada pengajuan yang sedang diverifikasi."},
        {title: "Pengajuan Bermasalah", head: headData2, badge: "alert",
            source: data => (data[1] || []).filter(bermasalah), columns: [0, 1, 2, 3, 4, 14, 6, 12, 13, 11, 7],
            empty: "Tidak ada pengajuan bermasalah."},
        {title: "Menunggu Diuji Verifikator PJK", head: headDataPjk, badge: "warn",
            source: data => data[6], columns: [0, 1, 2, 3, 4, 15, 6, 12, 13, 20, 21, 11],
            empty: "Tidak ada pengajuan yang menunggu verifikator PJK."},
    ]},
    {card: "Sudah Diverifikasi", tables: [
        {title: "Sudah Verifikasi", head: headData2,
            source: data => data[2], columns: [0, 1, 2, 3, 4, 15, 6, 12, 13, 11, 7],
            empty: "Tidak ada pengajuan yang sudah diverifikasi."},
        {title: "Ajuan Hari Ini", head: headData3,
            source: data => data[3], columns: [0, 2, 3, 4, 6, 11, 7],
            empty: "Tidak ada pengajuan yang diajukan hari ini."},
    ]},
    {card: "Sudah Diajukan", tables: [
        {title: "Sudah Diajukan Bulan Ini", head: headData4,
            source: data => [...(data[4] || []), ...(data[5] || [])], columns: [0, 2, 3, 4, 6, 11, 8, 9, 10],
            empty: "Tidak ada pengajuan yang sudah diajukan bulan ini."},
    ]},
];

const TAB_KEY = 'kelolaTabBendahara';

function KelolaPengajuan(props) {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCard, setActiveCard] = useState(() => localStorage.getItem(TAB_KEY) || "");

    useEffect(() => {
        (async () => {
            try {
                const response = await apiClient.get('/bendahara/kelola-ajuan');
                if (response.status === 200) setData(response.data.data);
            } catch (error) {
                console.log(error)
            } finally {
                setIsLoading(false);
            }
        })();
    }, [])

    const sections = useMemo(() => SECTIONS.map(section => {
        const tables = section.tables.map(table => ({...table, rows: table.source(data) || []}));
        const badgeCount = (type) => tables
            .filter(table => table.badge === type)
            .reduce((sum, table) => sum + table.rows.length, 0);
        return {...section, tables, count: tables.reduce((sum, table) => sum + table.rows.length, 0),
            alertCount: badgeCount("alert"), warnCount: badgeCount("warn")};
    }), [data]);

    // A remembered tab can be a card name from before the 7-to-4 merge
    const active = sections.find(section => section.card === activeCard) || sections[0];

    const selectTab = (card) => {
        setActiveCard(card);
        localStorage.setItem(TAB_KEY, card);
    };

    return (
        <div className='kelola-container'>
            <BatasGup />
            <div className='kelola-tabs' role='tablist'>
                {sections.map(section => {
                    const isActive = section.card === active.card;
                    return (
                        <button key={section.card} type='button' role='tab' aria-selected={isActive}
                            onClick={() => selectTab(section.card)}
                            className={`kelola-tab${isActive ? " kelola-tab-active" : ""}`}>
                            <span className='kelola-tab-label'>{section.card}</span>
                            <span className='kelola-tab-count'>{isLoading ? "-" : section.count}</span>
                            {!isLoading && section.alertCount > 0 &&
                                <span className='kelola-tab-count kelola-tab-count-alert'>{section.alertCount}</span>}
                            {!isLoading && section.warnCount > 0 &&
                                <span className='kelola-tab-count kelola-tab-count-warn'>{section.warnCount}</span>}
                        </button>
                    );
                })}
            </div>
            {/* Keyed per table (titles are unique across every tab) so TableKelola remounts
                on tab switch: its page number is internal state, and page 3 of one table is
                out of range in the next */}
            {active.tables.map(table => (
                !isLoading && table.rows.length === 0 ? (
                    <div key={table.title} className='bg-card wide-card'>
                        <h2 className='wide-card-title'>{table.title}</h2>
                        <p className='kelola-empty'>{table.empty}</p>
                    </div>
                ) : (
                    <WideTableCard key={table.title} title={table.title} tableHead={table.head}
                        tableContent={table.rows.map(row => table.columns.map(index => row[index]))}
                        fullContent={table.rows} loading={isLoading}
                        changeComponent={props.changeComponent} aksiData={props.aksiData}/>
                )
            ))}
        </div>
    )
}

KelolaPengajuan.propTypes = {
    changeComponent: PropTypes.func.isRequired,
    aksiData: PropTypes.func.isRequired,
};

export default KelolaPengajuan;
