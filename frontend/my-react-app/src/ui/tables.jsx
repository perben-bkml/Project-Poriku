import {useState, Fragment, useEffect, useMemo, useRef} from 'react';
// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableFooter from '@mui/material/TableFooter';
// Other Material UI
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { IconButton, TablePagination, Tooltip } from '@mui/material';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import CheckIcon from '@mui/icons-material/Check';
import Button from '@mui/material/Button';
// Components
import LoadingAnimate from './loading';

// SPM-Bend.jsx
export function TableSpmBendahara(props) {
    // State for pagination
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Pagination handlers
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <>
            <TableContainer sx={{ maxWidth: "94%", margin: "auto", marginTop:"20px", marginBottom:"20px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ backgroundColor: "#00449C" }}>
                            {props.tableData.length > 0 && props.tableData[0].map((col, colIndex) => (
                                <TableCell className="table-cell head-data" key={colIndex} sx={{fontWeight: 550, color:"white", border: "none"}} align="center">{col}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {props.tableData.length > 0 && props.tableData.slice(1)
                            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                            .map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <TableCell className="table-cell" key={cellIndex}>{cell}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                rowsPerPageOptions={[10, 25, 50]}
                component="div"
                count={props.tableData.length > 0 ? props.tableData.length - 1 : 0}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                sx={{ 
                    maxWidth: "94%", 
                    margin: "auto",
                    borderTop: '1px solid rgba(224, 224, 224, 1)',
                    '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                        margin: 0
                    }
                }}
            />
        </>
    )
}

//Kelola-Pengajuan.jsx & Aksi-Pengajuan.jsx
export function TableKelola(props) {
    //State
    const [tableType, setTableType] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [rowsPerPage, setRowsPerPage] = useState(10)
    const [sudahVerifSum, setSudahVerifSum] = useState("0");
    const [checkedItems, setCheckedItems] = useState(new Set());
    const mousePositionRef = useRef({ x: 0, y: 0 });
    const popupRef = useRef(null);
    const tableContainerRef = useRef(null);

    useEffect(() => {
        setTableType(props.type);
    }, [props.type])


    useEffect(() => {
        if (props.content && props.fullContent) {
            setIsLoading(false);
        }
    }, [props.content, props.fullContent]);

    // Reset checkboxes and sum when clicking outside the table for aksi-drpp
    useEffect(() => {
        if (tableType !== 'aksi-drpp' || checkedItems.size === 0) return;

        const handleClickOutside = (event) => {
            // Check if click is outside the table container
            if (tableContainerRef.current && !tableContainerRef.current.contains(event.target)) {
                // Reset checkboxes and sum
                setCheckedItems(new Set());
                setSudahVerifSum("0");
            }
        };

        // Add event listener
        document.addEventListener('mousedown', handleClickOutside);

        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [tableType, checkedItems.size]);

    if (isLoading) {
        return <LoadingAnimate />
    }


    if (!props.content || props.content.length === 0 || !props.fullContent || props.fullContent.length ===0) {
        return null
    }

    // Pagination handlers
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    function handleAksiClick(index) {
        if (props.type === "kelola") {
            props.changeComponent("aksi-pengajuan")
            props.aksiData(props.fullContent[index])
        } else if (props.type === "monitor") {
            props.changeComponent("aksi-drpp")
            props.aksiData(props.fullContent[index])
        } else {
            null
        }
    }

    //For footers
    const summableColumns = [4, 5, 6, 7, 9, 11, 13, 15, 17];
    function numberFormats(num) {
        if (!num) {
            return "";
        } else {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
        }
    }
    function getFooterSums() {
        const totals = Array(props.header.length).fill(""); // default empty strings

        props.content.forEach(row => {
            row.forEach((cell, index) => {
                if (summableColumns.includes(index)) {
                    const value = typeof cell === "string" ? parseInt(cell.replace(/\./g, '')) : parseInt(cell);
                    if (!isNaN(value)) {
                        totals[index] = (totals[index] || 0) + value;
                    }
                }
            });
        });

        return totals.map(value => typeof value === "number" ? numberFormats(value) : "");
    }
    //For copy button feature
    function CopyableTableCell({ children, showCheckbox, isChecked, onCheckboxChange, ...props }) {
        const [isHovered, setIsHovered] = useState(false);
        const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

        const copyToClipboard = async (text) => {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                }
                
                setShowCopiedTooltip(true);
                setTimeout(() => setShowCopiedTooltip(false), 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        };

        const handleCopyClick = (e) => {
            e.stopPropagation();
            const text = typeof children === 'string' ? children : 
                        typeof children === 'object' && children?.props?.children ? children.props.children : 
                        children?.toString() || '';
            copyToClipboard(text);
        };

        return (
            <TableCell
                {...props}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    ...props.sx,
                    ...(props.column < 2 && props.feature === "AksiDrpp" ? { position: "sticky", left: '0px', zIndex: 1000, backgroundColor: "white" } : { position: 'relative'}),
                    '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.02)'
                    }
                }}
            >
                {children}
                {showCheckbox && (isHovered || isChecked) && (
                    <Checkbox
                        checked={isChecked}
                        onChange={(e) => onCheckboxChange && onCheckboxChange(e.target.checked, e)}
                        size="small"
                        sx={{
                            position: 'absolute',
                            top: 2,
                            left: 2,
                            padding: '2px',
                            opacity: 0.8,
                            '&:hover': {
                                opacity: 1,
                                backgroundColor: 'rgba(0, 0, 0, 0.08)'
                            }
                        }}
                    />
                )}
                {isHovered && (
                    <Tooltip title={showCopiedTooltip ? "Copied!" : "Copy cell content"} arrow>
                        <IconButton
                            size="small"
                            onClick={handleCopyClick}
                            sx={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                padding: '2px',
                                opacity: 0.7,
                                '&:hover': {
                                    opacity: 1,
                                    backgroundColor: 'rgba(0, 0, 0, 0.08)'
                                }
                            }}
                        >
                            <ContentCopyIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </TableCell>
        );
    }
    // For monitoring DRPP
    function CustomColoredCell(props) {
        return(
            <p style={{margin: '0px', fontWeight: '700', height: "40px", width: "110px",
                borderRadius:"5%", display:"flex", justifyContent:"center", alignItems:"center",
                backgroundColor: props.color}}>{props.data}</p>
        )
    }

    // Mouse tracking for AksiDrpp popup (regular function to avoid hooks rule issues)
    function handleMouseMove(e) {
        if (props.feature === "AksiDrpp") {
            mousePositionRef.current = { x: e.clientX, y: e.clientY };
            
            // Update popup position directly via DOM manipulation
            if (popupRef.current) {
                popupRef.current.style.left = `${e.clientX + 15}px`;
                popupRef.current.style.top = `${e.clientY - 10}px`;
            }
        }
    }

    // For sudah verifikasi and aksi drpp checkbox sum calculation
    function handleCheckboxChange(rowIndex, columnIndex, cellData, isChecked, event) {
        // Capture scroll position before state changes
        const scrollTop = tableContainerRef.current?.scrollTop || 0;
        const scrollLeft = tableContainerRef.current?.scrollLeft || 0;
        
        // Prevent scroll for AksiDrpp
        if ((props.feature === "AksiDrpp" || props.feature === "SudahVerif" ) && event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const itemId = `${rowIndex}-${columnIndex}`; // rowIndex + column index
        const newCheckedItems = new Set(checkedItems);
        
        // Convert cellData to number
        const dataString = String(cellData || "");
        const cleanValue = dataString.replace(/\./g, "").replace(/[^0-9]/g, "");
        const valueNum = parseInt(cleanValue, 10);
        const finalValueNum = isNaN(valueNum) ? 0 : valueNum;
        
        const currentSum = parseInt(sudahVerifSum, 10);
        
        if (isChecked) {
            // Add to checked items and sum
            newCheckedItems.add(itemId);
            setSudahVerifSum((currentSum + finalValueNum).toString());
        } else {
            // Remove from checked items and subtract from sum
            newCheckedItems.delete(itemId);
            setSudahVerifSum((currentSum - finalValueNum).toString());
        }
        
        setCheckedItems(newCheckedItems);
        
        // Restore scroll position after state update
        requestAnimationFrame(() => {
            if (tableContainerRef.current) {
                tableContainerRef.current.scrollTop = scrollTop;
                tableContainerRef.current.scrollLeft = scrollLeft;
            }
        });
    }


    function Row(props) {
        //State
        const [isOpen, setIsOpen] = useState(false);
        const [clickCount, setClickCount] = useState(0);
        const [clickTimer, setClickTimer] = useState(null);
        const getCheckData = props.coloredRow?.[props.rowIndex] ?? [];

        // Handle multiple clicks (double and triple)
        const handleRowClick = () => {
            if (tableType !== 'aksi-drpp') return;

            const newCount = clickCount + 1;
            setClickCount(newCount);

            // Clear existing timer
            if (clickTimer) {
                clearTimeout(clickTimer);
            }

            // Set new timer to detect click pattern
            const timer = setTimeout(() => {
                if (newCount === 2) {
                    // Double click - set to red
                    props.addColorData(props.rowIndex, "colored");
                } else if (newCount >= 3) {
                    // Triple click - set to purple
                    props.addColorData(props.rowIndex, "color-purple");
                }
                setClickCount(0);
            }, 300); // 300ms window to detect multiple clicks

            setClickTimer(timer);
        };

        // Determine background color based on color status
        const getBackgroundColor = () => {
            if (tableType !== 'aksi-drpp') return 'inherit';
            if (getCheckData[0] === 'colored') return '#F3B5B5'; // Light red
            if (getCheckData[0] === 'color-purple') return '#FFA500'; // Light orange
            return 'inherit';
        };

        return (
            <Fragment>
                <TableRow onClick={handleRowClick}
                    sx={tableType === 'aksi-drpp' ? {backgroundColor: getBackgroundColor(), cursor: 'pointer'} : null}>
                    {tableType === "kelola" || tableType === "monitor"?
                    <TableCell sx={tableType === 'monitor' ? {borderBottom: '2px solid rgb(214, 214, 214)'} : null}>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                    </TableCell>
                    : null}
                    {props.rowData.map((data, index) => {
                        const itemId = `${props.rowIndex}-${index}`;
                        const shouldShowCheckbox = props.feature === "SudahVerif" && index === 4
                            || props.feature === "AksiDrpp" && (index === 7 || index === 9 || index === 11 || index === 13 || index === 15);
                        const isItemChecked = checkedItems.has(itemId);
                        
                        return (
                        <CopyableTableCell key={index} className={tableType === "kelola" || tableType === "monitor"? null : "table-cell" }
                                   column={index}
                                   feature={props.feature}
                                   showCheckbox={shouldShowCheckbox}
                                   isChecked={isItemChecked}
                                   onCheckboxChange={shouldShowCheckbox ? (checked, event) => handleCheckboxChange(props.rowIndex, index, data, checked, event) : null}
                                   sx={tableType === 'monitor' ? {borderBottom: '2px solid rgb(214, 214, 214)'}
                                       : (index === 1 || index === 19 ? {maxWidth: '100px', whiteSpace: 'normal', wordWrap: 'break-word', borderBottom: '2px solid rgb(214, 214, 214)'} : {borderBottom: '2px solid rgb(214, 214, 214)'})} >
                            {tableType === 'monitor' && (index === 0 || index === 4 || index === 5 || index === 7 || index === 8) ?
                                (data === "Sudah" && index === 7 || data === "Sudah" && index === 8 ? <CustomColoredCell color={"#92eb7f"} data={data} /> :
                                    (data === "Belum" && index === 7 || data === "Belum" && index === 8 ? <CustomColoredCell color={"#f27272"} data={data} /> :
                                        (data === "Ada Masalah" && index === 7 || data === "Ada Masalah" && index === 8 ? <CustomColoredCell color={"#eb3d3d"} data={data} /> :
                                            (data === "Tidak Ada Pajak" && index === 7 || data === "Tidak Ada Pajak" && index === 8 ? <CustomColoredCell color={"white"} data={data} /> :
                                                (data === "Pajak Manual" && index === 7 || data === "Pajak Manual" && index === 8 ? <CustomColoredCell color={"#b39979"} data={data} /> :
                                         <p style={{margin: '0px', fontWeight: '700'}}>{data}</p>)))))
                                : data}
                        </CopyableTableCell>
                        );
                    })}
                </TableRow>

                <TableRow>
                    <TableCell sx ={{ paddingBottom: 0, paddingTop: 0, border: "none" }} colSpan={tableType === "kelola" || tableType === "monitor"?  props.rowData[0].length + 2 : 20}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <div className="collapsible">
                                <button className="btn-aksi" onClick={() => handleAksiClick(props.rowIndex)}>Lihat</button>
                            </div>
                        </Collapse>
                    </TableCell>
                </TableRow>
            </Fragment>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
        <TableContainer 
            ref={tableContainerRef}
            sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)", maxHeight: 900, overflowX: 'auto' }}
            onMouseMove={handleMouseMove}>
            <Table stickyHeader aria-label="sticky table" sx={{ transform: "translateZ(0)"}}>
                <TableHead>
                    <TableRow sx={{backgroundColor: "#00449C"}}>
                    {tableType === "kelola" || tableType === "monitor"?  <TableCell sx={{width: "30px", backgroundColor: "#00449C"}}></TableCell> : null}
                    {props.header.map((data, index) => (
                        <TableCell key={index} sx={{
                            ...( tableType === "kelola" || tableType === "monitor"?
                            { fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}
                            :
                            { fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C", minWidth: data.minWidth}),
                            ...( index < 2 && props.feature === "AksiDrpp" && { position: "sticky", left: '0px', zIndex: 1100, backgroundColor: "#00449C" } )

                            }}>
                            {tableType === "kelola" || tableType === "monitor"?  data : data.label}</TableCell>
                    ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.content
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((row, index) => (
                            <Row 
                                key={index} 
                                rowData={row} 
                                rowIndex={page * rowsPerPage + index} 
                                coloredRow={props.coloredRow} 
                                addColorData={props.addColorData}
                                feature={props.feature}
                            />
                    ))}
                </TableBody>
                { props.type === "aksi" &&
                <TableFooter>
                    <TableRow>
                        {getFooterSums().map((value, colIndex) => (
                            <TableCell key={colIndex} className="table-footer-cell" sx={{ fontWeight: "bold", backgroundColor: "#f5f5f5" }}>
                                {value}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableFooter>
                }
                { props.feature === "SudahVerif" &&
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={props.header ? props.header.length : 1}>
                            <strong>Total yang dipilih: {numberFormats(sudahVerifSum)}</strong>
                        </TableCell>
                    </TableRow>
                </TableFooter>
                }
            </Table>
            {props.type !== "monitor" &&
            <TablePagination
                rowsPerPageOptions={[5, 10, 25]}
                component="div"
                count={props.content.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                sx={{ 
                    borderTop: '1px solid rgba(224, 224, 224, 1)',
                    '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                        margin: 0
                    }
                }}
            />
            }
        </TableContainer>
        
        {/* Floating popup for AksiDrpp sum display */}
        {props.feature === "AksiDrpp" && checkedItems.size > 0 && (
            <div
                ref={popupRef}
                style={{
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap'
                }}
            >
                Total: {numberFormats(sudahVerifSum)}
            </div>
        )}
        </div>
    )
}

export function TableInfoAntri(props) {
    return(
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{width: "30px", backgroundColor: "#00449C"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index}
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}}
                                >{data}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    <TableRow>
                        {props.body.map((data, index) => (
                            <TableCell key={index}>{data}</TableCell>
                        ))}
                    </TableRow>
                </TableBody>
            </Table>
        </TableContainer>
    )
}

// Monitor Data Gaji - last column renders as a Drive link instead of raw text
export function TableDokumenGaji(props) {
    return(
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{width: "30px", backgroundColor: "#00449C"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index}
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}}
                                >{data}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.content.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={props.header.length} align="center" sx={{color: "#666"}}>
                                Tidak ada data.
                            </TableCell>
                        </TableRow>
                    ) : (
                        props.content.map((row, index) => (
                            <TableRow key={index} hover>
                                {row.slice(0, 7).map((cell, cellIndex) => (
                                    <TableCell key={cellIndex}>{cell}</TableCell>
                                ))}
                                <TableCell>
                                    {row[7] ? (
                                        <a href={row[7]} target="_blank" rel="noopener noreferrer">Lihat Berkas</a>
                                    ) : "-"}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export function TableInfoPJK(props) {
    return(
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{width: "30px", backgroundColor: "#00449C"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index}
                                       sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}}
                            >{data}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                {props.body.map((row, index) => (
                    <TableRow key={index}>
                        {row.map((data, index) => (
                            <TableCell key={index}>
                                {index === 9 ? <a href={data} target="_blank" rel="noopener noreferrer">{ data !== "" ? 'Klik untuk lihat' : ""}</a>
                                    : data}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </TableContainer>
    )

}

export function TableNotif(props) {
    return(
        <TableContainer sx={{border: '1px solid #e0e0e0', boxShadow: 'none'}}>
            <Table sx={{'& th, & td': { borderBottom: 'none' }}}>

                <TableBody>
                    {props.content.map((data, index) => (
                        <Fragment key={index}>
                            <TableRow sx={{ borderTop: index === 0 ? 'none' : '1px solid #e0e0e0', boxShadow: 'none'}}>
                                <TableCell sx={{padding: '12px 16px 4px 16px', fontWeight: 'bold', fontSize: "15px", color: data[3] === 'no' ? 'black' : '#939090'}}>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{data[1]}</span>
                                        {data[3] === 'no' && (
                                            <Button
                                                size="small"
                                                startIcon={<CheckIcon />}
                                                onClick={() => props.onMarkAsRead(data[0])}
                                                sx={{
                                                    textTransform: 'none',
                                                    fontSize: '10px',
                                                    padding: '1px 6px',
                                                    minWidth: 0,
                                                    lineHeight: 1.4,
                                                    flexShrink: 0, // keep the label on one line next to a long title
                                                    '& .MuiButton-startIcon': {
                                                        marginLeft: 0,
                                                        marginRight: '3px',
                                                        '& > *:first-of-type': { fontSize: '13px' },
                                                    },
                                                }}
                                            >
                                                Tandai sudah dibaca
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                {/* pre-line keeps the "Keterangan:" line break stored in the sheet */}
                                <TableCell sx={{padding: '0px 16px 12px 16px', color: '#666', whiteSpace: 'pre-line'}}>{data[2]}</TableCell>
                            </TableRow>
                        </Fragment>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}
// Realisasi.jsx
const REALISASI_HEADER_BLUE = "#00449C";
const realisasiHeadCell = {fontSize: "1rem", fontWeight: 550, color: "white", backgroundColor: REALISASI_HEADER_BLUE};
const realisasiContainer = {maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"};

function formatRupiah(nominal) {
    return `Rp ${Math.round(nominal).toLocaleString('id-ID')}`;
}

// Thousand separators for display only - state and the PATCH body stay plain digits
function formatThousands(digits) {
    if (digits === "" || digits === undefined || digits === null) return "";
    return (parseInt(digits, 10) || 0).toLocaleString('id-ID');
}

function RealisasiHead({heads}) {
    return (
        <TableHead>
            <TableRow>
                {heads.map((head, index) => (
                    <TableCell key={index} sx={realisasiHeadCell}>{head}</TableCell>
                ))}
            </TableRow>
        </TableHead>
    )
}

export function TableAnggaran({funds, budgets, draftBudget, rowStatus, onDraftChange, onSave}) {
    return (
        <TableContainer sx={realisasiContainer}>
            <Table size="small">
                <RealisasiHead heads={["Unit Kerja", ...funds.map(fund => fund.label), "Total Anggaran", ""]}/>
                <TableBody>
                    {budgets.map(budget => {
                        const draft = draftBudget[budget.satker] || {};
                        const values = funds.map(({key}) => draft[key] ?? budget[key]);
                        const isDirty = funds.some(({key}) => draft[key] !== undefined);
                        const total = values.reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
                        const status = rowStatus[budget.satker];
                        const isRowSaving = status === "saving";
                        return (
                            <TableRow key={budget.satker} hover>
                                <TableCell>{budget.satker}</TableCell>
                                {funds.map(({key}, fundIndex) => (
                                    <TableCell key={key}>
                                        <input type="text" inputMode="numeric" value={formatThousands(values[fundIndex])}
                                               style={{width: '150px', fontFamily: 'inherit', fontSize: '0.95rem', padding: '4px'}}
                                               onChange={event => onDraftChange(budget.satker, key, event.target.value)}/>
                                    </TableCell>
                                ))}
                                <TableCell>{formatRupiah(total)}</TableCell>
                                <TableCell>
                                    <input className="btn-aksi" type="button" value={isRowSaving ? "Menyimpan..." : "Simpan"}
                                           disabled={!isDirty || isRowSaving}
                                           onClick={() => onSave(budget)}
                                           style={{cursor: isDirty && !isRowSaving ? 'pointer' : 'not-allowed', opacity: isDirty ? 1 : 0.5}}/>
                                    {status === "saved" &&
                                        <span style={{color: '#1B7F3B', fontSize: '0.85rem', marginLeft: '8px'}}>Tersimpan</span>}
                                    {status === "error" &&
                                        <span style={{color: '#BD1404', fontSize: '0.85rem', marginLeft: '8px'}}>Gagal</span>}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export function TableRealisasi({rows, grandTotal}) {
    return (
        <TableContainer sx={realisasiContainer}>
            <Table size="small">
                <RealisasiHead heads={["Unit Kerja", "Anggaran", "Realisasi", "Sisa", "% Realisasi", "Grafik"]}/>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.satker} hover>
                            <TableCell>
                                {row.satker}
                                {!row.matched &&
                                    <span style={{color: '#BD1404', fontSize: '0.8rem', display: 'block'}}>
                                        belum ada di Code_Anggaran
                                    </span>}
                            </TableCell>
                            <TableCell>{formatRupiah(row.anggaran)}</TableCell>
                            <TableCell>{formatRupiah(row.belanja)}</TableCell>
                            <TableCell style={{color: row.realisasi < 0 ? '#BD1404' : 'inherit'}}>
                                {formatRupiah(row.realisasi)}
                            </TableCell>
                            <TableCell>{row.persen}</TableCell>
                            <TableCell sx={{minWidth: '160px'}}>
                                <div style={{background: '#ECECEC', borderRadius: '6px', height: '14px', width: '100%'}}>
                                    <div style={{
                                        width: `${row.barWidth}%`,
                                        height: '100%',
                                        borderRadius: '6px',
                                        backgroundColor: row.overspent ? '#BD1404' : REALISASI_HEADER_BLUE,
                                    }}/>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    <TableRow>
                        <TableCell sx={{fontWeight: 600}}>TOTAL</TableCell>
                        <TableCell sx={{fontWeight: 600}}>{formatRupiah(grandTotal.anggaran)}</TableCell>
                        <TableCell sx={{fontWeight: 600}}>{formatRupiah(grandTotal.belanja)}</TableCell>
                        <TableCell sx={{fontWeight: 600, color: grandTotal.realisasi < 0 ? '#BD1404' : 'inherit'}}>
                            {formatRupiah(grandTotal.realisasi)}
                        </TableCell>
                        <TableCell sx={{fontWeight: 600}}>{grandTotal.persen}</TableCell>
                        <TableCell/>
                    </TableRow>
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export function TableRealisasiJenisBelanja({jenisBelanja, rows, totals}) {
    return (
        <TableContainer sx={realisasiContainer}>
            <Table size="small">
                <RealisasiHead heads={["Unit Kerja", ...jenisBelanja.map(jenis => `Belanja ${jenis}`), "Total"]}/>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.satker} hover>
                            <TableCell>{row.satker}</TableCell>
                            {row.values.map((nominal, index) => (
                                <TableCell key={index}>{formatRupiah(nominal)}</TableCell>
                            ))}
                            <TableCell>{formatRupiah(row.total)}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow>
                        <TableCell sx={{fontWeight: 600}}>TOTAL</TableCell>
                        {totals.values.map((nominal, index) => (
                            <TableCell key={index} sx={{fontWeight: 600}}>{formatRupiah(nominal)}</TableCell>
                        ))}
                        <TableCell sx={{fontWeight: 600}}>{formatRupiah(totals.total)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </TableContainer>
    )
}
