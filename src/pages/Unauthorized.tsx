import { Link } from 'react-router-dom'

export default function Unauthorized() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Unauthorized</h1>

      <p>
        You do not have permission to access this page.
      </p>

      <Link to="/">Return Home</Link>
    </div>
  )
}