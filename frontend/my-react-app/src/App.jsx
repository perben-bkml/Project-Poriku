// Package imports
import React from 'react'
// Component Imports
import Navbar from './components/Navbar'
import Footer from './components/Footer'
//Page Imports
import Home from './pages/Home'
import Bendahara from './pages/Bendahara-main'

function App() {

  return (
    <div>
      <Navbar />
      {/* <Home /> */}
      <Bendahara />
      <Footer />
    </div>
  )
}

export default App
