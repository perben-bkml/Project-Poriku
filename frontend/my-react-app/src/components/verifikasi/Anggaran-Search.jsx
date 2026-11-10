import {memo, useCallback, useDeferredValue, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import Pagination from '@mui/material/Pagination';
import {buatIndeksAnggaran, cariAnggaranPohon, halamanAnggaran, tandaiPaguMinus} from '../../lib/anggaranSearch.js';
import {TableAnggaranPohon} from '../../ui/tables.jsx';
import LoadingAnimate from '../../ui/loading.jsx';
import {anggaranTanpaRincian} from './head-data.js';
import AnggaranSpmDrawer from './Anggaran-Spm-Drawer.jsx';

const MAK_PER_PAGE = 10;
const BudgetTable = memo(TableAnggaranPohon);

// Input state stays here, so typing cannot rerender upload, history and diagnostic panels.
function AnggaranSearch({anggaran, canSearch, loading, kosong, tahun, snapshot, onRefresh}) {
    const [scope, setScope] = useState(null);
    const openSpm = useCallback(value => setScope(value), []);
    const [input, setInput] = useState('');
    const deferred = useDeferredValue(input);
    const pencarian = canSearch && input.trim() ? deferred.trim() : '';
    const updating = canSearch && input.trim() !== pencarian;
    const [pageState, setPageState] = useState({query: '', value: 1});
    const tree = useMemo(() => tandaiPaguMinus(anggaran), [anggaran]);
    const index = useMemo(() => buatIndeksAnggaran(tree), [tree]);
    const result = useMemo(() => {
        const units = cariAnggaranPohon(tree, pencarian, index);
        let mak = 0, akun = 0;
        for (const unit of units) for (const item of unit.mak) {
            mak++;
            akun += item.akun.length;
        }
        return {units, mak, akun};
    }, [tree, index, pencarian]);
    const pages = Math.max(1, Math.ceil(result.mak / MAK_PER_PAGE));
    const page = pageState.query === pencarian ? Math.min(pageState.value, pages) : 1;
    const visible = useMemo(() => pencarian
        ? halamanAnggaran(result.units, page, MAK_PER_PAGE) : result.units,
    [result.units, page, pencarian]);

    return <>
        {canSearch && <form className="anggaran-search" role="search" aria-label="Pencarian anggaran"
                            onSubmit={event => event.preventDefault()}>
            <label htmlFor="anggaran-search-input">Cari MAK, Uraian, atau Akun</label>
            <div className="anggaran-search-controls">
                <input id="anggaran-search-input" type="search" value={input}
                       placeholder="Contoh: EBA, belanja barang, 511111"
                       aria-describedby="anggaran-search-result"
                       onChange={event => setInput(event.target.value)}/>
                {input && <button type="button" className="spm-button" onClick={() => setInput('')}>Reset</button>}
            </div>
            <p id="anggaran-search-result" role="status">
                {loading ? 'Memuat anggaran…' : updating ? 'Memperbarui hasil…' : pencarian
                    ? `${result.mak} MAK dan ${result.akun} Akun pada ${result.units.length} Unit Kerja ditemukan. ${result.mak ? `Menampilkan MAK ${(page - 1) * MAK_PER_PAGE + 1}–${Math.min(page * MAK_PER_PAGE, result.mak)}. ` : ''}Nilai pada baris induk tetap menunjukkan total anggaran.`
                    : ''}
            </p>
        </form>}
        <p className="anggaran-note anggaran-catatan-realisasi">{anggaranTanpaRincian}</p>
        <div aria-busy={updating || loading}>
            {loading ? <LoadingAnimate/> : <BudgetTable anggaran={visible} pencarian={pencarian}
                onSpmDetails={openSpm}
                kosong={pencarian ? 'Tidak ada MAK, Uraian, atau Akun yang cocok dengan pencarian.' : kosong}/>}
        </div>
        {!loading && pencarian && pages > 1 && <Pagination className="dp-pagination" count={pages} page={page}
            disabled={updating} onChange={(_, value) => setPageState({query: pencarian, value})}/>}
        {scope && <AnggaranSpmDrawer key={`${scope.unitKerja}|${scope.kodeMak}|${scope.kodeAkun}`}
            scope={scope} tahun={tahun} snapshot={snapshot} onClose={() => setScope(null)} onRefresh={onRefresh}/>}
    </>;
}

AnggaranSearch.propTypes = {
    anggaran: PropTypes.array.isRequired,
    canSearch: PropTypes.bool.isRequired,
    loading: PropTypes.bool.isRequired,
    kosong: PropTypes.string.isRequired,
    tahun: PropTypes.number, snapshot: PropTypes.string, onRefresh: PropTypes.func.isRequired,
};

export default memo(AnggaranSearch);
