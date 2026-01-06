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
    //Scroll State
    const [isHeaderHidden, setIsHeaderHidden] = useState(false);
    const [lastScrollY, setLastScrollY] = useState(0);

    //Download link


    //Get table data
    async function getTableData(page) {
        const maxRow = 5;
        try {
            setIsLoading(true);
            const response = await apiClient.get('/bendahara/antrian-gaji', { params: { page, limit: maxRow } });
            if (response.status === 200) {
                setTableData(response.data.data);
                setTotalPage(Math.ceil(response.data.rowLength/maxRow));
                setIsLoading(false);
            }
        } catch (error) {
            console.log("Error fetching gaji antrian.", error);
            setIsLoading(false);
        }
    }

    useEffect(() => {
        getTableData(currentPage);
    }, [currentPage])

    // Enable scrolling for this page
    useEffect(() => {
        document.body.classList.add('scrollable-page');

        return () => {
            document.body.classList.remove('scrollable-page');
        };
    }, []);

    // Handle scroll to hide/show header
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY > 100) {
                // Scrolled down past 100px - hide header
                setIsHeaderHidden(true);
            } else {
                // At the top of the page - show header
                setIsHeaderHidden(false);
            }

            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [lastScrollY]);

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

    const headData = ["NO URUT PELAYANAN", "STATUS", "KETERANGAN"];

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
                                                <TableCell className="table-cell" key={cellIndex}>{cells}</TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </div>
                }
                <div className="lihat-antri-pagination">
                    <Pagination className="pagination" size="medium" count={totalPage} onChange={(event, value) => setCurrentPage(value) } />
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
                <h2 onClick={() => setGuideOpen(!guideOpen)}>Prosedur Flexi BNI {guideOpen ? <ExpandMoreIcon /> : <ExpandLessIcon />}</h2>
                { guideOpen &&
                <div className={`gaji-guide ${guideOpen ? 'slide-down' : ''}`}>
                    <img src="/assets/Infografis_BNI.jpg" className="gaji-img" alt='Infografis Gaji' />
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
                    <a href="https://bit.ly/PelayananGajiBakamlaRI" style={{textDecoration: 'none'}} target='_blank'><button className='page-button gaji-button'><EditNoteIcon fontSize='large'/><span className="padd-span-bend"/>Form Permintaan Dokumen</button></a>
                    <a href={`${import.meta.env.VITE_DOCS_URL}`} style={{textDecoration: 'none'}} target='_blank'><button className='page-button gaji-button'><CloudDownloadIcon fontSize='large'/><span className="padd-span-bend"/>Surat Rekomendasi Atasan</button></a>
                    <a href={`${import.meta.env.VITE_DOCS_TWO_URL}`} style={{textDecoration: 'none'}} target='_blank'><button className='page-button gaji-button'><CloudDownloadIcon fontSize='large'/><span className="padd-span-bend"/>Surat Pernyataan</button></a>
                </div>
            </div>

        </div>
    )
}
