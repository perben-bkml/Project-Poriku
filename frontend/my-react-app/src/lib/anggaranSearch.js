// Build once per API snapshot, instead of allocating/lowercasing strings on each keystroke.
export function buatIndeksAnggaran(units) {
    return units.map(unit => ({unit, mak: unit.mak.map(item => {
        const text = `${item.kode ?? ''} ${item.uraian ?? ''}`.toLowerCase();
        return {item, text, akun: item.akun.map(account => ({account,
            text: `${text} ${account.kode ?? ''} ${account.uraian ?? ''}`.toLowerCase(),
        }))};
    })}));
}

// Filter branches without recalculating their financial totals or mutating API data.
export function cariAnggaranPohon(units, query, index) {
    const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return units;
    const matches = text => terms.every(term => text.includes(term));
    return (index || buatIndeksAnggaran(units)).flatMap(({unit, mak: indexedMak}) => {
        const mak = indexedMak.flatMap(({item, text, akun: indexedAkun}) => {
            // A MAK/description match retains its complete account breakdown.
            if (matches(text)) return [item];
            const akun = indexedAkun.filter(account => matches(account.text)).map(({account}) => account);
            return akun.length ? [{...item, akun}] : [];
        });
        return mak.length ? [{...unit, mak}] : [];
    });
}

// Page by MAK rather than Unit Kerja: broad matches must not mount the entire tree.
export function halamanAnggaran(units, page, limit) {
    const start = (page - 1) * limit;
    const end = start + limit;
    let offset = 0;
    const result = [];
    for (const unit of units) {
        const mak = unit.mak.slice(Math.max(0, start - offset), Math.max(0, end - offset));
        if (mak.length) result.push({...unit, mak});
        offset += unit.mak.length;
        if (offset >= end) break;
    }
    return result;
}
// Derive warnings before filtering/paging, so hidden accounts cannot hide a parent's alert.
export function tandaiPaguMinus(units) {
    return units.map(unit => {
        const mak = unit.mak.map(item => ({...item,
            adaPaguMinus: !item.luarPagu && item.akun.some(account =>
                !account.takDirinci && !account.luarPagu && Number.isFinite(account.sisa) && account.sisa < 0),
        }));
        return {...unit, mak, adaPaguMinus: mak.some(item => item.adaPaguMinus)};
    });
}

