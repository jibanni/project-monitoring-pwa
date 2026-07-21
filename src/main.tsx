import { initPms10BottomNavRuntimeFix } from "./utils/pms10BottomNavRuntimeFix";
import { initPms10BottomNavLevelOverride } from "./utils/pms10BottomNavLevelOverride";
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
import { initPms10ProgramDropdownCaps } from './utils/pms10ProgramDropdownCaps'

initPms10BottomNavRuntimeFix();
initPms10BottomNavLevelOverride();
initPms10DisableZoomExceptMap();
initPms10ProgramDropdownCaps()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)