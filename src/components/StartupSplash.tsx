import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import '../styles/startupSplash.css'

type StartupSplashProps = {
  message?: string
}

export default function StartupSplash({
  message = 'Preparing your dashboard…',
}: StartupSplashProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('pms-startup-splash-active')

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('pms-startup-splash-active')
    }
  }, [])

  const splash = (
    <main className="pms-startup-splash" role="status" aria-live="polite">
      <div className="pms-startup-glow pms-startup-glow-one" aria-hidden="true" />
      <div className="pms-startup-glow pms-startup-glow-two" aria-hidden="true" />

      <section className="pms-startup-brand">
        <div className="pms-startup-logo-stage" aria-hidden="true">
          <div className="pms-startup-logo-halo" />
          <img
            src="/pwa-512x512.png"
            alt=""
            className="pms-startup-logo"
          />
        </div>

        <div className="pms-startup-copy">
          <strong>PMS10</strong>
          <span>Project Monitoring System</span>
        </div>

        <div className="pms-startup-loadbars" aria-hidden="true">
          <div className="pms-startup-loadbar">
            <span className="pms-startup-loadbar-runner runner-one" />
          </div>
          <div className="pms-startup-loadbar secondary">
            <span className="pms-startup-loadbar-runner runner-two" />
          </div>
          <div className="pms-startup-loadbar tertiary">
            <span className="pms-startup-loadbar-runner runner-three" />
          </div>
        </div>

        <span className="pms-startup-message">{message}</span>
      </section>
    </main>
  )

  if (typeof document === 'undefined') return splash
  return createPortal(splash, document.body)
}
