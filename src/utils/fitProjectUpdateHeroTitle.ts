function getTitleText(title: HTMLElement) {
  return title.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function getStartingSize(title: HTMLElement, textLength: number) {
  const width = Math.max(title.clientWidth, 1)

  if (textLength > 150) return Math.min(width * 0.047, 20)
  if (textLength > 120) return Math.min(width * 0.052, 22)
  if (textLength > 95) return Math.min(width * 0.058, 24)
  if (textLength > 70) return Math.min(width * 0.066, 28)
  return Math.min(width * 0.078, 36)
}

function fitOneProjectUpdateTitle(title: HTMLElement) {
  const hero = title.closest('.pu-update-hero-card') as HTMLElement | null
  if (!hero) return

  const text = getTitleText(title)
  if (!text) return

  title.style.removeProperty('--pu-update-title-size')
  title.style.removeProperty('--pu-update-title-line')

  const heroHeightLimit = window.innerWidth <= 420 ? 318 : 350
  const nonTitleHeight = hero.scrollHeight - title.scrollHeight
  const availableTitleHeight = Math.max(heroHeightLimit - nonTitleHeight - 16, 90)

  let size = getStartingSize(title, text.length)
  const minSize = text.length > 150 ? 12 : 14

  title.style.setProperty('--pu-update-title-line', '1.03')

  for (let i = 0; i < 28; i += 1) {
    title.style.setProperty('--pu-update-title-size', `${size}px`)

    const titleFits = title.scrollHeight <= availableTitleHeight
    const heroFits = hero.scrollHeight <= heroHeightLimit

    if (titleFits && heroFits) return

    size -= 1

    if (size <= minSize) {
      title.style.setProperty('--pu-update-title-size', `${minSize}px`)
      return
    }
  }
}

function fitProjectUpdateHeroTitles() {
  const titles = document.querySelectorAll<HTMLElement>('.pu-update-hero-title, .pu-update-hero-card h1')
  titles.forEach(fitOneProjectUpdateTitle)
}

if (typeof window !== 'undefined') {
  let queued = false

  const queueFit = () => {
    if (queued) return

    queued = true

    window.requestAnimationFrame(() => {
      queued = false
      fitProjectUpdateHeroTitles()
    })
  }

  queueFit()
  window.addEventListener('load', queueFit)
  window.addEventListener('resize', queueFit)
  window.addEventListener('popstate', queueFit)

  const observer = new MutationObserver(queueFit)

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

export {}
