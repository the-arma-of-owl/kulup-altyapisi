import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IntroSplash } from './ui/IntroSplash'
import './style.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /><IntroSplash /></React.StrictMode>)
