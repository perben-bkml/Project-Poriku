// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
// Import utility functions
import { numberFormats } from '../lib/utils';

// BuatPengajuan.jsx
export function TableBuatPengajuan(columns, tableData, handleCellChange, handleCellBlur, handleCellKeyDown, handlePaste, handleCellMouseDown, handleCellMouseOver, isCellSelected) {
    return (
        <TableContainer className="table-container" sx={{maxHeight: 750}}>
            <Table stickyHeader aria-label="sticky table">
                <TableHead className="table-head">
                    <TableRow className="table-row"> 
                        {props.columns.map((cols) => (
                            <TableCell className="table-cell head-data" key={cols.id} sx={{fontWeight: "bold", minWidth: cols.minWidth}} align="center">{cols.label}</TableCell>                                            
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.tableData.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                            {row.map((cell, colIndex) => (
                                <TableCell className={`table-cell ${props.isCellSelected(rowIndex, colIndex) ? "selected-cell" : ""}`}
                                    key={colIndex}
                                    data-row={rowIndex}
                                    data-col={colIndex}
                                    onMouseDown={()=> props.handleCellMouseDown(rowIndex, colIndex)}
                                    onMouseOver={()=> props.handleCellMouseOver(rowIndex, colIndex)}
                                    sx={{minHeight:20, minWidth: props.columns[colIndex].minWidth, padding:"8px"}}
                                    align={colIndex === 0 ? "center" : "left"}>
                                    <textarea 
                                        className={`${props.isCellSelected(rowIndex, colIndex) ? "selected-cell" : ""}`}
                                        value={cell}
                                        data-row={rowIndex}
                                        data-col={colIndex}
                                        onChange={(input) => props.handleCellChange(rowIndex, colIndex, input.target.value, input.target)}
                                        onBlur={(input) => props.handleCellBlur(rowIndex, colIndex, input.target.value)}
                                        onKeyDown={(event) => props.handleCellKeyDown(event, rowIndex, colIndex)}
                                        onPaste={(event) => props.handlePaste(event, rowIndex, colIndex)}/>
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        {props.columns.map((col, colIndex) => (
                            <TableCell className="table-footer-cell" key={colIndex}>
                                {Object.values(props.summableColumns).includes(colIndex) ? numberFormats(calculateColumnTotal(colIndex).toString()) : ""}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableFooter>
            </Table>
        </TableContainer>
    )
}


// SPM-Bend.jsx
export function TableSpmBendahara(props) {
    return (
        <TableContainer sx={{ maxWidth: "94%", margin: "auto", marginTop:"20px", marginBottom:"20px", borderRadius: "10px", border: "0.8px solid rgb(236, 236, 236)"}}>
        <Table>
            <TableHead>
                <TableRow sx={{ backgroundColor: "#1a284b" }}>
                    {props.tableData.length > 0 && props.tableData[0].map((col, colIndex) => (
                        <TableCell className="table-cell head-data" key={colIndex} sx={{fontWeight: 550, color:"white"}} align="center">{col}</TableCell>
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