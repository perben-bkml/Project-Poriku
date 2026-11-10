import { useState, useEffect, useRef } from "react";
import apiClient from "../../lib/apiClient";
import PropTypes from "prop-types";
//Import components;
import { columns, infoHeadData, formatNomorSpp } from "./head-data.js";
import { TableKelola, TableInfoAntri } from "../../ui/tables.jsx";
import LoadingAnimate, { LoadingScreen } from "../../ui/loading.jsx";
import Popup, { PopupAlert } from "../../ui/Popup.jsx";

function AksiPengajuan(props) {

    //States
    const [isLoading, setIsLoading] = useState(false)
    const [isTableLoading, setIsTableLoading] = useState(false)
    const [isPopup, setIsPopup] = useState(false)
    const [tableData, setTableData] = useState([])
    const [tandaMak, setTandaMak] = useState(null)
    const [antriData, setAntriData] = useState({
        no_antri: "",
        ajuan_verifikasi: "",
        tgl_verifikasi: "",
        status_pajak: "",
        sedia_anggaran: "",
        tgl_setuju: "",
        drpp: "",
        spp: "",
        spm: "",
        catatan: "",
        lampiran: "",
    })
    const [documentData, setDocumentData] = useState([{
        drpp: "", nominal: "", spp: "", spm: "",
    }])
    // Column R on 'Write Antrian', so reopening a transaction shows the date already saved
    const [tanggalSp2d, setTanggalSp2d] = useState(() => props.fulldata?.[17] || "")
    // Only once the existing DRPP rows are known may a save mean "delete what is there"
    const [docsLoaded, setDocsLoaded] = useState(false)
    const [warning, setWarning] = useState("")
    const [bpPreview, setBpPreview] = useState(null)
    const [isCheckingBp, setIsCheckingBp] = useState(false)
    const saving = useRef(false)
    const checking = useRef(false)
    //State for aju-verif select
    const [verifValue, setVerifValue] = useState("FALSE")
    const [drppProcess, setDrppProcess] = useState(false)

    //Options Data
    const optionPajak = [
        {label: "", color: "var(--theme-surface, white)", textcolor: "white"},
        {label: "OK", color: "var(--theme-fill-9fffc3, #9FFFC3)", textcolor: "var(--theme-ink-0f9043, #0F9043)"},
        {label: "Belum ada bukti potong", color: "var(--theme-fill-c7b6a7, #C7B6A7)", textcolor: "var(--theme-ink-5e4c3b, #5E4C3B)"},
        {label: "Belum ada faktur pajak", color: "var(--theme-surface-raised, #3D3630)", textcolor: "var(--theme-ink-c7b6a7, #C7B6A7)"},
        {label: "Jenis pajak salah", color: "var(--theme-fill-f3b5b5, #F3B5B5)", textcolor: "var(--theme-ink-8b0808, #8B0808)"},
        {label: "Perhitungan Salah", color: "var(--theme-fill-eb2727, #EB2727)", textcolor: "var(--theme-ink-eec6c6, #EEC6C6)"},]

    const optionAnggaran = [
        {label: "", color: "var(--theme-surface, white)", textcolor: "white"},
        {label: "OK", color: "var(--theme-fill-9fffc3, #9FFFC3)", textcolor: "var(--theme-ink-0f9043, #0F9043)"},
        {label: "Pagu Minus", color: "var(--theme-fill-eb2727, #EB2727)", textcolor: "var(--theme-ink-eec6c6, #EEC6C6)"},
    ]

    async function fetchAntrianTable() {
        try {
            setIsTableLoading(true)
            const tableKeyword = `TRANS_ID:${props.fulldata[0]}`
            const response = await apiClient.get('/bendahara/data-transaksi',
                { params: { tableKeyword, unitKerja: props.fulldata[11] } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
                setTandaMak(response.data.tandaMak || null);
                setIsTableLoading(false)
            }
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    async function fetchMonitoringData() {
        try {
            const response = await apiClient.get('/bendahara/get-ajuan', {
                params: { trans_id: props.fulldata[0], spm: props.fulldata[10] },
            });
            if (response.status === 200) {
                if ((response.data.data || []).some(row=>row.drpp || row.spp || row.spm || row.nominal)) {
                    setDocumentData(response.data.data || []);
                    setDrppProcess(true);
                }
                if (response.data.warning) setWarning(response.data.warning);
                setDocsLoaded(true);
            }
        } catch (error) {
            // 404 is the normal answer for a pengajuan with no DRPP rows yet, so the
            // state is known. Any other failure leaves it unknown, and a save then
            // touches neither Monitoring DRPP nor Pembayaran BP.
            if (error.response?.status === 404) setDocsLoaded(true);
            else {
                console.error("Error fetching monitoring data", error);
                setWarning('Rincian DRPP belum dapat dimuat. Perubahan DRPP dan Pembayaran BP tidak akan disimpan. Muat ulang untuk mengubahnya.');
            }
        }
    }


    useEffect(() => {
        fetchAntrianTable();
        fetchMonitoringData();
        setAntriData({
            no_antri: props.fulldata[0],
            ajuan_verifikasi: props.fulldata[14] === "" ? "FALSE" : "TRUE",
            tgl_verifikasi: props.fulldata[15],
            status_pajak: props.fulldata[12] ,
            sedia_anggaran: props.fulldata[13],
            tgl_setuju: props.fulldata[6],
            drpp: props.fulldata[8],
            spp: props.fulldata[9],
            spm: props.fulldata[10],
            catatan: props.fulldata[16],
            lampiran: props.fulldata[19],
        });
    }, [])

    //Automatically change background color for select tag
    useEffect(() => {
        setVerifValue(antriData.ajuan_verifikasi)
        if (antriData.sedia_anggaran) {
            const selectElement = document.getElementById("anggaran");
            if (selectElement) {
                selectAnggaranBackgroundColor(selectElement);
            }
        }
        if (antriData.status_pajak) {
            const selectElement = document.getElementById("sts-pajak");
            if (selectElement) {
                selectPajakBackgroundColor(selectElement);
            }
        }
    }, [antriData]);

    //Number format generator
    function numberFormats(num) {
        if (!num) {
            return "";
        }
        // Remove all non-numeric characters (except numbers)
        const numericValue = num.toString().replace(/\D/g, "");

        // Format with periods as thousand separators
        return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    //Handle Select Tag style change
    function selectPajakBackgroundColor(select) {
        const selectedOption = select.options[select.selectedIndex];
        const findColor = optionPajak.find(data => data.label === selectedOption.value)
        select.style.backgroundColor = findColor.color;
        select.style.color= findColor.textcolor;
    }
    function selectAnggaranBackgroundColor(select) {
        const selectedOption = select.options[select.selectedIndex];
        const findColor = optionAnggaran.find(data => data.label === selectedOption.value)
        select.style.backgroundColor = findColor.color;
        select.style.color= findColor.textcolor;
    }

    //Handle Input Change
    function handleInputChange(event){
        const {name, value} = event
        if (name === "ajuan_verifikasi") {
            setVerifValue(value)
        }
        setAntriData((prevdata) => ({...prevdata, 
            [name]: value 
        }));

    }

    function handleDocInputChange(event, index) {
        const { name, value } = event;
        let formattedValue = value;
        if (name === "nominal") {
            formattedValue = numberFormats(value);
        }
        const updatedRows = [...documentData];
        updatedRows[index][name] = name === "nominal" ? formattedValue : value;
        setDocumentData(updatedRows);
    }

    function dateDoubleClick(event) {

        if (event.name === "tgl_verifikasi") {
            setAntriData((prevdata) => ({...prevdata,
                [event.name]: ""
            }));
        }
        if (event.name === "tgl_setuju") {
            setAntriData((prevdata) => ({...prevdata,
                [event.name]: ""
            }));
        }
    }

    // Add and Delete Row For Document inputs
    function addNewRow(e) {
        e.preventDefault();
        setDocumentData([...documentData, { drpp: "", nominal: "", spp: "", spm: "" }]);
    }

    function deleteRow(e) {
        e.preventDefault();
        if (documentData.length === 1) return; // Prevent deleting the last row
        setDocumentData(prevRows => prevRows.slice(0, -1));
    }


    //Handle Popup
    async function handlePopup() {
        if (isPopup) {
            setIsPopup(false);
            setBpPreview(null);
            return;
        }
        if (checking.current || saving.current) return;
        checking.current=true;setIsCheckingBp(true);setWarning("");
        try {
            if (docsLoaded) {
                const {data}=await apiClient.post('/bendahara/aksi-ajuan/pembayaran-bp-preview',{
                    transId:props.fulldata[0],documentData,drppProcess,tanggalSp2d,
                });
                setBpPreview(data);
            } else setBpPreview(null);
            setIsPopup(true);
        } catch(error) {
            setWarning(error.response?.data?.message || 'Gagal memeriksa SPM di Pembayaran BP. Coba lagi sebelum menyimpan.');
        } finally {checking.current=false;setIsCheckingBp(false);}
    }

    // Grouped the way the server does before writing Pembayaran BP: by SPM digits, so
    // "60" and "00060" are one transaction
    const nominalOf = (row) => Number(String(row.nominal ?? "").replace(/\D/g, "") || 0);
    const spmKey = (row) => String(row.spm ?? "").replace(/\D/g, "").replace(/^0+/, "");
    const nominalPerSpm = documentData.reduce((groups, row) => {
        const key = spmKey(row);
        if (key) groups.set(key, (groups.get(key) || 0) + nominalOf(row));
        return groups;
    }, new Map());
    const nominalTanpaSpm = documentData.reduce(
        (sum, row) => spmKey(row) ? sum : sum + nominalOf(row), 0);
    const totalNominal = documentData.reduce((sum, row) => sum + nominalOf(row), 0);

    //Compile Info Antrian table data
    const infoTableData = [
        props.fulldata[0], 
        props.fulldata[2],
        props.fulldata[3],
        props.fulldata[1],
        props.fulldata[7],
        props.fulldata[11],
        props.fulldata[4],
        props.fulldata[5],
    ]

    //Submit Handler
    async function handleOnSubmit(){
        if (saving.current) return;
        saving.current=true;
        // Unticking Buat DRPP means this pengajuan has no DRPP, so the antrian stops
        // claiming a DRPP, SPP and SPM as well
        const docRows = drppProcess ? documentData : [];
        const drppArray = docRows.map(row => row.drpp).join(", ");
        const sppArray = docRows.map(row => row.spp).filter(spp => String(spp ?? '').trim() !== "");
        const sppString = [...new Set(sppArray)].join(", ");

        const spmArray = docRows.map(row => row.spm).filter(spm => String(spm ?? '').trim() !== "");
        const spmString = [...new Set(spmArray)].join(", ");

        const updatedAntriData = {
            ...antriData,
            ...(docsLoaded ? {drpp:drppArray,spp:sppString,spm:spmString} : {}),
        };

        // Sent even when unticked: the rows already on the sheet have to be removed,
        // which the server can only do if it is told about this save
        const monitoringDrppData = docsLoaded ? {
            trans_id: props.fulldata[0],
            satker: props.fulldata[11],
            jenis: props.fulldata[3],
        } : null

        const sendData = {
            updatedAntriData,
            monitoringDrppData,
            bpPreviewToken:bpPreview?.token || null,
            ...(docsLoaded ? { documentData, drppProcess, tanggalSp2d } : {}),
        }

        try {
            setIsPopup(false);
            setIsLoading(true);
            const result = await apiClient.post('/bendahara/aksi-ajuan', sendData)
            if (result.status === 200) {
                // Stay put when Pembayaran BP was not written, or the admin never sees it
                if (result.data?.warning) return setWarning(result.data.warning)
                props.changeComponent("kelola-pengajuan")
            }
        } catch (error) {
            if (error.response?.status===409 && error.response.data?.code==='BP_CONFIRMATION_REQUIRED') {
                setBpPreview(error.response.data.preview);
                setWarning('Data Pembayaran BP berubah. Periksa kembali penambahan nominal sebelum menyimpan.');
                setIsPopup(true);
            } else setWarning(error.response?.data?.message || 'Gagal menyimpan data. Silakan coba lagi.');
        } finally {saving.current=false;setIsLoading(false);}
    }

    return (
        <div className="aksi-pengajuan-container">
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Informasi Antrian</h2>
                <TableInfoAntri header={infoHeadData} body={infoTableData}/>
                <form>
                <fieldset className="aksi-pengajuan-fields" disabled={isCheckingBp || isLoading || isPopup}>
                <div className="aksi-content-label">
                    <label htmlFor="aju-verif">Sedang Di Verifikasi?</label>
                    <select id="aju-verif" className="type-btn" name="ajuan_verifikasi" value={verifValue} onChange={e => handleInputChange(e.target)}>
                        <option value="FALSE">Belum</option>
                        <option value="TRUE">Iya</option>
                    </select>
                    <label htmlFor="tgl-verif">Tanggal Selesai Verifikasi</label>
                    <input id="tgl-verif" className="type-btn" type="date" name="tgl_verifikasi" defaultValue={antriData.tgl_verifikasi} onChange={e => handleInputChange(e.target)} onDoubleClick={e=> dateDoubleClick(e.target)} />
                    <label htmlFor="sts-pajak">Status Pajak</label>
                    <select id="sts-pajak" className="type-btn" name="status_pajak" value={!props.fulldata ? null : antriData.status_pajak} onChange={(e) => (selectPajakBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionPajak.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="anggaran">Ketersediaan Anggaran</label>
                    <select id="anggaran" className="type-btn" name="sedia_anggaran" value={!props.fulldata ? null : antriData.sedia_anggaran} onChange={(e) => (selectAnggaranBackgroundColor(e.target), handleInputChange(e.target))}>
                        {optionAnggaran.map((data, index) => (
                            <option key={index} style={{backgroundColor: data.color, color: data.textcolor}} value={data.label}>{data.label}</option>
                        ))}
                    </select>
                    <label htmlFor="tgl-acc">Tanggal Disetujui</label>
                    <input id="tgl-acc" className="type-btn" type="date" name="tgl_setuju" defaultValue={antriData.tgl_setuju} onChange={e => handleInputChange(e.target)} onDoubleClick={e=>dateDoubleClick(e.target)}/>
                    <label htmlFor="catatan">Catatan</label>
                    <textarea id="catatan" className="type-btn span-row" name="catatan" defaultValue={antriData.catatan} onChange={e => handleInputChange(e.target)}/>
                    <label htmlFor="buat-drpp">Buat DRPP?</label>
                    <input id="buat-drpp" className="type-btn" type="checkbox" name="buat_drpp" checked={drppProcess === true} defaultValue={antriData.tgl_setuju} onChange={() => !drppProcess ? setDrppProcess(true) : setDrppProcess(false)}/>
                </div>

                <div className="lampiran-aksi-pengajuan">
                    <p>Lampiran: <span className={"padd-span-bend"}/>{ antriData.lampiran !== "" ?
                        <a href={antriData.lampiran} target={"_blank"} rel="noopener noreferrer">Klik disini</a>: <a>-</a> }
                    </p>
                </div>
                { drppProcess &&
                <div className="aksi-content-docs">
                    <div className={`docs-sp2d${tanggalSp2d ? " docs-sp2d-filled" : ""}`}>
                        <div className="docs-sp2d-head">
                            <span className="docs-sp2d-icon">{tanggalSp2d ? "\u2713" : "!"}</span>
                            <label htmlFor="tanggalSp2d">Tanggal SP2D</label>
                            <span className="docs-sp2d-badge">{tanggalSp2d ? "Sudah Diisi" : "Wajib Diisi"}</span>
                        </div>
                        <div className="docs-sp2d-body">
                            <input id="tanggalSp2d" className="type-btn" type="date" name="tanggalSp2d"
                                   value={tanggalSp2d} onChange={e => setTanggalSp2d(e.target.value)}/>
                            <p className="docs-sp2d-hint">{tanggalSp2d
                                ? "Transaksi akan dicatat di Pembayaran BP."
                                : "Tanpa Tanggal SP2D, transaksi tidak akan dicatat di Pembayaran BP."}</p>
                        </div>
                    </div>
                    <div className="docs-label">
                        <label htmlFor="drpp">Nomor DRPP</label>
                        <label htmlFor="nominal">Nominal</label>
                        <label htmlFor="spp">Nomor SPP</label>
                        <label htmlFor="spm">Nomor SPM</label>
                    </div>
                {documentData.map((row, index) => (
                    <div key={index} className="docs-input">
                        <input id="drpp" className="docs-btn" type="text" name="drpp" value={row.drpp} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="nominal" className="docs-btn" type="text" name="nominal" value={row.nominal} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="spp" className="docs-btn" type="text" name="spp" value={row.spp} onChange={e => handleDocInputChange(e.target, index)}/>
                        <input id="spm" className="docs-btn" type="text" name="spm" value={row.spm} onChange={e => handleDocInputChange(e.target, index)}/>
                    </div>
                ))}
                    <div className="docs-rincian">
                        <span className="docs-rincian-title">Rincian Nominal</span>
                        {[...nominalPerSpm].map(([spm, nominal]) => (
                            <div key={spm} className="docs-rincian-row">
                                <span>SPM {formatNomorSpp(spm)}</span>
                                <span>Rp {numberFormats(nominal) || "0"}</span>
                            </div>
                        ))}
                        {nominalTanpaSpm > 0 &&
                            <div className="docs-rincian-row">
                                <span>Tanpa Nomor SPM</span>
                                <span>Rp {numberFormats(nominalTanpaSpm) || "0"}</span>
                            </div>}
                        <div className="docs-rincian-row docs-rincian-total">
                            <span>Total Nominal</span>
                            <span>Rp {numberFormats(totalNominal) || "0"}</span>
                        </div>
                    </div>
                    <div>
                        <button className="add-row-btn" onClick={(e) => addNewRow(e)}>Tambah Baris</button>
                        <button className="add-row-btn" onClick={(e) => deleteRow(e)} disabled={documentData.length === 1}>Hapus Baris</button>
                    </div>
                </div>
                }
                <div className="form-submit aksi-submit">
                    <input className={"button-reject"} type="button" value="Kembali" onClick={() => props.changeComponent("kelola-pengajuan")}/>
                    <input type="button" value={isCheckingBp ? "Memeriksa SPM…" : "Simpan"} onClick={handlePopup} />
                </div>
                </fieldset>
                </form>
            </div>
            <div className="bg-card aksi-content">
                <h2 className="aksi-content-title">Tabel Ajuan</h2>
                {isTableLoading ? <LoadingAnimate /> : 
                <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData}
                             tandaMak={tandaMak} />
                }
            </div>
            {isPopup && <Popup type="submit" whenClick={handleOnSubmit} cancel={handlePopup}
                message={bpPreview?.additions?.length ? <span className="aksi-bp-confirm">
                    <span className="aksi-bp-confirm-title">Nomor SPM sudah ada di Pembayaran BP</span>
                    <span className="aksi-bp-confirm-note">SPM pengajuan ini akan menambah nominal pada data yang sudah ada.</span>
                    <span className="aksi-bp-confirm-items">{bpPreview.additions.map(item=><span key={item.spm} className="aksi-bp-confirm-item">
                        <strong>SPM {item.spm}</strong>
                        <span>Nominal saat ini: Rp {numberFormats(item.existing) || '0'}</span>
                        <span>Penambahan: <strong>Rp {numberFormats(item.increase) || '0'}</strong></span>
                        <span>Total setelah disimpan: <strong>Rp {numberFormats(item.total) || '0'}</strong></span>
                    </span>)}</span>
                    <span className="aksi-bp-confirm-note">Lanjutkan menyimpan?</span>
                </span> : bpPreview?.warning || undefined}/>
            }
            {warning && <PopupAlert isAlert={!!warning} severity="warning" message={warning}/>}
            {isLoading && <LoadingScreen />}
        </div>
    )
}

// Define PropTypes
AksiPengajuan.propTypes = {
    fulldata: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ])).isRequired, // Must be an array containing strings or numbers
    changeComponent: PropTypes.func.isRequired, // Must be a function
};


export default AksiPengajuan;
