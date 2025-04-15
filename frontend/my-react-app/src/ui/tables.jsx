import React, { useState, Fragment, useEffect } from 'react';
// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
// Other Material UI
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { IconButton } from '@mui/material';
import Collapse from '@mui/material/Collapse';
// Components
import LoadingAnimate from './loading';

// SPM-Bend.jsx
export function TableSpmBendahara(props) {
    return (
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
                {props.tableData.length > 0 && props.tableData.slice(1).map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                            <TableCell className="table-cell" key={cellIndex}>{cell}</TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </TableContainer>
    )
}

//Kelola-Pengajuan.jsx & Aksi-Pengajuan.jsx
export function TableKelola(props) {
    //State
    const [tableType, setTableType] = useState("")
    const [isLoading, setIsLoading] = useState(true)

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
    


    function handleAksiClick(index) {
        if (props.type === "kelola") {
            props.changeComponent("aksi-pengajuan")
            props.aksiData(props.fullContent[index])
        } else if (props.type === "aksi") {
            null
        } else if (props.type === "monitor") {
            props.changeComponent("aksi-drpp")
            props.aksiData(props.fullContent[index])
        }
    }

    function Row(props) {
        //State
        const [isOpen, setIsOpen] = useState(false);
        return (
            <Fragment>
                <TableRow>
                    {tableType === "kelola" || tableType === "monitor"?
                    <TableCell sx={tableType === 'monitor' ? {border: '0.8px solid rgb(214, 214, 214)'} : null}>
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
                        <TableCell key={index} className={tableType === "kelola" || tableType === "monitor"? null : "table-cell" } sx={tableType === 'monitor' ? {border: '0.8px solid rgb(214, 214, 214)'} : null} >
                            {tableType === 'monitor' && (index === 0 || index === 4 || index === 5 || index === 7 || index === 8) ? <p style={{margin: '0px', fontWeight: '700'}}>{data}</p> : data}
                        </TableCell>
                    ))}
                </TableRow>

                <TableRow>
                    <TableCell sx ={{ paddingBottom: 0, paddingTop: 0, border: "none" }} colSpan={tableType === "kelola" || tableType === "monitor"?  props.rowData[0].length + 2 : 22}>
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
                    {props.content.map((row, index) => (
                        <Row key={index} rowData={row} rowIndex={index}/>
                    ))}
                </TableBody>
            </Table>
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