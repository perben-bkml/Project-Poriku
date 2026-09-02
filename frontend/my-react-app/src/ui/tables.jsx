import {useState, Fragment, useEffect, useRef, memo} from 'react';
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
import { CircularProgress, IconButton, Pagination, TablePagination, Tooltip } from '@mui/material';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Button from '@mui/material/Button';
// Components
import LoadingAnimate from './loading';
import { sorotPotongan, daftarStatusStyle, isStatusLabel, HEAD_CELL, BODY_CELL, kolomGaya, dash, rowsPerPageOptions, formatNomorSpp, sbmTiketHeadData, sbmHotelHeadData, sbmGolonganHotel, sbmUangHarianHeadData, sbmTransportasiHeadData, sbmJenisUangHarian, kkpTransaksiHeadData, layananGajiDetailFields, layananGajiStatusStyle, layananGajiEmailStyle, layananGajiEmailGagal } from '../components/bendahara/head-data.js';
import { anggaranSebabLabel, anggaranTandaMak, tandaMakPesan } from '../components/verifikasi/head-data.js';

// dash() stringifies, so it must never reach a cell whose content is already a node -
// Pengujian-PJK puts an <a> in Dok. Verifikasi and it would render as [object Object]
const dashCell = (value) => value !== null && typeof value === "object" ? value : dash(value);
import PropTypes from 'prop-types';

const headLabel = (head) => typeof head === "string" ? head : head?.label ?? "";

const BUKTI_SETOR_STYLE = {
    "Sudah Diunggah": { color: "#9FFFC3", textcolor: "#0F9043" },
    "Belum Diunggah": { color: "#C7B6A7", textcolor: "#5E4C3B" },
    "Tidak Perlu": { color: "#E4E9F0", textcolor: "#5A6472" },
};

// SPM-Bend.jsx
// Cells are plain strings except Bukti Bayar, which arrives as {nama, url}
const spmCell = (cell) => {
    if (!cell || typeof cell !== "object") return cell;
    if (!cell.nama) return "";
    return cell.url
        ? <a href={cell.url} target="_blank" rel="noopener noreferrer">{cell.nama}</a>
        : cell.nama;
};

export function TableSpmBendahara(props) {
    // State for pagination
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(rowsPerPageOptions[0]);

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const head = props.tableData[0] || [];
    const body = props.tableData.slice(1);
    const jumlahHalaman = Math.ceil(body.length / rowsPerPage) || 1;
    // Rows can drop away between searches while page still points past the end
    const halaman = Math.min(page, jumlahHalaman - 1);

    return (
        <div className="dp-table-card">
            <div className="dp-toolbar">
                <span className="dp-toolbar-info">Halaman {halaman + 1} dari {jumlahHalaman}</span>
                <label className="dp-perpage">
                    Baris per halaman
                    <select value={rowsPerPage} onChange={handleChangeRowsPerPage}>
                        {rowsPerPageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
            </div>
            <TableContainer className="dp-scroll">
                <Table>
                    <TableHead>
                        <TableRow>
                            {head.map((col, colIndex) => (
                                <TableCell key={colIndex} sx={{...HEAD_CELL,
                                    ...(kolomGaya(col)?.textAlign ? {textAlign: "right"} : null)}}>{col}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {body
                            .slice(halaman * rowsPerPage, halaman * rowsPerPage + rowsPerPage)
                            .map((row, rowIndex) => (
                                <TableRow key={rowIndex} sx={{'&:hover td': {backgroundColor: '#F7FAFF'}}}>
                                    {row.map((cell, cellIndex) => (
                                        <TableCell key={cellIndex}
                                                   sx={{...BODY_CELL, ...kolomGaya(head[cellIndex])}}>
                                            {isStatusLabel(head[cellIndex]) && String(cell ?? "").trim()
                                                ? <span className="dp-status" style={{
                                                    backgroundColor: daftarStatusStyle(cell).bg,
                                                    color: daftarStatusStyle(cell).fg }}>{cell}</span>
                                                : dashCell(spmCell(cell))}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {jumlahHalaman > 1 &&
                <Pagination className="dp-pagination" size="medium" count={jumlahHalaman} page={halaman + 1}
                            onChange={(event, value) => setPage(value - 1)} />}
        </div>
    )
}

//Kelola-Pengajuan.jsx & Aksi-Pengajuan.jsx
export function TableKelola(props) {
    //State
    const [tableType, setTableType] = useState("")
    const [page, setPage] = useState(0)
    const [rowsPerPage, setRowsPerPage] = useState(10)
    const [sudahVerifSum, setSudahVerifSum] = useState("0");
    const [checkedItems, setCheckedItems] = useState(new Set());
    const mousePositionRef = useRef({ x: 0, y: 0 });
    const popupRef = useRef(null);
    const tableContainerRef = useRef(null);
    // Which sorot has already been scrolled to, so re-renders do not keep yanking the view
    const sorotTerpakaiRef = useRef(null);

    useEffect(() => {
        setTableType(props.type);
    }, [props.type])

    useEffect(() => {
        setPage(0);
    }, [props.filterActive])


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

    const hasPajak = (row) => (props.filterColumns || [])
        .some(column => {
            const value = String(row[column] ?? "").trim();
            return value !== "" && value.replace(/[.\s]/g, "") !== "0";
        });
    // Computed above the early returns below so the sorot effect stays unconditional
    const visibleRows = (props.content || [])
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !props.filterActive || hasPajak(row));

    // Computed out here because Row's own props shadow the table's. Kelola and monitor are
    // both the layouts with an expand column and the two that carry the Daftar Pengajuan
    // look; the aksi tables keep the original one. tableType rather than props.type because
    // Row reads the state one, and a first render mismatch would put the toggle column in
    // the header but not the body.
    const gayaDaftar = tableType === "kelola" || tableType === "monitor";
    const headLabels = (props.header || []).map(headLabel);
    const kolomStatus = new Set(headLabels
        .map((label, index) => isStatusLabel(label) ? index : -1)
        .filter(index => index >= 0));

    // Located by label, because the Kode MAK column sits at a different index on the full
    // GUP table and the cropped verifikasi one. Inert on every screen that passes no tandaMak.
    const tandaMak = props.tandaMak || {};
    const kolomMak = props.tandaMak
        ? headLabels.findIndex(label => String(label ?? "").trim().toLowerCase() === "kode mak")
        : -1;

    // Inert without a sorot prop, so the six other screens using this table are untouched
    const sorot = props.sorot;
    const potongCell = (data, column) => sorot && sorot.columns.includes(column)
        ? sorotPotongan(data, sorot.term, sorot.mode)
        : null;
    const barisSorot = (row) => !!sorot && sorot.columns.some(column => potongCell(row[column], column));
    // Position within visibleRows, not the original index: the pajak filter may have
    // dropped rows above it, and pagination slices the filtered list
    const posisiSorotPertama = sorot ? visibleRows.findIndex(({ row }) => barisSorot(row)) : -1;
    const indexSorotPertama = posisiSorotPertama >= 0 ? visibleRows[posisiSorotPertama].index : -1;
    const sorotKunci = sorot ? `${sorot.mode}|${sorot.term}` : null;

    // Open on the page holding the first match, or it sits invisible behind the pager.
    // Keyed on the search alone so changing rows-per-page later does not yank the page back.
    useEffect(() => {
        if (posisiSorotPertama >= 0) setPage(Math.floor(posisiSorotPertama / rowsPerPage));
    }, [sorotKunci]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fires once per search: the marked cell may be far right in a table that scrolls
    // sideways. block:'nearest' keeps the page from jumping vertically to reach it.
    const sorotRef = (node) => {
        if (!node || sorotTerpakaiRef.current === sorotKunci) return;
        sorotTerpakaiRef.current = sorotKunci;
        node.scrollIntoView({ block: 'nearest', inline: 'center' });
    };

    // Only the caller knows whether an empty content means "still fetching" or "nothing to show"
    if (props.loading) {
        return <LoadingAnimate />
    }

    if (!props.content || props.content.length === 0 || !props.fullContent || props.fullContent.length ===0) {
        return null
    }

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };


    // Read here rather than inside Row, whose own props shadow these
    const aksiLabel = props.aksiLabel || "Lihat";

    function handleAksiClick(index) {
        const target = props.aksiTarget
            || (props.type === "kelola" ? "aksi-pengajuan" : props.type === "monitor" ? "aksi-drpp" : null);
        if (!target) return;
        props.changeComponent(target)
        props.aksiData(props.fullContent[index])
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
    function CopyableTableCell({ children, showCheckbox, isChecked, onCheckboxChange, copyText, ...props }) {
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
            // copyText wins when given: a highlighted cell wraps its text in several
            // nodes, and deriving from children would paste them comma-joined
            const text = copyText !== undefined ? String(copyText ?? "")
                : typeof children === 'string' ? children
                : typeof children === 'object' && children?.props?.children ? children.props.children
                : children?.toString() || '';
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
                textAlign: "center", backgroundColor: props.color, color: props.textcolor}}>{props.data}</p>
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
                    sx={tableType === 'aksi-drpp'
                        ? {backgroundColor: getBackgroundColor(), cursor: 'pointer'}
                        : gayaDaftar ? {'&:hover td': {backgroundColor: '#F7FAFF'}} : null}>
                    {tableType === "kelola" || tableType === "monitor"?
                    <TableCell sx={{ ...BODY_CELL, width: "44px", paddingRight: 0 }}>
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
                        
                        const potongan = potongCell(data, index);
                        const tanda = index === kolomMak ? tandaMak[String(data ?? "").trim()] : null;
                        const gayaTanda = tanda && anggaranTandaMak[tanda.sebab];
                        // Only the first marked cell of the first matching row is scrolled to
                        const isSorotPertama = potongan && props.rowIndex === indexSorotPertama
                            && index === sorot.columns.find(column => potongCell(props.rowData[column], column) !== null);

                        return (
                        <CopyableTableCell key={index} className={tableType === "kelola" || tableType === "monitor"? null : "table-cell" }
                                   column={index}
                                   feature={props.feature}
                                   copyText={potongan ? data : undefined}
                                   showCheckbox={shouldShowCheckbox}
                                   isChecked={isItemChecked}
                                   onCheckboxChange={shouldShowCheckbox ? (checked, event) => handleCheckboxChange(props.rowIndex, index, data, checked, event) : null}
                                   sx={{ ...(gayaDaftar
                                           ? { ...BODY_CELL, ...kolomGaya(headLabels[index]) }
                                           : { borderBottom: '2px solid rgb(214, 214, 214)' }),
                                       ...(tableType !== 'monitor' && (index === 1 || index === 19)
                                       ? { maxWidth: '100px', whiteSpace: 'normal', wordWrap: 'break-word' } : null) }} >
                            {gayaTanda ?
                                <span className="mak-tanda" title={tandaMakPesan(tanda)}
                                      style={{backgroundColor: gayaTanda.bg, color: gayaTanda.fg}}>
                                    {data}
                                    <span className="mak-tanda-label">{gayaTanda.label}</span>
                                </span> :
                            tableType === 'monitor' && BUKTI_SETOR_STYLE[data] ?
                                <CustomColoredCell {...BUKTI_SETOR_STYLE[data]} data={data} /> :
                            tableType === 'monitor' && (index === 4 || index === 5 || index === 8 || index === 9) ?
                                (data === "Sudah" && index === 8 || data === "Sudah" && index === 9 ? <CustomColoredCell color={"#92eb7f"} data={data} /> :
                                    (data === "Belum" && index === 8 || data === "Belum" && index === 9 ? <CustomColoredCell color={"#f27272"} data={data} /> :
                                        (data === "Ada Masalah" && index === 8 || data === "Ada Masalah" && index === 9 ? <CustomColoredCell color={"#eb3d3d"} data={data} /> :
                                            (data === "Tidak Ada Pajak" && index === 8 || data === "Tidak Ada Pajak" && index === 9 ? <CustomColoredCell color={"white"} data={data} /> :
                                                (data === "Pajak Manual" && index === 8 || data === "Pajak Manual" && index === 9 ? <CustomColoredCell color={"#b39979"} data={data} /> :
                                         <p style={{margin: '0px', fontWeight: '700'}}>{data}</p>)))))
                                : potongan
                                ? <>{potongan[0]}<mark className="sorot" ref={isSorotPertama ? sorotRef : null}>{potongan[1]}</mark>{potongan[2]}</>
                                : !gayaDaftar
                                ? data
                                : index === 0 && String(data ?? "").trim()
                                ? <span className="dp-id">{data}</span>
                                : kolomStatus.has(index) && String(data ?? "").trim()
                                ? <span className="dp-status" style={{
                                    backgroundColor: daftarStatusStyle(data).bg,
                                    color: daftarStatusStyle(data).fg }}>{data}</span>
                                : dashCell(data)}
                        </CopyableTableCell>
                        );
                    })}
                </TableRow>

                <TableRow>
                    <TableCell sx ={{ paddingBottom: 0, paddingTop: 0, border: "none" }} colSpan={tableType === "kelola" || tableType === "monitor"?  props.rowData[0].length + 2 : 20}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <div className="collapsible">
                                <button className="btn-aksi" onClick={() => handleAksiClick(props.rowIndex)}>{aksiLabel}</button>
                            </div>
                        </Collapse>
                    </TableCell>
                </TableRow>
            </Fragment>
        )
    }

    // The daftar puts rows-per-halaman in a toolbar above the table and the pager below it,
    // so the two tables read the same way. The aksi tables keep the MUI pagination bar they
    // always had. Monitoring DRPP paginates on the server, so it drives the same controls
    // through props instead: pass totalPages and the table stops slicing and asks the screen.
    const terkontrol = typeof props.totalPages === "number";
    const berhalaman = gayaDaftar && (terkontrol || props.type !== "monitor");
    const jumlahHalaman = terkontrol
        ? Math.max(props.totalPages, 1)
        : Math.ceil(visibleRows.length / rowsPerPage) || 1;
    // Rows can drop away under a filter while page still points past the end
    const halaman = terkontrol ? props.page - 1 : Math.min(page, jumlahHalaman - 1);
    const barisPerHalaman = terkontrol ? props.rowsPerPage : rowsPerPage;
    const ubahBaris = terkontrol ? props.onRowsPerPageChange : handleChangeRowsPerPage;
    const ubahHalaman = terkontrol
        ? (event, value) => props.onPageChange(value)
        : (event, value) => setPage(value - 1);

    return (
        <div style={{ position: 'relative' }} className={gayaDaftar ? "dp-table-card" : undefined}>
        {berhalaman &&
        <div className="dp-toolbar">
            <span className="dp-toolbar-info">Halaman {halaman + 1} dari {jumlahHalaman}</span>
            <label className="dp-perpage">
                Baris per halaman
                <select value={barisPerHalaman} onChange={ubahBaris}>
                    {rowsPerPageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
            </label>
        </div>}
        <TableContainer 
            ref={tableContainerRef}
            sx={gayaDaftar
                ? { maxHeight: 900, overflowX: 'auto' }
                : { maxWidth: "96%", margin: "auto", borderRadius: "10px",
                    border: "0.8px solid rgb(236, 236, 236)", maxHeight: 900, overflowX: 'auto' }}
            onMouseMove={handleMouseMove}>
            <Table stickyHeader aria-label="sticky table" sx={{ transform: "translateZ(0)"}}>
                <TableHead>
                    <TableRow sx={gayaDaftar ? null : {backgroundColor: "#00449C"}}>
                    {gayaDaftar ? <TableCell sx={{...HEAD_CELL, width: "30px"}}></TableCell> : null}
                    {props.header.map((data, index) => (
                        <TableCell key={index} sx={{
                            ...(gayaDaftar
                                ? { ...HEAD_CELL,
                                    ...(kolomGaya(headLabels[index])?.textAlign ? { textAlign: "right" } : null) }
                                : { fontSize: "1rem", fontWeight: 550, color: "white",
                                    backgroundColor: "#00449C", minWidth: data.minWidth }),
                            ...( index < 2 && props.feature === "AksiDrpp" && { position: "sticky", left: '0px', zIndex: 1100, backgroundColor: gayaDaftar ? "#F4F7FB" : "#00449C" } )
                            }}>
                            {headLabel(data)}</TableCell>
                    ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(terkontrol
                        ? visibleRows
                        : visibleRows.slice(halaman * rowsPerPage, halaman * rowsPerPage + rowsPerPage))
                        .map(({ row, index }) => (
                            <Row
                                key={index}
                                rowData={row}
                                rowIndex={index}
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
                        <TableCell colSpan={props.header ? props.header.length : 1}
                                   sx={{ ...BODY_CELL, backgroundColor: "#F4F7FB" }}>
                            <strong>Total yang dipilih: {numberFormats(sudahVerifSum)}</strong>
                        </TableCell>
                    </TableRow>
                </TableFooter>
                }
            </Table>
            {!gayaDaftar &&
            <TablePagination
                rowsPerPageOptions={[5, 10, 25]}
                component="div"
                count={visibleRows.length}
                rowsPerPage={rowsPerPage}
                page={halaman}
                onPageChange={(event, newPage) => setPage(newPage)}
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
        {berhalaman && jumlahHalaman > 1 &&
            <Pagination className="dp-pagination" size="medium" count={jumlahHalaman} page={halaman + 1}
                        onChange={ubahHalaman} />}
        
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

TableKelola.propTypes = {
    type: PropTypes.string,
    tandaMak: PropTypes.object,
    header: PropTypes.array,
    content: PropTypes.array,
    fullContent: PropTypes.array,
    loading: PropTypes.bool,
    feature: PropTypes.string,
    aksiLabel: PropTypes.string,
    aksiTarget: PropTypes.string,
    changeComponent: PropTypes.func,
    aksiData: PropTypes.func,
    coloredRow: PropTypes.object,
    addColorData: PropTypes.func,
    filterActive: PropTypes.bool,
    filterColumns: PropTypes.arrayOf(PropTypes.number),
    // Server side pagination, used by Monitoring DRPP. Passing totalPages switches the
    // table from slicing its own rows to rendering the page the screen handed it.
    page: PropTypes.number,
    totalPages: PropTypes.number,
    rowsPerPage: PropTypes.number,
    onPageChange: PropTypes.func,
    onRowsPerPageChange: PropTypes.func,
    // The active Cari term and the columns it may appear in; absent on every other screen
    sorot: PropTypes.shape({
        term: PropTypes.string.isRequired,
        mode: PropTypes.oneOf(["teks", "persis", "angka"]).isRequired,
        columns: PropTypes.arrayOf(PropTypes.number).isRequired,
    }),
};

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

TableInfoAntri.propTypes = {
    header: PropTypes.array.isRequired,
    body: PropTypes.array.isRequired,
};

// Monitor Data Gaji - last column renders as a Drive link instead of raw text
export function TableDokumenGaji(props) {
    // Without the handlers the table stays read-only and drops the Aksi column, which is
    // how the roles that may only look at the monitor get rendered
    const showActions = Boolean(props.onEdit || props.onDelete);

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
                        {showActions &&
                            <TableCell align="center"
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}}
                                >Aksi</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.content.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={props.header.length + (showActions ? 1 : 0)} align="center" sx={{color: "#666"}}>
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
                                {showActions &&
                                    <TableCell align="center" sx={{whiteSpace: "nowrap"}}>
                                        {props.onEdit &&
                                            <Tooltip title="Ubah">
                                                <IconButton size="small" onClick={() => props.onEdit(row)}>
                                                    <EditIcon sx={{fontSize: 24, color: "#edbd4d"}}/>
                                                </IconButton>
                                            </Tooltip>}
                                        {props.onDelete &&
                                            <Tooltip title="Hapus">
                                                <IconButton size="small" onClick={() => props.onDelete(row)}>
                                                    <DeleteForeverIcon sx={{fontSize: 24, color: "#BD1404"}}/>
                                                </IconButton>
                                            </Tooltip>}
                                    </TableCell>}
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

// Home.jsx - lite realisasi dashboard
export function TableRealisasiLite({anggaran, belanja, sisa, persen}) {
    const baris = [
        {label: "Anggaran", value: formatRupiah(anggaran)},
        {label: "Belanja", value: formatRupiah(belanja)},
        {label: "Sisa", value: formatRupiah(sisa), warn: sisa < 0},
        {label: "% Realisasi", value: persen, bold: true},
    ];

    return (
        <TableContainer sx={{maxWidth: "100%", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table size="small">
                <TableBody>
                    {baris.map(row => (
                        <TableRow key={row.label} hover>
                            <TableCell sx={{
                                fontSize: "1.05rem",
                                fontWeight: 550,
                                color: REALISASI_HEADER_BLUE,
                                width: "40%",
                                // Back to the MUI small default on laptop screens
                                "@media (max-width: 1600px)": {fontSize: "0.875rem"},
                            }}>
                                {row.label}
                            </TableCell>
                            <TableCell align="right"
                                       sx={{
                                           fontSize: row.bold ? "1.2rem" : "1.05rem",
                                           color: row.warn ? "#BD1404" : "inherit",
                                           fontWeight: row.bold ? 700 : "inherit",
                                           "@media (max-width: 1600px)": {fontSize: "0.875rem"},
                                       }}>
                                {row.value}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

// Pembayaran-Bp.jsx. Without onEdit the table drops the Aksi column, as TableDokumenGaji
// does for roles that may only look.
export function TablePembayaranBp(props) {
    const showActions = Boolean(props.onEdit || props.onDelete);
    // Column order, matching pembayaranBpHeadData and PEMBAYARAN_BP_COLUMNS on the server
    const keys = ["no", "tanggalSp2d", "nomorSpm", "jenis", "va", "unitKerja", "nilaiSp2d",
        "kodeBniDirect", "buktiBayar", "statusBayarPenerima", "tanggalBayarPenerima",
        "keterangan", "statusPajak", "tanggalTrxPajak", "buktiBayarDepositPajak"];
    const linkKeys = new Set(["buktiBayar", "buktiBayarDepositPajak"]);
    // First three columns are frozen; widths and offsets live in .bp-freeze-*
    const freeze = (index) => index < 3 ? `bp-freeze bp-freeze-${index + 1}` : undefined;

    // Attachment columns hold {nama, url}. Some cells are typed by hand ("WITHDRAWAL")
    // and have no url, so the name still renders, just without a dead link.
    function renderCell(row, key) {
        // Free text, so it is capped and hovered rather than left to widen the table
        if (key === "keterangan") {
            return row.keterangan
                ? <Tooltip title={row.keterangan}><span className="bp-keterangan">{row.keterangan}</span></Tooltip>
                : "-";
        }
        if (!linkKeys.has(key)) return row[key] || "-";
        const {nama, url} = row[key] || {};
        if (!nama) {
            // Empty on a row whose status still expects a berkas, not merely empty
            return row.berkasKurang?.[key]
                ? <span className="berkas-kurang"><WarningAmberIcon sx={{fontSize: 16}}/>Belum ada berkas</span>
                : "-";
        }
        return url ? <a href={url} target="_blank" rel="noopener noreferrer">{nama}</a> : nama;
    }

    return (
        <TableContainer className="table-scroll-x"
                        sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{backgroundColor: "#00449C"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index} className={freeze(index)}
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C", whiteSpace: "nowrap"}}
                                >{data}</TableCell>
                        ))}
                        {showActions &&
                            <TableCell align="center"
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#00449C"}}
                                >Aksi</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.content.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={props.header.length + (showActions ? 1 : 0)} align="center" sx={{color: "#666"}}>
                                Tidak ada data.
                            </TableCell>
                        </TableRow>
                    ) : (
                        props.content.map((row) => (
                            <TableRow key={row.rowNumber} hover>
                                {keys.map((key, index) => (
                                    <TableCell key={key} className={freeze(index)}
                                               sx={{whiteSpace: "nowrap"}}>{renderCell(row, key)}</TableCell>
                                ))}
                                {showActions &&
                                    <TableCell align="center" sx={{whiteSpace: "nowrap"}}>
                                        {props.onEdit &&
                                            <Tooltip title="Ubah">
                                                <IconButton size="small" onClick={() => props.onEdit(row)}>
                                                    <EditIcon sx={{fontSize: 24, color: "#edbd4d"}}/>
                                                </IconButton>
                                            </Tooltip>}
                                        {props.onDelete &&
                                            <Tooltip title="Hapus">
                                                <IconButton size="small" onClick={() => props.onDelete(row)}>
                                                    <DeleteForeverIcon sx={{fontSize: 24, color: "#BD1404"}}/>
                                                </IconButton>
                                            </Tooltip>}
                                    </TableCell>}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

// SPM-Bend.jsx. Twelve month columns of berkas; without onUpload the table is read only.
// A cell whose bisaUnggah is false sits inside a merge it does not anchor, so the sheet
// would not accept a write there.
export function TableRekKoran(props) {
    const fileInput = useRef(null);
    const target = useRef(null);

    function pick(row, month) {
        target.current = { row, month };
        // Cleared so picking the same file twice still fires onChange
        fileInput.current.value = "";
        fileInput.current.click();
    }

    function handlePicked(event) {
        const file = event.target.files[0];
        if (file && target.current) props.onUpload(target.current.row, target.current.month, file);
    }

    function renderBerkas(row, month) {
        if (props.uploading === `${row.rowNumber}-${month}`) return <CircularProgress size={16}/>;
        const berkas = row.berkas[month];
        const canUpload = Boolean(props.onUpload) && berkas.bisaUnggah;
        if (!berkas.nama) {
            return canUpload
                ? <Button size="small" startIcon={<UploadFileIcon/>} onClick={() => pick(row, month)}
                          sx={{textTransform: "none"}}>Unggah</Button>
                : dash("");
        }
        return (
            <>
                {berkas.url
                    ? <a href={berkas.url} target="_blank" rel="noopener noreferrer">{berkas.nama}</a>
                    : berkas.nama}
                {canUpload &&
                    <Tooltip title="Ganti berkas">
                        <IconButton size="small" onClick={() => pick(row, month)}>
                            <UploadFileIcon sx={{fontSize: 18, color: "#00449C"}}/>
                        </IconButton>
                    </Tooltip>}
            </>
        );
    }

    return (
        <TableContainer className="table-scroll-x dp-table-card"
                        sx={{ maxWidth: "94%", margin: "20px auto" }}>
            <input type="file" accept="application/pdf" ref={fileInput} onChange={handlePicked} hidden/>
            <Table>
                <TableHead>
                    <TableRow>
                        {["Satker", "Nama Rekening", ...props.months].map((label, index) => (
                            <TableCell key={label} className={index < 2 ? `rk-freeze rk-freeze-${index + 1}` : undefined}
                                       align={index < 2 ? "left" : "center"}
                                       sx={{...HEAD_CELL}}
                                >{label}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.rows.map(row => (
                        <TableRow key={row.rowNumber} hover>
                            <TableCell className="rk-freeze rk-freeze-1" sx={{...BODY_CELL, whiteSpace: "nowrap"}}>{row.satker}</TableCell>
                            <TableCell className="rk-freeze rk-freeze-2" sx={{...BODY_CELL, whiteSpace: "nowrap"}}>{row.namaRekening}</TableCell>
                            {row.berkas.map((berkas, month) => (
                                <TableCell key={month} align="center" sx={{...BODY_CELL, whiteSpace: "nowrap"}}>
                                    {renderBerkas(row, month)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}


// Daftar-Pengajuan.jsx
// Status is free text off the sheet, so match on the lowered value and let anything
// unrecognised fall back to neutral rather than rendering an unstyled pill.
const DAFTAR_DETAIL_FIELDS = [
    { key: "spp", label: "Nomor SPP" },
    { key: "spm", label: "Nomor SPM" },
    { key: "pajak", label: "Status Pajak" },
    { key: "anggaran", label: "Ketersediaan Anggaran" },
    { key: "mulaiVerif", label: "Mulai Verifikasi" },
    { key: "selesaiVerif", label: "Selesai Verifikasi" },
];

// toggle, No., Jenis, Nominal, Tgl. Antri, Status, Aksi - the rest are per tab or per role
const DAFTAR_FIXED_COLUMNS = 7;

function DaftarBerkas({ label, url, pending }) {
    if (pending) return <span className="dp-file dp-file-pending">{label} · sedang dibuat…</span>;
    if (!url) return <span className="dp-file dp-file-empty">{label} · —</span>;
    return (
        <a className="dp-file" href={url} target="_blank" rel="noopener noreferrer">
            <DescriptionOutlinedIcon sx={{ fontSize: 17 }} />{label}
        </a>
    );
}

DaftarBerkas.propTypes = {
    label: PropTypes.string.isRequired,
    url: PropTypes.string,
    pending: PropTypes.bool,
};

const DaftarRow = memo(function DaftarRow({ row, jenisColumns, extraColumns, hiddenDetail, onView, onEdit, onDelete }) {
    const [open, setOpen] = useState(false);
    const status = daftarStatusStyle(row.status);
    const promoted = [...jenisColumns, ...extraColumns].map(column => column.field);
    const span = DAFTAR_FIXED_COLUMNS + jenisColumns.length + extraColumns.length;

    return (
        <Fragment>
            <tr className={`dp-row${open ? " dp-row-open" : ""}`}>
                <td className="dp-cell-toggle">
                    <IconButton size="small" aria-label={open ? "Tutup rincian" : "Lihat rincian"}
                        aria-expanded={open} onClick={() => setOpen(value => !value)}>
                        {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                </td>
                <td><span className="dp-id">{row.id}</span></td>
                <td className="dp-cell-jenis">{row.jenis}</td>
                {jenisColumns.map(column => <td key={column.field}>{dash(row[column.field])}</td>)}
                <td className="dp-num dp-cell-nominal">{dash(row.nominal)}</td>
                <td className="dp-num">{dash(row.tglAjuan)}</td>
                {extraColumns.map(column =>
                    <td key={column.field} className={column.text ? "" : "dp-num"}>{dash(row[column.field])}</td>)}
                <td>
                    <span className="dp-status" style={{ backgroundColor: status.bg, color: status.fg }}>{dash(row.status)}</span>
                    {row.hasilVerifPending && <span className="dp-status-note">Hasil verif. dibuat…</span>}
                </td>
                <td>
                    <div className="dp-actions">
                        {row.locked
                            ? <Tooltip title="Lihat detail" arrow>
                                <IconButton size="small" aria-label="Lihat detail pengajuan" onClick={() => onView(row)}>
                                    <RemoveRedEyeIcon sx={{ fontSize: 21, color: "#00204A" }} />
                                </IconButton>
                            </Tooltip>
                            : <>
                                <Tooltip title="Ubah pengajuan" arrow>
                                    <IconButton size="small" aria-label="Ubah pengajuan" onClick={() => onEdit(row)}>
                                        <EditIcon sx={{ fontSize: 21, color: "#D9A33B" }} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Hapus pengajuan" arrow>
                                    <IconButton size="small" aria-label="Hapus pengajuan" onClick={() => onDelete(row)}>
                                        <DeleteForeverIcon sx={{ fontSize: 21, color: "#BD1404" }} />
                                    </IconButton>
                                </Tooltip>
                            </>}
                    </div>
                </td>
            </tr>
            <tr className="dp-detail-row">
                <td className="dp-detail-cell" colSpan={span}>
                    <Collapse in={open} timeout={160} unmountOnExit>
                        <div className="dp-detail">
                            <dl className="dp-detail-grid">
                                {DAFTAR_DETAIL_FIELDS
                                    .filter(field => !promoted.includes(field.key) && !hiddenDetail.includes(field.key))
                                    .map(field => (
                                    <div className="dp-detail-item" key={field.key}>
                                        <dt>{field.label}</dt>
                                        <dd>{dash(row[field.key])}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="dp-detail-files">
                                {/* Only GUP/PTUP carry a Bupot; the other jenis have the PJK in its place */}
                                {row.isGup && <DaftarBerkas label="Bupot" url={row.bupot} />}
                                <DaftarBerkas label="PJK" url={row.pjk} />
                                <DaftarBerkas label="Hasil Verifikasi" url={row.hasilVerif} pending={row.hasilVerifPending} />
                            </div>
                            {(row.catatan || row.pjkCatatan) &&
                                <div className="dp-detail-notes">
                                    {row.catatan && <p><span>{row.isGup ? "Catatan Bendahara" : "Catatan Verifikator PJK"}</span>{row.catatan}</p>}
                                    {row.pjkCatatan && <p><span>Catatan Verifikator PJK</span>{row.pjkCatatan}</p>}
                                </div>}
                        </div>
                    </Collapse>
                </td>
            </tr>
        </Fragment>
    );
});

DaftarRow.propTypes = {
    row: PropTypes.object.isRequired,
    jenisColumns: PropTypes.array.isRequired,
    extraColumns: PropTypes.array.isRequired,
    hiddenDetail: PropTypes.array.isRequired,
    onView: PropTypes.func.isRequired,
    onEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
};

export function TableDaftarPengajuan({ rows, loading, page, totalPages, rowsPerPage, rowsPerPageOptions,
                                       jenisColumns = [], extraColumns, hiddenDetail = [], onPageChange,
                                       onRowsPerPageChange, onView, onEdit, onDelete }) {
    const span = DAFTAR_FIXED_COLUMNS + jenisColumns.length + extraColumns.length;
    return (
        <div className="dp-table-card">
            <div className="dp-toolbar">
                <span className="dp-toolbar-info">
                    {loading ? "Memuat data…" : totalPages > 0 ? `Halaman ${page} dari ${totalPages}` : "Tidak ada pengajuan"}
                </span>
                <label className="dp-perpage">
                    Baris per halaman
                    <select value={rowsPerPage} onChange={event => onRowsPerPageChange(Number(event.target.value))}>
                        {rowsPerPageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
            </div>
            <div className="dp-scroll">
                <table className="dp-table">
                    <thead>
                        <tr>
                            <th className="dp-cell-toggle"><span className="dp-sr-only">Rincian</span></th>
                            <th>No.</th>
                            <th>Jenis</th>
                            {jenisColumns.map(column => <th key={column.field}>{column.label}</th>)}
                            <th className="dp-th-right">Nominal</th>
                            <th>Tgl. Antri</th>
                            {extraColumns.map(column => <th key={column.field}>{column.label}</th>)}
                            <th>Status</th>
                            <th className="dp-th-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? <tr><td colSpan={span} className="dp-placeholder"><LoadingAnimate size="46px" /></td></tr>
                            : rows.length === 0
                                ? <tr><td colSpan={span} className="dp-placeholder dp-empty">Belum ada pengajuan.</td></tr>
                                : rows.map(row => (
                                    <DaftarRow key={row.key} row={row} jenisColumns={jenisColumns} extraColumns={extraColumns}
                                        hiddenDetail={hiddenDetail} onView={onView} onEdit={onEdit} onDelete={onDelete} />
                                ))}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 &&
                <Pagination className="dp-pagination" size="medium" count={totalPages} page={page} onChange={onPageChange} />}
        </div>
    );
}

TableDaftarPengajuan.propTypes = {
    rows: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    page: PropTypes.number.isRequired,
    totalPages: PropTypes.number.isRequired,
    rowsPerPage: PropTypes.number.isRequired,
    rowsPerPageOptions: PropTypes.array.isRequired,
    jenisColumns: PropTypes.array,
    extraColumns: PropTypes.array.isRequired,
    hiddenDetail: PropTypes.array,
    onPageChange: PropTypes.func.isRequired,
    onRowsPerPageChange: PropTypes.func.isRequired,
    onView: PropTypes.func.isRequired,
    onEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
};

// Layanan-Gaji.jsx - permintaan dokumen gaji. Built on the Daftar Pengajuan shell rather
// than on TableKelola: the row carries eighteen sheet columns and only five belong on
// screen, so the rest live in the dropdown. Records arrive as named objects straight from
// GET /layanan-gaji/antrian, not as positional arrays - there is no canonical row shape
// here to index against, and the keys are the sheet's own column meanings.
// toggle, No., Nama Lengkap, Jenis Permintaan, Status, Status E-mail, Petugas, Aksi
const LAYANAN_GAJI_COLUMN_COUNT = 8;

const LayananGajiRow = memo(function LayananGajiRow({ row, onUnggah, onKirimUlang, onUbahEmail, onHapus, sibuk }) {
    const [open, setOpen] = useState(false);
    // null means not editing, which "" cannot say - a cleared box is still an open editor
    const [emailBaru, setEmailBaru] = useState(null);
    const status = layananGajiStatusStyle(row.status);
    const email = layananGajiEmailStyle(row.statusEmail);
    // Disabled rather than hidden: the button is the obvious next move after a bounce, so it
    // has to say why it cannot be used instead of quietly disappearing
    const alamatGagal = row.statusEmail === layananGajiEmailGagal;

    return (
        <Fragment>
            <tr className={`dp-row${open ? " dp-row-open" : ""}`}>
                <td className="dp-cell-toggle">
                    <IconButton size="small" aria-label={open ? "Tutup rincian" : "Lihat rincian"}
                        aria-expanded={open} onClick={() => setOpen(value => !value)}>
                        {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                </td>
                <td><span className="dp-id">{dash(row.no)}</span></td>
                <td>{dash(row.namaLengkap)}</td>
                <td>{row.daftarJenis.length === 0 ? dash("")
                    : row.daftarJenis.map(jenis => <div key={jenis}>{jenis}</div>)}</td>
                <td>
                    <span className="dp-status" style={{ backgroundColor: status.bg, color: status.fg }}>
                        {dash(row.status)}
                    </span>
                </td>
                <td>
                    {email
                        ? <span className="dp-status" style={{ backgroundColor: email.bg, color: email.fg }}>
                            {row.statusEmail}
                        </span>
                        : dash("")}
                </td>
                <td>{dash(row.petugas)}</td>
                <td>
                    <div className="dp-actions">
                        {/* The 5px margin is the small IconButton's own padding, so swapping the
                            two does not change the row height */}
                        {sibuk
                            ? <CircularProgress size={21} sx={{ color: "#00449C", m: "5px" }} />
                            : <>
                                {/* Offered whenever a document exists: the retry re-sends the
                                    file already on Drive, so re-uploading is only for a
                                    document that was itself wrong */}
                                {row.lampiran.length > 0 &&
                                    <Tooltip arrow title={alamatGagal
                                        ? "Perbaiki alamat e-mail dahulu — alamat ini tidak aktif"
                                        : "Kirim ulang e-mail lampiran"}>
                                        <span>
                                            <IconButton size="small" disabled={alamatGagal}
                                                aria-label="Kirim ulang e-mail lampiran"
                                                onClick={() => onKirimUlang(row)}>
                                                <ForwardToInboxIcon
                                                    sx={{ fontSize: 21, color: alamatGagal ? "#9AA4B2" : "#8A6100" }} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>}
                                <Tooltip arrow title={`Unggah lampiran (${row.lampiran.length}/${row.daftarJenis.length})`}>
                                    <IconButton size="small" aria-label="Unggah lampiran"
                                        onClick={() => onUnggah(row)}>
                                        <UploadFileIcon sx={{ fontSize: 21, color: "#00449C" }} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Hapus permintaan" arrow>
                                    <IconButton size="small" aria-label="Hapus permintaan"
                                        onClick={() => onHapus(row)}>
                                        <DeleteForeverIcon sx={{ fontSize: 21, color: "#A81E1E" }} />
                                    </IconButton>
                                </Tooltip>
                            </>}
                    </div>
                </td>
            </tr>
            <tr className="dp-detail-row">
                <td className="dp-detail-cell" colSpan={LAYANAN_GAJI_COLUMN_COUNT}>
                    <Collapse in={open} timeout={160} unmountOnExit>
                        <div className="dp-detail">
                            <dl className="dp-detail-grid">
                                {layananGajiDetailFields.map(field => (
                                    <div className="dp-detail-item" key={field.key}>
                                        <dt>{field.label}</dt>
                                        {/* E-mail is the one field the desk may correct: a bounced
                                            row is unreachable until the address is fixed, and the
                                            pemohon cannot resubmit without taking a new antrian */}
                                        {field.key !== "email"
                                            ? <dd>{dash(row[field.key])}</dd>
                                            : emailBaru === null
                                                ? <dd className="lg-email">
                                                    {dash(row.email)}
                                                    <Tooltip title="Ubah alamat e-mail" arrow>
                                                        <IconButton size="small" aria-label="Ubah alamat e-mail"
                                                            onClick={() => setEmailBaru(row.email)}>
                                                            <EditIcon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </dd>
                                                : <dd className="lg-email">
                                                    <input className="lg-email-input" type="email" value={emailBaru}
                                                        autoFocus onChange={event => setEmailBaru(event.target.value)} />
                                                    <Button size="small" sx={{ textTransform: "none" }}
                                                        disabled={sibuk || !emailBaru.trim() || emailBaru === row.email}
                                                        onClick={() => { onUbahEmail(row, emailBaru.trim()); setEmailBaru(null); }}>Simpan</Button>
                                                    <Button size="small" color="inherit" sx={{ textTransform: "none" }}
                                                        onClick={() => setEmailBaru(null)}>Batal</Button>
                                                </dd>}
                                    </div>
                                ))}
                            </dl>
                            <div className="dp-detail-files">
                                {row.lampiran.length === 0
                                    ? <DaftarBerkas label="Lampiran File" url="" />
                                    : row.lampiran.map(berkas =>
                                        <DaftarBerkas key={berkas.nama} label={berkas.nama} url={berkas.url} />)}
                            </div>
                        </div>
                    </Collapse>
                </td>
            </tr>
        </Fragment>
    );
});

LayananGajiRow.propTypes = {
    row: PropTypes.object.isRequired,
    onUnggah: PropTypes.func.isRequired,
    onKirimUlang: PropTypes.func.isRequired,
    onUbahEmail: PropTypes.func.isRequired,
    onHapus: PropTypes.func.isRequired,
    sibuk: PropTypes.bool,
};

export function TableLayananGaji({ rows, loading, page, totalPages, rowsPerPage, rowsPerPageOptions,
                                   onPageChange, onRowsPerPageChange, onUnggah, onKirimUlang,
                                   onUbahEmail, onHapus, barisSibuk }) {
    return (
        <div className="dp-table-card">
            <div className="dp-toolbar">
                <span className="dp-toolbar-info">
                    {loading ? "Memuat data…" : totalPages > 0 ? `Halaman ${page} dari ${totalPages}` : "Tidak ada permintaan"}
                </span>
                <label className="dp-perpage">
                    Baris per halaman
                    <select value={rowsPerPage} onChange={event => onRowsPerPageChange(Number(event.target.value))}>
                        {rowsPerPageOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
            </div>
            <div className="dp-scroll">
                <table className="dp-table">
                    <thead>
                        <tr>
                            <th className="dp-cell-toggle"><span className="dp-sr-only">Rincian</span></th>
                            <th>No.</th>
                            <th>Nama Lengkap</th>
                            <th>Jenis Permintaan</th>
                            <th>Status</th>
                            <th>Status E-mail</th>
                            <th>Petugas</th>
                            <th className="dp-th-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? <tr><td colSpan={LAYANAN_GAJI_COLUMN_COUNT} className="dp-placeholder"><LoadingAnimate size="46px" /></td></tr>
                            : rows.length === 0
                                ? <tr><td colSpan={LAYANAN_GAJI_COLUMN_COUNT} className="dp-placeholder dp-empty">Belum ada permintaan dokumen.</td></tr>
                                // Keyed on timestamp, not rowNumber: deleting a row shifts every
                                // number below it, and React would then hand one row's open
                                // detail panel or half typed e-mail box to a different permintaan
                                : rows.map(row => (
                                    <LayananGajiRow key={row.timestamp || row.rowNumber} row={row} onUnggah={onUnggah}
                                        onKirimUlang={onKirimUlang} onUbahEmail={onUbahEmail}
                                        onHapus={onHapus} sibuk={barisSibuk === row.rowNumber} />
                                ))}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 &&
                <Pagination className="dp-pagination" size="medium" count={totalPages} page={page} onChange={onPageChange} />}
        </div>
    );
}

TableLayananGaji.propTypes = {
    rows: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    page: PropTypes.number.isRequired,
    totalPages: PropTypes.number.isRequired,
    rowsPerPage: PropTypes.number.isRequired,
    rowsPerPageOptions: PropTypes.array.isRequired,
    onPageChange: PropTypes.func.isRequired,
    onRowsPerPageChange: PropTypes.func.isRequired,
    onUnggah: PropTypes.func.isRequired,
    onKirimUlang: PropTypes.func.isRequired,
    onUbahEmail: PropTypes.func.isRequired,
    onHapus: PropTypes.func.isRequired,
    barisSibuk: PropTypes.number,
};

// Anggaran.jsx - the pagu tree, Unit Kerja -> MAK -> Akun Belanja.
// Positional arrays cannot express three levels, so unlike TableKelola this one takes the
// nested objects GET /anggaran returns and keeps its own expand state per row. "Belum
// dirinci" is the gap between a level's own pagu and what its children account for, which
// is the whole reason pagu is stored at every level rather than only at the leaf; "Sisa"
// is that pagu less everything committed or already paid against it, and a negative one is
// the computed replacement for the Pagu Minus an admin used to set by hand.
// "Terpakai", not "Realisasi": it holds money still in the antrian as well as money already
// SP2D, and only the latter is realisasi in the accounting sense. Sisa subtracts both, so a
// unit cannot over-submit unnoticed while its pengajuan wait for KPPN.
const ANGGARAN_HEAD = [
    "Unit Kerja / MAK / Akun", "Uraian", "Pagu", "Terpakai", "Sisa", "Belum Dirinci",
];

// Level indents rather than separate columns, so a deep row still reads as one line
const indentSel = (level) => ({paddingLeft: `${16 + level * 28}px`, whiteSpace: "nowrap"});
const sisaWarna = (nilai) => nilai < 0 ? "#BD1404" : "inherit";

// Badges sit on their own line under the label rather than beside it: inline they widen the
// first column enough to squeeze every money column off a laptop screen, and the cell is
// nowrap so they could never break on their own.
const barisLencana = (...lencana) => {
    const isi = lencana.filter(Boolean);
    return isi.length > 0 ? <div className="anggaran-lencana-baris">{isi}</div> : null;
};

// The same notice at every level: an akun carries it, and its MAK and unit kerja carry the
// count, so a collapsed row still shows that something inside it needs detailing in the DIPA.
const tandaTakDirinci = (jumlah) => jumlah > 0
    ? <span key="dirinci" className="anggaran-tanda-baru"
            title="Belum ada di DIPA, jadi tidak dihitung ke Terpakai">
        {jumlah} akun belum dirinci di DIPA
      </span>
    : null;

// A claimed MAK belongs to another unit kerja, so it has no pagu here and nothing to
// subtract from - every figure that would need one reads as a dash rather than a zero,
// which would look like a real ceiling of nothing.
const selLuarPagu = (nilai, luarPagu) => luarPagu ? "-" : formatRupiah(nilai);

export function TableAnggaranPohon({anggaran, kosong = "Belum ada anggaran untuk tahun ini."}) {
    // Keyed by unit name and by "unit|kode" so expanding one MAK never opens its namesake
    // under another unit kerja
    const [terbuka, setTerbuka] = useState({});
    const toggle = (kunci) => setTerbuka(prev => ({...prev, [kunci]: !prev[kunci]}));

    if (!anggaran || anggaran.length === 0) {
        return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    }

    return (
        <TableContainer sx={realisasiContainer}>
            <Table size="small">
                <RealisasiHead heads={ANGGARAN_HEAD}/>
                <TableBody>
                    {anggaran.map(unit => {
                        const unitBuka = !!terbuka[unit.unitKerja];
                        return (
                            <Fragment key={unit.unitKerja}>
                                <TableRow hover>
                                    <TableCell sx={{...indentSel(0), fontWeight: 600}}>
                                        {unit.mak.length > 0 &&
                                            <IconButton size="small" onClick={() => toggle(unit.unitKerja)}
                                                        aria-label={unitBuka ? "Tutup" : "Buka"}>
                                                {unitBuka ? <KeyboardArrowUpIcon fontSize="inherit"/> : <KeyboardArrowDownIcon fontSize="inherit"/>}
                                            </IconButton>}
                                        {unit.unitKerja}
                                        {barisLencana(
                                            unit.klaimUnitLain > 0 &&
                                                <span key="klaim" className="anggaran-lencana-klaim"
                                                      title="Belanja yang memakai Kode MAK milik unit kerja lain">
                                                    Klaim MAK unit lain {formatRupiah(unit.klaimUnitLain)}
                                                </span>,
                                            unit.akunDiklaim > 0 &&
                                                <span key="diklaim" className="anggaran-tanda-baru">
                                                    {unit.akunDiklaim} akun diklaim
                                                </span>,
                                            unit.makDiklaimOlehLain > 0 &&
                                                <span key="dipakai" className="anggaran-lencana-klaim"
                                                      title="MAK milik unit kerja ini yang dipakai unit kerja lain">
                                                    {unit.makDiklaimOlehLain} MAK dipakai unit lain
                                                </span>,
                                            tandaTakDirinci(unit.akunTakDirinci),
                                        )}
                                    </TableCell>
                                    <TableCell/>
                                    <TableCell sx={{fontWeight: 600}}>{formatRupiah(unit.pagu)}</TableCell>
                                    <TableCell>{formatRupiah(unit.terpakai)}</TableCell>
                                    <TableCell sx={{fontWeight: 600, color: sisaWarna(unit.sisa)}}>
                                        {formatRupiah(unit.sisa)}
                                    </TableCell>
                                    <TableCell sx={{color: sisaWarna(unit.belumDirinci)}}>
                                        {formatRupiah(unit.belumDirinci)}
                                    </TableCell>
                                </TableRow>

                                {unitBuka && unit.mak.map((mak, urutan) => {
                                    const kunciMak = `${unit.unitKerja}|${mak.kode}`;
                                    const makBuka = !!terbuka[kunciMak];
                                    // The claimed MAK are appended after the unit's own, so the
                                    // first of them opens the group. Announced rather than just
                                    // indented: these rows carry a nominal but deliberately do
                                    // not add to the totals above, and an unexplained row that
                                    // does not sum to its parent reads as a bug.
                                    const mulaiLuar = mak.luarPagu && !unit.mak[urutan - 1]?.luarPagu;
                                    return (
                                        <Fragment key={kunciMak}>
                                            {mulaiLuar &&
                                                <TableRow>
                                                    <TableCell colSpan={6} className="anggaran-pemisah-luar">
                                                        Di luar pagu unit kerja ini - memakai Kode MAK milik unit kerja lain,
                                                        sehingga tidak mengurangi angka di atas
                                                    </TableCell>
                                                </TableRow>}
                                            <TableRow hover>
                                                <TableCell sx={indentSel(1)}>
                                                    {mak.akun.length > 0 &&
                                                        <IconButton size="small" onClick={() => toggle(kunciMak)}
                                                                    aria-label={makBuka ? "Tutup" : "Buka"}>
                                                            {makBuka ? <KeyboardArrowUpIcon fontSize="inherit"/> : <KeyboardArrowDownIcon fontSize="inherit"/>}
                                                        </IconButton>}
                                                    {mak.kode}
                                                    {barisLencana(
                                                        mak.luarPagu &&
                                                            <span key="milik" className="anggaran-lencana-klaim">
                                                                milik {(mak.pemilik || []).join(", ") || "unit kerja lain"}
                                                            </span>,
                                                        mak.diklaimOleh?.length > 0 &&
                                                            <span key="diklaim" className="anggaran-lencana-klaim"
                                                                  title="Terpakai di bawah ini termasuk belanja unit kerja lain">
                                                                diklaim {mak.diklaimOleh.join(", ")}
                                                            </span>,
                                                        tandaTakDirinci(mak.akunTakDirinci),
                                                    )}
                                                </TableCell>
                                                <TableCell>{dash(mak.uraian)}</TableCell>
                                                <TableCell>{selLuarPagu(mak.pagu, mak.luarPagu)}</TableCell>
                                                <TableCell>{formatRupiah(mak.terpakai)}</TableCell>
                                                <TableCell sx={{color: sisaWarna(mak.sisa ?? 0)}}>
                                                    {selLuarPagu(mak.sisa, mak.luarPagu)}
                                                </TableCell>
                                                <TableCell sx={{color: sisaWarna(mak.belumDirinci ?? 0)}}>
                                                    {selLuarPagu(mak.belumDirinci, mak.luarPagu)}
                                                </TableCell>
                                            </TableRow>
                                            {makBuka && mak.akun.map(akun => (
                                                <TableRow key={`${kunciMak}|${akun.kode}`} hover>
                                                    <TableCell sx={indentSel(2)}>
                                                        {akun.kode}
                                                        {barisLencana(
                                                            akun.takDirinci &&
                                                                <span key="dirinci" className="anggaran-tanda-baru"
                                                                      title="Belum ada di DIPA, jadi tidak dihitung ke Terpakai">
                                                                    belum dirinci di DIPA - tidak dihitung
                                                                </span>,
                                                            akun.luarPagu &&
                                                                <span key="luar" className="anggaran-tanda-baru">
                                                                    di luar pagu unit kerja ini
                                                                </span>,
                                                        )}
                                                    </TableCell>
                                                    {/* No uraian by design - an akun code is a national
                                                        standard, so a dash would read as missing data */}
                                                    <TableCell/>
                                                    {/* Neither an undetailed akun nor a claimed one has a pagu
                                                        of its own, so neither has a Sisa */}
                                                    <TableCell>{selLuarPagu(akun.pagu, akun.takDirinci || akun.luarPagu)}</TableCell>
                                                    <TableCell>{formatRupiah(akun.terpakai)}</TableCell>
                                                    <TableCell sx={{color: sisaWarna(akun.sisa ?? 0)}}>
                                                        {selLuarPagu(akun.sisa, akun.takDirinci || akun.luarPagu)}
                                                    </TableCell>
                                                    {/* an akun has no children, so it has nothing left to detail */}
                                                    <TableCell/>
                                                </TableRow>
                                            ))}
                                        </Fragment>
                                    );
                                })}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableAnggaranPohon.propTypes = {
    anggaran: PropTypes.array,
    kosong: PropTypes.string,
};

// Spending whose MAK has no home in the active revisi. Shown rather than dropped: a
// silently discarded row understates realisasi and nobody ever finds out.
export function TableRealisasiTakDikenal({baris}) {
    if (!baris || baris.length === 0) {
        return <p style={{margin: "20px 30px", opacity: 0.7}}>Semua belanja cocok dengan anggaran yang berlaku.</p>;
    }
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={["Unit Kerja", "Kode MAK", "Akun", "Sebab", "Terpakai", "Baris"]}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.unitKerja)}</TableCell>
                            <TableCell style={{whiteSpace: "nowrap"}}>{dash(row.kodeMak)}</TableCell>
                            <TableCell>{dash(row.kodeAkun)}</TableCell>
                            <TableCell>{anggaranSebabLabel[row.sebab] || dash(row.sebab)}</TableCell>
                            <TableCell>{formatRupiah(row.terpakai)}</TableCell>
                            <TableCell>{row.baris}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableRealisasiTakDikenal.propTypes = {
    baris: PropTypes.array,
};

// A unit kerja spending against a MAK that belongs to another one. Flat rather than
// expandable so every offending pengajuan is on screen without a click - the Nomor SPP is
// the whole point, since it is what an admin searches Kelola Pengajuan by.
export function TableKlaimUnitLain({baris}) {
    if (!baris || baris.length === 0) return null;
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={["Unit Kerja Pengaju", "Kode MAK", "Akun", "Terdaftar di", "Nama", "Nomor SPP", "Terpakai"]}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.unitKerja)}</TableCell>
                            <TableCell style={{whiteSpace: "nowrap"}}>{dash(row.kodeMak)}</TableCell>
                            <TableCell>{dash(row.kodeAkun)}</TableCell>
                            <TableCell sx={{color: "#BD1404"}}>{dash((row.pemilik || []).join(", "))}</TableCell>
                            {/* A claim carried by the uploaded baseline has no pengajuan to name */}
                            <TableCell>{row.alur === "awal"
                                ? <span className="anggaran-tanda-baru">unggahan realisasi awal</span>
                                : dash(row.nama)}</TableCell>
                            <TableCell>{dash(formatNomorSpp(row.nomorSpp))}</TableCell>
                            <TableCell>{formatRupiah(row.terpakai)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableKlaimUnitLain.propTypes = {
    baris: PropTypes.array,
};


// Kelola-Kkp.jsx - the two SBM reference tables. Filtered by the screen rather than paged:
// the list is a few hundred rows an admin scans for one rute or provinsi, and a page break
// hides exactly the row being looked for.
export function TableSbmTiket({baris, kosong = "Belum ada data SBM Tiket Pesawat."}) {
    if (!baris || baris.length === 0) return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={sbmTiketHeadData}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.kotaAsal)}</TableCell>
                            <TableCell>{dash(row.kotaTujuan)}</TableCell>
                            <TableCell>{formatRupiah(row.tarif.bisnis)}</TableCell>
                            <TableCell>{formatRupiah(row.tarif.ekonomi)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableSbmTiket.propTypes = {
    baris: PropTypes.array,
    kosong: PropTypes.string,
};

export function TableSbmHotel({baris, kosong = "Belum ada data SBM Tarif Hotel."}) {
    if (!baris || baris.length === 0) return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={sbmHotelHeadData}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.provinsi)}</TableCell>
                            {sbmGolonganHotel.map(({value}) => (
                                <TableCell key={value}>{formatRupiah(row.tarif[value])}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableSbmHotel.propTypes = {
    baris: PropTypes.array,
    kosong: PropTypes.string,
};

export function TableSbmUangHarian({baris, kosong = "Belum ada data SBM Uang Harian."}) {
    if (!baris || baris.length === 0) return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={sbmUangHarianHeadData}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.provinsi)}</TableCell>
                            {sbmJenisUangHarian.map(({value}) => (
                                <TableCell key={value}>{formatRupiah(row.tarif[value])}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableSbmUangHarian.propTypes = {
    baris: PropTypes.array,
    kosong: PropTypes.string,
};

// Besaran is a single figure rather than a keyed tarif, so this one reads row.besaran
export function TableSbmTransportasi({baris, kosong = "Belum ada data SBM Transportasi."}) {
    if (!baris || baris.length === 0) return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "420px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={sbmTransportasiHeadData}/>
                <TableBody>
                    {baris.map((row, index) => (
                        <TableRow key={index} hover>
                            <TableCell>{dash(row.provinsi)}</TableCell>
                            <TableCell>{formatRupiah(row.besaran)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableSbmTransportasi.propTypes = {
    baris: PropTypes.array,
    kosong: PropTypes.string,
};

// The transaksi register, grouped by Kode - a Kode is one SPM, so the group is the unit an
// admin acts on and a single row is only ever a line inside it. Follows TableAnggaranPohon:
// one Fragment per group, expansion held in a map keyed by Kode.
//
// Colour carries unit kerja, not status: the accent and the Kode chip identify whose
// spending this is, and whether it is settled is said in words on its own pill. The two
// were competing for one chip before, and status is the thing that must never be guessed.
const KKP_STATUS_GAYA = {
    lunas:  {latar: "#DFF5E6", teks: "#0F7A38", titik: "#12A24A"},
    belum:  {latar: "#FFF1CC", teks: "#8A6100", titik: "#E0A200"},
};

function StatusKkp({lunas, label}) {
    const gaya = lunas ? KKP_STATUS_GAYA.lunas : KKP_STATUS_GAYA.belum;
    return (
        <span className="kkp-status" style={{backgroundColor: gaya.latar, color: gaya.teks}}>
            <span className="kkp-status-titik" style={{backgroundColor: gaya.titik}}/>
            {label}
        </span>
    );
}

StatusKkp.propTypes = {lunas: PropTypes.bool, label: PropTypes.string};

export function TableTransaksiKkp({grup, kosong, warna, onSpm, onUbah, onHapus}) {
    const [terbuka, setTerbuka] = useState({});
    const toggle = (kode) => setTerbuka(prev => ({...prev, [kode]: !prev[kode]}));

    if (!grup || grup.length === 0) {
        return <p style={{margin: "20px 30px", opacity: 0.7}}>{kosong}</p>;
    }

    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "640px"}}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        {kkpTransaksiHeadData.map(({label, align}) => (
                            <TableCell key={label} sx={realisasiHeadCell} align={align || "left"}>{label}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {grup.map(item => {
                        // A hand-edited sheet can hold a row with no Kode; it groups under ""
                        // rather than disappearing, but has no SPM to be given
                        const kunci = item.kode || "(tanpa kode)";
                        const buka = !!terbuka[kunci];
                        const gaya = warna(item.unitKerja);
                        // The accent runs down the whole group, so its rows read as belonging
                        // to the band above them rather than as a flat list
                        const tepi = {borderLeft: `4px solid ${gaya.aksen}`};
                        return (
                            <Fragment key={kunci}>
                                <TableRow className="kkp-band">
                                    <TableCell colSpan={6} sx={tepi}>
                                        <span className="kkp-band-utama">
                                            <IconButton size="small" onClick={() => toggle(kunci)}
                                                        aria-label={buka ? "Tutup" : "Buka"}>
                                                {buka ? <KeyboardArrowUpIcon fontSize="inherit"/> : <KeyboardArrowDownIcon fontSize="inherit"/>}
                                            </IconButton>
                                            <span className="kkp-kode"
                                                  style={{backgroundColor: gaya.latar, color: gaya.teks}}>
                                                {kunci}
                                            </span>
                                            <span className="kkp-grup-unit">{item.unitKerja || "Tanpa unit kerja"}</span>
                                            <StatusKkp lunas={item.lunas} label={item.status}/>
                                        </span>
                                        <span className="kkp-band-meta">
                                            {item.jumlahBaris} transaksi
                                            {item.nomorSpm && <> &middot; SPM {item.nomorSpm}</>}
                                            {/* The status still flipped - the money moved - but
                                                the register and the SP2D disagree on how much,
                                                so one of the two needs correcting */}
                                            {item.selisih !== 0 &&
                                                <span className="kkp-selisih"
                                                      title={`Nilai SP2D di Pembayaran BP ${formatRupiah(item.nilaiSpm)}`}>
                                                    Selisih {formatRupiah(Math.abs(item.selisih))}
                                                    {item.selisih > 0 ? " lebih besar" : " lebih kecil"} dari Nilai SP2D
                                                </span>}
                                        </span>
                                    </TableCell>
                                    <TableCell align="right" className="kkp-grup-total">
                                        {formatRupiah(item.total)}
                                    </TableCell>
                                    <TableCell colSpan={2} align="center">
                                        {!item.lunas && item.kode &&
                                            <button type="button" className="kkp-btn-spm" onClick={() => onSpm(item)}>
                                                {item.nomorSpm ? "Ubah SPM" : "Beri Nomor SPM"}
                                            </button>}
                                    </TableCell>
                                </TableRow>

                                {buka && item.baris.map(row => (
                                    <TableRow key={row.rowNumber} hover className="kkp-anak">
                                        <TableCell sx={tepi} className="kkp-anak-no">{row.no}</TableCell>
                                        <TableCell sx={{whiteSpace: "nowrap"}}>{row.tanggalTransaksi}</TableCell>
                                        <TableCell>{row.namaPic}</TableCell>
                                        <TableCell>{row.namaPejalan}</TableCell>
                                        <TableCell className="kkp-anak-ket">{row.keterangan}</TableCell>
                                        <TableCell>{row.transaksiVia}</TableCell>
                                        {/* A refund is entered as a negative nominal, so it has
                                            to read as one rather than as a smaller charge */}
                                        <TableCell align="right" sx={{whiteSpace: "nowrap"}}
                                                   className={row.nominal < 0 ? "kkp-refund" : "kkp-angka-sel"}>
                                            {formatRupiah(row.nominal)}
                                        </TableCell>
                                        <TableCell align="center">
                                            {row.buktiTransaksi?.url
                                                ? <Tooltip title={row.buktiTransaksi.nama}>
                                                    <a href={row.buktiTransaksi.url} target="_blank" rel="noopener noreferrer"
                                                       className="kkp-bukti">
                                                        <DescriptionOutlinedIcon sx={{fontSize: 20}}/>
                                                    </a>
                                                  </Tooltip>
                                                : <span className="kkp-bukti-kosong">-</span>}
                                        </TableCell>
                                        <TableCell align="center" sx={{whiteSpace: "nowrap"}}>
                                            {/* A settled group is the record of what an SP2D
                                                paid for, so its rows stop being editable */}
                                            <Tooltip title={item.lunas ? "Sudah terbayarkan" : "Ubah"}>
                                                <span>
                                                    <IconButton size="small" disabled={item.lunas}
                                                                onClick={() => onUbah(row)}>
                                                        <EditIcon sx={{fontSize: 19, color: item.lunas ? "#C9CFD8" : "#00449C"}}/>
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title={item.lunas ? "Sudah terbayarkan" : "Hapus"}>
                                                <span>
                                                    <IconButton size="small" disabled={item.lunas}
                                                                onClick={() => onHapus(row)}>
                                                        <DeleteForeverIcon sx={{fontSize: 19, color: item.lunas ? "#C9CFD8" : "#BD1404"}}/>
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableTransaksiKkp.propTypes = {
    grup: PropTypes.array,
    kosong: PropTypes.string,
    warna: PropTypes.func.isRequired,
    onSpm: PropTypes.func.isRequired,
    onUbah: PropTypes.func.isRequired,
    onHapus: PropTypes.func.isRequired,
};

// The pair of kalkulator share one row on a wide monitor, so each table gets about
// half the content width: tighter cells and a smaller header keep every column
// visible instead of pushing the table into a horizontal scroll.
const KALKULATOR_SEL = {
    "& .MuiTableCell-root": {padding: "6px 6px"},
    // Header labels wrap onto a second line rather than setting the column width:
    // "Jumlah Orang" on one line is wider than the control underneath it.
    "& .MuiTableCell-head": {fontSize: "0.82rem", lineHeight: 1.25, whiteSpace: "normal"},
};

// The kalkulator line items. Not a reference list but an editable form laid out as a table,
// so the controls live here with the columns they belong to rather than in the screen.
export function TableKalkulatorRincian({baris, kolom, onUbah, onHapus}) {
    return (
        <TableContainer sx={{...realisasiContainer, maxWidth: "100%"}}>
            <Table size="small" sx={KALKULATOR_SEL}>
                <RealisasiHead heads={[...kolom.map(item => item.label), "Subtotal", ""]}/>
                <TableBody>
                    {baris.map(row => (
                        <TableRow key={row.id}>
                            {kolom.map(({key, pilihan, min}) => {
                                // Kota Tujuan is offered per row from the Kota Asal already picked, so
                                // pilihan may be a function of the row rather than one fixed list
                                const opsi = typeof pilihan === "function" ? pilihan(row) : pilihan;
                                return (
                                    <TableCell key={key}>
                                        {opsi
                                            ? <select className="type-btn kkp-sel" value={row[key]}
                                                      onChange={event => onUbah(row.id, key, event.target.value)}>
                                                <option value="">- pilih -</option>
                                                {opsi.map(item => (
                                                    <option key={item.value} value={item.value}>{item.title}</option>
                                                ))}
                                              </select>
                                            : <input className="type-btn kkp-angka" type="number" min={min ?? 1}
                                                     value={row[key]}
                                                     onChange={event => onUbah(row.id, key, event.target.value)}/>}
                                    </TableCell>
                                );
                            })}
                            <TableCell sx={{whiteSpace: "nowrap", fontWeight: 600}}>
                                {row.subtotal === null
                                    ? <span className="kkp-belum">belum lengkap</span>
                                    : formatRupiah(row.subtotal)}
                            </TableCell>
                            <TableCell align="center">
                                <Tooltip title="Hapus baris">
                                    <span>
                                        <IconButton size="small" disabled={baris.length === 1}
                                                    onClick={() => onHapus(row.id)}>
                                            <DeleteForeverIcon sx={{fontSize: 22, color: baris.length === 1 ? "#C9CFD8" : "#BD1404"}}/>
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableKalkulatorRincian.propTypes = {
    baris: PropTypes.array.isRequired,
    kolom: PropTypes.array.isRequired,
    onUbah: PropTypes.func.isRequired,
    onHapus: PropTypes.func.isRequired,
};

// The upload diff. Deliberately not paginated: an admin about to replace a budget should
// scroll the whole list, and a "hapus" hiding on page 3 is exactly what must not happen.
const AKSI_GAYA = {
    tambah: {label: "Tambah", warna: "#0F9043", latar: "#9FFFC3"},
    ubah:   {label: "Ubah",   warna: "#5E4C3B", latar: "#F0E0CC"},
    hapus:  {label: "Hapus",  warna: "#8B0808", latar: "#F3B5B5"},
};
const TINGKAT_LABEL = {unit: "Unit Kerja", mak: "MAK", akun: "Akun"};

export function TableSelisihAnggaran({perubahan}) {
    if (!perubahan || perubahan.length === 0) {
        return <p style={{margin: "20px 30px", opacity: 0.7}}>Tidak ada perubahan - berkas ini sama dengan anggaran yang berlaku.</p>;
    }
    return (
        <TableContainer sx={{...realisasiContainer, maxHeight: "520px"}}>
            <Table size="small" stickyHeader>
                <RealisasiHead heads={["Aksi", "Tingkat", "Unit Kerja", "Kode MAK", "Akun", "Uraian", "Pagu Lama", "Pagu Baru", "Selisih"]}/>
                <TableBody>
                    {perubahan.map((row, index) => {
                        const gaya = AKSI_GAYA[row.aksi] || AKSI_GAYA.ubah;
                        return (
                            <TableRow key={index} hover>
                                <TableCell>
                                    <span style={{
                                        backgroundColor: gaya.latar, color: gaya.warna, fontWeight: 600,
                                        padding: "2px 10px", borderRadius: "10px", fontSize: "0.8rem", whiteSpace: "nowrap",
                                    }}>{gaya.label}</span>
                                </TableCell>
                                <TableCell>{TINGKAT_LABEL[row.tingkat] || row.tingkat}</TableCell>
                                <TableCell>{row.unitKerja}</TableCell>
                                <TableCell style={{whiteSpace: "nowrap"}}>{dash(row.kodeMak)}</TableCell>
                                <TableCell>{dash(row.kodeAkun)}</TableCell>
                                <TableCell>{dash(row.uraianBaru || row.uraianLama)}</TableCell>
                                <TableCell>{row.paguLama === null ? "-" : formatRupiah(row.paguLama)}</TableCell>
                                <TableCell>{row.paguBaru === null ? "-" : formatRupiah(row.paguBaru)}</TableCell>
                                <TableCell style={{color: sisaWarna(row.selisih), whiteSpace: "nowrap"}}>
                                    {row.selisih > 0 ? "+" : ""}{formatRupiah(row.selisih)}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

TableSelisihAnggaran.propTypes = {
    perubahan: PropTypes.array,
};
