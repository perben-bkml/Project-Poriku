// SPP may have an A/T suffix and multiple numbers separated by commas or ampersands.
export function pjkSpmFromSpp(value) {
    const parts = String(value ?? "").trim().split(/[,&]/);
    const matches = parts.map(part => part.trim().match(/^(\d{1,5})\s*[AT]?$/i));
    return matches.every(Boolean)
        ? [...new Set(matches.map(match => `${match[1].padStart(5, "0")}A`))].join(', ')
        : "";
}

// Return only missing cells: existing SPMs (including formulas) belong to the sheet.
export function missingPjkSpmWrites(rows, { sheet, sppColumn = 'G', spmColumn = 'H', startRow = 3 }) {
    const sppIndex = sppColumn.charCodeAt(0) - 65;
    const spmIndex = spmColumn.charCodeAt(0) - 65;
    return rows.flatMap((row, index) => {
        const spm = pjkSpmFromSpp(row[sppIndex]);
        return String(row[0] ?? "").trim() && !String(row[spmIndex] ?? "").trim() && spm
            ? [{range: `'${sheet}'!${spmColumn}${startRow + index}`, values: [[spm]]}]
            : [];
    });
}
