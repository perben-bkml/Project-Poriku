import React, {useState, useEffect, useRef, useContext, useCallback, useMemo} from "react";
import * as math from "mathjs";
import apiClient from "../../lib/apiClient";

// Import Components
import Popup from "../../ui/Popup.jsx";
import { columns, jenisPengajuan, jenisTabelPenuh, jenisTanpaTabel, ringkasColumns, ringkasLabels, jenisValueFromLabel, daftarStatusStyle } from "./head-data.js";
import { PILOT, PILOT_JENIS_ALLOWED, isPilotUser } from "../../lib/pilot.js";
import LoadingAnimate, { LoadingScreen } from "../../ui/loading.jsx";
import { SubmitButton, UploadButton } from "../../ui/buttons.jsx";

// Import Table Material UI
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { TableFooter, TablePagination } from "@mui/material";
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

// Import Context
import { AuthContext } from "../../lib/AuthContext.jsx";
import PropTypes from "prop-types";

// Virtualization and optimization
// Import the actual packages
import debounce from 'lodash.debounce';


const emptyCell = Array(21).fill("");
const initialRow = [1, ...emptyCell];

function BuatPengajuan(props) {
    //Determining if this component is being used for viewing, editing, or creating new pengajuan
    const [componentType, setComponentType] = useState("")

    //Use Context
    const { user } = useContext(AuthContext);

    //State
    const [rowNum, setRowNum] = useState(1);
    const [tableData, setTableData] = useState([initialRow]);
    const [mouseSelectRange, setMouseSelectRange] = useState({start: null, end:null});
    const [isSelecting, setIsSelecting] = useState(false);

    //State for form input tag
    const [namaPengisi, setNamaPengisi] = useState("");
    // A reopened row carries the sheet's Jenis label, which has to become the form's slug.
    // Seeded here rather than synced in an effect so the form shape is right on first render.
    const [ajuan, setAjuan] = useState(() => (
        props.type === "buat" || !props.passedData
            ? "gup"
            : jenisValueFromLabel(props.passedData[2]) || "gup"
    ));
    const [jumlahAjuan, setJumlahAjuan] = useState("");
    const [nomorSpp, setNomorSpp] = useState(() => props.passedData?.[12] || "");
    const [sppError, setSppError] = useState("");
    const sppRef = useRef(null);
    // Seeded like nomorSpp above: the input is controlled, so leaving this empty made an
    // untouched "ubah" write "" over the Request Tanggal the row already had
    const [tanggalAjuan, setTanggalAjuan] = useState(() => props.passedData?.[4] || "");
    const [lockRow, setLockRow] = useState(false);

    //State for reading and edit tabledata
    const [keywordRowPos, setKeywordRowPos] = useState("");
    const [keywordEndRow, setKeywordEndRow] = useState("");

    //State for "formula mode"
    const [targetReference, setTargetReference] = useState(null);
    const [currentEditableCell, setCurrentEditableCell] = useState(null);
    const [isFormulaMode, setIsFormulaMode] = useState(false);
    const [currentTextareaRef, setCurrentTextareaRef] = useState(null);

    //Popup State
    const [isPopup, setIsPopup] = useState(false);
    const [isKetentuan, setIsKetentuan] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoading2, setIsLoading2] = useState(false);

    // Pagination state
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);

    // State to held file from UploadFile
    const [file, setFile] = useState(null);
    const [filePjk, setFilePjk] = useState(null);
    // Marks the stored PJK for removal - applied, together with deleting the file itself,
    // when the edit is saved
    const [removePjk, setRemovePjk] = useState(false);

    // Jenis Pengajuan drives the whole form shape in every mode. Anything other than
    // GUP/PTUP is a verifikasi flow, whether it is being created or reopened from the
    // daftar, so the table shape follows the jenis rather than the mode.
    const isBuat = componentType === "buat";
    const isTabelPenuh = jenisTabelPenuh.includes(ajuan);
    const isTanpaTabel = jenisTanpaTabel.includes(ajuan);
    const nomorSppRequired = !isTabelPenuh && componentType !== "lihat";
    const canUploadPjk = isPilotUser(user) || String(user?.role ?? "").includes("admin");
    const showUploadGroup = componentType !== "lihat" && (isTabelPenuh || canUploadPjk);
    // Which antrian/table sheet pair this pengajuan lives on
    const rowFlow = isBuat ? null : (props.passedData?.[10] || (isTabelPenuh ? "gup" : "verif"));
    // GUP/PTUP keep the Bupot on their own row and the PJK on the mirror row, which the
    // daftar carries across separately. Every other jenis only ever has a PJK.
    const statusStyle = daftarStatusStyle(props.passedData?.[8]);
    const catatanBendahara = rowFlow === "gup" ? props.passedData?.[13] : "";
    const catatanPjk = rowFlow === "gup" ? props.passedData?.[14] : props.passedData?.[13];
    const bupotLink = rowFlow === "gup" ? (props.passedData?.[9] || "") : "";
    const pjkLink = props.passedData?.[11] || (rowFlow && rowFlow !== "gup" ? props.passedData?.[9] || "" : "");
    const activeColumns = useMemo(
        () => (isTabelPenuh ? columns.map((_, index) => index) : ringkasColumns),
        [isTabelPenuh]
    );

    // Pilot hold: the verifikasi jenis are being trialled on the live server, so everyone
    // outside the pilot composes GUP/PTUP only. Reopened rows are untouched - their select
    // below is already fixed to the flow the row lives on, so an LS pengajuan submitted
    // before the hold still opens and edits normally.
    const jenisOptions = useMemo(() => (
        PILOT.jenisPengajuanPilotOnly && !isPilotUser(user)
            ? jenisPengajuan.filter(jenis => PILOT_JENIS_ALLOWED.includes(jenis.value))
            : jenisPengajuan
    ), [user]);

    // The form keeps its state when Bendahara-Page swaps between lihat/edit/buat, so a jenis
    // left over from a reopened row can outlive the switch to composing. Snap it back to a
    // jenis that is actually on offer, or the select would show one thing and submit another.
    useEffect(() => {
        if (isBuat && !jenisOptions.some(jenis => jenis.value === ajuan)) setAjuan(jenisOptions[0].value);
    }, [isBuat, jenisOptions, ajuan]);

    // The verifikasi table is a single row, and its sheet has no Request Tanggal column.
    // Only applies while composing - a reopened row already arrives in its own shape.
    useEffect(() => {
        if (!isBuat || isTabelPenuh) return;
        setRowNum(1);
        setTanggalAjuan("");
        setTableData(prevData => [[1, ...(prevData[0] || initialRow).slice(1)]]);
        setPage(0);
    }, [isBuat, isTabelPenuh]);

    //Auto size textarea tag height after fetching data
    const textAreaRefs = useRef([]); // Stores references to each textarea

    // Auto-resize textareas when data is loaded - debounced to improve performance
    const resizeAllTextareas = useCallback(() => {
        // Create a new debounced function each time to avoid stale closures
        const debouncedResize = debounce(() => {
            textAreaRefs.current.forEach((textarea) => {
                if (textarea) {
                    textarea.style.height = "auto"; // Reset height first
                    textarea.style.height = `${textarea.scrollHeight}px`; // Expand to fit content
                }
            });
        }, 100);

        // Execute the debounced function
        debouncedResize();

        // Return a cleanup function that cancels the debounced call if component unmounts
        return () => debouncedResize.cancel();
    }, []);

    //Fetching table data from backend to be shown
    async function fetchAntrianTable() {
        try {
            setIsLoading2(true);
            const tableKeyword = `TRANS_ID:${props.passedData[0]}`
            const response = await apiClient.get('/bendahara/data-transaksi', { params: { tableKeyword, flow: rowFlow } })
            if (response.status === 200) {
                // The verifikasi sheet stores only the ringkas columns, but every row held
                // in state is full width - scatter them back to the positions they edit at
                const fetched = response.data.data || [];
                const rows = isTabelPenuh
                    ? fetched
                    : fetched.map(row => {
                        const full = Array(columns.length).fill("");
                        ringkasColumns.forEach((colIndex, position) => { full[colIndex] = row[position] ?? ""; });
                        return full;
                    });
                setTableData(rows);
                setRowNum(rows.length);
                setKeywordRowPos(response.data.keywordRowPos)
                setKeywordEndRow(response.data.keywordEndRow)
                setTimeout(() => {
                    resizeAllTextareas();
                }, 0);
            }
            setIsLoading2(false);
        } catch (error) {
            console.log("Failed sending Keyword.", error)
        }
    }
    useEffect(() => {
        const newComponentType = props.type;
        setComponentType(newComponentType);

        // LS Pegawai and LS Platform never wrote a table block, so there is nothing to fetch
        if (newComponentType !== "buat" && !isTanpaTabel) {
            fetchAntrianTable();
        }
    }, [props.type, isTanpaTabel]);


    //Handle how many rows the user wants
    function handleRowChange(event) {
        const userRowValue = parseInt(event.target.value)
        setRowNum(userRowValue);
    }

    function handleRowBlur(event) {
        const userRowValue = parseInt(event.target.value);
        setRowNum(userRowValue);
        if (userRowValue > tableData.length) {
            const newRows = Array.from({ length: userRowValue - tableData.length }, (_, index) => 
                [tableData.length + index + 1, ...emptyCell] );
            setTableData([...tableData, ...newRows]);
        } else if (userRowValue < tableData.length) {
            setTableData(tableData.slice(0, userRowValue).map((row, index) => [index + 1, ...row.slice(1)]))
        }
    }
    //Number format generator
    function numberFormats(num) {
        if (!num) {
            return "";
        } else {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
        }
    }

    // Helper function to clean currency values from Excel data
    function cleanCurrencyValue(value) {
        if (!value || typeof value !== 'string') {
            return value;
        }
        
        // Remove common currency symbols and prefixes
        // Supports: Rp, $, €, £, ¥, and other common formats
        let cleaned = value
            .replace(/^(Rp\.?\s*|USD?\s*|\$\s*|EUR?\s*|€\s*|GBP?\s*|£\s*|JPY?\s*|¥\s*)/i, '') // Remove currency prefixes
            .replace(/[^\d.,]/g, '') // Remove any non-digit, non-comma, non-period characters
            .replace(/[,.]/g, ''); // Remove commas and periods for validation
            
        return cleaned;
    }

    // Set Jumlah Ajuan input tag
    const handleJumlahChange = (event) => {
        const value = event.target.value;
        const digitsOnly = value.replace(/[^\d]/g, "");
        setJumlahAjuan(numberFormats(digitsOnly));
    }

    // Helper function to calculate and update column 17 (Nilai Terima)
    const updateNilaiTerima = (data, rowIndex) => {
        // Function to convert formatted numbers to actual numbers
        function toNumber(value) {
            const cleaned = String(value).replace(/\./g, "").replace(/,/g, ".");
            const num = parseFloat(cleaned);
            return isNaN(num) ? 0 : num;
        }

        const initialValue = toNumber(data[rowIndex][4]);
        const cut1 = toNumber(data[rowIndex][7]);
        const cut2 = toNumber(data[rowIndex][9]);
        const cut3 = toNumber(data[rowIndex][11]);
        const cut4 = toNumber(data[rowIndex][13]);
        const cut5 = toNumber(data[rowIndex][15]);

        data[rowIndex][17] = numberFormats(initialValue - cut1 - cut2 - cut3 - cut4 - cut5);
        return data;
    };

    //Function handling Math equations
    function evaluateEquation(equation, rowIndex, colIndex) {
        try {
            //Remove = as leading equation like excel
            let equ = equation.trim().startsWith("=") ? equation.slice(1) : equation;

            // Regular expression to find cell references in the format of column index plus row index
            // For example: 4[10] refers to column 4, row 10
            // We use a more specific regex to avoid matching numbers like 4[1] as cell references
            // when they're meant to be literal values
            const cellRefRegex = /(\d+)\[(\d+)\]/g;

            // Replace all cell references with their actual values
            equ = equ.replace(cellRefRegex, (match, colIdx, rowIdx) => {
                const col = parseInt(colIdx);
                // Adjust row index to match the 1-based indexing used in handleCellClick
                const row = parseInt(rowIdx) - 1;

                // Check if the referenced cell exists
                if (row >= 0 && row < tableData.length && col >= 0 && col < tableData[row].length) {
                    const cellValue = tableData[row][col];

                    // If the cell value is empty or not a number, return 0
                    if (!cellValue || isNaN(cellValue.replace(/\./g, "").replace(/,/g, "."))) {
                        return "0";
                    }

                    // Return the numeric value of the cell (remove formatting)
                    return cellValue.replace(/\./g, "").replace(/,/g, ".");
                }

                // If the cell doesn't exist, return 0
                return "0";
            });

            // Remove formatting from the equation
            const sanitizeEqu = equ.replace(/\./g, "")
            const sanitizeEqu2 = sanitizeEqu.replace(/,/g, ".");

            //Evaluate/count equations
            const result = Math.floor(math.evaluate(sanitizeEqu2));
            let stringResult = numberFormats(result.toString());
            if (stringResult == "NaN") {
                stringResult = "";
            }

            //Returning formatted result
            const newData = [...tableData];
            newData[rowIndex][colIndex] = stringResult;

            // If the updated column is one of the columns used in the Nilai Terima calculation,
            // update column 17 as well
            if (colIndex === 4 || colIndex === 7 || colIndex === 9 || colIndex === 11 || colIndex === 13 || colIndex === 15) {
                updateNilaiTerima(newData, rowIndex);
            }

            setTableData(newData);
        } catch (error) {
            console.error("Formula evaluation error:", error);
            return "Rumus tidak valid."
        }
    }

    // Handling text area changes - optimized with useCallback
    const handleCellChange = useCallback((cellrowIndex, cellcolumnIndex, value, textareaRef) => {
        if (value.startsWith("=")) {
            setIsFormulaMode(true);
            setCurrentEditableCell({ row: cellrowIndex, col: cellcolumnIndex });
            setCurrentTextareaRef(textareaRef);
        } else {
            setIsFormulaMode(false);
            setCurrentEditableCell(null);
            setCurrentTextareaRef(null);
        }

        setTableData(prevData => {
            const updatedData = [...prevData];
            updatedData[cellrowIndex] = [...updatedData[cellrowIndex]];
            updatedData[cellrowIndex][cellcolumnIndex] = value;

            // Update column 17 (Nilai Terima) when any of the columns used in its calculation change
            if (cellcolumnIndex === 4 || cellcolumnIndex === 7 || cellcolumnIndex === 9 || 
                cellcolumnIndex === 11 || cellcolumnIndex === 13 || cellcolumnIndex === 15) {
                updateNilaiTerima(updatedData, cellrowIndex);
            }

            return updatedData;
        });

        // Debounce the height adjustment for better performance
        setTimeout(() => {
            if (textareaRef) {
                textareaRef.style.height = "auto";
                textareaRef.style.height = textareaRef.scrollHeight + "px";
            }
        }, 0);
    }, [updateNilaiTerima]);

    const handleCellBlur = useCallback((cellrowIndex, cellcolumnIndex, value) => {
        //Exclude column 1 - 4 from auto formatting
        if (cellcolumnIndex >= 0 && cellcolumnIndex <= 3) {
            return;
        }

        if (cellcolumnIndex >= 18 && cellcolumnIndex <= 21) {
            return;
        }

        // Exclude columns 8, 10, 12, 14, and 16 from auto formatting
        if (cellcolumnIndex === 8 || cellcolumnIndex === 10 || cellcolumnIndex === 12 || cellcolumnIndex === 14 || cellcolumnIndex === 16) {
            return;
        }

        // Check if the value starts with "=" (formula mode)
        if (value.startsWith("=")) {
            // No formatting should occur in formula mode
            return;
        }

        // Clean currency formatting and check if the value is numeric
        const cleanedValue = cleanCurrencyValue(value);
        if (!isNaN(cleanedValue) && cleanedValue.trim() !== "") {
            // Format the number with commas for thousands
            const formattedValue = numberFormats(cleanedValue);

            setTableData(prevData => {
                const updatedData = [...prevData];
                updatedData[cellrowIndex] = [...updatedData[cellrowIndex]];
                updatedData[cellrowIndex][cellcolumnIndex] = formattedValue;

                // Format column 5 and 6 if column 4 is filled
                if (cellcolumnIndex === 4) {
                    const baseValue = parseFloat(cleanedValue);
                    if (!isNaN(baseValue)) {
                        updatedData[cellrowIndex][5] = numberFormats((baseValue * 100 / 111).toFixed(0)); // Column 5 for normal DPP
                        updatedData[cellrowIndex][6] = numberFormats((baseValue * 100 / 111 * 11 / 12).toFixed(0)); // Column 6 for DPP Nilai Lain
                    }
                }

                //Automatically calculate total Nilai Terima
                if (cellcolumnIndex >= 4 && cellcolumnIndex <= 16) {
                    updateNilaiTerima(updatedData, cellrowIndex);
                }

                return updatedData;
            });
        }  else if (cellcolumnIndex === 4) {
            // --- NEW: If column 4 is empty, clear columns 5 and 6 ---
            setTableData(prevData => {
                const updatedData = [...prevData];
                updatedData[cellrowIndex] = [...updatedData[cellrowIndex]];

                // Ensure columns 4, 5, and 6 are set to empty strings
                updatedData[cellrowIndex][4] = "";
                updatedData[cellrowIndex][5] = "";
                updatedData[cellrowIndex][6] = "";

                // Recalculate Nilai Terima since column 4 has changed
                updateNilaiTerima(updatedData, cellrowIndex);

                return updatedData;
            });
        }
    }, [numberFormats, updateNilaiTerima]);

    // Handling formula mode - optimized with useCallback
    const handleCellClick = useCallback((rowIndex, colIndex) => {
        if (isFormulaMode && targetReference) {
            if (currentEditableCell && (currentEditableCell.col !== colIndex || currentEditableCell.row !== rowIndex)) {
                // Create a cell reference in the format C[R] where C is column and R is row
                const cellReference = `${colIndex}[${rowIndex+1}]`;

                const originCellData = tableData[currentEditableCell.row][currentEditableCell.col] || "=";

                // Check if the last character is an operator
                const lastChar = originCellData[originCellData.length - 1];
                const isLastCharOperator = /[\+\-\*\/=]$/.test(lastChar);

                let updatedFormula;

                if (isLastCharOperator) {
                    // Append the new cell reference if the last character is an operator
                    updatedFormula = originCellData + cellReference;
                } else {
                    // Find the position of the last operator or "="
                    const lastOperatorMatch = originCellData.match(/[\+\-\*\/=]/g);
                    const lastOperatorPos = lastOperatorMatch
                        ? originCellData.lastIndexOf(lastOperatorMatch[lastOperatorMatch.length - 1]) + 1
                        : originCellData.length;

                    // Replace the value after the last operator
                    updatedFormula = originCellData.substring(0, lastOperatorPos) + cellReference;
                }

                // Update the table with the new formula using functional setState
                setTableData(prevData => {
                    const newData = [...prevData];
                    newData[currentEditableCell.row] = [...newData[currentEditableCell.row]];
                    newData[currentEditableCell.row][currentEditableCell.col] = updatedFormula;
                    return newData;
                });

                // Retain focus on the current editing cell
                if (currentTextareaRef) {
                    setTimeout(() => {
                        currentTextareaRef.focus();
                        currentTextareaRef.setSelectionRange(updatedFormula.length, updatedFormula.length);
                    }, 0);
                }
            }
        }
    }, [isFormulaMode, targetReference, currentEditableCell, tableData, currentTextareaRef]);


    // This functions enable to navigate through cells with arrow - optimized with useCallback
    const focusCell = useCallback((row, col) => {
        // Use a more targeted approach to reduce DOM operations
        const currentSelected = document.querySelectorAll(".table-container .selected-cell");
        currentSelected.forEach((cell) => cell.classList.remove("selected-cell"));

        // Focusing on the selected cell
        const textarea = document.querySelector(
            `.table-container textarea[data-row="${row}"][data-col="${col}"]`
        );
        const cell = document.querySelector(
            `.table-container .table-cell[data-row="${row}"][data-col="${col}"]`
        );

        if (textarea) {
            // Use setTimeout to defer focus until after the current execution context
            setTimeout(() => {
                textarea.focus();
                textarea.classList.add("selected-cell");
                if (cell) cell.classList.add("selected-cell");
            }, 0);
        }
    }, []);

    // The following function will make us able to select many cells with mouse - optimized with useCallback
    const handleCellMouseDown = useCallback((rowIndex, colIndex) => {
        if (!isFormulaMode){
            setMouseSelectRange({start: {row: rowIndex, col: colIndex}, end: {row: rowIndex, col: colIndex}});
            setIsSelecting(true);
            focusCell(rowIndex, colIndex);
        } 
    }, [isFormulaMode, focusCell]);

    const handleCellMouseOver = useCallback((rowIndex, colIndex) => {
        if (isSelecting) {
            setMouseSelectRange((prevdata) => ({
                ...prevdata,
                end: {row: rowIndex, col: colIndex},
            }));
        }
    }, [isSelecting]);

    const handleCellMouseUp = useCallback(() => {
        setIsSelecting(false);
    }, []);
    // Memoize the selected cells calculation for better performance
    const selectedCells = useMemo(() => {
        if (!mouseSelectRange.start || !mouseSelectRange.end) return new Set();

        const { start, end } = mouseSelectRange;
        const rowStart = Math.min(start.row, end.row);
        const rowEnd = Math.max(start.row, end.row);
        const colStart = Math.min(start.col, end.col);
        const colEnd = Math.max(start.col, end.col);

        const selected = new Set();
        for (let r = rowStart; r <= rowEnd; r++) {
            for (let c = colStart; c <= colEnd; c++) {
                selected.add(`${r}-${c}`);
            }
        }
        return selected;
    }, [mouseSelectRange]);

    // More efficient cell selection check using Set
    function isCellSelected(rowIndex, colIndex) {
        return selectedCells.has(`${rowIndex}-${colIndex}`);
    }
    // Deleting all selected textarea contents - optimized with useCallback
    const clearSelectedCells = useCallback(() => {
        if (!mouseSelectRange.start || !mouseSelectRange.end) return;

        const { start, end } = mouseSelectRange;

        const rowStart = Math.min(start.row, end.row);
        const rowEnd = Math.max(start.row, end.row);
        const colStart = Math.min(start.col, end.col);
        const colEnd = Math.max(start.col, end.col);

        setTableData(prevData => {
            const updatedData = [...prevData];

            for (let row = rowStart; row <= rowEnd; row++) {
                if (!updatedData[row]) continue;
                updatedData[row] = [...updatedData[row]];

                for (let col = colStart; col <= colEnd; col++) {
                    updatedData[row][col] = ""; // Clear content
                }
            }

            return updatedData;
        });
    }, [mouseSelectRange]);


    // Function to adjust cell height after pasting - optimized with useCallback and debounce
    const adjustAllHeight = useCallback(() => {
        // Create a new debounced function each time to avoid stale closures
        const debouncedAdjust = debounce(() => {
            const textareas = document.querySelectorAll(".table-container textarea");
            textareas.forEach((textarea) => {
                textarea.style.height = "auto"; // Reset height to calculate proper scrollHeight
                textarea.style.height = textarea.scrollHeight + "px"; // Set height based on content
            });
        }, 100);

        // Execute the debounced function
        debouncedAdjust();

        // Return a cleanup function that cancels the debounced call if component unmounts
        return () => debouncedAdjust.cancel();
    }, []);

    // Function to parse and adjust cell references in formulas
    const adjustFormulaReferences = useCallback((formula, sourceRow, targetRow) => {
        if (!formula.startsWith('=')) return formula;

        // Regular expression to find cell references in the format of column index plus row index
        // For example: 4[10] refers to column 4, row 10
        const cellRefRegex = /(\d+)\[(\d+)\]/g;

        return formula.replace(cellRefRegex, (match, colIndex, rowIndex) => {
            // Calculate the row difference
            const rowDiff = targetRow - sourceRow;
            // Adjust the row index, keeping the column index the same
            const newRowIndex = parseInt(rowIndex) + rowDiff;

            // Make sure the new row index is not negative
            const safeRowIndex = Math.max(0, newRowIndex);

            // Return the adjusted cell reference
            return `${colIndex}[${safeRowIndex}]`;
        });
    }, []);


    // Handle pasting data to cell - optimized with useCallback
    const handlePaste = useCallback((event, startRow, startCol) => {
        event.preventDefault();

        const clipboardData = event.clipboardData.getData("text/plain");
        
        // Clean clipboard data to handle quoted strings with internal newlines
        let cleanedClipboardData = clipboardData
            .replace(/\r\n/g, '\n')  // Normalize Windows line endings
            .replace(/\r/g, '\n')    // Handle Mac line endings
            .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1$2"')  // Remove newlines inside quoted strings
            .replace(/\n+$/, '')     // Remove trailing newlines that cause empty rows
        .trim();
        
        const rows = cleanedClipboardData
            .split("\n")
            .map((row) => row.split("\t"))
            .filter(row => row.some(cell => cell != null && cell.trim() !== "")); // Filter empty/whitespace-only rows

        setTableData(prevData => {
            const updatedData = [...prevData];

            rows.forEach((row, i) => {
                const targetRow = startRow + i;
                if (targetRow >= updatedData.length) return;

                updatedData[targetRow] = [...updatedData[targetRow]];

                row.forEach((cell, j) => {
                    const targetCol = startCol + j;
                    if (targetCol < updatedData[targetRow].length) {
                        // Safely handle undefined/null cells
                        const safeCell = cell != null ? String(cell) : "";
                        
                        // Check if the cell contains a formula
                        if (safeCell.trim().startsWith('=')) {
                            // Get the source row (where the formula is being copied from)
                            const sourceRow = mouseSelectRange.start ? mouseSelectRange.start.row : targetRow;
                            // Adjust the formula references
                            const adjustedFormula = adjustFormulaReferences(safeCell.trim(), sourceRow, targetRow);
                            updatedData[targetRow][targetCol] = adjustedFormula;
                        } else {
                            // Clean currency formatting from pasted values for numeric columns
                            let trimmedCell = safeCell.trim();
                            
                            // Special handling for column 3 (SPM numbers) - remove quotes and newlines
                            if (targetCol === 3) {
                                trimmedCell = trimmedCell.replace(/^["']|["']$/g, '').replace(/\n/g, '').trim();
                            }
                            
                            // Apply currency cleaning to numeric columns (exclude columns 0-3, 8, 10, 12, 14, 16, and 18-21)
                            if (!(targetCol >= 0 && targetCol <= 3) && !(targetCol >= 18 && targetCol <= 21) && targetCol !== 8 && targetCol !== 10 && targetCol !== 12 && targetCol !== 14 && targetCol !== 16) {
                                const cleanedValue = cleanCurrencyValue(trimmedCell);
                                // If it's a valid number after cleaning, use the cleaned value, otherwise use original
                                updatedData[targetRow][targetCol] = (!isNaN(cleanedValue) && cleanedValue.trim() !== "") ? cleanedValue : trimmedCell;
                            } else {
                                updatedData[targetRow][targetCol] = trimmedCell;
                            }
                        }
                    }
                    //Auto format pasted values
                    handleCellBlur(targetRow, targetCol, updatedData[targetRow][targetCol]);
                });
            });

            return updatedData;
        });

        // Use the debounced version for better performance
        adjustAllHeight();
    }, [tableData.length, adjustAllHeight, adjustFormulaReferences, mouseSelectRange, handleCellBlur]);

    // Handling keyboard presses - optimized with useCallback
    const handleCellKeyDown = useCallback((event, rowIndex, colIndex) => {
        const numRows = tableData.length;
        // Tab walks the columns actually on screen, which are a subset on the
        // verifikasi table
        const visibleIndex = activeColumns.indexOf(colIndex);

        switch (event.key) {
            case "Enter":
                event.preventDefault();
                evaluateEquation(event.target.value, rowIndex, colIndex);
                handleCellBlur(rowIndex, colIndex, event.target.value);
                setIsFormulaMode(false);
                setCurrentEditableCell(null); 
                setTargetReference(null);
                if (rowIndex < numRows - 1) {
                    focusCell(rowIndex + 1, colIndex);
                }
                break;

            case "Tab":
                event.preventDefault();
                if (isFormulaMode) {
                    evaluateEquation(event.target.value, rowIndex, colIndex);
                    handleCellBlur(rowIndex, colIndex, event.target.value);
                    setIsFormulaMode(false);
                    setCurrentEditableCell(null); 
                    setTargetReference(null);
                }
                if (visibleIndex < activeColumns.length - 1) {
                    focusCell(rowIndex, activeColumns[visibleIndex + 1]);
                } else if (rowIndex < numRows - 1) {
                    focusCell(rowIndex + 1, activeColumns[0]);
                }
                break;

            case "Delete":
                event.preventDefault();
                clearSelectedCells();
                break;

            default:
                break;
        }
    }, [tableData.length, evaluateEquation, isFormulaMode, focusCell, clearSelectedCells, handleCellBlur, activeColumns]);

    // Memoize column totals calculation for better performance
    const calculateColumnTotal = useCallback((columnIndex) => {
        return tableData.reduce((sum, row) => {
            const cellValue = row[columnIndex];

            // Ensure the value is a string before calling replace
            const stringValue = typeof cellValue === "string" ? cellValue : String(cellValue || "0");

            // Remove non-digit characters and convert to number
            const value = parseInt(stringValue.replace(/[^\d]/g, ""), 10);

            return sum + (isNaN(value) ? 0 : value);
        }, 0);
    }, [tableData]);

    // Determining what columns that will accept numbers
    const summableColumns = useMemo(() => ({
        tagihan: 4,
        dpp: 5,
        dppLain: 6,
        ppn: 7,
        pph21: 9,
        pph22: 11,
        pph23: 13,
        pphf: 15,
        terima: 17,
    }), []);

    // Memoize all column totals to prevent recalculation on every render
    const columnTotals = useMemo(() => {
        const totals = {};
        Object.entries(summableColumns).forEach(([key, colIndex]) => {
            totals[key] = calculateColumnTotal(colIndex);
        });
        return totals;
    }, [tableData, summableColumns, calculateColumnTotal]);

    // Handle Popups
    function handlePopup() {
        if (!isPopup) {
            if (nomorSppRequired && nomorSpp.trim() === "") {
                setSppError("Nomor SPP wajib diisi.");
                sppRef.current?.focus();
                return;
            }
            setIsPopup(true);
        } else {
            setIsPopup(false);
        }
    }

    function handleKetentuanPopup() {
        if (!isKetentuan) {
            setIsKetentuan(true);
        } else {
            setIsKetentuan(false);
        }
    }

    // Handle form submits
    async function handleSubmit(event){
        event.preventDefault();
        setIsPopup(false);

        // Grabbing input & select tag values from useState
        const inputArray = [namaPengisi, ajuan, jumlahAjuan, tanggalAjuan, nomorSpp];

        //Handling file upload. Create FormData object
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        }
        if (filePjk) {
            formData.append('filePjk', filePjk);
        }

        // Converting column info into data, then insert in existing tableData.
        // activeColumns is every column on the full table, so this crops nothing there.
        const tableHead = activeColumns.map(colIndex => (!isTabelPenuh && ringkasLabels[colIndex]) || columns[colIndex].label)
        const sendTable = isTanpaTabel ? [] : [tableHead, ...tableData.map(row => activeColumns.map(colIndex => row[colIndex] ?? ""))]

        //Append other data (inputArray, sendTable, user name) into formData
        formData.append('textdata', JSON.stringify(inputArray));
        formData.append('tabledata', JSON.stringify(sendTable));
        formData.append('userdata', user.name);

        // Set loading state
        setIsLoading(true);
        // Sending to backend
        try {
            const response = await apiClient.post('/bendahara/buat-ajuan' , formData, {
                headers:{
                    'Content-Type': 'multipart/form-data',
                }
            })
            if (response.status === 200){
                props.alertMessage("Data berhasil dibuat.")
                props.changeComponent("daftar-pengajuan")
            }
            setIsLoading(false);
        } catch (err) {
            // Handle 401 authentication error
            if (err.response && err.response.status === 401) {
                const errorData = err.response.data;
                if (errorData.redirectToAuth) {
                    // Open Google auth in a new popup window
                    const authWindow = window.open(
                        errorData.authUrl,
                        'googleAuth',
                        'width=500,height=600,scrollbars=yes,resizable=yes'
                    );
                    
                    // Listen for auth completion
                    const checkAuthComplete = setInterval(() => {
                        try {
                            // Check if popup is closed (user completed auth)
                            if (authWindow.closed) {
                                clearInterval(checkAuthComplete);
                                // Wait a moment then retry the original request
                                setTimeout(() => {
                                    handleSubmit(event);
                                }, 500);
                                return;
                            }
                        } catch (error) {
                            // Cross-origin error, ignore
                        }
                    }, 1000);
                    
                    // Also listen for window message (better method)
                    const messageListener = (event) => {
                        if (event.data === 'oauth-success') {
                            clearInterval(checkAuthComplete);
                            window.removeEventListener('message', messageListener);
                            authWindow.close();
                            setTimeout(() => {
                                handleSubmit(event);
                            }, 500);
                        }
                    };
                    window.addEventListener('message', messageListener);
                    
                    return;
                }
            }
            console.log("Failed to send data.", err)
            setIsLoading(false);
        }
    }

    //Handle form submits when editing
    async function handleSubmitEdit(event){
        event.preventDefault();
        setIsPopup(false);

        const finalNama = namaPengisi === "" ? props.passedData[1] : namaPengisi;
        const finalJumlah = jumlahAjuan === "" ? props.passedData[3] : jumlahAjuan;

        // Input Array data fill
        if (namaPengisi === "") {
            setNamaPengisi(finalNama);
        }
        if (jumlahAjuan === "") {
            setJumlahAjuan(finalJumlah);
        }


        const inputArray = [finalNama, ajuan, finalJumlah, tanggalAjuan];

        console.log(inputArray);
        console.log(props.passedData);

        //Handling file upload. Create FormData object
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        }
        if (filePjk) {
            formData.append('filePjk', filePjk);
        }
        if (removePjk && !filePjk) {
            formData.append('removePjk', 'true');
        }


        // Converting column info into data, then insert in existing tableData. Cropped to
        // the flow's own columns the same way a new pengajuan is.
        const tableHead = activeColumns.map(colIndex => (!isTabelPenuh && ringkasLabels[colIndex]) || columns[colIndex].label)
        const sendTable = isTanpaTabel ? [] : [tableHead, ...tableData.map(row => activeColumns.map(colIndex => row[colIndex] ?? ""))]
        const antriPosition = parseInt(props.passedData[5]);


        // Append to formData and send to backend
        formData.append('textdata', JSON.stringify(inputArray));
        formData.append('tabledata', JSON.stringify(sendTable));
        formData.append('tablePosition', JSON.stringify(keywordRowPos));
        formData.append('antriPosition', JSON.stringify(antriPosition));
        formData.append('lastTableEndRow', JSON.stringify(keywordEndRow));
        formData.append('flow', rowFlow);
        if (!isTabelPenuh) {
            formData.append('nomorSpp', nomorSpp);
        }

        try {
            setIsLoading(true);
            const response = await apiClient.patch('/bendahara/edit-table', formData, {
                headers:{
                    'Content-Type': 'multipart/form-data',
                }
            })
            if (response.status === 200){
                // The row saves even if deleting the PJK from Drive did not - say so rather
                // than reporting a clean success
                props.alertMessage(response.data?.warning
                    ? response.data.message
                    : "Data berhasil diubah.");
                props.changeComponent(props.fallbackTo);
            }
            setIsLoading(false);
        } catch (err) {
            // Handle 401 authentication error
            if (err.response && err.response.status === 401) {
                const errorData = err.response.data;
                if (errorData.redirectToAuth) {
                    // Open Google auth in a new popup window
                    const authWindow = window.open(
                        errorData.authUrl,
                        'googleAuth',
                        'width=500,height=600,scrollbars=yes,resizable=yes'
                    );

                    // Listen for auth completion
                    const checkAuthComplete = setInterval(() => {
                        try {
                            // Check if popup is closed (user completed auth)
                            if (authWindow.closed) {
                                clearInterval(checkAuthComplete);
                                // Wait a moment then retry the original request
                                setTimeout(() => {
                                    handleSubmitEdit(event);
                                }, 500);
                                return;
                            }
                        } catch (error) {
                            // Cross-origin error, ignore
                        }
                    }, 1000);

                    // Also listen for window message (better method)
                    const messageListener = (event) => {
                        if (event.data === 'oauth-success') {
                            clearInterval(checkAuthComplete);
                            window.removeEventListener('message', messageListener);
                            authWindow.close();
                            setTimeout(() => {
                                handleSubmitEdit(event);
                            }, 500);
                        }
                    };
                    window.addEventListener('message', messageListener);

                    return;
                }
            }
            console.log("Failed to send data.", err)
            setIsLoading(false);
        }
    }
    // Memoize the table component to prevent unnecessary re-renders
    const TableComponent = useMemo(() => {
        return (
            <React.Fragment>
                <TableContainer className="table-container" sx={{maxHeight: 950, border:"2px solid rgb(236, 236, 236)"}}>
                    <Table stickyHeader aria-label="sticky table">
                        <TableHead className="table-head">
                            <TableRow className="table-row">
                                {activeColumns.map((colIndex) => (
                                    <TableCell className="table-cell head-data" key={columns[colIndex].id} sx={{fontWeight: "bold", minWidth: columns[colIndex].minWidth, backgroundColor: "#00449C", color: "white", border: "none"}} align="center">{ringkasLabels[colIndex] && !isTabelPenuh ? ringkasLabels[colIndex] : columns[colIndex].label}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {/* Render rows directly without FixedSizeList to avoid DOM nesting issues */}
                            {tableData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, rowIndex) => {
                                const actualRowIndex = page * rowsPerPage + rowIndex;
                                return (
                                    <TableRow key={actualRowIndex}>
                                        {activeColumns.map((colIndex) => (
                                            <TableCell className={`table-cell ${isCellSelected(actualRowIndex, colIndex) ? "selected-cell" : ""}`}
                                                key={colIndex}
                                                data-row={actualRowIndex}
                                                data-col={colIndex}
                                                onMouseDown={()=>handleCellMouseDown(actualRowIndex, colIndex)}
                                                onMouseOver={()=>handleCellMouseOver(actualRowIndex, colIndex)}
                                                onClick={() => {
                                                    setTargetReference({ row: actualRowIndex, col: colIndex });
                                                    handleCellClick(actualRowIndex, colIndex);
                                                }}
                                                sx={{minHeight:20, minWidth: columns[colIndex].minWidth, padding:"8px"}}
                                                align={colIndex === 0 ? "center" : "left"}>
                                                <textarea
                                                    ref={(el) => (textAreaRefs.current[actualRowIndex * row.length + colIndex] = el)}
                                                    className={`${isCellSelected(actualRowIndex, colIndex) ? "selected-cell" : ""}`}
                                                    value={row[colIndex] ?? ""}
                                                    data-row={actualRowIndex}
                                                    data-col={colIndex}
                                                    onChange={(input) => handleCellChange(actualRowIndex, colIndex, input.target.value, input.target)}
                                                    onBlur={(input) => handleCellBlur(actualRowIndex, colIndex, input.target.value)}
                                                    onKeyDown={(event) => handleCellKeyDown(event, actualRowIndex, colIndex)}
                                                    onPaste={(event) => handlePaste(event, actualRowIndex, colIndex)}
                                                    readOnly={componentType == "lihat"}
                                                />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                {activeColumns.map((colIndex) => (
                                    <TableCell className="table-footer-cell" key={colIndex}>
                                        {Object.values(summableColumns).includes(colIndex) ?
                                            numberFormats(
                                                columnTotals[
                                                    Object.keys(summableColumns).find(key =>
                                                        summableColumns[key] === colIndex
                                                    )
                                                ].toString()
                                            ) : ""}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableFooter>
                    </Table>
                </TableContainer>

                {/* Add pagination controls */}
                {isTabelPenuh && <TablePagination
                    rowsPerPageOptions={[10, 25, 50, 100]}
                    component="div"
                    count={tableData.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                />}
            </React.Fragment>
        );
    }, [
        tableData,
        page,
        rowsPerPage,
        columns,
        summableColumns,
        columnTotals,
        isCellSelected,
        handleCellMouseDown,
        handleCellMouseOver,
        handleCellClick,
        handleCellChange,
        handleCellBlur,
        handleCellKeyDown,
        handlePaste,
        componentType,
        setPage,
        setRowsPerPage,
        setTargetReference,
        numberFormats,
        activeColumns,
        isTabelPenuh
    ]);

    return (
        <div className={`buat-pengajuan bg-card${isBuat ? "" : " buat-pengajuan-detail"}`} onMouseUp={handleCellMouseUp}>
            {componentType === "buat" ? (
            <div className="pengajuan-desc">
                <p>Ketentuan Pengajuan Pencairan GUP/TUP (Wajib Dibaca!):</p>
                <button onClick={handleKetentuanPopup}>Baca Ketentuan</button>
            </div> )
            :
            (props.passedData && (<div className="ajuan-info">
                <span className="ajuan-info-label">Status Pengajuan:</span>
                <span className="ajuan-info-status" style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}>
                    {props.passedData[8] || "\u2014"}
                </span>
                <span className="ajuan-info-label">Catatan Bendahara:</span>
                <p className="ajuan-info-catatan">{catatanBendahara || "\u2014"}</p>
                <span className="ajuan-info-label">Catatan Verifikator PJK:</span>
                <p className="ajuan-info-catatan">{catatanPjk || "\u2014"}</p>
            </div>))
            }
            <div className="pengajuan-content">
                <form className="pengajuan-form" onSubmit={componentType === "buat" ? handleSubmit : handleSubmitEdit}>
                    <div className="pengajuan-form-textdata">
                        <label htmlFor="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name" name="nama-pengisi" value={namaPengisi}
                            readOnly={componentType === "lihat"}
                            onChange={(e) => setNamaPengisi(e.target.value)}
                            placeholder={componentType === "buat"? null : (props.passedData && props.passedData[1]) }
                            required/>
                        <label htmlFor="ajuan">Jenis Pengajuan:</label>
                        {componentType === "buat" ?
                        <select name="ajuan" id="ajuan" value={ajuan} onChange={(e) => setAjuan(e.target.value)}>
                            {jenisOptions.map((jenis) => (
                                <option key={jenis.value} value={jenis.value}>{jenis.label}</option>
                            ))}
                        </select>
                        :
                        // GUP and PTUP can still be swapped for each other. Every other jenis is
                        // fixed: switching it would move the row to the other flow's sheets.
                        (props.passedData && (<select name="ajuan" id="ajuan" value={ajuan} onChange={(e) => setAjuan(e.target.value)} disabled={componentType === "lihat" || rowFlow !== "gup"}>
                            {rowFlow === "gup"
                                ? ["gup", "ptup"].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)
                                : <option value={ajuan}>{String(props.passedData[2]).toUpperCase()}</option>}
                        </select>))
                        }
                        <label htmlFor="aju-number">Jumlah Total Pengajuan:</label>
                        <input type="text" id="aju-number" placeholder={componentType === "buat"? "Di isi angka" : (props.passedData && props.passedData[3])} name="jumlah-ajuan"
                            value={jumlahAjuan}
                            onChange={handleJumlahChange}
                            readOnly={componentType === "lihat"}
                            required/>
                        {!isTabelPenuh && <>
                        <label htmlFor="aju-spp">Nomor SPP:</label>
                        <input type="text" id="aju-spp" name="nomor-spp" value={nomorSpp} ref={sppRef}
                            readOnly={componentType === "lihat"}
                            onChange={(e) => { setNomorSpp(e.target.value); setSppError(""); }}
                            aria-invalid={sppError ? "true" : undefined}
                            aria-describedby={sppError ? "aju-spp-error" : undefined}
                            required={nomorSppRequired}/>
                        </>}
                        {isTabelPenuh && <>
                        <label htmlFor="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date" name="tanggal-ajuan" className="pengajuan-date"
                            readOnly={componentType === "lihat"}
                            value={tanggalAjuan}
                            onChange={(e)=>setTanggalAjuan(e.target.value)}/>
                        </>}
                    </div>
                    {nomorSppRequired && sppError ?
                        <p id="aju-spp-error" className="pengajuan-form-error" role="alert">{sppError}</p> : null}
                    <br/>
                    <div className="pengajuan-form-tabledata">
                        <div className="pengajuan-form-tableinfo">
                            <p>Input Data Pengajuan</p>
                            {isTabelPenuh && <>
                            <label>Tentukan Jumlah Row Tabel:</label>
                            <input type="number" value={rowNum > 0 ? rowNum : ""}
                                onChange={handleRowChange} onBlur={handleRowBlur}
                                readOnly={componentType === "lihat"} min="0"
                                disabled={lockRow}
                            />
                            <div className="table-lock" onClick={() => setLockRow(!lockRow)}>
                                {lockRow === false ? <LockOpenIcon fontSize={"medium"} /> : <LockIcon fontSize={"medium"} />}
                            </div>
                            </>}
                            {componentType !== "buat" && (bupotLink || pjkLink) ?
                                <div className={"pengajuan-form-tableinfo-message"}>
                                    {bupotLink ? <p>Bupot: <a href={bupotLink} target={"_blank"} rel="noopener noreferrer" >Klik Disini</a></p> : null}
                                    {pjkLink ?
                                        <p>PJK: {removePjk
                                            ? <span style={{textDecoration: "line-through"}}>Klik Disini</span>
                                            : <a href={pjkLink} target={"_blank"} rel="noopener noreferrer" >Klik Disini</a>}
                                            {/* Replacing supersedes removing, so the control hides once a new file is picked */}
                                            {componentType === "edit" && !filePjk ?
                                                <DeleteForeverIcon
                                                    titleAccess={removePjk ? "Batalkan hapus PJK" : "Hapus PJK"}
                                                    sx={{fontSize: 20, marginLeft: "6px", verticalAlign: "middle", cursor: "pointer",
                                                        color: removePjk ? "#6c757d" : "#BD1404"}}
                                                    onClick={() => setRemovePjk(!removePjk)}/>
                                                : null}
                                        </p> : null}
                                    {removePjk ? <p style={{color: "#BD1404"}}>Berkas PJK akan dihapus saat perubahan disimpan.</p> : null}
                                </div> : null}
                        </div>
                        {showUploadGroup &&
                            <div className="upload-btn-group">
                                {isTabelPenuh && <UploadButton title={"Bupot"} onFileSelect={setFile}/>}
                                {/* Uploading again replaces the stored link - also on edit, where the
                                    PJK of a GUP/PTUP pengajuan lands on its mirror row */}
                                {canUploadPjk && <UploadButton title={"PJK"} onFileSelect={setFilePjk} accept={"application/pdf"} maxSizeMb={100}/>}
                            </div>
                        }
                        {isTanpaTabel ? null : (isLoading2 ? <LoadingAnimate /> : TableComponent)}
                    </div>
                    {componentType === "buat" ?
                    <div className="form-submit">
                        <SubmitButton value="Kirim Pengajuan" name="submit-all" onClick={handlePopup}/>
                    </div>
                    :
                    <div className="form-submit">
                        <SubmitButton value="Kembali Ke Daftar" name="submit-all" onClick={ 
                           props.invisible && props.invisible(props.fallbackTo, props.passedData)
                        }/>
                        <SubmitButton value="Simpan Perubahan" name="submit-all" onClick={handlePopup} hidden={componentType === "lihat"}/>
                    </div>    
                        }
                </form>
            </div>
            {isKetentuan && (<Popup whenClick={() => setIsKetentuan(false)} type="ketentuan-bendahara"/>)}
            {isPopup && (<Popup whenClick={componentType === "buat"? handleSubmit : handleSubmitEdit} cancel={handlePopup} type="submit"/>)}
            {isLoading && <LoadingScreen />}
        </div>
    )
}

//Proptypes
BuatPengajuan.propTypes = {
    passedData: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number
    ])),
    type: PropTypes.string,
    changeComponent: PropTypes.func,
    alertMessage: PropTypes.func,
    invisible: PropTypes.func,
    fallbackTo: PropTypes.string,
};

export default BuatPengajuan;
