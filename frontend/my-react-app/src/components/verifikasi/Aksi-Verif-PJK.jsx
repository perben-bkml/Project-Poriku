import { useState, useEffect, useMemo } from "react";
import apiClient from "../../lib/apiClient";
import PropTypes from "prop-types";
import { columns, ringkasColumns, ringkasLabels, pjkInfoHeadData, pjkStatusOptions, pjkKelengkapanOptions, formatNomorSpp } from "../bendahara/head-data.js";
import { TableKelola, TableInfoAntri } from "../../ui/tables.jsx";
import LoadingAnimate, { LoadingScreen } from "../../ui/loading.jsx";
import Popup from "../../ui/Popup.jsx";

const FIELD = {
    no: 0, timestamp: 1, nama: 2, jenis: 3, nominal: 4, spp: 6,
    unitKerja: 8, substansi: 9, kelengkapan: 10,
    mulaiVerif: 11, selesaiVerif: 12, catatan: 13, lampiran: 14,
    // Appended by the backend: the 'Write Antrian' id, set only on GUP/PTUP mirror rows
    sourceId: 15,
};

function AksiVerifPJK(props) {
    const [isLoading, setIsLoading] = useState(false);
    const [isTableLoading, setIsTableLoading] = useState(true);
    const [isPopup, setIsPopup] = useState(false);
    const [tableData, setTableData] = useState([]);
    const [pjkData, setPjkData] = useState({
        no_antri: "",
        mulai_verifikasi: "FALSE",
        tgl_selesai: "",
        substansi: "",
        kelengkapan: "",
        catatan: "",
        lampiran: "",
    });

    // A GUP/PTUP block is the full table; every other jenis stores the cropped one
    const sourceId = props.fulldata[FIELD.sourceId];
    const tableHeader = useMemo(
        () => sourceId
            ? columns
            : ringkasColumns.map(index => ({...columns[index], label: ringkasLabels[index] || columns[index].label})),
        [sourceId]
    );

    useEffect(() => {
        setPjkData({
            no_antri: props.fulldata[FIELD.no],
            mulai_verifikasi: props.fulldata[FIELD.mulaiVerif] === "" ? "FALSE" : "TRUE",
            tgl_selesai: props.fulldata[FIELD.selesaiVerif] || "",
            // Rows predating the defaults have these blank, which no option matches
            substansi: props.fulldata[FIELD.substansi] || pjkStatusOptions[0].label,
            kelengkapan: props.fulldata[FIELD.kelengkapan] || pjkKelengkapanOptions[0].label,
            catatan: props.fulldata[FIELD.catatan],
            lampiran: props.fulldata[FIELD.lampiran],
        });

        (async () => {
            try {
                // A mirror row's block lives on the gup table sheet under the id it came from
                const response = await apiClient.get('/bendahara/data-transaksi', {
                    params: sourceId
                        ? { tableKeyword: `TRANS_ID:${sourceId}`, flow: "gup" }
                        : { tableKeyword: `TRANS_ID:${props.fulldata[FIELD.no]}`, flow: "verif" },
                });
                if (response.status === 200) setTableData(response.data.data || []);
            } catch {
                setTableData([]); // jenis without a table block
            }
            setIsTableLoading(false);
        })();
    }, []);

    function applyOptionColor(select, options) {
        const match = options.find(option => option.label === select.value);
        if (!match) return;
        select.style.backgroundColor = match.color;
        select.style.color = match.textcolor;
    }

    useEffect(() => {
        [["substansi", pjkStatusOptions], ["kelengkapan", pjkKelengkapanOptions]].forEach(([id, options]) => {
            const select = document.getElementById(id);
            if (select) applyOptionColor(select, options);
        });
    }, [pjkData]);

    function handleInputChange({name, value}) {
        setPjkData(prev => ({...prev, [name]: value}));
    }

    function handlePopup() {
        setIsPopup(!isPopup);
    }

    const infoTableData = [
        props.fulldata[FIELD.no],
        sourceId || "-",
        <b key="spp">{formatNomorSpp(props.fulldata[FIELD.spp])}</b>,
        props.fulldata[FIELD.nama],
        props.fulldata[FIELD.jenis],
        props.fulldata[FIELD.timestamp],
        props.fulldata[FIELD.unitKerja],
        props.fulldata[FIELD.nominal],
    ];

    async function handleOnSubmit() {
        try {
            handlePopup();
            setIsLoading(true);
            const result = await apiClient.post('/verifikasi/aksi-pjk', pjkData);
            if (result.status === 200) props.changeComponent("pengujian-PJK");
        } catch (error) {
            console.log("Failed sending Data.", error);
        }
        setIsLoading(false);
    }

    return (
        <div className="aksi-pengajuan-container">
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Verifikasi PJK</h2>
                <TableInfoAntri header={pjkInfoHeadData} body={infoTableData}/>
                <form>
                <div className="aksi-content-label">
                    <label htmlFor="aju-verif">Sedang Di Verifikasi?</label>
                    <select id="aju-verif" className="type-btn" name="mulai_verifikasi" value={pjkData.mulai_verifikasi} onChange={e => handleInputChange(e.target)}>
                        <option value="FALSE">Belum</option>
                        <option value="TRUE">Iya</option>
                    </select>
                    <label htmlFor="tgl-selesai">Tanggal Selesai Verifikasi</label>
                    <input id="tgl-selesai" className="type-btn" type="date" name="tgl_selesai" value={pjkData.tgl_selesai || ""}
                        onChange={e => handleInputChange(e.target)}
                        onDoubleClick={() => handleInputChange({name: "tgl_selesai", value: ""})}/>
                    <label htmlFor="substansi">Substansi PJK</label>
                    <select id="substansi" className="type-btn" name="substansi" value={pjkData.substansi}
                        onChange={e => (applyOptionColor(e.target, pjkStatusOptions), handleInputChange(e.target))}>
                        {pjkStatusOptions.map(option => (
                            <option key={option.label} style={{backgroundColor: option.color, color: option.textcolor}} value={option.label}>{option.label}</option>
                        ))}
                    </select>
                    <label htmlFor="kelengkapan">Kelengkapan PJK</label>
                    <select id="kelengkapan" className="type-btn" name="kelengkapan" value={pjkData.kelengkapan}
                        onChange={e => (applyOptionColor(e.target, pjkKelengkapanOptions), handleInputChange(e.target))}>
                        {pjkKelengkapanOptions.map(option => (
                            <option key={option.label} style={{backgroundColor: option.color, color: option.textcolor}} value={option.label}>{option.label}</option>
                        ))}
                    </select>
                    <label htmlFor="catatan">Catatan</label>
                    <textarea id="catatan" className="type-btn span-row" name="catatan" defaultValue={pjkData.catatan} onChange={e => handleInputChange(e.target)}/>
                </div>

                <div className="lampiran-aksi-pengajuan">
                    <p>Lampiran: <span className={"padd-span-bend"}/>{ pjkData.lampiran ?
                        <a href={pjkData.lampiran} target={"_blank"} rel="noopener noreferrer">Klik disini</a> : <a>-</a> }
                    </p>
                </div>
                <div className="form-submit aksi-submit">
                    <input className={"button-reject"} type="button" value="Kembali" onClick={() => props.changeComponent("pengujian-PJK")}/>
                    <input type="button" value="Simpan" onClick={handlePopup} />
                </div>
                </form>
            </div>
            {isTableLoading || tableData.length > 0 ?
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Ajuan</h2>
                {isTableLoading ? <LoadingAnimate /> :
                <TableKelola type="aksi" header={tableHeader} content={tableData} fullContent={tableData} />
                }
            </div> : null}
            {isPopup && <Popup type="submit" whenClick={handleOnSubmit} cancel={handlePopup}/>}
            {isLoading && <LoadingScreen />}
        </div>
    )
}

AksiVerifPJK.propTypes = {
    fulldata: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ])).isRequired,
    changeComponent: PropTypes.func.isRequired,
};

export default AksiVerifPJK;
