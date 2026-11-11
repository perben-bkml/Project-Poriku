import {createHash} from 'node:crypto';

export const AKSI_BP_LOG_SHEET='_PORIKU_AKSI_BP';
export const AKSI_BP_LOG_HEAD=['SUMBER','SHEET_BP','SPM','NOMINAL','RINCIAN'];
export const aksiBpError=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export const aksiSpmKey=value=>String(value ?? '').replace(/\D/g,'').replace(/^0+/,'');
const integer=value=>{
    const n=Number(value);
    if (!Number.isSafeInteger(n) || n<0) throw aksiBpError('Nominal Pembayaran BP harus rupiah bulat, tidak negatif, dan dalam batas ketelitian aplikasi.');
    return n;
};
export const aksiBpSource=(year,spreadsheetId,transId)=>JSON.stringify([String(year),spreadsheetId,String(transId)]);

export function aksiLegacyGroups(previousSpm,paid,monitoringRows,parseMoney) {
    const groups=new Map();
    if (!paid) return groups;
    const keys=[...new Set(String(previousSpm || '').split(/[,&]/).map(aksiSpmKey).filter(Boolean))];
    if (keys.length && !monitoringRows.length) throw aksiBpError('Rincian DRPP lama tidak ditemukan untuk SPM yang sudah dibayar. Periksa data lama sebelum menambahkan nominal.',409);
    for (const row of monitoringRows) {
        const value=integer(parseMoney(row.nominal));
        const spm=keys.length===1 ? keys[0] : aksiSpmKey(row.spp);
        if (!keys.includes(spm)) throw aksiBpError('SPM lama tidak dapat dipasangkan dengan rincian DRPP. Periksa Nomor SPP/SPM sebelum menyimpan.',409);
        groups.set(spm,integer((groups.get(spm) || 0)+value));
    }
    return groups;
}

export function parseAksiBpLog(values,sheetId) {
    if (sheetId===null || sheetId===undefined) return [];
    if (AKSI_BP_LOG_HEAD.slice(0,4).some((head,i)=>values[0]?.[i]!==head))
        throw aksiBpError('Format catatan kontribusi Pembayaran BP tidak sesuai. Hubungi administrator.',409);
    const seen=new Set();
    return values.slice(1).flatMap((row,i)=>{
        if (!row.some(v=>String(v ?? '').trim())) return [];
        const source=String(row[0] || ''), target=Number(row[1]), spm=aksiSpmKey(row[2]);
        if (!source || !Number.isInteger(target) || target<0 || !spm || row[3]===undefined || row[3]==='')
            throw aksiBpError('Ada catatan kontribusi Pembayaran BP yang tidak lengkap.',409);
        const key=JSON.stringify([source,target,spm]);
        if (seen.has(key)) throw aksiBpError('Ada catatan kontribusi SPM ganda. Hubungi administrator.',409);
        seen.add(key);
        let details=[];
        try {details=row[4] ? JSON.parse(String(row[4])) : [];} catch {throw aksiBpError('Rincian catatan kontribusi SPM tidak dapat dibaca.',409);}
        if (!Array.isArray(details) || details.some(d=>!d || typeof d.drpp!=='string' || typeof d.spp!=='string' || typeof d.spm!=='string' || d.nominal!==undefined && typeof d.nominal!=='string'))
            throw aksiBpError('Format rincian catatan kontribusi SPM tidak sesuai.',409);
        return [{source,sheetId:target,spm,nominal:integer(row[3]),details,row:i+2}];
    });
}

// existing + (new contribution - previously recorded contribution), never existing +
// the full request again. The log is updated in the same Sheets batch as the amount.
export function planAksiBp({source,sheetId,groups,legacy,payments,log,logNextRow,tanggalSp2d,details=new Map()}) {
    const own=new Map(log.filter(r=>r.source===source && r.sheetId===sheetId).map(r=>[r.spm,r]));
    const touched=[...new Set([...groups.keys(),...[...own.values()].filter(r=>r.nominal>0).map(r=>r.spm),...legacy.keys()])].sort();
    const changes=[],registrations=[],contributions=[],additions=[];
    let nextRow=logNextRow;
    for (const spm of touched) {
        const matching=payments.filter(row=>row.spm===spm);
        if (matching.length>1) throw aksiBpError(`Nomor SPM ${spm.padStart(5,'0')} ditemukan pada beberapa baris Pembayaran BP. Rapikan data ganda terlebih dahulu.`,409);
        const known=matching[0], entry=own.get(spm);
        const desired=integer(groups.get(spm) || 0);
        const previous=entry ? entry.nominal : known ? integer(legacy.get(spm) || 0) : 0;
        if (!known && log.some(r=>r.sheetId===sheetId && r.spm===spm && r.nominal>0))
            throw aksiBpError(`Data SPM ${spm.padStart(5,'0')} pernah dicatat tetapi baris Pembayaran BP tidak ditemukan. Periksa perubahan langsung pada sheet.`,409);
        const current=known ? integer(known.nominal) : 0;
        if (current<previous) throw aksiBpError(`Nilai SPM ${spm.padStart(5,'0')} di Pembayaran BP lebih kecil daripada kontribusi sebelumnya. Periksa perubahan nominal terlebih dahulu.`,409);
        const total=integer(current+desired-previous);
        if (!entry && !desired && !previous) continue;
        const row=entry?.row || nextRow++;
        const nextDetails=details.get(spm) || [];
        if (JSON.stringify(nextDetails).length>40000) throw aksiBpError('Rincian DRPP untuk satu SPM terlalu panjang. Ringkas rincian sebelum menyimpan.');
        if (!entry) registrations.push({source,sheetId,spm,nominal:previous,details:[],row});
        if (desired!==previous || JSON.stringify(entry?.details || [])!==JSON.stringify(nextDetails)) contributions.push({source,sheetId,spm,nominal:desired,details:nextDetails,row});
        if (known && total!==current || !known && desired>0) changes.push({spm,row:known?.row || null,nominal:total,previous:current});
        if (known && desired>previous) additions.push({spm:spm.padStart(5,'0'),existing:current,increase:desired-previous,total});
    }
    const token=createHash('sha256').update(JSON.stringify({source,sheetId,tanggalSp2d,
        groups:[...groups].sort(),legacy:[...legacy].sort(),
        payments:payments.filter(p=>touched.includes(p.spm)),own:[...own.values()].filter(r=>touched.includes(r.spm)),changes,registrations,contributions})).digest('hex');
    return {token,changes,registrations,contributions,additions};
}

export function aksiBpLogRequests(sheetId,rows) {
    return rows.map(row=>({updateCells:{range:{sheetId,startRowIndex:row.row-1,endRowIndex:row.row,startColumnIndex:0,endColumnIndex:5},
        rows:[{values:[{userEnteredValue:{stringValue:row.source}},{userEnteredValue:{numberValue:row.sheetId}},
            {userEnteredValue:{stringValue:row.spm}},{userEnteredValue:{numberValue:row.nominal}},
            {userEnteredValue:{stringValue:JSON.stringify(row.details || [])}}]}],fields:'userEnteredValue'}}));
}

export function aksiBpMoveLog(snapshot,from,to=null) {
    const records=snapshot.log.filter(r=>r.sheetId===snapshot.sheetId && r.spm===from);
    if (!records.length || from===to) return [];
    if (to && snapshot.payments.some(p=>p.spm===to)) throw aksiBpError('Nomor SPM tujuan sudah ada. Gunakan nomor yang berbeda agar kontribusi pengajuan tidak tercampur.',409);
    const changes=records.map(r=>({...r,nominal:0,details:[]}));
    let next=snapshot.logNextRow;
    if (to) for (const record of records) {
        const existing=snapshot.log.find(r=>r.source===record.source && r.sheetId===record.sheetId && r.spm===to);
        if (existing?.nominal>0) throw aksiBpError('SPM tujuan memiliki kontribusi yang belum diselesaikan.',409);
        changes.push({...record,spm:to,row:existing?.row || next++,details:record.details.map(d=>({...d,spm:to.padStart(5,'0')}))});
    }
    return aksiBpLogRequests(snapshot.trackingId,changes);
}
