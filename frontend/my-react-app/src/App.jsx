// Package imports
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
//Page Imports
import Landing from './pages/Landing'
import Home from './pages/Home'
import BendaharaPage from './pages/Bendahara-Page.jsx'
import VerifikasiPage from "./pages/Verifikasi-Page.jsx";
import Login from './pages/Login'
import NotFound from './pages/NotFound.jsx'
import Gaji from './pages/Gaji.jsx'
import BukuTamu from './pages/Buku-Tamu.jsx'
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
            <Route exact path="/" element={<Landing />} />
            <Route exact path="/login" element={<Login />} />
            <Route exact path="/layanan-gaji" element={<Gaji />} />
            <Route exact path="/buku-tamu" element={<BukuTamu />} />
            <Route path="*" element={<NotFound />} />
            {/* Protected Route */}
            <Route path="/home" element={<ProtectedRoute> <Home /> </ProtectedRoute>} />
            <Route path="/menu-bendahara" element={
              <ProtectedRoute>
                <BendaharaPage menu="Bendahara"/>
              </ProtectedRoute>} />
            <Route path="/menu-verifikasi" element={
              <ProtectedRoute>
                <VerifikasiPage menu="Verifikasi"/>
              </ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  )
}

export default App
