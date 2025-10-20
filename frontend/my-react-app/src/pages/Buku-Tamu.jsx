import React, { useState } from 'react';
import axios from 'axios';
import { NavLink, useNavigate } from "react-router-dom";
import FormField from '../ui/FormField';
import { PopupAlert } from '../ui/Popup';

export default function BukuTamu() {
    // Navigation hook
    const navigate = useNavigate();

    // State for form data
    const [formData, setFormData] = useState({
        namaLengkap: '',
        golonganPangkat: '',
        nrp: '',
        matra: '',
        nomorHandphone: '',
        jenisRonda: '',
        satkerAsal: '',
        petugasGajiSatkerAsal: '',
        satkerTujuan: '',
        jabatanUnitKerja: '',
        tunjanganJabatanTerakhir: ''
    });

    // State for file uploads
    const [files, setFiles] = useState({
        uploadKTP: null,
        uploadKK: null,
        uploadSKKEP: null,
        uploadSKPP: null,
        uploadSKKEPKeluar: null
    });

    // State for loading and alerts
    const [isLoading, setIsLoading] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [alertSeverity, setAlertSeverity] = useState('success');

    // Handle text input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Handle file input changes
    const handleFileChange = (e) => {
        const { name, files: uploadedFiles } = e.target;
        setFiles(prev => ({
            ...prev,
            [name]: uploadedFiles[0]
        }));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const submitData = new FormData();

            // Append text fields
            Object.keys(formData).forEach(key => {
                if (formData[key]) {
                    submitData.append(key, formData[key]);
                }
            });

            // Append files
            Object.keys(files).forEach(key => {
                if (files[key]) {
                    submitData.append(key, files[key]);
                }
            });

            const response = await axios.post(
                `${import.meta.env.VITE_API_URL}/buku-tamu`,
                submitData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            if (response.status === 200 || response.status === 201) {
                // Show success alert
                setAlertSeverity('success');
                setAlertMessage('Data berhasil dikirim!');
                setIsAlert(true);

                // Reset form
                setFormData({
                    namaLengkap: '',
                    golonganPangkat: '',
                    nrp: '',
                    matra: '',
                    nomorHandphone: '',
                    jenisRonda: '',
                    satkerAsal: '',
                    petugasGajiSatkerAsal: '',
                    satkerTujuan: '',
                    jabatanUnitKerja: '',
                    tunjanganJabatanTerakhir: ''
                });
                setFiles({
                    uploadKTP: null,
                    uploadKK: null,
                    uploadSKKEP: null,
                    uploadSKPP: null,
                    uploadSKKEPKeluar: null
                });

                // Reset file inputs
                const fileInputs = document.querySelectorAll('input[type="file"]');
                fileInputs.forEach(input => input.value = '');

                // Redirect to layanan-gaji after 2 seconds
                setTimeout(() => {
                    navigate('/layanan-gaji');
                }, 2000);
            }
        } catch (error) {
            console.error('Error submitting form:', error);

            // Show error alert
            setAlertSeverity('error');
            setAlertMessage('Gagal mengirim data. Silakan coba lagi.');
            setIsAlert(true);

            // Hide alert after 5 seconds
            setTimeout(() => {
                setIsAlert(false);
            }, 5000);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="gaji-page">
            {/* Popup Alert */}
            <PopupAlert
                isAlert={isAlert}
                severity={alertSeverity}
                message={alertMessage}
            />

            <div className='gaji-title'>
                <h1>Buku Tamu Bakamla RI</h1>
                <br/>
                <NavLink to='/layanan-gaji' style={{textDecoration: 'none', color: 'inherit'}}>
                    <p className='gaji-title-desc'>Kembali ke Pelayanan Gaji</p>
                </NavLink>
            </div>

            <div className='gaji-content'>
                <div className='gaji-desc slide-down'>
                    <h4 className='gaji-desc-head buku-tamu-page-title'>
                        Buku Tamu Bakamla RI
                    </h4>
                    <p className='gaji-desc-body buku-tamu-description'>
                        Mohon izin, saat Masuk/Keluar Bakamla RI, kami meminta bantuannya Bapak/Ibu TNI/Polri untuk mengisi data pada form ini sebagai dasar Juru Bayar melakukan pengurusan pembayaran/penghentian gaji di Bakamla RI pada SKPP (Surat Keterangan Penghentian Pembayaran)
                    </p>

                    <form onSubmit={handleSubmit} className='buku-tamu-form'>
                        {/* Basic Information */}
                        <div className='pengajuan-form-textdata'>
                            <FormField
                                label="Nama Lengkap dengan Gelar (Tanpa Pangkat)"
                                name="namaLengkap"
                                type="text"
                                value={formData.namaLengkap}
                                onChange={handleInputChange}
                                required
                            />

                            <FormField
                                label="Golongan Pangkat"
                                name="golonganPangkat"
                                type="text"
                                value={formData.golonganPangkat}
                                onChange={handleInputChange}
                                required
                            />

                            <FormField
                                label="NRP"
                                name="nrp"
                                type="text"
                                value={formData.nrp}
                                onChange={handleInputChange}
                                required
                            />

                            <FormField
                                label="Matra"
                                name="matra"
                                type="select"
                                value={formData.matra}
                                onChange={handleInputChange}
                                required
                                placeholder="Pilih Matra"
                                options={['TNI AD', 'TNI AL', 'TNI AU', 'POLRI']}
                            />

                            <FormField
                                label="Nomor Handphone"
                                name="nomorHandphone"
                                type="text"
                                value={formData.nomorHandphone}
                                onChange={handleInputChange}
                                required
                            />

                            <FormField
                                label="Jenis Ronda"
                                name="jenisRonda"
                                type="select"
                                value={formData.jenisRonda}
                                onChange={handleInputChange}
                                required
                                placeholder="Pilih Jenis Ronda"
                                options={['Ronda Masuk', 'Ronda Keluar']}
                            />
                        </div>

                        {/* Conditional Fields for Ronda Masuk */}
                        {formData.jenisRonda === 'Ronda Masuk' && (
                            <>
                                <div className='pengajuan-form-textdata'>
                                    <h4 className='buku-tamu-section-title'>Informasi Ronda Masuk</h4>
                                </div>
                                <div className='pengajuan-form-textdata'>
                                    <FormField
                                        label="Satker Asal (Isi Detail, contoh: Pusdik Hidros)"
                                        name="satkerAsal"
                                        type="text"
                                        value={formData.satkerAsal}
                                        onChange={handleInputChange}
                                        required
                                    />

                                    <FormField
                                        label="Petugas Gaji Satker Asal (Isi Detail, contoh: Pekas Mabes TNI)"
                                        name="petugasGajiSatkerAsal"
                                        type="text"
                                        value={formData.petugasGajiSatkerAsal}
                                        onChange={handleInputChange}
                                        required
                                    />

                                    <FormField
                                        label="Upload KTP"
                                        name="uploadKTP"
                                        type="file"
                                        onChange={handleFileChange}
                                        required
                                        accept="image/*,.pdf"
                                        className="buku-tamu-file"
                                    />

                                    <FormField
                                        label="Upload KK"
                                        name="uploadKK"
                                        type="file"
                                        onChange={handleFileChange}
                                        required
                                        accept="image/*,.pdf"
                                        className="buku-tamu-file"
                                    />

                                    <FormField
                                        label="Upload SK/KEP masuk Bakamla RI"
                                        name="uploadSKKEP"
                                        type="file"
                                        onChange={handleFileChange}
                                        required
                                        accept="image/*,.pdf"
                                        className="buku-tamu-file"
                                    />

                                    <FormField
                                        label="Upload SKPP dari Satker Asal"
                                        name="uploadSKPP"
                                        type="file"
                                        onChange={handleFileChange}
                                        required
                                        accept="image/*,.pdf"
                                        className="buku-tamu-file"
                                    />
                                </div>
                            </>
                        )}

                        {/* Conditional Fields for Ronda Keluar */}
                        {formData.jenisRonda === 'Ronda Keluar' && (
                            <>
                                <div className='pengajuan-form-textdata'>
                                    <h4 className='buku-tamu-section-title'>Informasi Ronda Keluar</h4>
                                </div>
                                <div className='pengajuan-form-textdata'>
                                    <FormField
                                        label="Satker Tujuan (Isi Detail, contoh: Pusdik Hidros)"
                                        name="satkerTujuan"
                                        type="text"
                                        value={formData.satkerTujuan}
                                        onChange={handleInputChange}
                                        required
                                    />

                                    <FormField
                                        label="Jabatan/Unit Kerja di Bakamla RI"
                                        name="jabatanUnitKerja"
                                        type="text"
                                        value={formData.jabatanUnitKerja}
                                        onChange={handleInputChange}
                                        required
                                    />

                                    <FormField
                                        label="Tunjangan Jabatan Terakhir"
                                        name="tunjanganJabatanTerakhir"
                                        type="text"
                                        value={formData.tunjanganJabatanTerakhir}
                                        onChange={handleInputChange}
                                    />

                                    <FormField
                                        label="SK/KEP keluar Bakamla RI"
                                        name="uploadSKKEPKeluar"
                                        type="file"
                                        onChange={handleFileChange}
                                        required
                                        accept="image/*,.pdf"
                                        className="buku-tamu-file"
                                    />
                                </div>
                            </>
                        )}

                        {/* Submit Button */}
                        <div className={`form-submit buku-tamu-submit ${isLoading ? 'buku-tamu-submit-disabled' : ''}`}>
                            <input
                                type="submit"
                                value={isLoading ? "Mengirim..." : "Kirim"}
                                disabled={isLoading}
                            />
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
