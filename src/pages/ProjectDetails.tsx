import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ProjectDetails() {
  const { id } = useParams();

  const [project, setProject] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);

    const projectResult = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    const updatesResult = await supabase
      .from("project_updates")
      .select("*")
      .eq("project_id", id)
      .order("inspection_date", { ascending: false });

    if (projectResult.data) {
      setProject(projectResult.data);
    }

    if (updatesResult.data) {
      setUpdates(updatesResult.data);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>Project not found</h2>
      </div>
    );
  }

  const latestUpdate =
    updates.length > 0 ? updates[0] : null;

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      <h1>{project.project_name}</h1>

      <p>
        <strong>Status:</strong>{" "}
        {project.status}
      </p>

      <hr />

      <h2>Project Progress</h2>

      <p>
        Physical Accomplishment:
        {" "}
        <strong>
          {project.physical_accomplishment}%
        </strong>
      </p>

      <p>
        Financial Accomplishment:
        {" "}
        <strong>
          {project.financial_accomplishment}%
        </strong>
      </p>

      <p>
        Risk Level:
        {" "}
        <strong>
          {project.risk_level}
        </strong>
      </p>

      <p>
        Last Inspection Date:
        {" "}
        <strong>
          {project.last_inspection_date || "-"}
        </strong>
      </p>

      <hr />

      <h2>Project Information</h2>

      <p>
        <strong>Project Type:</strong>{" "}
        {project.project_type}
      </p>

      <p>
        <strong>Funding Source:</strong>{" "}
        {project.funding_source}
      </p>

      <p>
        <strong>Implementing Office:</strong>{" "}
        {project.implementing_office}
      </p>

      <p>
        <strong>Barangay:</strong>{" "}
        {project.barangay}
      </p>

      <p>
        <strong>Municipality:</strong>{" "}
        {project.municipality}
      </p>

      <p>
        <strong>Province:</strong>{" "}
        {project.province}
      </p>

      <hr />

      <h2>Latest Update</h2>

      {latestUpdate ? (
        <div
          style={{
            border: "1px solid #ccc",
            padding: "15px",
            borderRadius: "8px",
          }}
        >
          <p>
            <strong>Inspection Date:</strong>{" "}
            {latestUpdate.inspection_date}
          </p>

          <p>
            <strong>Physical:</strong>{" "}
            {latestUpdate.physical_accomplishment}%
          </p>

          <p>
            <strong>Financial:</strong>{" "}
            {latestUpdate.financial_accomplishment}%
          </p>

          <p>
            <strong>Risk Level:</strong>{" "}
            {latestUpdate.risk_level}
          </p>

          <p>
            <strong>Issues:</strong>{" "}
            {latestUpdate.issues}
          </p>

          <p>
            <strong>Recommendations:</strong>{" "}
            {latestUpdate.recommendations}
          </p>

          <p>
            <strong>Remarks:</strong>{" "}
            {latestUpdate.remarks}
          </p>
        </div>
      ) : (
        <p>No updates yet.</p>
      )}

      <hr />

      <h2>Update History</h2>

      {updates.length === 0 ? (
        <p>No update history available.</p>
      ) : (
        updates.map((update) => (
          <div
            key={update.id}
            style={{
              border: "1px solid #ddd",
              padding: "15px",
              marginBottom: "10px",
              borderRadius: "8px",
            }}
          >
            <p>
              <strong>Date:</strong>{" "}
              {update.inspection_date}
            </p>

            <p>
              <strong>Physical:</strong>{" "}
              {update.physical_accomplishment}%
            </p>

            <p>
              <strong>Financial:</strong>{" "}
              {update.financial_accomplishment}%
            </p>

            <p>
              <strong>Risk:</strong>{" "}
              {update.risk_level}
            </p>

            <p>
              <strong>Remarks:</strong>{" "}
              {update.remarks}
            </p>
          </div>
        ))
      )}

      <br />

      <Link to={`/projects/${id}/updates`}>
        <button>
          Add Update
        </button>
      </Link>
    </div>
  );
}