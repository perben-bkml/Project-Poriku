// Package imports
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
//Page Imports
import Landing from './pages/Landing'
import Home from './pages/Home'
import MainPage from './pages/Main-Page'
import Login from './pages/Login'
import NotFound from './pages/Not-Found'
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
            <Route path="*" element={<NotFound />} />
            {/* Protected Route */}
            <Route path="/home" element={<ProtectedRoute> <Home /> </ProtectedRoute>} />
            <Route path="/menu-bendahara" element={
              <ProtectedRoute>
                <MainPage menu="Bendahara"/>
              </ProtectedRoute>} />
            <Route path="/menu-verifikasi" element={
              <ProtectedRoute>
                <MainPage menu="Verifikasi"/>
              </ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  )
}

export default App
