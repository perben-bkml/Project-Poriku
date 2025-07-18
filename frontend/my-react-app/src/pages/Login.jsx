import React, { useContext, useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, NavLink } from "react-router-dom";
import { AuthContext } from "../lib/AuthContext";
import { LoadingScreen } from "../ui/loading.jsx";

function Login () {
    //States
    const [credentials, setCredentials] = useState({
        username: "",
        password: "",
    })
    const [isScreenLoading, setScreenLoading] = useState(false)
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

    async function handleSubmit(event) {
        event.preventDefault();
        try {
            setScreenLoading(true)
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/login-auth`, credentials, {
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
                console.log("Invalid Username or Password.")
            } else {
                console.log("Error sending data to backend.", error)
           }
            setScreenLoading(false)
        }
    }

    return (
        <div className="login-home">
            <div className="login-bg slide-down">
                <div className="login-logo-container">
                    <img src="/assets/bakamla_logo.svg" alt="Bakamla Logo" className="login-logo"></img>
                </div>

                <div className="login-title">
                    <h2 className="title-1">Portal Informasi Keuangan</h2>
                    <h2 className="title-2">Bakamla RI</h2>
                    <h3>Login</h3>
                </div>
                <div className="login-content">
                    <form className="login-form" onSubmit={handleSubmit}>
                        <input type="text" value={credentials.username} placeholder="Username" name="username" onChange={handleInputChange} />
                        <input type="password" value={credentials.password} placeholder="Password" name="password" onChange={handleInputChange} />
                        <input type="submit" value='Masuk'/>
                    </form>
                </div>
                <div className="login-gaji">
                    <p className="login-gaji-p1"><NavLink to="/" style={{ textDecoration: "none", color:"inherit"}}>Kembali Ke Halaman Awal</NavLink></p>
                </div>
            </div>
            {isScreenLoading && <LoadingScreen />}
        </div>
    )
}

export default Login;
