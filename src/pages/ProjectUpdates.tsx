import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function ProjectUpdates() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [inspectionDate, setInspectionDate] = useState('')
  const [physical, setPhysical] = useState('')
  const [financial, setFinancial] = useState('')
  const [riskLevel, setRiskLevel] = useState('Low')
  const [issues, setIssues] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [remarks, setRemarks] = useState('')

  async function saveUpdate() {
    if (!id) {
      alert('Project ID not found')
      return
    }

    const physicalValue = Number(physical)
    const financialValue = Number(financial)

    // STEP 1: INSERT UPDATE HISTORY

    const updateResult = await supabase
      .from('project_updates')
      .insert([
        {
          project_id: id,
          inspection_date: inspectionDate,
          physical_accomplishment: physicalValue,
          financial_accomplishment: financialValue,
          risk_level: riskLevel,
          issues,
          recommendations,
          remarks
        }
      ])

    if (updateResult.error) {
      console.error(updateResult.error)
      alert(updateResult.error.message)
      return
    }

    // STEP 2: UPDATE MASTER PROJECT RECORD

    const projectResult = await supabase
      .from('projects')
      .update({
        physical_accomplishment: physicalValue,
        financial_accomplishment: financialValue,
        risk_level: riskLevel,
        issues,
        recommendations,
        last_inspection_date: inspectionDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (projectResult.error) {
      console.error(projectResult.error)
      alert(projectResult.error.message)
      return
    }

    alert('Project update saved successfully')

    // STEP 3: RETURN TO PROJECT DETAILS

    navigate(`/projects/${id}`)
  }

  return (
    <div>
      <h1>Project Update Form</h1>

      <div style={{ maxWidth: '600px' }}>
        <p>Inspection Date</p>
        <input
          type="date"
          value={inspectionDate}
          onChange={(e) =>
            setInspectionDate(e.target.value)
          }
        />

        <p>Physical Accomplishment (%)</p>
        <input
          type="number"
          value={physical}
          onChange={(e) =>
            setPhysical(e.target.value)
          }
        />

        <p>Financial Accomplishment (%)</p>
        <input
          type="number"
          value={financial}
          onChange={(e) =>
            setFinancial(e.target.value)
          }
        />

        <p>Risk Level</p>
        <select
          value={riskLevel}
          onChange={(e) =>
            setRiskLevel(e.target.value)
          }
        >
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>

        <p>Issues</p>
        <textarea
          rows={4}
          value={issues}
          onChange={(e) =>
            setIssues(e.target.value)
          }
        />

        <p>Recommendations</p>
        <textarea
          rows={4}
          value={recommendations}
          onChange={(e) =>
            setRecommendations(e.target.value)
          }
        />

        <p>Remarks</p>
        <textarea
          rows={4}
          value={remarks}
          onChange={(e) =>
            setRemarks(e.target.value)
          }
        />

        <br />
        <br />

        <button onClick={saveUpdate}>
          Save Update
        </button>
      </div>
    </div>
  )
}

export default ProjectUpdates