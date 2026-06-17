import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function Dashboard() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setProjects(data || [])
    setLoading(false)
  }

  const totalProjects = projects.length

  const ongoingProjects = projects.filter(
    (p) => p.status === 'Ongoing'
  ).length

  const completedProjects = projects.filter(
    (p) => p.status === 'Completed'
  ).length

  const delayedProjects = projects.filter(
    (p) => p.status === 'Delayed'
  ).length

  const highRiskProjects = projects.filter(
    (p) => p.risk_level === 'High'
  )

  if (loading) {
    return <h2>Loading Dashboard...</h2>
  }

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}
    >
      <h1>Project Monitoring Dashboard</h1>

      {/* SUMMARY CARDS */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '15px',
          marginBottom: '30px'
        }}
      >
        <div
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px'
          }}
        >
          <h3>Total Projects</h3>
          <h2>{totalProjects}</h2>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px'
          }}
        >
          <h3>Ongoing</h3>
          <h2>{ongoingProjects}</h2>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px'
          }}
        >
          <h3>Completed</h3>
          <h2>{completedProjects}</h2>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px'
          }}
        >
          <h3>Delayed</h3>
          <h2>{delayedProjects}</h2>
        </div>
      </div>

      {/* RECENT PROJECTS */}

      <h2>Recent Project Updates</h2>

      {projects.length === 0 ? (
        <p>No projects found.</p>
      ) : (
        projects.slice(0, 5).map((project) => (
          <div
            key={project.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '10px'
            }}
          >
            <h3>{project.project_name}</h3>

            <p>
              <strong>Status:</strong>{' '}
              {project.status}
            </p>

            <p>
              <strong>Physical:</strong>{' '}
              {project.physical_accomplishment}%
            </p>

            <p>
              <strong>Financial:</strong>{' '}
              {project.financial_accomplishment}%
            </p>

            <p>
              <strong>Last Inspection:</strong>{' '}
              {project.last_inspection_date || '-'}
            </p>
          </div>
        ))
      )}

      <br />

      {/* HIGH RISK PROJECTS */}

      <h2>Projects Needing Attention</h2>

      {highRiskProjects.length === 0 ? (
        <p>No high-risk projects.</p>
      ) : (
        highRiskProjects.map((project) => (
          <div
            key={project.id}
            style={{
              border: '1px solid red',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '10px'
            }}
          >
            <h3>{project.project_name}</h3>

            <p>
              <strong>Risk Level:</strong>{' '}
              {project.risk_level}
            </p>

            <p>
              <strong>Issues:</strong>{' '}
              {project.issues || '-'}
            </p>
          </div>
        ))
      )}
    </div>
  )
}

export default Dashboard