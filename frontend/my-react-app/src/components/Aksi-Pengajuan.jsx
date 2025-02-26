import React, { useState, useEffect } from "react";
import axios from "axios";
//Import components;
import { columns } from "./head-data";
import { TableKelola } from "../ui/tables";
import LoadingAnimate from "../ui/loading";

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
        <div className="bg-card">
            <TableKelola type="aksi" header={columns} content={tableData} fullContent={tableData} />
        </div>
    )
}

export default AksiPengajuan;