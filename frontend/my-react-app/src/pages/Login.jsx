import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function Login () {
    //States
    const [credentials, setCredentials] = useState({
        username: "",
        password: "",
    })
    //Setting up useNavigate
    const navigate = useNavigate();
    
    //Handling user input changes
    function handleInputChange(event) {
        setCredentials({
            ...credentials,
            [event.target.name]: event.target.value,
        })
    }    

    async function handleSubmit(event) {
        event.preventDefault();
        try {
            const response = await axios.post("http://localhost:3000/login-auth", credentials)
            if (response.status === 200) {
                navigate("/home")
            } 
        } catch (error) {
            if (error.status === 401) {
                console.log("Invalid Username or Password.")
            } else {
                console.log("Error sending data to backend.", error)
           }
        }
    }

    return (
        <div className="login-home">
            <div className="login-bg">
                <div className="login-logo-container">
                    <img src="../../public/assets/bakamla_logo.png" alt="Bakamla Logo" className="login-logo"></img>
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
                        <input type="submit" />
                    </form>
                </div>
                <div className="login-gaji">
                    <p className="login-gaji-p1">Ingin mengajukan permohonan Slip Gaji?</p>
                    <p className="login-gaji-p2">Klik Disini!</p>
                </div>
            </div>      
        </div>
    )
}

export default Login;