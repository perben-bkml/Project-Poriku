import React from "react";

function Login () {
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
                    <form className="login-form">
                        <input type="text" value="" placeholder="Username" name="username" />
                        <input type="text" value="" placeholder="Password" name="password" />
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