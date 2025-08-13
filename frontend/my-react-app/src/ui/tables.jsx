import React, {useState, Fragment, useEffect, useMemo} from 'react';
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
import Collapse from '@mui/material/Collapse';
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
                        <TableRow sx={{ backgroundColor: "#1a284b" }}>
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

    useEffect(() => {
        setTableType(props.type);
    }, [props.type])


    useEffect(() => {
        if (props.content && props.fullContent) {
            setIsLoading(false);
        }
    }, [props.content, props.fullContent]);

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

    function CopyableTableCell({ children, ...props }) {
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
                    position: 'relative',
                    '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.02)'
                    }
                }}
            >
                {children}
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
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </TableCell>
        );
    }

    function Row(props) {
        //State
        const [isOpen, setIsOpen] = useState(false);
        const getCheckData = props.coloredRow?.[props.rowIndex] ?? [];
        return (
            <Fragment>
                <TableRow onDoubleClick={() => {
                    if (tableType === 'aksi-drpp') {
                        props.addColorData(props.rowIndex, "colored");
                    }}}
                    sx={tableType === 'aksi-drpp' ? {backgroundColor: getCheckData[0] === 'colored' ? "#F3B5B5" : "inherit", cursor: 'pointer'} : null}>
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
                    {props.rowData.map((data, index) => (
                        <CopyableTableCell key={index} className={tableType === "kelola" || tableType === "monitor"? null : "table-cell" }
                                   sx={tableType === 'monitor' ? {borderBottom: '2px solid rgb(214, 214, 214)'}
                                       : (index === 1 || index === 19 ? {maxWidth: '100px', whiteSpace: 'normal', wordWrap: 'break-word', borderBottom: '2px solid rgb(214, 214, 214)'} : {borderBottom: '2px solid rgb(214, 214, 214)'})} >
                            {tableType === 'monitor' && (index === 0 || index === 4 || index === 5 || index === 7 || index === 8) ? <p style={{margin: '0px', fontWeight: '700'}}>{data}</p> : data}
                        </CopyableTableCell>
                    ))}
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
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)", maxHeight: 900 }}>
            <Table stickyHeader aria-label="sticky table" sx={{ transform: "translateZ(0)"}}>
                <TableHead>
                    <TableRow sx={{backgroundColor: "#1a284b"}}>
                    {tableType === "kelola" || tableType === "monitor"?  <TableCell sx={{width: "30px", backgroundColor: "#1a284b"}}></TableCell> : null}
                    {props.header.map((data, index) => (
                        <TableCell key={index} sx={
                            tableType === "kelola" || tableType === "monitor"?
                            { fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#1a284b"}
                            :
                            { fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#1a284b", minWidth: data.minWidth}}>
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
    )
}

export function TableInfoAntri(props) {
    return(
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{width: "30px", backgroundColor: "#1a284b"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index}
                                sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#1a284b"}}
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

export function TableInfoPJK(props) {
    return(
        <TableContainer sx={{ maxWidth: "96%", margin: "auto", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
            <Table>
                <TableHead>
                    <TableRow sx={{width: "30px", backgroundColor: "#1a284b"}}>
                        {props.header.map((data, index) => (
                            <TableCell key={index}
                                       sx={{ fontSize:"1rem", fontWeight: 550, color: "white", backgroundColor: "#1a284b"}}
                            >{data}</TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                {props.body.map((row, index) => (
                    <TableRow key={index}>
                        {row.map((data, index) => (
                            <TableCell key={index}>{data}</TableCell>
                        ))}
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </TableContainer>
    )

}
