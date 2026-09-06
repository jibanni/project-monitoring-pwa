import './utils/fitProjectUpdateHeroTitle'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme.css'
import './styles/layout.css'
import './styles/dashboard.css'
import './styles/mainPageHero.css'
import './styles/desktopDensity.css'
import './styles/typography.css'
import './styles/filterSystem.css'
import './styles/secondaryFilterSingleFrame.css'
import App from './App.tsx'
import './utils/titleCaseLocationsDom'
import { initPms10StandalonePwaClass } from './utils/pms10StandalonePwaClass'
import { initPms10PwaAutoUpdate } from './utils/pwaAutoUpdate'
initPms10StandalonePwaClass()
initPms10PwaAutoUpdate()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)