import { decodeGitHubContent, validateState } from "/state-utils.js";

const STATE_URL = "https://api.github.com/repos/hdboyer/tryhardernexttime.com/contents/site-state.json";
const SESSION_MODAL_KEY = "onlytryhards-modal-shown";
const genericTitle = "We'll be right back";

const elements = {
  offline: document.querySelector("#offline"),
  retry: document.querySelector("#retry-button"),
  site: document.querySelector("#site"),
  feed: document.querySelector("#feed"),
  name: document.querySelector("#profile-name"),
  handle: document.querySelector("#profile-handle"),
  bio: document.querySelector("#profile-bio"),
  avatar: document.querySelector("#avatar"),
  postCount: document.querySelector("#post-count"),
  fanCount: document.querySelector("#fan-count"),
  effortScore: document.querySelector("#effort-score"),
  modal: document.querySelector("#ad-modal"),
  modalClose: document.querySelector("#modal-close"),
  modalTitle: document.querySelector("#modal-title"),
  modalCopy: document.querySelector("#modal-copy"),
  modalCta: document.querySelector("#modal-cta"),
  toast: document.querySelector("#toast"),
};

let enabled = false;
let contentLoaded = false;
let checkSequence = 0;
let modalTimer;
let toastTimer;
let previousFocus;
let currentConfig;

function storageGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Storage can be unavailable in privacy modes. */ }
}

async function fetchState() {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    const response = await fetch(`/site-state.json?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Local state request failed: ${response.status}`);
    const state = await response.json();
    if (!validateState(state)) throw new TypeError("Invalid local site state");
    return state;
  }

  const url = new URL(STATE_URL);
  url.searchParams.set("ref", "main");
  url.searchParams.set("_", `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`);

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`State request failed: ${response.status}`);
  return decodeGitHubContent(await response.json());
}

async function checkState() {
  const sequence = ++checkSequence;
  elements.retry.disabled = true;

  try {
    const state = await fetchState();
    if (sequence !== checkSequence) return;
    if (state.enabled) await showSite();
    else showOffline();
  } catch {
    if (sequence === checkSequence) showOffline();
  } finally {
    if (sequence === checkSequence) elements.retry.disabled = false;
  }
}

function showOffline() {
  enabled = false;
  clearTimeout(modalTimer);
  window.removeEventListener("scroll", watchScroll);
  closeModal(false);
  elements.site.hidden = true;
  elements.offline.hidden = false;
  document.title = genericTitle;
  document.querySelector('meta[name="description"]').content = "This page is temporarily unavailable.";
}

async function showSite() {
  enabled = true;
  if (!contentLoaded) await loadContent();
  if (!enabled) return;

  elements.offline.hidden = true;
  elements.site.hidden = false;
  document.title = `${currentConfig.brand} — ${currentConfig.profile.displayName}`;
  document.querySelector('meta[name="description"]').content = currentConfig.description;
  armFakeAd();
}

async function loadContent() {
  try {
    const [configResponse, postsResponse] = await Promise.all([
      fetch("/content/site.json", { cache: "no-cache" }),
      fetch("/posts.json", { cache: "no-cache" }),
    ]);
    if (!configResponse.ok || !postsResponse.ok) throw new Error("Content unavailable");

    const config = await configResponse.json();
    const posts = await postsResponse.json();
    validateConfig(config);
    if (!Array.isArray(posts)) throw new TypeError("Invalid post manifest");

    currentConfig = config;
    renderProfile(config.profile, posts.length);
    renderFeed(posts, config);
    configureModal(config.modalAd);
    contentLoaded = true;
  } catch {
    showOffline();
    throw new Error("Site content failed validation");
  }
}

function validateConfig(config) {
  const profile = config?.profile;
  if (!config || typeof config.brand !== "string" || typeof config.description !== "string") throw new TypeError("Invalid config");
  for (const key of ["displayName", "handle", "bio", "initials", "fanCount", "effortScore"]) {
    if (typeof profile?.[key] !== "string" || !profile[key].trim()) throw new TypeError("Invalid profile config");
  }
  if (!Array.isArray(config.ads) || config.ads.length === 0) throw new TypeError("Invalid ads config");
  for (const ad of config.ads) {
    for (const key of ["headline", "copy", "cta"]) if (typeof ad?.[key] !== "string" || !ad[key].trim()) throw new TypeError("Invalid ad config");
  }
  for (const key of ["headline", "copy", "cta"]) if (typeof config.modalAd?.[key] !== "string" || !config.modalAd[key].trim()) throw new TypeError("Invalid modal config");
}

function renderProfile(profile, count) {
  elements.name.textContent = profile.displayName;
  elements.handle.textContent = profile.handle;
  elements.bio.textContent = profile.bio;
  elements.avatar.textContent = profile.initials;
  elements.postCount.textContent = String(count);
  elements.fanCount.textContent = profile.fanCount;
  elements.effortScore.textContent = profile.effortScore;
}

function renderFeed(posts, config) {
  elements.feed.replaceChildren();
  if (posts.length === 0) {
    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.innerHTML = "<span aria-hidden=\"true\">📸</span><h3>Premium content is buffering</h3><p>The first extremely important post is coming soon. Greatness has a loading time.</p>";
    elements.feed.append(empty);
    return;
  }

  posts.forEach((post, index) => {
    elements.feed.append(createPost(post, config.profile, index));
    if ((index + 1) % 3 === 0) elements.feed.append(createInlineAd(config.ads[Math.floor(index / 3) % config.ads.length]));
  });
}

function createPost(post, profile, index) {
  const article = document.createElement("article");
  article.className = "post-card";

  const meta = document.createElement("div");
  meta.className = "post-meta";
  const miniProfile = document.createElement("div");
  miniProfile.className = "mini-profile";
  const miniAvatar = document.createElement("span");
  miniAvatar.className = "mini-avatar";
  miniAvatar.setAttribute("aria-hidden", "true");
  miniAvatar.textContent = profile.initials;
  const identity = document.createElement("div");
  const creator = document.createElement("strong");
  creator.textContent = profile.displayName;
  const time = document.createElement("time");
  time.dateTime = post.date;
  time.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${post.date}T00:00:00Z`));
  identity.append(creator, time);
  miniProfile.append(miniAvatar, identity);
  const menu = document.createElement("button");
  menu.className = "post-menu joke-action";
  menu.type = "button";
  menu.setAttribute("aria-label", "More pretend options");
  menu.textContent = "•••";
  meta.append(miniProfile, menu);

  const picture = document.createElement("picture");
  picture.className = "post-media";
  const webp = document.createElement("source");
  webp.type = "image/webp";
  webp.srcset = makeSrcset(post.sources.webp);
  webp.sizes = "(max-width: 720px) 100vw, 696px";
  const image = document.createElement("img");
  image.src = post.sources.jpeg[0].src;
  image.srcset = makeSrcset(post.sources.jpeg);
  image.sizes = "(max-width: 720px) 100vw, 696px";
  image.alt = post.alt;
  image.width = post.width;
  image.height = post.height;
  image.loading = index === 0 ? "eager" : "lazy";
  image.decoding = "async";
  if (index === 0) image.fetchPriority = "high";
  picture.append(webp, image);

  const copy = document.createElement("div");
  copy.className = "post-copy";
  const caption = document.createElement("p");
  caption.className = "post-caption";
  caption.textContent = post.caption;
  const actions = document.createElement("div");
  actions.className = "post-actions";
  const heart = document.createElement("button");
  heart.type = "button";
  heart.className = "reaction-button";
  heart.setAttribute("aria-pressed", "false");
  heart.textContent = "♡ Like-ish";
  heart.addEventListener("click", () => {
    const liked = heart.getAttribute("aria-pressed") === "true";
    heart.setAttribute("aria-pressed", String(!liked));
    heart.textContent = liked ? "♡ Like-ish" : "♥ Regretted";
  });
  actions.append(heart);
  copy.append(caption, actions);
  article.append(meta, picture, copy);
  return article;
}

function makeSrcset(variants) {
  return variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
}

function createInlineAd(ad) {
  const article = document.createElement("article");
  article.className = "inline-ad";
  const kicker = document.createElement("span");
  kicker.className = "ad-kicker";
  kicker.textContent = "A completely fake advertisement";
  const headline = document.createElement("h3");
  headline.textContent = ad.headline;
  const copy = document.createElement("p");
  copy.textContent = ad.copy;
  const button = document.createElement("button");
  button.className = "ad-button";
  button.type = "button";
  button.textContent = ad.cta;
  button.addEventListener("click", () => showToast("Nothing happened. Exactly as advertised."));
  article.append(kicker, headline, copy, button);
  return article;
}

function configureModal(ad) {
  elements.modalTitle.textContent = ad.headline;
  elements.modalCopy.textContent = ad.copy;
  elements.modalCta.textContent = ad.cta;
}

function armFakeAd() {
  if (storageGet(SESSION_MODAL_KEY)) return;
  clearTimeout(modalTimer);
  modalTimer = window.setTimeout(showModal, 8000);
  window.removeEventListener("scroll", watchScroll);
  window.addEventListener("scroll", watchScroll, { passive: true });
}

function watchScroll() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable > 0 && window.scrollY / scrollable >= 0.4) showModal();
}

function showModal() {
  if (!enabled || elements.modal.hidden === false || storageGet(SESSION_MODAL_KEY)) return;
  storageSet(SESSION_MODAL_KEY, "1");
  clearTimeout(modalTimer);
  window.removeEventListener("scroll", watchScroll);
  previousFocus = document.activeElement;
  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.modalClose.focus();
  document.addEventListener("keydown", trapModalFocus);
}

function closeModal(restoreFocus = true) {
  if (elements.modal.hidden) return;
  elements.modal.hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", trapModalFocus);
  if (restoreFocus && previousFocus instanceof HTMLElement) previousFocus.focus();
}

function trapModalFocus(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...elements.modal.querySelectorAll("button:not([disabled])")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

elements.retry.addEventListener("click", checkState);
elements.modalClose.addEventListener("click", () => closeModal());
elements.modal.querySelector("[data-modal-close]").addEventListener("click", () => closeModal());
elements.modalCta.addEventListener("click", () => {
  closeModal();
  showToast("Prize claimed: one whole sense of accomplishment.");
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".joke-action") && event.target !== elements.modalCta) showToast("Nice try. This button is purely decorative.");
});

let refocusTimer;
function scheduleRefocusCheck() {
  clearTimeout(refocusTimer);
  refocusTimer = window.setTimeout(checkState, 250);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleRefocusCheck(); });
window.addEventListener("focus", scheduleRefocusCheck);

checkState();
