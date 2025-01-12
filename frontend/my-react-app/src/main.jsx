import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Import CSS Styles
import '../public/styles/index.css'
import "../public/styles/components.css"
import "../public/styles/pages.css"
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
