type BottomNavElement = HTMLElement & {
  dataset: DOMStringMap & {
    pms10BottomNavBaseHeight?: string;
  };
};

const REQUIRED_NAV_LABELS = ["home", "projects", "map", "reports", "sync", "users"];
const OLD_BODY_LAYER_IDS = [
  "pms10-bottom-nav-blue-bg-extension",
  "pms10-bottom-nav-visible-blue-bar",
];
const INTERNAL_BLUE_LAYER_CLASS = "pms10-bottom-nav-v17-blue-fill";
function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikePms10BottomNav(element: Element): element is BottomNavElement {
  if (!(element instanceof HTMLElement)) return false;

  const text = normalizeText(element.innerText || element.textContent || "");
  if (!text) return false;
  if (!REQUIRED_NAV_LABELS.every((label) => text.includes(label))) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < window.innerWidth * 0.65) return false;
  if (rect.height < 30) return false;

  const style = window.getComputedStyle(element);
  const isFixedLike =
    style.position === "fixed" ||
    style.position === "sticky" ||
    style.position === "absolute";
  const isNearBottom = rect.bottom >= window.innerHeight - 220;

  return isFixedLike || isNearBottom;
}

function getBottomNavCandidates() {
  return Array.from(
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
  ).filter(looksLikePms10BottomNav);
}

function chooseBestBottomNav(candidates: BottomNavElement[]) {
  if (!candidates.length) return null;

  return candidates
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((a, b) => {
      const bottomScore = b.rect.bottom - a.rect.bottom;
      if (Math.abs(bottomScore) > 2) return bottomScore;

      const aHeightPenalty = Math.abs(a.rect.height - 80);
      const bHeightPenalty = Math.abs(b.rect.height - 80);
      return aHeightPenalty - bHeightPenalty;
    })[0]?.element ?? null;
}

function removeOldBodyLayers() {
  OLD_BODY_LAYER_IDS.forEach((id) => document.getElementById(id)?.remove());
}

function getBlueBackground(nav: HTMLElement) {
  const style = window.getComputedStyle(nav);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== "none") return bgImage;

  const bgColor = style.backgroundColor;
  if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
    return bgColor;
  }

  return "linear-gradient(135deg, #0b4f9f 0%, #0f66bd 52%, #1f78ce 100%)";
}

function ensureInternalBlueLayer(nav: HTMLElement) {
  let layer = nav.querySelector<HTMLElement>(`.${INTERNAL_BLUE_LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = INTERNAL_BLUE_LAYER_CLASS;
    layer.setAttribute("aria-hidden", "true");
    nav.prepend(layer);
  }
  return layer;
}

function applyContentClearance(totalHeight: number) {
  const clearance = Math.round(totalHeight + 14);
  document.documentElement.style.setProperty("--pms10-bottom-nav-total-clearance", `${clearance}px`);
  document.body.style.paddingBottom = `calc(${clearance}px + env(safe-area-inset-bottom, 0px))`;

  const containers = document.querySelectorAll<HTMLElement>(
    ["#root", ".app", ".app-shell", ".page-shell", ".page", ".content", ".main-content", "main"].join(",")
  );

  containers.forEach((container) => {
    const rect = container.getBoundingClientRect();
    if (rect.height > window.innerHeight * 0.45) {
      container.style.paddingBottom = `calc(${clearance}px + env(safe-area-inset-bottom, 0px))`;
      container.style.boxSizing = "border-box";
      container.style.scrollPaddingBottom = `calc(${clearance}px + env(safe-area-inset-bottom, 0px))`;
    }
  });
}

function resetPreviousRuntimeClasses(nav: BottomNavElement) {
  nav.classList.remove(
    "pms10-bottom-nav-runtime-taller",
    "pms10-bottom-nav-runtime-taller-clean",
    "pms10-bottom-nav-runtime-background-taller",
    "pms10-bottom-nav-fixed-stationary",
    "pms10-bottom-nav-fixed-overlay",
    "pms10-bottom-nav-v10-visible-icons",
    "pms10-bottom-nav-v11-extend-blue",
    "pms10-bottom-nav-v12-visible-overlay",
    "pms10-bottom-nav-v13-icons-above-blue",
    "pms10-bottom-nav-v14-white-square-top",
    "pms10-bottom-nav-v15-clickable-blue-fill",
    "pms10-bottom-nav-v16-rect-strip"
  );

  Array.from(nav.children).forEach((child) => {
    if (child instanceof HTMLElement && !child.classList.contains(INTERNAL_BLUE_LAYER_CLASS)) {
      child.classList.remove(
        "pms10-bottom-nav-runtime-item",
        "pms10-bottom-nav-runtime-item-clean",
        "pms10-bottom-nav-fixed-stationary-item",
        "pms10-bottom-nav-fixed-overlay-item",
        "pms10-bottom-nav-v10-item",
        "pms10-bottom-nav-v11-item",
        "pms10-bottom-nav-v12-item",
        "pms10-bottom-nav-v13-item",
        "pms10-bottom-nav-v14-item",
        "pms10-bottom-nav-v15-item",
        "pms10-bottom-nav-v16-item"
      );
    }
  });
}

function getItemLabel(item: HTMLElement) {
  return normalizeText(item.innerText || item.textContent || "");
}

function isHomePath(path: string) {
  return (
    path === "/" ||
    path.includes("dashboard") ||
    path.includes("home")
  ) && !path.includes("project") && !path.includes("map") && !path.includes("report") && !path.includes("sync") && !path.includes("user");
}

function isActiveNavItem(item: HTMLElement) {
  const text = getItemLabel(item);
  const path = window.location.pathname.toLowerCase();

  const ariaCurrent = item.getAttribute("aria-current");
  if (ariaCurrent && ariaCurrent !== "false") return true;

  const classText = item.className.toString().toLowerCase();
  if (classText.includes("active") || classText.includes("selected") || classText.includes("current")) {
    return true;
  }

  const anchor = item.matches("a") ? item : item.querySelector("a");
  if (anchor instanceof HTMLAnchorElement) {
    const href = (anchor.getAttribute("href") || "").replace(/[\/#]/g, "").toLowerCase();
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

function forceWhiteNavColors(item: HTMLElement, isActive: boolean) {
  item.style.color = "#FFFFFF";
  item.style.border = "0";
  item.style.outline = "0";
  item.style.boxShadow = isActive
    ? "inset 0 0 0 1px rgba(255, 255, 255, 0.16), 0 8px 18px rgba(0, 32, 82, 0.18)"
    : "none";
  item.style.background = isActive ? "rgba(7, 78, 165, 0.72)" : "transparent";
  item.style.backgroundColor = isActive ? "rgba(7, 78, 165, 0.72)" : "transparent";
  item.style.borderRadius = isActive ? "18px" : "0";
  item.style.transition = "background-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease";
  item.style.setProperty("-webkit-tap-highlight-color", "rgba(255, 255, 255, 0.14)");

  const descendants = item.querySelectorAll<HTMLElement>("*");
  descendants.forEach((node) => {
    node.style.color = "#FFFFFF";
    node.style.borderColor = "transparent";
    node.style.outline = "0";

    const tag = node.tagName.toLowerCase();
    if (!["svg", "path", "circle", "line", "polyline", "rect"].includes(tag)) {
      if (!node.classList.contains(INTERNAL_BLUE_LAYER_CLASS)) {
        node.style.backgroundColor = "transparent";
      }
    }
  });

  const svgNodes = item.querySelectorAll<SVGElement>("svg");
  svgNodes.forEach((svg) => {
    svg.style.color = "#FFFFFF";
    svg.style.stroke = "currentColor";
    svg.style.fill = "none";
  });

  const svgShapeNodes = item.querySelectorAll<SVGElement>("svg *");
  svgShapeNodes.forEach((shape) => {
    shape.style.stroke = "currentColor";
    const tag = shape.tagName.toLowerCase();
    if (tag === "circle" || tag === "rect" || tag === "polygon") {
      shape.style.fill = "none";
    }
  });
}

function makeNavClickable(nav: HTMLElement) {
  nav.style.pointerEvents = "auto";
  Array.from(nav.children).forEach((child) => {
    if (child instanceof HTMLElement && !child.classList.contains(INTERNAL_BLUE_LAYER_CLASS)) {
      child.style.pointerEvents = "auto";
      child.querySelectorAll<HTMLElement>("a, button, [role='button'], [tabindex]").forEach((node) => {
        node.style.pointerEvents = "auto";
      });
    }
  });
}

function applyBottomNavFix(nav: BottomNavElement) {
  removeOldBodyLayers();

  const rect = nav.getBoundingClientRect();
  const computed = window.getComputedStyle(nav);

  if (!nav.dataset.pms10BottomNavBaseHeight) {
    const detected = Math.max(rect.height, Number.parseFloat(computed.height || "0"), 74);
    const baseHeight = Math.min(Math.max(detected, 74), 88);
    nav.dataset.pms10BottomNavBaseHeight = String(Math.round(baseHeight));
  }

  const baseHeight = Number(nav.dataset.pms10BottomNavBaseHeight || "82");
  const visibleBlueHeight = Math.round(baseHeight * 1.32);

  resetPreviousRuntimeClasses(nav);

  const blueLayer = ensureInternalBlueLayer(nav);
  const blueBackground = getBlueBackground(nav);

  nav.classList.add("pms10-bottom-nav-v17-rect-strip");

  nav.style.setProperty("--pms10-bottom-nav-base-height", `${baseHeight}px`);
  nav.style.setProperty("--pms10-bottom-nav-visible-height", `${visibleBlueHeight}px`);
  nav.style.setProperty("--pms10-bottom-nav-bg-extension", "38px");
  nav.style.setProperty("--pms10-bottom-nav-side-bleed", "28px");
  nav.style.setProperty("--pms10-bottom-nav-bottom-bleed", "28px");
  nav.style.setProperty("--pms10-bottom-nav-bg", blueBackground);
  nav.style.setProperty("--pms10-bottom-nav-item-rise", "-10px");

  nav.style.position = "fixed";
  nav.style.left = "0";
  nav.style.right = "0";
  nav.style.bottom = "0";
  nav.style.width = "100vw";
  nav.style.zIndex = "2147483005";
  nav.style.height = `calc(${visibleBlueHeight}px + env(safe-area-inset-bottom, 0px))`;
  nav.style.minHeight = `calc(${visibleBlueHeight}px + env(safe-area-inset-bottom, 0px))`;
  nav.style.maxHeight = `calc(${visibleBlueHeight}px + env(safe-area-inset-bottom, 0px))`;
  nav.style.background = "transparent";
  nav.style.backgroundColor = "transparent";
  nav.style.boxShadow = "none";
  nav.style.border = "0";
  nav.style.outline = "0";
  nav.style.transform = "none";
  nav.style.willChange = "auto";
  nav.style.boxSizing = "border-box";
  nav.style.overflow = "visible";
  nav.style.isolation = "isolate";
  nav.style.borderRadius = "0";
  nav.style.paddingTop = "12px";
  nav.style.paddingBottom = "calc(18px + env(safe-area-inset-bottom, 0px))";
  nav.style.pointerEvents = "auto";

  blueLayer.style.position = "absolute";
  blueLayer.style.left = "calc(-1 * var(--pms10-bottom-nav-side-bleed))";
  blueLayer.style.right = "calc(-1 * var(--pms10-bottom-nav-side-bleed))";
  blueLayer.style.top = "calc(-1 * var(--pms10-bottom-nav-bg-extension))";
  blueLayer.style.bottom = "calc(-1 * var(--pms10-bottom-nav-bottom-bleed))";
  blueLayer.style.background = blueBackground;
  blueLayer.style.zIndex = "0";
  blueLayer.style.pointerEvents = "none";
  blueLayer.style.border = "0";
  blueLayer.style.outline = "0";
  blueLayer.style.boxShadow = "0 -8px 22px rgba(3, 24, 63, 0.14)";
  blueLayer.style.borderRadius = "0";

  Array.from(nav.children).forEach((child) => {
    if (child instanceof HTMLElement && !child.classList.contains(INTERNAL_BLUE_LAYER_CLASS)) {
      child.classList.add("pms10-bottom-nav-v17-item");
      child.style.position = "relative";
      child.style.zIndex = "2";
      child.style.transform = "translateY(-10px)";
      child.style.pointerEvents = "auto";
      child.style.touchAction = "manipulation";

      const active = isActiveNavItem(child);
      child.classList.toggle("pms10-bottom-nav-v20-active", active);
      child.classList.toggle("pms10-bottom-nav-v20-inactive", !active);
      child.style.transform = active ? "translateY(0px)" : "translateY(8px)";
      forceWhiteNavColors(child, active);
    }
  });

  makeNavClickable(nav);
  applyContentClearance(visibleBlueHeight);
}

function applyPms10BottomNavRuntimeFix() {
  const nav = chooseBestBottomNav(getBottomNavCandidates());
  if (!nav) return;
  applyBottomNavFix(nav);
}

let resizeTimer: number | undefined;

function scheduleApply() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(applyPms10BottomNavRuntimeFix, 80);
}

export function initPms10BottomNavRuntimeFix() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  removeOldBodyLayers();
  applyPms10BottomNavRuntimeFix();

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("resize", scheduleApply, { passive: true });
  window.addEventListener("orientationchange", scheduleApply, { passive: true });
  window.addEventListener("scroll", scheduleApply, { passive: true });
  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("pointerdown", scheduleApply, { passive: true });
  window.addEventListener("pointerup", scheduleApply, { passive: true });

  window.setTimeout(applyPms10BottomNavRuntimeFix, 100);
  window.setTimeout(applyPms10BottomNavRuntimeFix, 400);
  window.setTimeout(applyPms10BottomNavRuntimeFix, 1000);
}
