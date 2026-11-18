import { useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  prepareRpmesLinkSettings, resolveRpmesSheet, rpmesLinkSlots, rpmesSheetLink,
  RPMES_LINK_VARIANTS, RPMES_PROVINCES,
  type RpmesSourceKey, type RpmesSourceLinks,
} from '../utils/rpmesStatusComparison'

type Props = {
  open: boolean
  disabled: boolean
  yearOptions: readonly string[]
  initialYear: string
  links: RpmesSourceLinks
  onSave: (next: RpmesSourceLinks, changed: RpmesSourceKey[]) => boolean
}

export default function RpmesLinkManager({ open, disabled, yearOptions, initialYear, links, onSave }: Props) {
  const id = useId()
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<RpmesSourceKey, string>>>({})
  const [invalidKeys, setInvalidKeys] = useState<RpmesSourceKey[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const year = selectedYear !== null && (selectedYear === '' || yearOptions.includes(selectedYear)) ? selectedYear : initialYear
  const slotsByYear = useMemo(() => Object.fromEntries(yearOptions.map((item) => [item, rpmesLinkSlots(item)])), [yearOptions])
  const slots = slotsByYear[year] ?? []
  const draftCount = Object.keys(drafts).length

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setError('')
    setNotice('')
    const result = prepareRpmesLinkSettings(links, Object.values(slotsByYear).flat(), drafts)
    setInvalidKeys(result.invalid.map(({ key }) => key))
    if (result.invalid.length) {
      const first = result.invalid[0]
      setSelectedYear(first.year)
      setError(`Enter a valid Google Sheets link for FY ${first.year} · ${first.label} · ${first.province}.`)
      return
    }
    if (result.changed.length && !onSave(result.next, result.changed)) {
      setError('Your browser could not save the links. Your edits are still here so you can try again.')
      return
    }
    setDrafts({})
    const count = result.changed.length
    setNotice(count ? `Saved ${count} RPMES link ${count === 1 ? 'change' : 'changes'} in this browser.` : 'No link changes to save.')
  }

  return <form id="rpmes-link-manager" className="rpmes-link-manager" aria-labelledby={`${id}-title`}
    onSubmit={save} hidden={!open} noValidate>
    <div className="rpmes-link-manager-heading">
      <div>
        <h2 id={`${id}-title`}>Manage RPMES Links</h2>
        <p>Paste or edit the Google Sheets link for each province and program. You can edit several years before saving.</p>
      </div>
      <label className="rpmes-link-manager-year">Link reporting year
        <select aria-label="Link reporting year" value={year} disabled={disabled} onChange={(event) => {
          setSelectedYear(event.target.value)
          setNotice('')
        }}>
          <option value="">Select year</option>
          {yearOptions.map((item) => <option value={item} key={item}>FY {item}</option>)}
        </select>
      </label>
    </div>
    {year ? <div className="rpmes-link-manager-table-wrap">
      <table className="rpmes-link-manager-table" aria-label={`RPMES links for FY ${year}`}>
        <thead><tr>
          <th scope="col">Province</th>
          {RPMES_LINK_VARIANTS.map(({ label }) => <th scope="col" key={label} data-preserve-case>{label}</th>)}
        </tr></thead>
        <tbody>{RPMES_PROVINCES.map((province) => <tr key={province}>
          <th scope="row">{province}</th>
          {slots.filter((slot) => slot.province === province).map((slot) => {
            const value = drafts[slot.key] ?? rpmesSheetLink(resolveRpmesSheet(links, slot.cohort, province))
            return <td key={slot.key}><input
              aria-label={`${province} ${slot.label} FY ${year} link`}
              aria-invalid={invalidKeys.includes(slot.key)}
              type="url" maxLength={2048} placeholder="Paste Google Sheets link"
              value={value} disabled={disabled} onChange={(event) => {
                const newValue = event.target.value
                const savedValue = rpmesSheetLink(resolveRpmesSheet(links, slot.cohort, province))
                setDrafts((previous) => {
                  const next = { ...previous }
                  if (newValue === savedValue) delete next[slot.key]
                  else next[slot.key] = newValue
                  return next
                })
                setInvalidKeys((previous) => previous.filter((key) => key !== slot.key))
                setError('')
                setNotice('')
              }} /></td>
          })}
        </tr>)}</tbody>
      </table>
    </div> : <p>Select a reporting year to enter workbook links.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="rpmes-comparison-controls rpmes-link-manager-footer">
      <p>Links are saved in this browser. Clear a field to remove that link. Workbooks are checked when you compare.</p>
      <div className="rpmes-actions">
        {draftCount > 0 && <span aria-live="polite">{draftCount} unsaved</span>}
        <button type="button" disabled={disabled || !draftCount} onClick={() => {
          setDrafts({})
          setInvalidKeys([])
          setError('')
          setNotice('')
        }}>Discard edits</button>
        <button type="submit" className="rpmes-primary" disabled={disabled || !draftCount}>Save links</button>
      </div>
    </div>
  </form>
}
