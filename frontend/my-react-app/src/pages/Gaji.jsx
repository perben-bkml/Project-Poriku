import React, {useEffect, useState} from 'react';
import apiClient from "../lib/apiClient";
import { NavLink } from "react-router-dom";
//Import Material UI
import EditNoteIcon from '@mui/icons-material/EditNote';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import Pagination from "@mui/material/Pagination";
//Import Components
import LoadingAnimate from "../ui/loading.jsx";


// The Google Form staff used before the in-app form existed, restored when the switch is off
const FORM_GAJI_LAMA = "https://bit.ly/PelayananGajiBakamlaRI";

export default function Gaji() {
    //State
    const [gajiContentOpen, setGajiContentOpen] = useState(true);
    const [tableContentOpen, setTableContentOpen] = useState(true);
    const [guideOpen, setGuideOpen] = useState(true);
    const [tableData, setTableData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    //Page State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPage, setTotalPage] = useState(0);
    // Which system this page is running. null until known, so nothing is fetched and no button
    // points anywhere until the answer arrives - guessing would flash the wrong destination.
    const [sistemBaru, setSistemBaru] = useState(null);
    //Scroll State
    const [isHeaderHidden, setIsHeaderHidden] = useState(false);

    //Download link


    // The admin switch on Layanan Gaji decides both the queue below and where the form button
    // goes. Read once, before anything else: the two must never disagree with each other.
    useEffect(() => {
        apiClient.get('/layanan-gaji/pengaturan')
            .then(response => setSistemBaru(response.data?.sistemBaru !== false))
            .catch(error => {
                console.log("Error reading layanan gaji setting.", error);
                setSistemBaru(true);
            });
    }, []);

    //Get table data
    async function getTableData(page, baru) {
        const maxRow = 5;
        try {
            setIsLoading(true);
            const response = baru
                ? await apiClient.get('/layanan-gaji/antrian-publik', { params: { page, limit: maxRow } })
                : await apiClient.get('/bendahara/antrian-gaji', { params: { page, limit: maxRow } });
            // Defaulted rather than assigned straight through: this page is public, and a
            // payload without rows would take the whole of it down on the first .map
            setTableData(Array.isArray(response.data?.data) ? response.data.data : []);
            setTotalPage(Math.ceil((Number(response.data?.rowLength) || 0) / maxRow));
        } catch (error) {
            console.log("Error fetching gaji antrian.", error);
        } finally {
            // In finally, not beside the assignment: any other 2xx used to leave the spinner up
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (sistemBaru !== null) getTableData(currentPage, sistemBaru);
    }, [currentPage, sistemBaru])

    // Enable scrolling for this page
    useEffect(() => {
        document.body.classList.add('scrollable-page');

        return () => {
            document.body.classList.remove('scrollable-page');
        };
    }, []);

    // Handle scroll to hide/show header. Subscribed once: this used to store every scroll
    // position in state nothing read, which re-rendered the page and tore the listener down
    // and back up on each event.
    useEffect(() => {
        const handleScroll = () => setIsHeaderHidden(window.scrollY > 100);

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const descList = () => {
        return (
            <ol className='gaji-desc-body'>
                <li>Slip Gaji</li>
                <li>Surat Keterangan Penghasilan</li>
                <li>Surat Keterangan KP4 (untuk pengajuan BPJS)</li>
                <li>Surat Rekomendasi Atasan (untuk pengajuan pinjaman)</li>
                <li>Dokumen lain berkaitan dengan Gaji/Tunjangan Kinerja</li>
            </ol>
        )
    }

    // Positional. The old queue serves three columns from 'Sheet1', the new one projects two.
    const headData = sistemBaru ? ["NOMOR URUT", "STATUS"] : ["NO URUT PELAYANAN", "STATUS", "KETERANGAN"];

    const tableContent = () => {
        return (
            <div className='gaji-table slide-down'>
                {isLoading ? <LoadingAnimate /> :
                    <div className="lihat-antri-table">
                        <TableContainer sx={{ margin: "auto", marginTop:"10px", marginBottom:"10px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: "#00449C" }}>
                                        {headData.map((column, index) => (
                                            <TableCell className="table-cell head-data" key={index} sx={{fontWeight: 550, fontSize:"1.1rem", color:"white", border:"none"}} align="center">{column}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tableData.map((rows, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {rows.map((cells, cellIndex) => (
                                                <TableCell className="table-cell" key={cellIndex} align="center">{cells}</TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </div>
                }
                <div className="lihat-antri-pagination">
                    <Pagination className="pagination" size="medium" count={totalPage} page={currentPage}
                                onChange={(event, value) => setCurrentPage(value) } />
                </div>
            </div>
        )
    }

    return (
        <div className="gaji-page">
                <div className={`gaji-title ${isHeaderHidden ? 'hidden' : ''}`}>
                    <h3>Selamat datang di</h3>
                    <h1>Pelayanan Gaji Bakamla</h1>
                    <br/>
                    <NavLink to='/' style={{textDecoration: 'none', color: 'inherit'}}><p className='gaji-title-desc'>Kembali ke <b>Halaman Awal</b></p></NavLink>
                </div>
            <div className='gaji-content' >
                <h2 onClick={() => setGuideOpen(!guideOpen)}>Langkah-Langkah Pengajuan Kredit {guideOpen ? <ExpandMoreIcon /> : <ExpandLessIcon />}</h2>
                { guideOpen &&
                <div className={`gaji-guide ${guideOpen ? 'slide-down' : ''}`}>
                    <img src="/assets/Infografis_Gaji.jpg" className="gaji-img" alt='Infografis Gaji' />
                </div>
                }
                <br />
                <h2 onClick={() => setGajiContentOpen(!gajiContentOpen)}>Ketentuan Pelayanan Gaji {gajiContentOpen ? <ExpandMoreIcon /> : <ExpandLessIcon />}</h2>
                { gajiContentOpen &&
                <div className={`gaji-desc ${gajiContentOpen ? 'slide-down' : ''}`}>
                    <h4 className='gaji-desc-head'>Peruntukan Pelayanan Gaji</h4>
                    <p className='gaji-desc-body'>Personil Bakamla RI dapat mengisi formulir untuk mendapatkan:</p>
                    {descList()}
                    <p className='gaji-desc-body'>Selanjutnya surat tersebut akan kami proses dan akan kami kirimkan via Email personel yang bersangkutan melalui email perbend.bakamla@gmail.com.</p>
                    <p className='gaji-desc-body'>Untuk hardcopy dokumen/surat dapat diambil di Bagian Keuangan pada hari dan jam kerja.</p>
                    <p className='gaji-desc-body' style={{fontWeight: 'bold'}}>Permintaan pengiriman dokumen selain melalui email tidak dapat kami layani.</p>
                </div>
                }
                <br />
                <h2 onClick={() => setTableContentOpen(!tableContentOpen)}>Antrian Pelayanan {tableContentOpen ? <ExpandMoreIcon /> : <ExpandLessIcon />}</h2>
                { tableContentOpen &&
                    tableContent()
                }
                <div className='gaji-buttonList'>
                    {/* Kept alive behind the switch rather than deleted: turning the new system
                        off has to restore what staff used before it, link and all */}
                    {sistemBaru === false
                        ? <a href={FORM_GAJI_LAMA} style={{textDecoration: 'none'}} target='_blank' rel='noreferrer'><button className='page-button gaji-button'><EditNoteIcon fontSize='large'/><span className="padd-span-bend"/>Form Permintaan Dokumen</button></a>
                        : <NavLink to='/layanan-gaji/form' style={{textDecoration: 'none'}}><button className='page-button gaji-button'><EditNoteIcon fontSize='large'/><span className="padd-span-bend"/>Form Permintaan Dokumen</button></NavLink>}
                    <a href={`${import.meta.env.VITE_DOCS_URL}`} style={{textDecoration: 'none'}} target='_blank'><button className='page-button gaji-button'><CloudDownloadIcon fontSize='large'/><span className="padd-span-bend"/>Surat Rekomendasi Atasan</button></a>
                    <a href={`${import.meta.env.VITE_DOCS_TWO_URL}`} style={{textDecoration: 'none'}} target='_blank'><button className='page-button gaji-button'><CloudDownloadIcon fontSize='large'/><span className="padd-span-bend"/>Surat Pernyataan</button></a>
                </div>
            </div>

        </div>
    )
}
