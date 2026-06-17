import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Projects() {
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')

    if (error) {
      console.error(error)
      return
    }

    setProjects(data || [])
  }

  return (
    <div>
      <h1>Projects</h1>

      {projects.map((project) => (
        <div
          key={project.id}
          style={{
            border: '1px solid #ccc',
            padding: '15px',
            marginBottom: '15px',
            borderRadius: '8px'
          }}
        >
          <h3>
            <Link to={`/projects/${project.id}`}>
              {project.project_name}
            </Link>
          </h3>

          <p>Status: {project.status}</p>

          <p>
            Physical: {project.physical_accomplishment}%
          </p>

          <p>
            City/Municipality:{' '}
            {project.city_municipality || project.municipality}
          </p>
        </div>
      ))}
    </div>
  )
}

export default Projects