export function normalizeMultiFilterValue(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value]

  return Array.from(
    new Set(
      rawValues
        .map((item) => String(item ?? '').trim())
        .filter(
          (item) =>
            item.length > 0 &&
            item !== 'All' &&
            item !== '__ALL__' &&
            item.toLowerCase() !== 'all programs' &&
            item.toLowerCase() !== 'all funding years',
        ),
    ),
  )
}

export function matchesMultiFilter(value: string, selectedValues: string[]) {
  if (selectedValues.length === 0) return true
  return selectedValues.includes(String(value ?? '').trim())
}

export function pruneMultiFilterValues(
  selectedValues: string[],
  availableValues: string[],
) {
  if (selectedValues.length === 0) return selectedValues

  const available = new Set(availableValues.map((value) => String(value).trim()))
  return selectedValues.filter((value) => available.has(value))
}

export function formatMultiFilterScope(
  selectedValues: string[],
  allLabel: string,
  prefix = '',
) {
  if (selectedValues.length === 0) return allLabel
  if (selectedValues.length <= 2) {
    return selectedValues.map((value) => `${prefix}${value}`).join(', ')
  }
  return `${selectedValues.length} selected`
}
