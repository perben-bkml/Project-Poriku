
// Buat-Pengajuan.jsx
//Number format generator
export function numberFormats(num) {
    if (!num) {
        return "";
    } else {
        return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    }
}
//Managing "Jumlah Row Table" input handler
export function buatHandleRowChange(event, setRowNum) {
    const userRowValue = parseInt(event.target.value)
    setRowNum(userRowValue);
}

export function buatHandleRowBlur(event, setRowNum, tableData, emptyCell, setTableData) {
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