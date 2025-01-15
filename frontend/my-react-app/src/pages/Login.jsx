import React from "react";

function Login () {
    return (
        <div className="login-home">
            <div className="login-title">
                <h2>Poriku!</h2>
                <h3>Login Page</h3>
            </div>
            <div className="login-content">
                <form>
                    <input type="text" value="" placeholder="Username" name="username" />
                    <input type="text" value="" placeholder="Password" name="password" />
                </form>
                <p>Ingin mengajukan permohonan Slip Gaji? Klik Disini!</p>
            </div>      
        </div>
    )
}

export default Login;