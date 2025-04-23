import React, { createContext, useEffect, useState } from "react";
import axios from "axios";

export const AuthContext = createContext();

export function AuthProvider({children}) {
    const [isAuthenticated, setIsAuthenticated] = useState();
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    async function checkAuth() {
        try {
            const response = await axios.get("http://localhost:3000/check-auth", { withCredentials: true });
            if (response.status === 200) {
                setIsAuthenticated(true);
                setUser(response.data.user)
            }
        } catch  {
            setIsAuthenticated(false);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }

    //Logout functin
    async function logout() {
        try {
            await axios.post("http://localhost:3000/logout", {}, { withCredentials: true });
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem("selectedButton"); //remove button select data
            navigate("/login"); // Redirect to login after logout
        } catch (error) {
            console.log("Logout failed:", error);
        }
    }

    //Check auth on page load
    useEffect(() => {
        checkAuth();
    }, [])

    return (
        <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated, user, setUser, isLoading, logout }}>
            {children}
        </AuthContext.Provider>
    )
}