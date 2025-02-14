// Import Material UI Table
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

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