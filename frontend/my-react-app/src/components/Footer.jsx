import React from "react";

function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="footer">
            <p className="footer-copy">&copy; Copyright Bakamla Keuangan {year}</p>
            <p>By J</p>
        </footer>
    )
}

export default Footer;