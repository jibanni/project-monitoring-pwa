const NAV_LABELS = ["home", "projects", "map", "reports", "sync", "users"];

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function findBottomNav(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        "nav",
        "footer",
        "[role='navigation']",
        "[class*='nav']",
        "[class*='Nav']",
        "[class*='tab']",
        "[class*='Tab']",
        "[class*='bottom']",
        "[class*='Bottom']",
      ].join(",")
    )
  );

  const matched = candidates
    .filter((element) => {
      const text = normalize(element.innerText || element.textContent || "");
      if (!NAV_LABELS.every((label) => text.includes(label))) return false;

      const rect = element.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.65) return false;
      if (rect.height < 45) return false;
      if (rect.bottom < window.innerHeight - 240) return false;

      return true;
    })
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((a, b) => {
      const bottomScore = b.rect.bottom - a.rect.bottom;
      if (Math.abs(bottomScore) > 2) return bottomScore;

      const aHeightPenalty = Math.abs(a.rect.height - 95);
      const bHeightPenalty = Math.abs(b.rect.height - 95);
      return aHeightPenalty - bHeightPenalty;
    });

  return matched[0]?.element ?? null;
}

function getItemText(item: HTMLElement) {
  return normalize(item.innerText || item.textContent || "");
}

function getNavItems(nav: HTMLElement): HTMLElement[] {
  const directItems = Array.from(nav.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.className.toString().toLowerCase().includes("blue-fill") &&
      NAV_LABELS.some((label) => getItemText(child).includes(label))
  );

  if (directItems.length >= 5) return directItems;

  const itemMap = new Map<string, HTMLElement>();

  for (const label of NAV_LABELS) {
    const possible = Array.from(nav.querySelectorAll<HTMLElement>("a, button, [role='button'], div, span"))
      .filter((element) => {
        const text = getItemText(element);
        if (!text.includes(label)) return false;

        const rect = element.getBoundingClientRect();
        if (rect.width < 28 || rect.width > 170) return false;
        if (rect.height < 28 || rect.height > 130) return false;

        return true;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0];

    if (possible) {
      const container =
        possible.closest<HTMLElement>("a, button, [role='button']") ??
        possible.parentElement ??
        possible;

      itemMap.set(label, container);
    }
  }

  return Array.from(new Set(itemMap.values()));
}

function isHomePath(path: string) {
  return (
    path === "/" ||
    path.includes("dashboard") ||
    path.includes("home")
  ) &&
    !path.includes("project") &&
    !path.includes("map") &&
    !path.includes("report") &&
    !path.includes("sync") &&
    !path.includes("user");
}

function isActiveItem(item: HTMLElement) {
  const text = getItemText(item);
  const path = window.location.pathname.toLowerCase();

  const ariaCurrent = item.getAttribute("aria-current");
  if (ariaCurrent && ariaCurrent !== "false") return true;

  const classText = item.className.toString().toLowerCase();
  if (
    classText.includes("active") ||
    classText.includes("selected") ||
    classText.includes("current")
  ) {
    return true;
  }

  const anchor = item.matches("a") ? item : item.querySelector("a");
  if (anchor instanceof HTMLAnchorElement) {
    const href = (anchor.getAttribute("href") || "")
      .replace(/[\/#]/g, "")
      .toLowerCase();

    if (href && path.includes(href)) return true;
  }

  if (text.includes("home") && isHomePath(path)) return true;
  if (text.includes("projects") && path.includes("project")) return true;
  if (text.includes("map") && (path.includes("map") || path.includes("gis"))) return true;
  if (text.includes("reports") && path.includes("report")) return true;
  if (text.includes("sync") && path.includes("sync")) return true;
  if (text.includes("users") && path.includes("user")) return true;

  return false;
}


function applyNavLevelOverride() {
const nav = findBottomNav();
  if (!nav) return;

  const items = getNavItems(nav);
  if (items.length < 5) return;

  items.forEach((item) => {
    const active = isActiveItem(item);

    item.classList.toggle("pms10-nav-level-active-v21", false);
    item.classList.toggle("pms10-nav-level-inactive-v21", false);
    item.classList.toggle("pms10-nav-level-active-v22", active);
    item.classList.toggle("pms10-nav-level-inactive-v22", !active);

    /*
      v22: every item keeps the same vertical transform, whether active or inactive.
      This prevents the old active item, such as Home, from jumping up/down
      while navigating to another tab.
    */
    item.style.setProperty("transform", "none", "important");
    item.style.setProperty(
      "transition",
      "background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease",
      "important"
    );
    item.style.setProperty("will-change", "auto", "important");
    item.style.setProperty("pointer-events", "auto", "important");
    item.style.setProperty("border-radius", active ? "18px" : "14px", "important");
    item.style.setProperty("overflow", "hidden", "important");
    item.style.setProperty("-webkit-tap-highlight-color", "rgba(255, 255, 255, 0.12)");

    const inner = Array.from(item.querySelectorAll<HTMLElement>("*"));
    inner.forEach((node) => {
      node.style.setProperty("pointer-events", "auto", "important");
      node.style.setProperty("border-radius", "inherit", "important");
    });

    const action =
      item.matches("a, button, [role='button']")
        ? item
        : item.querySelector<HTMLElement>("a, button, [role='button']");

    if (action) {
      action.style.setProperty("border-radius", "18px", "important");
      action.style.setProperty("overflow", "hidden", "important");
      action.style.setProperty("-webkit-tap-highlight-color", "rgba(255, 255, 255, 0.12)");
    }
  });
}

let timer: number | undefined;

function scheduleApply() {
  window.clearTimeout(timer);
  timer = window.setTimeout(applyNavLevelOverride, 60);
}

export function initPms10BottomNavLevelOverride() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  applyNavLevelOverride();

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-current"],
  });

  window.addEventListener("resize", scheduleApply, { passive: true });
  window.addEventListener("orientationchange", scheduleApply, { passive: true });
  window.addEventListener("scroll", scheduleApply, { passive: true });
  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("pointerdown", scheduleApply, { passive: true });
  window.addEventListener("pointerup", scheduleApply, { passive: true });

  window.setTimeout(applyNavLevelOverride, 100);
  window.setTimeout(applyNavLevelOverride, 350);
  window.setTimeout(applyNavLevelOverride, 750);
  window.setTimeout(applyNavLevelOverride, 1400);
}
