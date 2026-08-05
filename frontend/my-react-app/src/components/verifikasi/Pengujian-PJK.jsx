import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import PropTypes from "prop-types";
import { WideTableCard } from '../../ui/cards.jsx';
import { pjkHeadData, pjkHeadDataMulai, formatNomorSpp } from '../bendahara/head-data.js';

// Column indices on 'Write Antrian Verif'
const INFO_COLUMNS = [0, 1, 6, 2, 3, 4, 8, 9, 10];
const MULAI_VERIF = 11;
const SPP = 6;

function PengujianPJK(props) {
    const [sections, setSections] = useState([[], [], []]);

    useEffect(() => {
        (async () => {
            try {
                const response = await apiClient.get('/verifikasi/pengujian-pjk');
                if (response.status === 200) setSections(response.data.data);
            } catch (error) {
                console.error("Error fetching PJK data", error);
            }
        })();
    }, []);

    const project = (rows, columns) => rows.map(row =>
        columns.map(index => index === SPP ? formatNomorSpp(row[index]) : row[index]));

    const tables = [
        {title: "Informasi Pengajuan", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[0]},
        {title: "Sedang Di Verifikasi", head: pjkHeadDataMulai, columns: [...INFO_COLUMNS, MULAI_VERIF], rows: sections[1]},
        {title: "Sudah Verifikasi", head: pjkHeadData, columns: INFO_COLUMNS, rows: sections[2]},
    ];

    return (
        <div className='kelola-container'>
            {tables.map(table => (
                <WideTableCard key={table.title} title={table.title} feature="PJK"
                    aksiLabel="Verif" aksiTarget="aksi-verif-PJK"
                    tableHead={table.head}
                    tableContent={project(table.rows, table.columns)}
                    fullContent={table.rows}
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
