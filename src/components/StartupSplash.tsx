import '../styles/startupSplash.css'

type StartupSplashProps = {
  message?: string
}

export default function StartupSplash({
  message = 'Preparing your secure workspace…',
}: StartupSplashProps) {
  return (
    <main className="pms-startup-splash" role="status" aria-live="polite">
      <section className="pms-startup-card">
        <img src="/pms10-logo-bluefilled.png" alt="PMS10" />
        <p>DILG X · PDMU</p>
        <h1>Project Monitoring System</h1>
        <div className="pms-startup-spinner" aria-hidden="true" />
        <span>{message}</span>
      </section>
    </main>
  )
}
