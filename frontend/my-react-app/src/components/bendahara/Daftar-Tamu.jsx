import React, {useState, useEffect} from "react";
import axios from "axios";

// Components import
import {TableDaftarTamu} from "../../ui/tables.jsx";
import {daftarMasuk, daftarKeluar} from "./head-data.js";
import LoadingAnimate from "../../ui/loading.jsx";
import Pagination from "@mui/material/Pagination";



export default function DaftarTamu() {

    //States
    const [isLoading, setIsLoading] = useState(false);
    const [masukTableData, setMasukTableData] = useState([]);
    const [keluarTableData, setKeluarTableData] = useState([]);

    // Pagination states for Personil Masuk
    const [masukCurrentPage, setMasukCurrentPage] = useState(() => {
        const savedPage = localStorage.getItem('daftar-tamu-masuk-pagination');
        const pageNumber = savedPage ? parseInt(savedPage, 10) : 1;
        return pageNumber > 0 ? pageNumber : 1;
    });
    const [masukTotalPages, setMasukTotalPages] = useState(0);
    const [masukPageInput, setMasukPageInput] = useState("");

    // Pagination states for Personil Keluar
    const [keluarCurrentPage, setKeluarCurrentPage] = useState(() => {
        const savedPage = localStorage.getItem('daftar-tamu-keluar-pagination');
        const pageNumber = savedPage ? parseInt(savedPage, 10) : 1;
        return pageNumber > 0 ? pageNumber : 1;
    });
    const [keluarTotalPages, setKeluarTotalPages] = useState(0);
    const [keluarPageInput, setKeluarPageInput] = useState("");



    //Fetch Data
    async function fetchData(masukPage, keluarPage) {
        const rowsPerPage = 10;
        try {
            setIsLoading(true);
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/bendahara/daftar-tamu`, {
                params: {
                    masukPage: masukPage,
                    keluarPage: keluarPage,
                    limit: rowsPerPage
                }
            });
            if (response.status === 200) {
                const { masuk, keluar } = response.data;

                // Set Masuk data
                setMasukTableData(masuk.data);
                setMasukTotalPages(masuk.totalPages);

                // Set Keluar data
                setKeluarTableData(keluar.data);
                setKeluarTotalPages(keluar.totalPages);

                setIsLoading(false);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            setIsLoading(false);
        }
    }

    // Fetch data when pagination changes
    useEffect(() => {
        fetchData(masukCurrentPage, keluarCurrentPage);
    }, [masukCurrentPage, keluarCurrentPage]);

    // Validate masukCurrentPage against masukTotalPages
    useEffect(() => {
        if (masukTotalPages > 0 && masukCurrentPage > masukTotalPages) {
            setMasukCurrentPage(1);
            localStorage.setItem('daftar-tamu-masuk-pagination', '1');
        }
    }, [masukTotalPages, masukCurrentPage]);

    // Validate keluarCurrentPage against keluarTotalPages
    useEffect(() => {
        if (keluarTotalPages > 0 && keluarCurrentPage > keluarTotalPages) {
            setKeluarCurrentPage(1);
            localStorage.setItem('daftar-tamu-keluar-pagination', '1');
        }
    }, [keluarTotalPages, keluarCurrentPage]);

    // Pagination handlers for Personil Masuk
    function handleMasukPaginationChange(event, value) {
        if (value >= 1 && value <= masukTotalPages) {
            setMasukCurrentPage(value);
            localStorage.setItem('daftar-tamu-masuk-pagination', value.toString());
        }
    }

    function handleMasukPageInputChange(event) {
        const value = event.target.value;
        if (/^\d*$/.test(value)) {
            setMasukPageInput(value);
        }
    }

    function handleMasukGoToPage() {
        const pageNumber = parseInt(masukPageInput, 10);
        if (pageNumber >= 1 && pageNumber <= masukTotalPages) {
            setMasukCurrentPage(pageNumber);
            localStorage.setItem('daftar-tamu-masuk-pagination', pageNumber.toString());
            setMasukPageInput("");
        } else {
            setMasukPageInput("");
        }
    }

    function handleMasukPageInputKeyDown(event) {
        if (event.key === 'Enter') {
            handleMasukGoToPage();
        }
    }

    // Pagination handlers for Personil Keluar
    function handleKeluarPaginationChange(event, value) {
        if (value >= 1 && value <= keluarTotalPages) {
            setKeluarCurrentPage(value);
            localStorage.setItem('daftar-tamu-keluar-pagination', value.toString());
        }
    }

    function handleKeluarPageInputChange(event) {
        const value = event.target.value;
        if (/^\d*$/.test(value)) {
            setKeluarPageInput(value);
        }
    }

    function handleKeluarGoToPage() {
        const pageNumber = parseInt(keluarPageInput, 10);
        if (pageNumber >= 1 && pageNumber <= keluarTotalPages) {
            setKeluarCurrentPage(pageNumber);
            localStorage.setItem('daftar-tamu-keluar-pagination', pageNumber.toString());
            setKeluarPageInput("");
        } else {
            setKeluarPageInput("");
        }
    }

    function handleKeluarPageInputKeyDown(event) {
        if (event.key === 'Enter') {
            handleKeluarGoToPage();
        }
    }

    return (
        <div>
            <div className={'bg-card wide-card'}>
                <h2 className={'wide-card-title'}>Personil Masuk</h2>
                {isLoading ? <LoadingAnimate /> : (
                    <>
                        <TableDaftarTamu header={daftarMasuk} body={masukTableData} type={'masuk'}/>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', marginTop: '20px'}}>
                            <Pagination
                                className="pagination"
                                size="medium"
                                count={masukTotalPages}
                                page={masukCurrentPage}
                                onChange={handleMasukPaginationChange}
                                showFirstButton={true}
                                showLastButton={true}
                                siblingCount={1}
                                boundaryCount={1}
                            />
                            <div className="goto-page" style={{marginRight: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <span>Go to page:</span>
                                <input
                                    type="text"
                                    value={masukPageInput}
                                    onChange={handleMasukPageInputChange}
                                    onKeyDown={handleMasukPageInputKeyDown}
                                    placeholder={`1-${masukTotalPages}`}
                                    style={{
                                        width: '60px',
                                        padding: '4px 8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        textAlign: 'center'
                                    }}
                                />
                                <button
                                    onClick={handleMasukGoToPage}
                                    disabled={!masukPageInput || masukTotalPages === 0}
                                    style={{
                                        padding: '4px 12px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        backgroundColor: '#f5f5f5',
                                        cursor: masukPageInput && masukTotalPages > 0 ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </>
                )}

                <h2 className={'wide-card-title'} style={{marginTop: '40px'}}>Personil Keluar</h2>
                {isLoading ? <LoadingAnimate /> : (
                    <>
                        <TableDaftarTamu header={daftarKeluar} body={keluarTableData} type={'keluar'}/>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', marginTop: '20px'}}>
                            <Pagination
                                className="pagination"
                                size="medium"
                                count={keluarTotalPages}
                                page={keluarCurrentPage}
                                onChange={handleKeluarPaginationChange}
                                showFirstButton={true}
                                showLastButton={true}
                                siblingCount={1}
                                boundaryCount={1}
                            />
                            <div className="goto-page" style={{marginRight: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <span>Go to page:</span>
                                <input
                                    type="text"
                                    value={keluarPageInput}
                                    onChange={handleKeluarPageInputChange}
                                    onKeyDown={handleKeluarPageInputKeyDown}
                                    placeholder={`1-${keluarTotalPages}`}
                                    style={{
                                        width: '60px',
                                        padding: '4px 8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        textAlign: 'center'
                                    }}
                                />
                                <button
                                    onClick={handleKeluarGoToPage}
                                    disabled={!keluarPageInput || keluarTotalPages === 0}
                                    style={{
                                        padding: '4px 12px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        backgroundColor: '#f5f5f5',
                                        cursor: keluarPageInput && keluarTotalPages > 0 ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
