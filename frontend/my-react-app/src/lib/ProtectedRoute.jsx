import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "./AuthContext";
import { LoadingScreen } from "../ui/loading";

function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useContext(AuthContext);
    if (isLoading) {
        return <LoadingScreen />
    }

  // If not authenticated, redirect to login
  return isAuthenticated ? children : <Navigate to="/login" />;
}

export default ProtectedRoute;