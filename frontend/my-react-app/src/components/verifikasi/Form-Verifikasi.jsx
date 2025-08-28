import React, { useState, useContext } from 'react';
import axios from "axios";

//Import UI
import { VerifButton } from "../../ui/buttons.jsx"
import { LoadingScreen } from "../../ui/loading.jsx";
import { PopupAlert } from "../../ui/Popup.jsx";
//Other Data
import { AuthContext } from "../../lib/AuthContext.jsx";
import { satkerNames } from "./head-data.js";


export default function FormVerifikasi(props) {
    //Context
    const { user } = useContext(AuthContext);
    //States
    const [display, setDisplay] = useState(true);
    const [loadingScreen, setLoadingScreen] = useState(false);
    const [searchedData, setSearchedData] = useState([]);
    const [savedRow, setSavedRow] = useState(null);
    const [isAlert, setIsAlert] = useState(false);
    const [activeButton, setActiveButton] = useState("buat-form");
    const [popupType, setPopupType] = useState("");

    //Menu display handler
    function handleDisplay(event) {
        const { name } = event.target;
        if (name === "buat-form") {
            setDisplay(true);
            setActiveButton(name);
        } else {
            setDisplay(false);
            setActiveButton(name);
        }
    }

    //Date converter
    function formatDate(dateString) {
        // Check if the string is in YYYY-MM-DD format - convert to Indonesian format
        const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (isoRegex.test(dateString)) {
            const indoMonthNames = [
                'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
            ];
            
            const [year, month, day] = dateString.split('-');
            const monthIndex = parseInt(month, 10) - 1;
            const dayNum = parseInt(day, 10);
            
            if (monthIndex >= 0 && monthIndex < 12) {
                return `${dayNum}-${indoMonthNames[monthIndex]}-${year}`;
            }
        }

        // Handle Indonesian format like "6-Mei-2025" - convert to ISO format
        const indoMonths = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
            'Mei': 4, 'Jun': 5, 'Jul': 6, 'Agu': 7,
            'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11
        };

        const parts = dateString.split('-');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const monthName = parts[1];
            const year = parseInt(parts[2], 10);

            const monthIndex = indoMonths[monthName];
            if (monthIndex === undefined) {
                console.error("Invalid Indonesian month name:", monthName);
                return "";
            }

            const date = new Date(year, monthIndex, day);
            if (isNaN(date.getTime())) {
                console.error("Invalid date after conversion");
                return "";
            }

            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');

            return `${yyyy}-${mm}-${dd}`;
        }
    }

    //Handler Onblur Search
    async function handleOnBlur(data) {
        let searchValue = "";
        if (data) {
            searchValue = data;
        } else {
            searchValue = document.getElementById("find-spm").value;
        }

        if (searchValue !== "") {
            try {
                setLoadingScreen(true);
                const response = await axios.get(`${import.meta.env.VITE_API_URL}/verifikasi/cari-spm`, { params: { searchValue }});
                if (response.status === 200) {
                    const { data, rowNumber } = response.data;
                    setSearchedData(data);
                    setSavedRow(rowNumber);
                    setLoadingScreen(false);
                }
            } catch (error) {
                console.log("Error sending data to backend.", error)
                setLoadingScreen(false);
            }
        }
    }

    //Handle Input Form Reset
    function handleResetInputForm() {
        document.getElementById("find-spm").value = "";
        setSearchedData([]);
    }

    //Handle Generate PDF
    async function handleGeneratePDF() {
        try {
            setLoadingScreen(true);
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/verifikasi/generate-pdf`, {
                noSPM: searchedData[0],
                unitKerja: searchedData[1],
                tanggalUploadBerkas: formatDate(searchedData[2]), // ISO 8601 format
                hasilVerifikasi: searchedData[3],
                catatan: searchedData[4],
                operator: searchedData[5]
            });
            if (response.status === 200) {
                setLoadingScreen(false);
                setIsAlert(true);
                setTimeout(() => {
                    setIsAlert(false);
                }, 3000);
            }
        } catch (error) {
            console.log("Error sending data to website.", error)
            setLoadingScreen(false);
        }
    }


    //Handler for form submit
    async function handleSubmit(event, type) {
        event.preventDefault();

        const form = event.target;
        const noSpm = form["no-spm"].value || "";
        const unitKerja = form["unit-kerja"].value || "";
        const tglUpload = form["tgl-upload"].value || "";
        const hasil = form["verif"].value || "";
        const catatan = form["catatan"].value || "";

        const date = formatDate(tglUpload);

        let verifikator = "";
        if (user.name === "Admin Verifikasi") {
            verifikator = "Vegga Chrisdiansyah";
        } else if (user.name === "Admin Verifikasi 2") {
            verifikator = "Agata Melinda";
        } else if (user.name === "Admin Verifikasi 3") {
            verifikator = "Rahmat";
        } else if (user.name === "Admin Verifikasi 4") {
            verifikator = "Esteria Sitanggang";
        } else {
            verifikator = user.name;
        }

        const dataArray = [noSpm, unitKerja, date, hasil, catatan, verifikator];

        try {
            setLoadingScreen(true);
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/verifikasi/verifikasi-form`, { data: dataArray, type: type, rowPosition: savedRow })
            if (response.status === 200) {
                setPopupType("Buat/Edit")
                setIsAlert(true);
                setTimeout(() => {
                    setIsAlert(false);
                }, 1000);
                setTimeout( () => {
                    setLoadingScreen(false); props.changeComponent("kelola-PJK");
                    }, 1000);

            } else if (response.status === 201) {
                const { existingData } = response.data
                setDisplay(false);
                setActiveButton("cari/perbarui");
                await handleOnBlur(existingData.toString());
                setLoadingScreen(false);
                setPopupType("Data Exist")
                setIsAlert(true);
                setTimeout(() => {
                    setIsAlert(false);
                }, 3000);
            }
        } catch (error) {
            setLoadingScreen(false);
            console.log("Error sending data to backend.", error)
        }

    }


    //Buat Form display
    function CreateForm(props) {

        const setType = props.type;

        return(
            <form className={"form-verif"} onSubmit={(e) => handleSubmit(e, setType)}>
                <label htmlFor="no-spm">No SPM</label>
                <input type="text" id="no-spm" name="no-spm" defaultValue={setType === "filled" ? searchedData[0] : null} required/>
                <br />
                <label htmlFor="unit-kerja">Unit Kerja</label>
                <select id="unit-kerja" name="unit-kerja" defaultValue={setType === "filled" ? searchedData[1] : null} required>
                    {satkerNames.map((satker, index) => (
                        <option key={index} value={satker.value}>{satker.title}</option>
                    ))}
                </select>
                <br />
                <label htmlFor="tgl-upload">Tanggal Upload Berkas</label>
                <input type="date" id="tgl-upload" name="tgl-upload" defaultValue={setType === "filled" ? formatDate(searchedData[2]) : null} required/>
                <br />
                <label htmlFor="verif">Hasil Verifikasi</label>
                <select id="verif" name="verif" defaultValue={setType === "filled" ? searchedData[3] : null} required >
                    <option value=""></option>
                    <option value="Ditolak">Ditolak</option>
                    <option value="Lengkap dengan catatan">Lengkap dengan catatan</option>
                    <option value="Lengkap">Lengkap</option>
                </select>
                <br />
                <label htmlFor="catatan">Catatan</label>
                <input type="text" id="catatan" name="catatan" defaultValue={setType === "filled" ? searchedData[4] : null}/>
                <br />
                <div>
                    {setType === "basic" ?
                        <VerifButton type="submit" value="Submit Formulir" name="submit-form"/>:
                        <div className="verif-submit-buttons">
                            <VerifButton type="submit" value="Update Formulir" name="submit-form"/>
                            <VerifButton type="button" value="Generate PDF" name="submit-form" onClick={handleGeneratePDF}/>
                        </div>
                    }
                </div>
            </form>
        )
    }

    //Cari/Perbarui display
    function FindReplaceForm() {
        return(
            <div>
                <div className="form-verif verif-find">
                    <label htmlFor="find-spm">Input Nomor SPM</label>
                    <input type="text" id="find-spm" name="find-spm" />
                    <br />
                    <div>
                        <button className='cari spm-button find-btn' onClick={() => handleOnBlur()} >Cari</button>
                        <button className='cari spm-button find-btn' onClick={handleResetInputForm} >Hapus</button>
                    </div>

                </div>
                { searchedData.length > 0 && <CreateForm type="filled" /> }
            </div>
        )
    }

    return (
        <div className={"bg-card"}>
            <div className="verif-buttons">
                <VerifButton type="button" value="Buat Form" name="buat-form" pressed={activeButton === "buat-form"} onClick={(e) => handleDisplay(e)}/>
                <VerifButton type="button" value="Cari/Perbarui" name="cari/perbarui" pressed={activeButton === "cari/perbarui"} onClick={(e) => handleDisplay(e)}/>
            </div>
            {display ? <CreateForm type="basic" /> : <FindReplaceForm />}
            {loadingScreen && <LoadingScreen />}
            {isAlert && popupType === "PDF" ? <PopupAlert isAlert={isAlert} severity="success" message="PDF Berhasil Dibuat"/> : null}
            {isAlert && popupType === "Data Exist" ? <PopupAlert isAlert={isAlert} severity="error" message="Nomor SPM Sudah Dicatat"/> : null}
            {isAlert && popupType === "Buat/Edit" ? <PopupAlert isAlert={isAlert} severity="success" message="Form Berhasil Di Buat/Update"/> : null}
        </div>
    )
}
