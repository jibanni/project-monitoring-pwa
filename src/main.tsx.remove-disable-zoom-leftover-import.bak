import { initPms10DisableZoomExceptMap } from "./utils/disableAppZoomExceptMap";
import './utils/fitProjectUpdateHeroTitle'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme.css'
import './styles/layout.css'
import './styles/dashboard.css'
import App from './App.tsx'
import './utils/titleCaseLocationsDom'
import { initPms10StandalonePwaClass } from './utils/pms10StandalonePwaClass'
initPms10DisableZoomExceptMap();
initPms10StandalonePwaClass()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)