import React, { useContext, useState, useEffect } from "react";
import apiClient from "../lib/apiClient";
import { useNavigate, NavLink } from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";
import { LoadingScreen } from "../ui/loading.jsx";
import { PopupAlert } from "../ui/Popup.jsx";

function Login () {
    //States
    const [credentials, setCredentials] = useState({
        username: "",
        password: "",
    })
    const [isScreenLoading, setScreenLoading] = useState(false)
    const [showErrorPopup, setShowErrorPopup] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    //Setting up useNavigate and createContex
    const navigate = useNavigate();
    const { isAuthenticated, setIsAuthenticated, isLoading, setUser } = useContext(AuthContext)

    //Handling user input changes
    function handleInputChange(event) {
        setCredentials({
            ...credentials,
            [event.target.name]: event.target.value,
        })
    }

    //Redirect to home page if user is authenticated
    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            navigate("/home")
        }
    }, [isAuthenticated, isLoading, navigate])

    //Auto-dismiss error popup after 4 seconds
    useEffect(() => {
        if (showErrorPopup) {
            const timer = setTimeout(() => {
                setShowErrorPopup(false)
            }, 4000)
            return () => clearTimeout(timer)
        }
    }, [showErrorPopup])

    async function handleSubmit(event) {
        event.preventDefault();
        try {
            setScreenLoading(true)
            const response = await apiClient.post('/login-auth', credentials, {
                withCredentials: true, //Ensure cookies are sent
            })
            if (response.status === 200) {
                setScreenLoading(false)
                setIsAuthenticated(true)
                setUser({
                    name: response.data.data[0],
                    role: response.data.data[1],
                })
                navigate("/home")
            }
        } catch (error) {
            if (error.status === 401) {
                setErrorMessage("Username atau Password Salah.")
                setShowErrorPopup(true)
            } else {
                setErrorMessage("Masalah koneksi ke server. Coba lagi.")
                setShowErrorPopup(true)
           }
            setScreenLoading(false)
        }
    }

    return (
        <div className="login-home">
            <div className="login-left">
                <div className="login-head">
                    <h3 className={'landing-h1'} style={{fontSize:'3.8rem'}}>
                        PO
                        {<h3 className={'landing-h1 h1-unique'} style={{fontSize:'3.8rem'}}>RI</h3>}
                        KU</h3>
                    <p className={'landing-p'} style={{fontSize:'1.18rem'}}>Portal Informasi Keuangan</p>
                </div>
                <div className="login-bg slide-down">
                    <div className="login-title">
                        <p className={"login-title-1"}>Permintaan izin akses sebagai</p>
                        <p className={"login-title-2"}>Pengelola Keuangan</p>
                    </div>
                    <div className="login-content">
                        <form className="login-form" onSubmit={handleSubmit}>
                            <input type="text" value={credentials.username} placeholder="Username" name="username" onChange={handleInputChange} maxLength={25} />
                            <input type="password" value={credentials.password} placeholder="Password" name="password" onChange={handleInputChange} maxLength={25} />
                            <input type="submit" value='Login'/>
                        </form>
                    </div>
                    <div className="login-gaji">
                        <p className="login-gaji-p1"><NavLink to="/" style={{ textDecoration: "none", color:"inherit"}}>Kembali Ke <b> Halaman Awal </b></NavLink></p>
                    </div>
                </div>
                {isScreenLoading && <LoadingScreen />}
                <PopupAlert
                    isAlert={showErrorPopup}
                    severity="error"
                    message={errorMessage}
                />
            </div>
            <div className="login-right">

            </div>
        </div>
    )
}

export default Login;
