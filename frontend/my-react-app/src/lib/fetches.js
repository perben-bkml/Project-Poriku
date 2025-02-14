import axios from 'axios';

// Functions for SPM-Bend.jsx
//Fetch Data SPM belum dibayar
export async function fetchNotPaidSPM(setNotPaidSPM, setIsLoading1) {
    try {
        setIsLoading1(true);
        const response = await axios.get("http://localhost:3000/bendahara/spm-belum-bayar")
        if (response.status === 200){
            setNotPaidSPM(response.data.data)
            setIsLoading1(false);
        }

    } catch (error) {
        console.log("Failed fetching data.", error)
        setIsLoading1(false);
    }
}

// Cari Nomor SPM
export async function handleCariBtn(setSheetTimer) {
    try {
        let cariSPM = document.getElementsByName("cari-input")[0].value;
        if (cariSPM !== "") {
            const response = await axios.patch("http://localhost:3000/bendahara/cari-spm", {data: cariSPM});
            if (response.status === 200){
                setSheetTimer(Date.now());
            }
        } else {
            null;
        }
    } catch (error) {
        console.log("Error sending data.", error)
    }
}

// Cari Rincian SPM
export async function handleRincianSubmit(event, setIsLoading2, setRincianData, rincianSearch) {
    event.preventDefault();
    try {
        setIsLoading2(true);
        const response = await axios.post("http://localhost:3000/bendahara/cari-rincian", rincianSearch)
        if (response.status === 200) {
            setRincianData(response.data.data);
            setIsLoading2(false);
        }
    } catch (error) {
        console.log("Error Sending Rincian.", error)
    }
}