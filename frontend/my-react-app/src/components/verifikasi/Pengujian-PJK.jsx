import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import PropTypes from "prop-types";
import { WideTableCard } from '../../ui/cards.jsx';
import { pjkHeadData, pjkHeadDataMulai, formatNomorSpp } from '../bendahara/head-data.js';

// Column indices on 'Write Antrian Verif'; 15 is the source id the backend appends
const SOURCE_ID = 15;
const INFO_COLUMNS = [0, SOURCE_ID, 1, 6, 2, 3, 4, 8, 9, 10];
const MULAI_COLUMNS = [...INFO_COLUMNS, 11];
const SPP = 6;
const SUBSTANSI = 9, KELENGKAPAN = 10;

// A rejected verdict parks the row until the verifikator revisits it
const ditolak = row => [row[SUBSTANSI], row[KELENGKAPAN]]
    .some(value => String(value ?? "").trim() === "Ditolak");

function PengujianPJK(props) {
    const [sections, setSections] = useState([[], [], []]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const response = await apiClient.get('/verifikasi/pengujian-pjk');
                if (response.status === 200) setSections(response.data.data);
            } catch (error) {
                console.error("Error fetching PJK data", error);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const project = (rows, columns) => rows.map(row => columns.map(index => {
        if (index === SPP) return formatNomorSpp(row[index]);
        if (index === SOURCE_ID) return row[index] || "-";
        return row[index];
    }));

    const tables = [
        {title: "Informasi Pengajuan", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[0]},
        {title: "Sedang Di Verifikasi", head: pjkHeadDataMulai, columns: MULAI_COLUMNS, rows: sections[1].filter(row => !ditolak(row))},
        {title: "Pengajuan Bermasalah", head: pjkHeadDataMulai, columns: MULAI_COLUMNS, rows: sections[1].filter(ditolak)},
        {title: "Sudah Verifikasi", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[2]},
    ];

    return (
        <div className='kelola-container'>
            {tables.map(table => (
                <WideTableCard key={table.title} title={table.title} feature="PJK"
                    aksiLabel="Verif" aksiTarget="aksi-verif-PJK"
                    tableHead={table.head}
                    tableContent={project(table.rows, table.columns)}
                    fullContent={table.rows} loading={isLoading}
                    changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            ))}
        </div>
    )
}

PengujianPJK.propTypes = {
    changeComponent: PropTypes.func.isRequired,
    aksiData: PropTypes.func.isRequired,
};

export default PengujianPJK;
