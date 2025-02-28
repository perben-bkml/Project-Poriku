import React, { useState, useEffect } from "react";
import axios from "axios";
//Import components;
import { columns } from "./head-data";
import { TableKelola } from "../ui/tables";
import LoadingAnimate from "../ui/loading";
import { SubmitButton } from "../ui/buttons";

function AksiPengajuan(props) {
    
    //States
    const [isLoading, setIsLoading] = useState(false)
    const [tableData, setTableData] = useState([])

    if (tableData == [] || !props.keyword) {
        return <LoadingAnimate />
    }

    async function fetchAntrianTable() {
        try {
            setIsLoading(true);
            const tableKeyword = `TRANS_ID:${props.keyword}`
            const response = await axios.get("http://localhost:3000/bendahara/data-transaksi", { params: { tableKeyword } })
            if (response.status === 200) {
                setTableData(response.data.data || []);
            }
            setIsLoading(false);
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }

    useEffect(() => {
        fetchAntrianTable();
    }, [])



    return (
        <div className="aksi-pengajuan-container">
            <div className="bg-card aksi-content">
                <div className="aksi-content-label">
                    <label htmlFor="aju-verif">Sedang Di Verifikasi?</label>
                    <input id="aju-verif" type="checkbox" name="ajuan-verifikasi"/>
                    <label htmlFor="tgl-verif">Tanggal Selesai Verifikasi</label>
                    <input id="tgl-verif" type="date" name="tgl-verifikasi"/>
                    <label htmlFor="sts-pajak">Status Pajak</label>
                    <select id="sts-pajak" name="status-pajak">

                    </select>
                    <label htmlFor="anggaran">Ketersediaan Anggaran</label>
                    <select id="anggaran" name="sedia-anggaran">

                    </select>
                    <label htmlFor="tgl-acc">Tanggal Disetujui</label>
                    <input id="tgl-acc" type="date" name="tgl-setuju" />
                    <label htmlFor="drpp">Nomor DRPP</label>
                    <input id="drpp" type="number" name="drpp"/>
                    <label htmlFor="spp">Nomor SPP</label>
                    <input id="spp" type="number" name="spp" />
                    <label htmlFor="spm">Nomor SPM</label>
                    <input id="spm" type="number" name="spm"/>
                </div>
                <div className="form-submit aksi-submit">
                    <SubmitButton value="Kembali"/>
                    <SubmitButton value="Simpan"/>
                </div>
            </div>
            <br />
            <div className="bg-card aksi-content">
                <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData} />
            </div>
        </div>
    )
}

export default AksiPengajuan;