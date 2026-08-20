import apiClient from './apiClient';

// Functions for SPM-Bend.jsx
// SPM yang belum selesai dibayarkan, dari sheet Pembayaran BP. limit=all keeps this to
// one request - the rows are paginated in the table, not on the server.
export async function fetchNotPaidSPM(setNotPaidSPM, setIsLoading1) {
    try {
        setIsLoading1(true);
        const response = await apiClient.get('/bendahara/pembayaran-bp', {
            params: {limit: "all", bulan: "", belumSelesai: 1},
        });
        setNotPaidSPM(response.data.data);
    } catch (error) {
        console.log("Failed fetching data.", error)
        setNotPaidSPM([]);
    } finally {
        setIsLoading1(false);
    }
}

// Rekening Koran, satker-scoped by the server
export async function fetchRekKoran(setRekKoran, setIsLoading) {
    try {
        setIsLoading(true);
        const response = await apiClient.get('/bendahara/pembayaran-bp/rek-koran');
        setRekKoran(response.data.data);
    } catch (error) {
        console.log("Failed fetching Rekening Koran.", error)
        setRekKoran([]);
    } finally {
        setIsLoading(false);
    }
}
