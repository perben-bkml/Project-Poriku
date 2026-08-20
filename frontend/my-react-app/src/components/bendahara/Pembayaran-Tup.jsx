import { useContext, useEffect, useState } from 'react';
import apiClient from "../../lib/apiClient";
import LoadingAnimate from "../../ui/loading.jsx";
import { pembayaranBpHeadData } from "./head-data.js";
import { TablePembayaranBp } from "../../ui/tables.jsx";
import { SubmitButton } from "../../ui/buttons.jsx";
import { BackgroundTaskContext } from "../../lib/BackgroundTasks.jsx";

const toRupiah = (value) => `Rp ${Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const rupiah = (value) => value < 0 ? `- ${toRupiah(value)}` : toRupiah(value);

export default function PembayaranTup(props) {
    const [cycles, setCycles] = useState([]);
    const [aktif, setAktif] = useState(null);
    const [sisa, setSisa] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [openCycle, setOpenCycle] = useState(null);
    const {lastCompleted} = useContext(BackgroundTaskContext);

    // lastCompleted covers a Pembayaran BP save that was still running when this opened
    useEffect(() => {
        apiClient.get('/bendahara/pembayaran-bp/tup')
            .then(response => {
                setCycles(response.data.cycles || []);
                setAktif(response.data.aktif);
                setSisa(response.data.sisa || 0);
            })
            .catch(error => console.log("Failed fetching data TUP.", error))
            .finally(() => setIsLoading(false));
    }, [lastCompleted]);

    const cycleAktif = cycles.find(cycle => cycle.nomor === aktif);
    const riwayat = cycles.filter(cycle => cycle.nomor !== aktif);

    return (
        <div className='kelola-container'>
            <div className='bg-card wide-card'>
                <h2 className='wide-card-title'>Sisa TUP Berjalan</h2>
                <div className='wide-card-content tup-sisa'>
                    {isLoading ? <LoadingAnimate/> : <>
                        <span className='tup-sisa-nilai'>{rupiah(sisa)}</span>
                        {cycleAktif
                            ? <span className='tup-sisa-info'>TUP {cycleAktif.nomor} sejak {cycleAktif.tanggalMulai || "-"}</span>
                            : <span className='tup-sisa-info'>Tidak ada TUP yang sedang berjalan</span>}
                    </>}
                </div>
            </div>

            <div className='bg-card wide-card'>
                <h2 className='wide-card-title'>
                    {cycleAktif ? `Transaksi TUP ${cycleAktif.nomor}` : "Transaksi TUP Berjalan"}
                </h2>
                <div className='wide-card-content'>
                    {isLoading ? <LoadingAnimate/> : cycleAktif
                        ? <TablePembayaranBp header={pembayaranBpHeadData} content={cycleAktif.rows}/>
                        : <p className='tup-kosong'>Belum ada TUP yang sedang berjalan.</p>}
                </div>
            </div>

            <div className='bg-card wide-card'>
                <h2 className='wide-card-title'>Riwayat TUP</h2>
                <div className='wide-card-content'>
                    {isLoading ? <LoadingAnimate/> : riwayat.length === 0
                        ? <p className='tup-kosong'>Belum ada riwayat TUP.</p>
                        : riwayat.map(cycle => (
                            <div key={cycle.nomor} className='tup-riwayat'>
                                <button type='button' className='tup-riwayat-judul'
                                        onClick={() => setOpenCycle(openCycle === cycle.nomor ? null : cycle.nomor)}>
                                    <span>TUP {cycle.nomor}</span>
                                    <span className='tup-riwayat-tanggal'>
                                        {cycle.tanggalMulai || "-"} s.d. {cycle.tanggalSelesai || "belum ditutup"}
                                    </span>
                                    <span>Sisa: {rupiah(cycle.sisa)}</span>
                                </button>
                                {openCycle === cycle.nomor &&
                                    <div className='tup-riwayat-isi'>
                                        <TablePembayaranBp header={pembayaranBpHeadData} content={cycle.rows}/>
                                    </div>}
                            </div>
                        ))}
                </div>
                <div className='form-submit'>
                    <SubmitButton value='Kembali' name='kembali-tup'
                                  onClick={() => props.changeComponent('pembayaran-bp')}/>
                </div>
            </div>
        </div>
    );
}
