import React, {useState} from 'react';
//Import Material UI
import EditNoteIcon from '@mui/icons-material/EditNote';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

export default function Gaji() {
    //State
    const [gajiContentOpen, setGajiContentOpen] = useState(true);

    //Handle Toggles
    const contentToggle = () => {setGajiContentOpen(!gajiContentOpen)}


    const descList = () => {
        return (
            <ol className='gaji-desc-body'>
                <li>Slip Gaji</li>
                <li>Surat Keterangan Penghasilan</li>
                <li>Surat Keterangan KP4 (untuk pengajuan BPJS)</li>
                <li>Surat Rekomendasi Atasan (untuk pengajuan pinjaman)</li>
                <li>Dokumen lain berkaitan dengan Gaji/Tunjangan Kinerja</li>
            </ol>
        )
    }

    return (
        <div className="gaji-page">
            <div className='gaji-title'>
                <h3>Selamat datang di</h3>
                <h1>Pelayanan Gaji Bakamla</h1>
                <button className='page-button gaji-button'><EditNoteIcon fontSize='large'/><span className="padd-span-bend"/>Form Permintaan Dokumen</button>
            </div>
            <div className='gaji-content' >
                <h2 onClick={contentToggle}>Ketentuan Pelayanan Gaji {gajiContentOpen ? <ExpandMoreIcon /> : <ExpandLessIcon />}</h2>
                { gajiContentOpen &&
                <div className={`gaji-desc ${gajiContentOpen ? 'slide-down' : ''}`}>
                    <h4 className='gaji-desc-head'>Peruntukan Pelayanan Gaji</h4>
                    <p className='gaji-desc-body'>Personil Bakamla RI dapat mengisi formulir untuk mendapatkan:</p>
                    {descList()}
                    <p className='gaji-desc-body'>Selanjutnya surat tersebut akan kami proses dan akan kami kirimkan via Email personel yang bersangkutan melalui email perbend.bakamla@gmail.com.</p>
                    <p className='gaji-desc-body'>Untuk hardcopy dokumen/surat dapat diambil di Bagian Keuangan pada hari dan jam kerja.</p>
                    <p className='gaji-desc-body' style={{fontWeight: 'bold'}}>Permintaan pengiriman dokumen selain melalui email tidak dapat kami layani.</p>
                </div>
                }
            </div>
            <div className='gaji-table'>

            </div>
        </div>
    )
}