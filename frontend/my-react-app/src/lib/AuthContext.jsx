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
        } catch (error) {
            setIsAuthenticated(false);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }

    //Check auth on page load
    useEffect(() => {
        checkAuth();
    }, [])

    return (
        <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated, user, setUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    )
}