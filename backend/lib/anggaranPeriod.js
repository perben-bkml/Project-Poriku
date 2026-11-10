import {createHash} from 'node:crypto';
import {anggaranSpmSnapshot, bacaRincianSpm, parseSpmDetailQuery, pilihLingkupSpm, spmDetailError} from './anggaranSpm.js';

export const unitKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
export function periodDate(value) {
    if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
    const text = value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0,10) === text ? text : null;
}
export function periodRange(tahun, mulai, akhir, today) {
    if (!periodDate(mulai) || !periodDate(akhir) || mulai > akhir || akhir > today
        || !mulai.startsWith(`${tahun}-`) || !akhir.startsWith(`${tahun}-`))
        throw spmDetailError('Rentang tanggal harus valid, dalam tahun terpilih, dan tidak melewati hari ini.');
    return {mulai,akhir};
}
const amount = value => {
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw spmDetailError('Nominal melebihi ketelitian rupiah aplikasi.',422);
    return n;
};
const rowKey = row => `${row.unitKerjaKunci}|${row.kodeMak}|${row.kodeAkun}`;

// Use current eligible transactions and current budget ownership. An opening balance has
// no daily breakdown: include it in period spending only when the full opening period is covered.
export function periodAggregates(rows, override, {tahun,mulai,akhir}) {
    const cutoff = periodDate(override?.tanggal_batas);
    if (override && !cutoff) throw spmDetailError('Tanggal batas override Realisasi tidak valid.',422);
    const includeOpening = Boolean(cutoff && mulai === `${tahun}-01-01` && akhir >= cutoff);
    const includeCumulativeOpening = Boolean(cutoff && akhir >= cutoff);
    const period = new Map(), cumulative = new Map();
    const add = (map, key, realisasi=0, komitmen=0, dariAwal=0) => {
        const id=rowKey(key), target=map.get(id) || {...key,realisasi:0,komitmen:0,dariAwal:0,baris:0};
        target.realisasi=amount(target.realisasi+realisasi);
        target.komitmen=amount(target.komitmen+komitmen);
        target.dariAwal=amount(target.dariAwal+dariAwal);target.baris++;
        map.set(id,target);
    };
    let undated=0;
    for (const row of rows) {
        const key={unitKerjaKunci:row.unit_kerja_kunci,kodeMak:row.kode_mak,kodeAkun:row.kode_akun};
        const value=amount(row.nominal);
        add(period,key);add(cumulative,key);
        if (!row.sudah_sp2d) {add(period,key,0,value);add(cumulative,key,0,value);continue;}
        const date=periodDate(row.tanggal_pengakuan);
        if (!date || !date.startsWith(`${tahun}-`)) {undated++;continue;}
        if (date>=mulai && date<=akhir && (!includeOpening || date>cutoff)) add(period,key,value);
        if (date<=akhir && (!includeCumulativeOpening || date>cutoff)) add(cumulative,key,value);
    }
    for (const row of override?.baris || []) {
        const key={unitKerjaKunci:row.unit_kerja_kunci,kodeMak:row.kode_mak,kodeAkun:row.kode_akun};
        const value=amount(row.nominal);
        if (includeOpening) add(period,key,value,0,value);
        if (includeCumulativeOpening) add(cumulative,key,value,0,value);
    }
    // Keep zero-valued branches needed for cumulative spending and current Outstanding.
    for (const row of cumulative.values()) if (!period.has(rowKey(row))) add(period,{
        unitKerjaKunci:row.unitKerjaKunci,kodeMak:row.kodeMak,kodeAkun:row.kodeAkun,
    });
    return {period:[...period.values()],cumulative:[...cumulative.values()],includeOpening,cutoff,undated,
        periodPartial:Boolean(undated || cutoff && mulai<=cutoff && !includeOpening),
        cumulativePartial:Boolean(undated || cutoff && akhir<cutoff)};
}

export function attachCumulative(period, cumulative, incomplete) {
    const attach=(row,other) => ({...row,realisasiKumulatif:incomplete ? null : other?.realisasi || 0,
        sisa:incomplete || row.pagu===null ? null : row.pagu-(other?.realisasi || 0)});
    return period.map(unit=>{
        const total=cumulative.find(u=>unitKey(u.unitKerja)===unitKey(unit.unitKerja));
        return {...attach(unit,total),mak:unit.mak.map(mak=>{
            const other=total?.mak.find(m=>m.kode===mak.kode);
            return {...attach(mak,other),akun:mak.akun.map(a=>attach(a,other?.akun.find(v=>v.kode===a.kode)))};
        })};
    });
}

export function registerAnggaranPeriod(app,deps) {
    const {sql,yearOf,today,readActive,readTree,readOverride,readSync,classify,renderTree,normalizeMak}=deps;
    const route=(path,handler)=>app.get(path,async(req,res)=>{
        try {await handler(req,res);} catch(error) {
            if (!error.statusCode) console.error('Anggaran periode:',error.code || error.message);
            res.status(error.statusCode || 500).json({message:error.statusCode ? error.message : 'Gagal memuat laporan periode.'});
        }
    });
    function range(req) {
        const tahun=yearOf(req);
        if (!tahun) throw spmDetailError('Tahun tidak valid.');
        return {tahun,...periodRange(tahun,req.query.mulai,req.query.akhir,today())};
    }
    async function read(db,req) {
        const dates=range(req), {tahun}=dates;
        const revisi=await readActive(tahun,db);
        if (!revisi) throw spmDetailError('Belum ada revisi anggaran aktif untuk tahun ini.',404);
        const units=await readTree(revisi.id,db), override=await readOverride(tahun,db), sync=await readSync(tahun,db);
        const sourceSnapshot=anggaranSpmSnapshot(tahun,revisi,sync,override);
        if (!sourceSnapshot) throw spmDetailError('Data Realisasi belum siap. Muat ulang Anggaran atau Segarkan Realisasi.',409);
        const rows=await db`SELECT unit_kerja_kunci,kode_mak,kode_akun,nominal,sudah_sp2d,tanggal_pengakuan
            FROM anggaran_realisasi_baris WHERE tahun=${tahun}`;
        const aggregate=periodAggregates(rows,override,dates);
        let belanja=classify(units,aggregate.period), cumulative=classify(units,aggregate.cumulative), scoped=units;
        const requested=String(req.query.unitKerja || '').trim();
        if (requested.length>200) throw spmDetailError('Unit Kerja tidak valid.');
        if (req.viewer.role==='user' && requested && unitKey(requested)!==unitKey(req.viewer.name))
            throw spmDetailError('Akses Unit Kerja ditolak.',403);
        const key=req.viewer.role==='user' ? unitKey(req.viewer.name) : unitKey(requested);
        if (key) {
            if (!units.has(key)) throw spmDetailError('Unit Kerja tidak ada pada revisi terbaru.',404);
            scoped=new Map([...units].filter(([k])=>k===key));
            const visible=([,row])=>row.unitKerjaKunci===key || row.dibebankanKe===key;
            belanja=new Map([...belanja].filter(visible));cumulative=new Map([...cumulative].filter(visible));
        }
        const sourceIssues=Object.values(sync.detail_peringatan || {}).some(v=>Number(v)>0);
        const periodPartial=aggregate.periodPartial || sourceIssues;
        const cumulativePartial=aggregate.cumulativePartial || sourceIssues;
        const view=renderTree(scoped,belanja), cumView=renderTree(scoped,cumulative);
        const anggaran=attachCumulative(view.anggaran,cumView.anggaran,cumulativePartial);
        const snapshot=createHash('sha256').update(JSON.stringify(['latest-pagu',sourceSnapshot,dates])).digest('hex');
        const notes=['Pagu selalu memakai revisi aktif terbaru. Realisasi difilter berdasarkan tanggal pengakuan (GUP/PTUP: SP2D; verifikasi: tanggal verifikasi atau SP2D).',
            'Sisa dan % memakai Realisasi kumulatif 1 Januari sampai tanggal akhir. Outstanding menunjukkan posisi saat ini, tanpa filter tanggal.'];
        if (aggregate.includeOpening) notes.push(`Saldo override s.d. ${aggregate.cutoff} disertakan sekali karena rentang mencakup seluruh periode saldo awal; saldo ini tidak memiliki rincian SPM.`);
        else if (aggregate.cutoff && dates.mulai<=aggregate.cutoff) notes.push(`Saldo override s.d. ${aggregate.cutoff} tidak dapat dipecah per tanggal. Realisasi periode hanya menampilkan transaksi bertanggal yang tersedia dan dapat belum lengkap.`);
        if (aggregate.undated) notes.push(`${aggregate.undated} alokasi Realisasi tidak memiliki tanggal pengakuan valid dan tidak masuk filter tanggal.`);
        if (sourceIssues) notes.push('Ada catatan kualitas sumber. Nilai periode dapat belum lengkap.');
        if (view.tidakDikenal.length) notes.push(`${view.tidakDikenal.length} alokasi belum cocok dengan MAK/Unit pada revisi terbaru dan tidak masuk total anggaran.`);
        if (cumulativePartial) notes.push('Kumulatif, Sisa, dan % ditampilkan — karena saldo sampai tanggal akhir belum dapat dipastikan.');
        return {...dates,revisi:{id:revisi.id,nomor_revisi:revisi.nomor_revisi},anggaran,snapshot,periodPartial,cumulativePartial,
            note:notes.join(' '),outstandingNote:'Outstanding menunjukkan posisi saat ini; filter tanggal hanya berlaku untuk Realisasi.',
            disegarkanPada:sync.disegarkan_pada,aggregate,belanja,units,warnings:sync.detail_peringatan || {}};
    }
    route('/anggaran/periode',async(req,res)=>{
        range(req);
        try {await deps.refresh?.(req);} catch(error) {console.warn('Proyeksi periode tidak disegarkan:',error.code || 'source');}
        const result=await sql.begin('isolation level repeatable read read only',db=>read(db,req));
        const {aggregate,belanja,units,...response}=result;
        void aggregate;void belanja;void units;
        res.json(response);
    });
    route('/anggaran/periode/rincian',async(req,res)=>{
        const options=parseSpmDetailQuery(req.query);
        const result=await sql.begin('isolation level repeatable read read only',async db=>{
            const current=await read(db,req);
            if (current.snapshot!==req.query.snapshot) throw spmDetailError('Data atau revisi terbaru berubah. Muat ulang periode.',409);
            const scope=pilihLingkupSpm({anggaran:current.anggaran,belanja:current.belanja,viewer:req.viewer,
                unitKerja:req.query.unitKerja,kodeMak:normalizeMak(req.query.kodeMak || ''),kodeAkun:options.kodeAkun,normalizeMak});
            const detail=await bacaRincianSpm(db,{...options,tahun:current.tahun,keys:scope.keys,
                cutoff:current.aggregate.includeOpening ? current.aggregate.cutoff : null,
                period:{mulai:current.mulai,akhir:current.akhir}});
            return {...detail,snapshot:current.snapshot,scope:{...scope,keys:undefined},totals:scope.totals,
                warnings:current.warnings,periodPartial:current.periodPartial,outstandingNote:current.outstandingNote,
                disegarkanPada:current.disegarkanPada,rows:detail.rows.map(row=>({...row,
                    key:`${current.tahun}|${row.alur}|${row.trans_id}|${row.unit_kerja_kunci}`,
                    unitKerjaPengaju:current.units.get(row.unit_kerja_kunci)?.nama || row.unit_kerja_kunci}))};
        });
        res.json(result);
    });
}
