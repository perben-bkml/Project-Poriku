import React, { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
//Import components
import { Card, WideTableCard } from '../../ui/cards.jsx';
import { headData1, headData2, headData3, headData4, headDataPjk } from './head-data.js';
import { PILOT } from '../../lib/pilot.js';
import PropTypes from "prop-types";

// Pajak (12) or Anggaran (13) answered with anything but OK - the bendahara flagged
// something, so the row waits here instead of among the ones still being verified
const bermasalah = row => [row[12], row[13]]
    .map(value => String(value ?? "").trim())
    .some(value => value !== "" && value !== "OK");

// source picks the section out of the response; columns are indices on the 'Write Antrian' row
const SECTIONS = [
    {card: "Dalam Antrian", title: "Pengajuan Belum Verifikasi", head: headData1,
        source: data => data[0], columns: [0, 1, 2, 3, 4, 5, 11, 7]},
    {card: "Sedang di Verifikasi", title: "Sedang Verifikasi Bendahara", head: headData2,
        source: data => (data[1] || []).filter(row => !bermasalah(row)), columns: [0, 1, 2, 3, 4, 14, 6, 12, 13, 11, 7]},
    {card: "Bermasalah", title: "Pengajuan Bermasalah", head: headData2,
        source: data => (data[1] || []).filter(bermasalah), columns: [0, 1, 2, 3, 4, 14, 6, 12, 13, 11, 7]},
    {card: "Menunggu Verifikator PJK", title: "Menunggu Diuji Verifikator PJK", head: headDataPjk,
        source: data => data[6], columns: [0, 1, 2, 3, 4, 15, 6, 12, 13, 20, 21, 11]},
    {card: "Sudah di Verifikasi", title: "Sudah Verifikasi", head: headData2,
        source: data => data[2], columns: [0, 1, 2, 3, 4, 15, 6, 12, 13, 11, 7]},
    {card: "Diajukan Hari Ini", title: "Ajuan Hari Ini", head: headData3,
        source: data => data[3], columns: [0, 2, 3, 4, 6, 11, 7]},
    {card: "Selesai Bulan Ini", title: "Sudah Diajukan Bulan Ini", head: headData4,
        source: data => [...(data[4] || []), ...(data[5] || [])], columns: [0, 2, 3, 4, 6, 11, 8, 9, 10]},
];

function KelolaPengajuan(props) {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

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

    // Pilot hold: with PILOT_SKIP_MENUNGGU_PJK on, the backend parks a row on the
    // verifikator only when it belongs to a pilot satker, so this section holds those rows
    // and nobody else's. It is dropped rather than shown empty only when the pilot has no
    // participants left. Turning both flags back off restores it as it was.
    const sections = SECTIONS
        .filter(section => !(PILOT.hideMenungguPjkSection && section.card === "Menunggu Verifikator PJK"))
        .map(section => ({...section, rows: section.source(data) || []}));

    return (
        <div className='kelola-container'>
            <div className='card-wrap'>
                {sections.map(section => (
                    <Card key={section.card} title={section.card} content={section.rows.length}/>
                ))}
            </div>
            {sections.map(section => (
                <WideTableCard key={section.title} title={section.title} tableHead={section.head}
                    tableContent={section.rows.map(row => section.columns.map(index => row[index]))}
                    fullContent={section.rows} loading={isLoading}
                    changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            ))}
        </div>
    )
}

KelolaPengajuan.propTypes = {
    changeComponent: PropTypes.func.isRequired,
    aksiData: PropTypes.func.isRequired,
};

export default KelolaPengajuan;
