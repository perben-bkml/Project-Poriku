// Package imports
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
//Page Imports
import Home from './pages/Home'
import MainPage from './pages/Main-Page'
import Login from './pages/Login'

function App() {

  return (
    <div>
      <BrowserRouter>
        <Routes>
          <Route exact path="/" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/menu-bendahara" element={<MainPage menu="Bendahara" submenu="daftar-pengajuan"/>} />
          <Route path="/menu-verifikasi" element={<MainPage menu="Verifikasi"/>} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
