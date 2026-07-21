import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { canEditProjectRecord, getCanonicalRole } from '../utils/aorAccess'
import {
  getComputedRiskLevel,
  getContractExpirationInfo,
  getProjectReasonLabel,
  getStatusFromContractModification,
  getTargetPhysicalInfo,
  requiresProjectReason,
} from '../utils/projectVariance'
import { toProjectTitleCase } from '../utils/projectTitleCase'
import '../styles/editProject.css'
import '../styles/pageHero.css'

const MINDANAO_BOUNDS = {
  minLat: 4,
  maxLat: 10.8,
  minLng: 119,
  maxLng: 127.8,
}

type ProjectForm = {
  project_name: string
  description: string
  status: string
  project_type: string
  funding_source: string
  funding_year: string
  implementing_office: string
  contractor: string
  budget: string
  disbursement_amount: string
  start_date: string
  target_completion_date: string
  contract_expiration_date: string
  has_contract_modification: string
  contract_modification_type: string
  revised_project_cost: string
  revised_contract_expiration_date: string
  barangay: string
  municipality: string
  province: string
  latitude: string
  longitude: string
  physical_accomplishment: string
  financial_accomplishment: string
  not_yet_started_reason: string
  target_physical_accomplishment: string
  target_physical_as_of: string
  target_physical_source: string
  risk_level: string
  last_inspection_date: string
}

type CoordinateStatus = {
  state: 'blank' | 'valid' | 'invalid' | 'reversed'
  message: string
  latitude: number | null
  longitude: number | null
  canSwap: boolean
}

const emptyForm: ProjectForm = {
  project_name: '',
  description: '',
  status: 'Not Yet Started',
  project_type: '',
  funding_source: '',
  funding_year: '',
  implementing_office: '',
  contractor: '',
  budget: '',
  disbursement_amount: '',
  start_date: '',
  target_completion_date: '',
  contract_expiration_date: '',
  has_contract_modification: 'no',
  contract_modification_type: '',
  revised_project_cost: '',
  revised_contract_expiration_date: '',
  barangay: '',
  municipality: '',
  province: '',
  latitude: '',
  longitude: '',
  physical_accomplishment: '0',
  financial_accomplishment: '0',
  not_yet_started_reason: '',
  target_physical_accomplishment: '',
  target_physical_as_of: '',
  target_physical_source: 'auto',
  risk_level: 'None',
  last_inspection_date: '',
}

const fundingYearOptions = [2023, 2024, 2025, 2026, 2027, 2028]

const FUNDING_SOURCE_OPTIONS = [
  'RAPID Growth Project',
  'LGSF-FALGU',
  'LGSF-GEF',
  'LGSF-SBDP',
  'LGSF - SBDP UA',
  'LGSF-SAFPB',
  'SALINTUBIG',
  'CMGP / KALSADA',
  'Other',
]

const statusOptions = [
  'Under Review',
  'Under Procurement',
  'Not Yet Started',
  'Ongoing',
  'Suspended',
  'Terminated',
  'Completed',
]


const NOT_YET_STARTED_REASON_OPTIONS = [
  'No TDRs Submitted',
  'Lacking TDRs Submitted',
  'TDRs under PO Engineers Review',
  'TDRs under Review (PO)',
  'TDRs under Review (RO)',
]

const SUSPENSION_ORDER_TYPE = 'Suspension Order (SO)'

const CONTRACT_MODIFICATION_TYPE_OPTIONS = [
  'Variation Order (VO)',
  SUSPENSION_ORDER_TYPE,
  'Time Extension (EOT)',
  'Combination',
]

const PROJECT_TYPE_OPTIONS = [
  'Road',
  'Bridge',
  'Water Supply',
  'Building',
  'Drainage / Flood Control',
  'Evacuation Facility',
  'Rural Electrification',
  'Vehicle',
  'Non Infra',
  'Other Infrastructure',
]

function cleanText(value: string) {
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

function dateInputValue(value: unknown) {
  if (!value || typeof value !== 'string') return ''
  return value.slice(0, 10)
}

function formatLongDate(value?: string | null) {
  if (!value) return 'Select date'

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) return 'Select date'

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function numberInputValue(value: unknown) {
  if (value === null || value === undefined) return ''
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? String(numericValue) : ''
}

function toNullableNumber(value: string) {
  const cleaned = value.trim()

  if (!cleaned) return null

  const numericValue = Number(cleaned)

  if (!Number.isFinite(numericValue)) return null

  return numericValue
}

function clampProgress(value: string) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return 0

  return Math.min(100, Math.max(0, numericValue))
}

function isWithinMindanao(latitude: number, longitude: number) {
  return (
    latitude >= MINDANAO_BOUNDS.minLat &&
    latitude <= MINDANAO_BOUNDS.maxLat &&
    longitude >= MINDANAO_BOUNDS.minLng &&
    longitude <= MINDANAO_BOUNDS.maxLng
  )
}

function analyzeCoordinates(latitudeValue: string, longitudeValue: string): CoordinateStatus {
  const latitudeText = latitudeValue.trim()
  const longitudeText = longitudeValue.trim()

  if (!latitudeText && !longitudeText) {
    return {
      state: 'blank',
      message: 'GPS is optional. Leave both fields blank if no coordinate is available.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (!latitudeText || !longitudeText) {
    return {
      state: 'invalid',
      message: 'Both latitude and longitude are required when adding GPS coordinates.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  const latitude = Number(latitudeText)
  const longitude = Number(longitudeText)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      state: 'invalid',
      message: 'Latitude and longitude must be valid numbers.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (latitude === 0 && longitude === 0) {
    return {
      state: 'invalid',
      message: 'Coordinates 0, 0 are invalid.',
      latitude: null,
      longitude: null,
      canSwap: false,
    }
  }

  if (isWithinMindanao(latitude, longitude)) {
    return {
      state: 'valid',
      message: 'GPS coordinate is valid and within Mindanao.',
      latitude,
      longitude,
      canSwap: false,
    }
  }

  if (isWithinMindanao(longitude, latitude)) {
    return {
      state: 'reversed',
      message: 'The coordinates appear reversed. Use Swap Coordinates before saving.',
      latitude: null,
      longitude: null,
      canSwap: true,
    }
  }

  return {
    state: 'invalid',
    message: 'GPS coordinate is outside the allowed Mindanao range.',
    latitude: null,
    longitude: null,
    canSwap: false,
  }
}

function formatPhp(value: string) {
  const amount = Number(value)

  if (!Number.isFinite(amount) || amount <= 0) return 'Php 0.00'

  return `Php ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: string) {
  const amount = clampProgress(value)

  return `${amount.toLocaleString('en-PH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`
}


function evaluateAmountExpression(value: string) {
  const expression = value.replace(/,/g, '').trim()

  if (!expression) return null

  if (!/^[0-9+\-*/().\s]+$/.test(expression)) return null

  try {
    const result = Function(`"use strict"; return (${expression})`)()
    const numericValue = Number(result)

    if (!Number.isFinite(numericValue) || numericValue < 0) return null

    return numericValue
  } catch {
    return null
  }
}

function formatAmountInput(value: number) {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)

  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function formatFinancialPercent(value: number) {
  if (!Number.isFinite(value)) return '0.00'

  const clamped = Math.min(100, Math.max(0, value))

  return clamped.toFixed(2)
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
      <path d="M9 12h10" />
    </svg>
  )
}

function IconDetails() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2.75h8.1L19 7.65V21.25H6V2.75Z" />
      <path d="M14 2.75V8h5" />
      <path d="M8.8 12h6.4" />
      <path d="M8.8 15.1h6.4" />
      <path d="M8.8 18.2h4.6" />
    </svg>
  )
}

export default function EditProject() {
  const { id } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const revisedContractExpirationDateInputRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [portalReady, setPortalReady] = useState(false)

  const role = getCanonicalRole(auth.profile?.role)
  const canAccessEditRoute = auth.isAdmin || auth.isROEngineer || role === 'RO Engineer'
  const hasContractModification = form.has_contract_modification === 'yes'
  const activeModificationType = hasContractModification ? form.contract_modification_type : ''
  const isSuspendedStatus = form.status.toLowerCase().includes('suspend')
  const contractModificationTypeOptions = useMemo(() => {
    return isSuspendedStatus ? [SUSPENSION_ORDER_TYPE] : CONTRACT_MODIFICATION_TYPE_OPTIONS
  }, [isSuspendedStatus])
  const requiresNotYetStartedReason = form.status === 'Not Yet Started'
  const requiresProjectChangeReason = requiresProjectReason(form.status, activeModificationType)
  const projectReasonLabel = getProjectReasonLabel(form.status, activeModificationType)

  const disbursementAmount = useMemo(() => {
    const evaluatedAmount = evaluateAmountExpression(form.disbursement_amount)

    if (evaluatedAmount !== null) return evaluatedAmount

    return toNullableNumber(form.disbursement_amount) ?? 0
  }, [form.disbursement_amount])

  const officialProjectCost = useMemo(() => {
    const originalCost = toNullableNumber(form.budget) ?? 0
    const revisedCost = toNullableNumber(form.revised_project_cost) ?? 0

    return hasContractModification && revisedCost > 0 ? revisedCost : originalCost
  }, [form.budget, form.revised_project_cost, hasContractModification])

  useEffect(() => {
    if (!requiresProjectChangeReason && form.not_yet_started_reason) {
      updateField('not_yet_started_reason', '')
    }
  }, [requiresProjectChangeReason, form.not_yet_started_reason])

  useEffect(() => {
    if (!hasContractModification) {
      setForm((current) => ({
        ...current,
        revised_project_cost: '',
        revised_contract_expiration_date: '',
        contract_modification_type: '',
      }))
    }
  }, [hasContractModification])

  useEffect(() => {
    const statusFromModification = getStatusFromContractModification(form.contract_modification_type)

    if (hasContractModification && statusFromModification && form.status !== statusFromModification) {
      updateField('status', statusFromModification)
    }
  }, [form.contract_modification_type, form.status, hasContractModification])

  useEffect(() => {
    if (!isSuspendedStatus) return

    setForm((current) => {
      const nextForm = { ...current }

      if (nextForm.has_contract_modification !== 'yes') {
        nextForm.has_contract_modification = 'yes'
      }

      if (nextForm.contract_modification_type !== SUSPENSION_ORDER_TYPE) {
        nextForm.contract_modification_type = SUSPENSION_ORDER_TYPE
      }

      return nextForm
    })
  }, [isSuspendedStatus])

  useEffect(() => {
    if (officialProjectCost <= 0 || disbursementAmount <= 0) {
      if (form.financial_accomplishment !== '0.00') {
        updateField('financial_accomplishment', '0.00')
      }
      return
    }

    const nextFinancial = formatFinancialPercent((disbursementAmount / officialProjectCost) * 100)

    if (form.financial_accomplishment !== nextFinancial) {
      updateField('financial_accomplishment', nextFinancial)
    }
  }, [disbursementAmount, officialProjectCost, form.financial_accomplishment])

  const contractInfo = useMemo(() => {
    return getContractExpirationInfo({
      contract_expiration_date: form.contract_expiration_date,
      has_contract_modification: hasContractModification,
      revised_contract_expiration_date: form.revised_contract_expiration_date,
      contract_modification_type: form.contract_modification_type,
    })
  }, [
    form.contract_expiration_date,
    hasContractModification,
    form.revised_contract_expiration_date,
    form.contract_modification_type,
  ])

  const coordinateStatus = useMemo(
    () => analyzeCoordinates(form.latitude, form.longitude),
    [form.latitude, form.longitude]
  )
  const riskInfo = useMemo(() => {
    return getTargetPhysicalInfo({
      start_date: form.start_date,
      target_completion_date: form.target_completion_date,
      physical_accomplishment: form.physical_accomplishment,
      target_physical_accomplishment: form.target_physical_accomplishment,
      target_physical_as_of: form.target_physical_as_of || form.last_inspection_date,
      target_physical_source: form.target_physical_source,
      last_inspection_date: form.last_inspection_date,
      contract_expiration_date: form.contract_expiration_date,
      has_contract_modification: hasContractModification,
      revised_contract_expiration_date: form.revised_contract_expiration_date,
      contract_modification_type: form.contract_modification_type,
    })
  }, [
    form.start_date,
    form.target_completion_date,
    form.physical_accomplishment,
    form.target_physical_accomplishment,
    form.target_physical_as_of,
    form.target_physical_source,
    form.last_inspection_date,
    form.contract_expiration_date,
    hasContractModification,
    form.revised_contract_expiration_date,
    form.contract_modification_type,
  ])

  const computedRiskLevel = useMemo(() => {
    return getComputedRiskLevel({
      start_date: form.start_date,
      target_completion_date: form.target_completion_date,
      physical_accomplishment: form.physical_accomplishment,
      target_physical_accomplishment: form.target_physical_accomplishment,
      target_physical_as_of: form.target_physical_as_of || form.last_inspection_date,
      target_physical_source: form.target_physical_source,
      last_inspection_date: form.last_inspection_date,
      contract_expiration_date: form.contract_expiration_date,
      has_contract_modification: hasContractModification,
      revised_contract_expiration_date: form.revised_contract_expiration_date,
      contract_modification_type: form.contract_modification_type,
    })
  }, [
    form.start_date,
    form.target_completion_date,
    form.physical_accomplishment,
    form.target_physical_accomplishment,
    form.target_physical_as_of,
    form.target_physical_source,
    form.last_inspection_date,
    form.contract_expiration_date,
    hasContractModification,
    form.revised_contract_expiration_date,
    form.contract_modification_type,
  ])

  const mergedStatusOptions = useMemo(() => {
    if (!form.status || statusOptions.includes(form.status)) return statusOptions
    return [form.status, ...statusOptions]
  }, [form.status])

  const mergedProjectTypeOptions = useMemo(() => {
    if (!form.project_type || PROJECT_TYPE_OPTIONS.includes(form.project_type)) {
      return PROJECT_TYPE_OPTIONS
    }

    return [form.project_type, ...PROJECT_TYPE_OPTIONS]
  }, [form.project_type])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!canAccessEditRoute) {
      navigate('/unauthorized', { replace: true })
      return
    }

    loadProject()
  }, [id, canAccessEditRoute])

  async function loadProject() {
    if (!id) {
      setPageError('Missing project ID.')
      setLoading(false)
      return
    }

    setLoading(true)
    setPageError('')
    setSuccessMessage('')

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      setPageError(error.message || 'Unable to load project details.')
      setLoading(false)
      return
    }

    if (!data) {
      setPageError('Project record was not found.')
      setLoading(false)
      return
    }

    if (!canEditProjectRecord(data, auth)) {
      navigate('/unauthorized', { replace: true })
      return
    }

    setForm({
      project_name: data.project_name || '',
      description: data.description || '',
      status: data.status || 'Not Yet Started',
      project_type: data.project_type || '',
      funding_source: data.funding_source || '',
      funding_year: numberInputValue(data.funding_year),
      implementing_office: data.implementing_office || '',
      contractor: data.contractor || '',
      budget: numberInputValue(data.budget),
      disbursement_amount: numberInputValue(data.disbursement_amount),
      start_date: dateInputValue(data.start_date),
      target_completion_date: dateInputValue(data.target_completion_date),
      contract_expiration_date: dateInputValue(data.contract_expiration_date),
      has_contract_modification: data.has_contract_modification ? 'yes' : 'no',
      contract_modification_type: data.contract_modification_type || '',
      revised_project_cost: numberInputValue(data.revised_project_cost),
      revised_contract_expiration_date: dateInputValue(data.revised_contract_expiration_date),
      barangay: data.barangay || '',
      municipality: data.municipality || '',
      province: data.province || '',
      latitude: numberInputValue(data.latitude),
      longitude: numberInputValue(data.longitude),
      physical_accomplishment: numberInputValue(data.physical_accomplishment) || '0',
      financial_accomplishment: numberInputValue(data.financial_accomplishment) || '0',
      not_yet_started_reason: data.not_yet_started_reason || '',
      target_physical_accomplishment: numberInputValue(data.target_physical_accomplishment),
      target_physical_as_of: dateInputValue(data.target_physical_as_of),
      target_physical_source: data.target_physical_source || 'auto',
      risk_level: data.risk_level || 'None',
      last_inspection_date: dateInputValue(data.last_inspection_date),
    })

    setLoading(false)
  }

  function updateField(field: keyof ProjectForm, value: string) {
    setForm((current) => {
      const nextForm = {
        ...current,
        [field]: value,
      }

      if (field === 'status' && value !== 'Not Yet Started') {
        nextForm.not_yet_started_reason = ''
      }

      if (field === 'has_contract_modification' && value !== 'yes') {
        nextForm.contract_modification_type = ''
        nextForm.revised_project_cost = ''
        nextForm.revised_contract_expiration_date = ''
      }

      return nextForm
    })

    if (pageError) setPageError('')
    if (successMessage) setSuccessMessage('')
  }

  function openDateInput(dateInput: HTMLInputElement | null) {
    const pickerInput = dateInput as
      | (HTMLInputElement & { showPicker?: () => void })
      | null

    if (!pickerInput) return

    if (pickerInput.showPicker) {
      pickerInput.showPicker()
      return
    }

    pickerInput.focus()
    pickerInput.click()
  }

  function openRevisedContractExpirationPicker() {
    openDateInput(revisedContractExpirationDateInputRef.current)
  }

  function handleStatusChange(nextStatus: string) {
    setForm((current) => {
      const nextForm = {
        ...current,
        status: nextStatus,
      }

      if (nextStatus !== 'Not Yet Started') {
        nextForm.not_yet_started_reason = ''
      }

      if (nextStatus.toLowerCase().includes('suspend')) {
        nextForm.has_contract_modification = 'yes'
        nextForm.contract_modification_type = SUSPENSION_ORDER_TYPE
      } else if (nextForm.contract_modification_type === SUSPENSION_ORDER_TYPE) {
        nextForm.contract_modification_type = ''
      }

      return nextForm
    })

    if (pageError) setPageError('')
    if (successMessage) setSuccessMessage('')
  }

  function handleContractModificationTypeChange(nextType: string) {
    setForm((current) => {
      const statusFromModification = getStatusFromContractModification(nextType)

      return {
        ...current,
        contract_modification_type: nextType,
        status: statusFromModification || current.status,
      }
    })

    if (pageError) setPageError('')
    if (successMessage) setSuccessMessage('')
  }

  function swapCoordinates() {
    setForm((current) => ({
      ...current,
      latitude: current.longitude,
      longitude: current.latitude,
    }))
  }

  function resolveDisbursementExpression() {
    const amount = evaluateAmountExpression(form.disbursement_amount)

    if (amount === null) {
      setPageError('Disbursement must be a valid amount or calculator expression.')
      return
    }

    updateField('disbursement_amount', formatAmountInput(amount))
    setPageError('')
  }

  function handleDisbursementKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault()
      resolveDisbursementExpression()
    }
  }

  function validateForm() {
    if (!cleanText(form.project_name)) {
      return 'Project name is required.'
    }

    if (!cleanText(form.status)) {
      return 'Project status is required.'
    }

    if (requiresProjectChangeReason && !cleanText(form.not_yet_started_reason)) {
      return `Please provide the ${projectReasonLabel.toLowerCase()}.`
    }

    if (
      hasContractModification &&
      (!cleanText(form.revised_project_cost) ||
        !cleanText(form.revised_contract_expiration_date) ||
        !cleanText(form.contract_modification_type))
    ) {
      return 'Please complete the revised contract details before saving.'
    }

    if (!canEditProjectRecord({ province: form.province, municipality: form.municipality }, auth)) {
      return 'RO Engineer accounts can edit project master records only within their assigned province AOR.'
    }

    if (form.budget.trim()) {
      const amount = Number(form.budget)

      if (!Number.isFinite(amount) || amount < 0) {
        return 'Project Cost must be a valid amount.'
      }
    }

    const physicalValue = Number(form.physical_accomplishment)
    const financialValue = Number(form.financial_accomplishment)

    if (!Number.isFinite(physicalValue) || physicalValue < 0 || physicalValue > 100) {
      return 'Physical accomplishment must be from 0 to 100.'
    }

    if (!Number.isFinite(financialValue) || financialValue < 0 || financialValue > 100) {
      return 'Financial accomplishment must be from 0 to 100.'
    }

    if (coordinateStatus.state === 'invalid' || coordinateStatus.state === 'reversed') {
      return coordinateStatus.message
    }

    return ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!id) {
      setPageError('Missing project ID.')
      return
    }

    const validationError = validateForm()

    if (validationError) {
      setPageError(validationError)
      return
    }

    setSaving(true)
    setPageError('')
    setSuccessMessage('')

    const updatePayload = {
      project_name: toProjectTitleCase(cleanText(form.project_name) || 'Untitled Project'),
      description: cleanText(form.description),
      status: cleanText(form.status) || 'Not Yet Started',
      project_type: cleanText(form.project_type),
      funding_source: cleanText(form.funding_source),
      funding_year: cleanText(form.funding_year) ? Number(form.funding_year) : null,
      implementing_office: cleanText(form.implementing_office),
      contractor: cleanText(form.contractor),
      budget: toNullableNumber(form.budget) ?? 0,
      disbursement_amount: disbursementAmount > 0 ? disbursementAmount : 0,
      start_date: cleanText(form.start_date),
      target_completion_date: cleanText(form.target_completion_date),
      contract_expiration_date: cleanText(form.contract_expiration_date),
      has_contract_modification: hasContractModification,
      contract_modification_type: hasContractModification
        ? cleanText(form.contract_modification_type)
        : null,
      revised_project_cost: hasContractModification && cleanText(form.revised_project_cost)
        ? toNullableNumber(form.revised_project_cost)
        : null,
      revised_contract_expiration_date: hasContractModification
        ? cleanText(form.revised_contract_expiration_date)
        : null,
      barangay: cleanText(form.barangay),
      municipality: cleanText(form.municipality),
      province: cleanText(form.province),
      latitude: coordinateStatus.state === 'valid' ? coordinateStatus.latitude : null,
      longitude: coordinateStatus.state === 'valid' ? coordinateStatus.longitude : null,
      physical_accomplishment: clampProgress(form.physical_accomplishment),
      financial_accomplishment: clampProgress(form.financial_accomplishment),
      not_yet_started_reason: requiresProjectChangeReason ? cleanText(form.not_yet_started_reason) : null,
      target_physical_accomplishment: cleanText(form.target_physical_accomplishment)
        ? clampProgress(form.target_physical_accomplishment)
        : null,
      target_physical_as_of: cleanText(form.target_physical_as_of || form.last_inspection_date),
      target_physical_source: cleanText(form.target_physical_source) || 'auto',
      risk_level: computedRiskLevel,
      last_inspection_date: cleanText(form.last_inspection_date),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      setPageError(error.message || 'Unable to update project.')
      setSaving(false)
      return
    }

    setSuccessMessage('Project details were updated successfully.')

    setTimeout(() => {
      navigate(`/projects/${id}`)
    }, 700)
  }

  if (!canAccessEditRoute) {
    return null
  }

  if (loading) {
    return (
      <main className="edit-project-page">
        <section className="edit-project-hero">
          <div className="edit-project-hero-content">
            <p className="edit-project-eyebrow">Project Administration</p>
            <h1>Edit Project</h1>
            <p>Loading enrolled project details from the project register.</p>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-loading">
            <div className="edit-project-loader" />
            <p>Loading project record...</p>
          </div>
        </section>
      </main>
    )
  }

  if (pageError && !form.project_name) {
    return (
      <main className="edit-project-page">
        <section className="edit-project-hero">
          <div className="edit-project-hero-content">
            <p className="edit-project-eyebrow">Project Administration</p>
            <h1>Edit Project</h1>
            <p>Review and update enrolled project details.</p>
          </div>

          <div className="edit-project-hero-actions">
            <Link
              to={id ? `/projects/${id}` : '/projects'}
              className="edit-project-button edit-project-button-secondary"
            >
              Back to Project Details
            </Link>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-alert edit-project-alert-error">{pageError}</div>
        </section>
      </main>
    )
  }

  return (
    <main className="edit-project-page">
      <section className="edit-project-hero">
        <div className="edit-project-hero-content">
          <p className="edit-project-eyebrow">Project Administration</p>
          <h1>Edit Project</h1>
          <p>
            Update all enrolled project details including implementation profile, project cost,
            progress, automatic risk level, inspection date, location, and GPS coordinates.
          </p>
        </div>

      </section>

      <section className="edit-project-summary-grid">
        <div className="edit-project-summary-card">
          <span>Project Status</span>
          <strong>{form.status || 'Not Set'}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Funding Year</span>
          <strong>{form.funding_year ? `FY ${form.funding_year}` : 'No FY'}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Risk Level</span>
          <strong className={`edit-project-risk-text risk-${computedRiskLevel.toLowerCase()}`}>{computedRiskLevel}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Project Cost</span>
          <strong>{formatPhp(form.budget)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Physical</span>
          <strong>{formatPercent(form.physical_accomplishment)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Financial</span>
          <strong>{formatPercent(form.financial_accomplishment)}</strong>
        </div>

        <div className="edit-project-summary-card">
          <span>Last Inspection</span>
          <strong>{form.last_inspection_date || 'No Date'}</strong>
        </div>
      </section>

      <form className="edit-project-form" onSubmit={handleSubmit}>
        {pageError && <div className="edit-project-alert edit-project-alert-error">{pageError}</div>}
        {successMessage && (
          <div className="edit-project-alert edit-project-alert-success">{successMessage}</div>
        )}

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Basic Information</p>
              <h2>Project Profile</h2>
            </div>

            <span className="edit-project-section-badge">Admin / RO Engineer Editable</span>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field edit-project-field-wide">
              <span>Project Name</span>
              <input
                type="text"
                value={form.project_name}
                onChange={(event) => updateField('project_name', event.target.value)}
                placeholder="Enter project name"
                required
              />
            </label>

            <label className="edit-project-field edit-project-field-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Enter project description"
                rows={4}
              />
            </label>

            <label className="edit-project-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => handleStatusChange(event.target.value)}
                required
              >
                {mergedStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            {requiresNotYetStartedReason ? (
              <label className="edit-project-field">
                <span>{projectReasonLabel} *</span>
                <select
                  value={form.not_yet_started_reason}
                  onChange={(event) => updateField('not_yet_started_reason', event.target.value)}
                >
                  <option value="">Select reason</option>
                  {NOT_YET_STARTED_REASON_OPTIONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={`edit-project-field ${!requiresProjectChangeReason ? 'edit-project-disabled-field' : ''}`}>
                <span>{projectReasonLabel} {requiresProjectChangeReason ? '*' : ''}</span>
                <textarea
                  value={form.not_yet_started_reason}
                  onChange={(event) => updateField('not_yet_started_reason', event.target.value)}
                  disabled={!requiresProjectChangeReason}
                  placeholder={
                    requiresProjectChangeReason
                      ? 'State the reason/justification for this critical status or contract modification.'
                      : 'Not applicable'
                  }
                  rows={3}
                />
              </label>
            )}

            <div className="edit-project-field edit-project-readonly-field">
              <span>Risk Level</span>
              <strong className={`edit-project-risk-text risk-${computedRiskLevel.toLowerCase()}`}>{computedRiskLevel}</strong>
            </div>

            <label className="edit-project-field">
              <span>Project Type</span>
              <select
                value={form.project_type}
                onChange={(event) => updateField('project_type', event.target.value)}
              >
                <option value="">Select project type</option>
                {mergedProjectTypeOptions.map((projectType) => (
                  <option key={projectType} value={projectType}>
                    {projectType}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-project-field">
              <span>Funding Year</span>
              <select
                value={form.funding_year}
                onChange={(event) => updateField('funding_year', event.target.value)}
              >
                <option value="">No funding year</option>
                {fundingYearOptions.map((year) => (
                  <option key={year} value={year}>
                    FY {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-project-field">
              <span>Funding Source / Program</span>
              <select
                value={form.funding_source}
                onChange={(event) => updateField('funding_source', event.target.value)}
              >
                <option value="">SELECT FUNDING SOURCE</option>
                {FUNDING_SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-project-field">
              <span>Implementing Office</span>
              <input
                type="text"
                value={form.implementing_office}
                onChange={(event) => updateField('implementing_office', event.target.value)}
                placeholder="Enter implementing office"
              />
            </label>

            <label className="edit-project-field">
              <span>Contractor</span>
              <input
                type="text"
                value={form.contractor}
                onChange={(event) => updateField('contractor', event.target.value)}
                placeholder="Enter contractor name"
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Financial and Schedule</p>
              <h2>Project Cost and Dates</h2>
            </div>

            <div className="edit-project-cost-pill">{formatPhp(form.budget)}</div>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field">
              <span>Project Cost</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.budget}
                onChange={(event) => updateField('budget', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="edit-project-field">
              <span>Disbursement</span>
              <div className="edit-project-calculator-row">
                <input
                  value={form.disbursement_amount}
                  onChange={(event) => updateField('disbursement_amount', event.target.value)}
                  onKeyDown={handleDisbursementKeyDown}
                  onBlur={() => {
                    if (form.disbursement_amount.trim()) resolveDisbursementExpression()
                  }}
                  placeholder="Example: 500000 + 250000"
                  inputMode="decimal"
                />

                <button
                  type="button"
                  className="edit-project-equals-btn"
                  onClick={resolveDisbursementExpression}
                  aria-label="Compute disbursement"
                >
                  =
                </button>
              </div>
              <small>Press Enter or = to compute calculator-style input.</small>
            </label>

            <label className="edit-project-field">
              <span>Start Date</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => updateField('start_date', event.target.value)}
              />
            </label>

            <label className="edit-project-field">
              <span>Target Completion Date</span>
              <input
                type="date"
                value={form.target_completion_date}
                onChange={(event) => updateField('target_completion_date', event.target.value)}
              />
            </label>

            <label className="edit-project-field">
              <span>Contract Expiration Date</span>
              <input
                type="date"
                value={form.contract_expiration_date}
                onChange={(event) => updateField('contract_expiration_date', event.target.value)}
              />
            </label>

            <label className="edit-project-field">
              <span>Approved Contract Modification?</span>
              <select
                value={form.has_contract_modification}
                onChange={(event) => updateField('has_contract_modification', event.target.value)}
                disabled={isSuspendedStatus}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>

            {hasContractModification && (
              <label className="edit-project-field edit-project-field-wide">
                <span>Type of Modification *</span>
                <select
                  value={form.contract_modification_type}
                  onChange={(event) => handleContractModificationTypeChange(event.target.value)}
                >
                  <option value="">Select modification type</option>
                  {contractModificationTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {contractInfo.isExpired && (
              <div className="edit-project-contract-warning edit-project-field-wide">
                <strong>Contract Warning</strong>
                <span>{contractInfo.warningMessage}</span>
                <span>Risk will be automatically classified as High until a valid revised expiration date is encoded.</span>
              </div>
            )}

            {hasContractModification && (
              <>
                <label className="edit-project-field">
                  <span>Revised Project Cost *</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.revised_project_cost}
                    onChange={(event) => updateField('revised_project_cost', event.target.value)}
                    placeholder="0.00"
                  />
                </label>

                <label className="edit-project-field edit-project-date-field">
                  <span>Revised Contract Expiration Date *</span>

                  <div className="edit-project-long-date-field">
                    <div>
                      <strong>{formatLongDate(form.revised_contract_expiration_date)}</strong>
                      <small>Revised contract expiration</small>
                    </div>

                    <button
                      type="button"
                      className="edit-project-date-change-btn"
                      onClick={openRevisedContractExpirationPicker}
                      disabled={saving}
                    >
                      Change Date
                    </button>
                  </div>

                  <input
                    ref={revisedContractExpirationDateInputRef}
                    className="edit-project-hidden-date-input"
                    type="date"
                    value={form.revised_contract_expiration_date}
                    onChange={(event) => updateField('revised_contract_expiration_date', event.target.value)}
                    aria-label="Revised contract expiration date"
                  />
                </label>
              </>
            )}

            <label className="edit-project-field">
              <span>Last Inspection Date</span>
              <input
                type="date"
                value={form.last_inspection_date}
                onChange={(event) => updateField('last_inspection_date', event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Progress Monitoring</p>
              <h2>Accomplishment</h2>
            </div>
          </div>

          <div className="edit-project-progress-grid">
            <label className="edit-project-progress-card">
              <div className="edit-project-progress-header">
                <span>Physical Accomplishment</span>
                <strong>{formatPercent(form.physical_accomplishment)}</strong>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.physical_accomplishment}
                onChange={(event) => updateField('physical_accomplishment', event.target.value)}
                placeholder="0"
              />

              <div className="edit-project-progress-track">
                <div
                  className="edit-project-progress-fill"
                  style={{ width: `${clampProgress(form.physical_accomplishment)}%` }}
                />
              </div>
            </label>

            <label className="edit-project-progress-card edit-project-readonly-progress-card">
              <div className="edit-project-progress-header">
                <span>Financial Accomplishment</span>
                <strong>{formatPercent(form.financial_accomplishment)}</strong>
              </div>

              <input
                type="text"
                value={form.financial_accomplishment}
                readOnly
                placeholder="0.00"
              />
              <small>Auto-computed from Disbursement / Official Project Cost.</small>

              <div className="edit-project-progress-track">
                <div
                  className="edit-project-progress-fill"
                  style={{ width: `${clampProgress(form.financial_accomplishment)}%` }}
                />
              </div>
            </label>

            <div className="edit-project-progress-card edit-project-readonly-progress-card">
              <div className="edit-project-progress-header">
                <span>Variance</span>
                <strong>{riskInfo.compactLabel}</strong>
              </div>
              <div className="edit-project-progress-header">
                <span>Risk Level</span>
                <strong className={`edit-project-risk-text risk-${computedRiskLevel.toLowerCase()}`}>{computedRiskLevel}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>Location</p>
              <h2>Project Location</h2>
            </div>
          </div>

          <div className="edit-project-grid">
            <label className="edit-project-field">
              <span>Province</span>
              <input
                type="text"
                value={form.province}
                onChange={(event) => updateField('province', event.target.value)}
                placeholder="Enter province"
              />
            </label>

            <label className="edit-project-field">
              <span>Municipality / City</span>
              <input
                type="text"
                value={form.municipality}
                onChange={(event) => updateField('municipality', event.target.value)}
                placeholder="Enter municipality or city"
              />
            </label>

            <label className="edit-project-field">
              <span>Barangay</span>
              <input
                type="text"
                value={form.barangay}
                onChange={(event) => updateField('barangay', event.target.value)}
                placeholder="Enter barangay"
              />
            </label>
          </div>
        </section>

        <section className="edit-project-card">
          <div className="edit-project-section-header">
            <div>
              <p>GIS Reference</p>
              <h2>Project Coordinates</h2>
            </div>

            {coordinateStatus.canSwap && (
              <button
                type="button"
                className="edit-project-button edit-project-button-warning"
                onClick={swapCoordinates}
              >
                Swap Coordinates
              </button>
            )}
          </div>

          <div className="edit-project-gps-box">
            <div className="edit-project-grid">
              <label className="edit-project-field">
                <span>Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(event) => updateField('latitude', event.target.value)}
                  placeholder="Example: 8.4542"
                />
              </label>

              <label className="edit-project-field">
                <span>Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(event) => updateField('longitude', event.target.value)}
                  placeholder="Example: 124.6319"
                />
              </label>
            </div>

            <div
              className={[
                'edit-project-coordinate-status',
                coordinateStatus.state === 'valid' ? 'edit-project-coordinate-valid' : '',
                coordinateStatus.state === 'invalid' || coordinateStatus.state === 'reversed'
                  ? 'edit-project-coordinate-invalid'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <strong>
                {coordinateStatus.state === 'valid'
                  ? 'Valid GPS'
                  : coordinateStatus.state === 'reversed'
                    ? 'Possible Reversed GPS'
                    : coordinateStatus.state === 'invalid'
                      ? 'Invalid GPS'
                      : 'Optional GPS'}
              </strong>
              <span>{coordinateStatus.message}</span>
            </div>
          </div>
        </section>

        <div className="edit-project-sticky-actions">
          <div>
            <span>Editing enrolled project record</span>
            <strong>{form.project_name || 'Untitled Project'}</strong>
          </div>

          <div className="edit-project-action-group">
            <Link
              to={`/projects/${id}`}
              className="edit-project-button edit-project-button-secondary"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="edit-project-button edit-project-button-primary"
              disabled={saving}
            >
              {saving ? 'Saving Changes...' : 'Save Project Changes'}
            </button>
          </div>
        </div>
      </form>

      {portalReady
        ? createPortal(
            <div className="edit-project-fab-stack" aria-label="Edit project quick actions">
              <button
                type="button"
                className="edit-project-fab edit-project-fab-back"
                onClick={() => navigate(`/projects/${id}`)}
                aria-label="Back to project details"
                title="Back to Project Details"
              >
                <IconBack />
              </button>

              <button
                type="button"
                className="edit-project-fab edit-project-fab-details"
                onClick={() => navigate(`/projects/${id}`)}
                aria-label="View project details"
                title="View Details"
              >
                <IconDetails />
              </button>
            </div>,
            document.body,
          )
        : null}
    </main>
  )
}
