import React, { createContext, useEffect, useState } from "react";
import apiClient from "./apiClient";

export const AuthContext = createContext();

export function AuthProvider({children}) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    async function checkAuth() {
        try {
            const response = await apiClient.get('/check-auth', { withCredentials: true });
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
            await apiClient.post('/logout', {}, { withCredentials: true });
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem("selectedButtonBendahara");
            localStorage.removeItem("selectedButtonVerif")//remove button select data
            localStorage.removeItem("poriku-selected-year"); // Clear year selection
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
