import React from "react";

function BuatPengajuan() {



    return (
        <div className="buat-pengajuan bg-card">
            <div className="pengajuan-desc">
                <p>Ketentuan Pengajuan Pencairan GUP/TUP (Wajib Dibaca!):</p>
                <button>Baca</button>
            </div>
            <div className="pengajuan-content">
                <form className="pengajuan-form">
                    <div className="pengajuan-form-textdata">
                        <label for="aju-name">Nama Pengisi Form:</label>
                        <input type="text" id="aju-name"/>
                        <br />
                        <label for="ajuan">Jenis Pengajuan:</label>
                        <select name="ajuan" id="ajuan">
                            <option value="gup">GUP</option>
                            <option value="ptup">PTUP</option>
                        </select>
                        <br />
                        <label for="aju-number">Nominal Total Pengajuan:</label>
                        <input type="number" id="aju-number" placeholder="Hanya diisi angka"/>
                        <br />
                        <label for="aju-date">Request Tanggal Pengajuan:</label>
                        <input type="date" id="aju-date"/>
                    </div>
                    <div className="pengajuan-form-tabledata">
                        <p>Input Data Pengajuan</p>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default BuatPengajuan;