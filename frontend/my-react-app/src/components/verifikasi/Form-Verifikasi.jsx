import React, { useState, useContext } from 'react';
import axios from "axios";

//Import UI
import { VerifButton } from "../../ui/buttons.jsx"
import { LoadingScreen } from "../../ui/loading.jsx";
//Other Data
import { AuthContext } from "../../lib/AuthContext.jsx";
import { satkerNames } from "./head-data.js";


export default function FormVerifikasi(props) {
    //Context
    const { user } = useContext(AuthContext);
    //States
    const [display, setDisplay] = useState(true);
    const [loadingScreen, setLoadingScreen] = useState(false);


    //Menu display handler
    function handleDisplay(event) {
        const { name } = event.target;
        if (name === "buat-form") {
            setDisplay(true);
        } else {
            setDisplay(false);
        }
    }

    //Handler for form submit
    async function handleSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const noSpm = form["no-spm"].value || "";
        const unitKerja = form["unit-kerja"].value || "";
        const tglUpload = form["tgl-upload"].value || "";
        const hasil = form["verif"].value || "";
        const catatan = form["catatan"].value || "";

        const date = new Date(tglUpload).toISOString().split("T")[0];


        let verifikator = "";
        if (user.name === "Admin Verifikasi" || user.name === "Master") {
            verifikator = "Vegga Chrisdiansyah";
        } else {
            verifikator = user.name;
        }

        const dataArray = [noSpm, unitKerja, date, hasil, catatan, verifikator];

        try {
            setLoadingScreen(true);
            const response = await axios.post("http://localhost:3000/verifikasi/verifikasi-form", { data: dataArray})
            if (response.status === 200) {
                setLoadingScreen(false);
                props.changeComponent("kelola-PJK");
            }
        } catch (error) {
            setLoadingScreen(false);
            console.log("Error sending data to backend.", error)
        }

    }


    //Buat Form display
    function CreateForm() {
        return(
            <form className={"form-verif slide-down"} onSubmit={(e) => handleSubmit(e)}>
                <label htmlFor="no-spm">No SPM</label>
                <input type="text" id="no-spm" name="no-spm" required/>
                <br />
                <label htmlFor="unit-kerja">Unit Kerja</label>
                <select id="unit-kerja" name="unit-kerja" required>
                    {satkerNames.map((satker, index) => (
                        <option key={index} value={satker.value}>{satker.title}</option>
                    ))}
                </select>
                <br />
                <label htmlFor="tgl-upload">Tanggal Upload Berkas</label>
                <input type="date" id="tgl-upload" name="tgl-upload" required/>
                <br />
                <label htmlFor="verif">Hasil Verifikasi</label>
                <select id="verif" name="verif" required >
                    <option value=""></option>
                    <option value="Ditolak">Ditolak</option>
                    <option value="Lengkap dengan catatan">Lengkap dengan catatan</option>
                    <option value="Lengkap">Lengkap</option>
                </select>
                <br />
                <label htmlFor="catatan">Catatan</label>
                <input type="text" id="catatan" name="catatan"/>
                <br />
                <div className="verif-submit-buttons">
                    <VerifButton type="submit" value="Submit Formulir" name="submit-form"/>
                </div>
            </form>
        )
    }

    //Cari/Perbarui display
    function FindReplaceForm() {
        return(
            <div>
                <div className="form-verif verif-find slide-down">
                    <label htmlFor="find-spm">Input Nomor SPM</label>
                    <input type="text" id="find-spm" name="find-spm" />
                </div>
            </div>
        )
    }

    return (
        <div className={"bg-card"}>
            <div className="verif-buttons">
                <VerifButton type="button" value="Buat Form" name="buat-form" onClick={(e) => handleDisplay(e)}/>
                <VerifButton type="button" value="Cari/Perbarui" name="cari/perbarui" onClick={(e) => handleDisplay(e)}/>
            </div>
            {display ? <CreateForm /> : <FindReplaceForm />}
            {loadingScreen && <LoadingScreen />}
        </div>
    )
}