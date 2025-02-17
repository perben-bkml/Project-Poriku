// Package imports
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
//Page Imports
import Home from './pages/Home'
import MainPage from './pages/Main-Page'
import Login from './pages/Login'
//Lib Imports
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './lib/ProtectedRoute'

function App() {

  return (
    <div>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Route */}
            <Route exact path="/login" element={<Login />} />
            {/* Protected Route */}
            <Route path="/home" element={<ProtectedRoute> <Home /> </ProtectedRoute>} />
            <Route path="/menu-bendahara" element={
              <ProtectedRoute>
                <MainPage menu="Bendahara" submenu="daftar-pengajuan"/>
              </ProtectedRoute>} />
            <Route path="/menu-verifikasi" element={
              <ProtectedRoute>
                <MainPage menu="Verifikasi" submenu="daftar-pengajuan"/>
              </ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  )
}

export default App
