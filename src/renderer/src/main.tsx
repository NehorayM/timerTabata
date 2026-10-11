import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@fontsource/roboto-condensed/400.css'
import '@fontsource/roboto-condensed/700.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { UiProvider } from './components/ui'
import { MiniTimer } from './screens/Mini'

const mini = window.location.hash === '#mini'
document.documentElement.classList.toggle('is-mini', mini)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mini ? (
      <MiniTimer />
    ) : (
      <UiProvider>
        <App />
      </UiProvider>
    )}
  </StrictMode>
)
