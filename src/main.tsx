import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/providers'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('#root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
