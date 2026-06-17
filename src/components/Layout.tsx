import { Link } from 'react-router-dom'

function Layout({ children }: any) {
  return (
    <div>
      <nav style={{ padding: '15px' }}>
        <Link to="/">Dashboard</Link>
        {' | '}
        <Link to="/projects">Projects</Link>
      </nav>

      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  )
}

export default Layout