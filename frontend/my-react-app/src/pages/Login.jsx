import React from "react";

function Login () {
    return (
        <div className="login-home">
            <div className="login-bg">
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
            </div>      
        </div>
    )
}

export default Login;