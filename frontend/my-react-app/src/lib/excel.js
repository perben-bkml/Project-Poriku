// The library is loaded on demand so Vite keeps it in its own chunk: only someone who
// presses an export button ever downloads it, and the main bundle stays as it was.
export async function unduhExcel(namaFile, head, baris, lebar = []) {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const header = head.map(label => ({ value: String(label ?? ""), fontWeight: 'bold' }));
    await writeExcelFile([header, ...baris], {
        columns: head.map((_, index) => ({ width: lebar[index] || 16 })),
        stickyRowsCount: 1,
    }).toFile(namaFile);
}

// Sheets hands back the value as the sheet displays it, so a rupiah cell arrives as
// "3.500.000". Excel can only sum it as a real number, but a value carrying a decimal
// comma would be multiplied by 100 if the separators were simply stripped, so that one
// stays text rather than being silently altered.
export const selAngka = (teks) => {
    const nilai = String(teks ?? "");
    const angka = nilai.replace(/\D/g, "");
    return angka && !nilai.includes(",")
        ? { value: Number(angka), type: Number, format: '#,##0' }
        : { value: nilai, type: String };
};

// '@' declares the cell as Text, or Excel reads Nomor SPP "00041" back as 41 - the same
// zero padding trap RAW guards against on the sheet side.
export const selTeks = (teks, apaAdanya = false) => ({
    value: String(teks ?? ""),
    type: String,
    ...(apaAdanya ? { format: '@' } : {}),
});
