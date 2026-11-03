const APP_VERSION = "2026-11-03-2";
const username = "wahyuar0709-web";

const STORAGE_KEYS = {
  pinned: "repohub-pinned",
  sort: "repohub-sort",
};

const repoList = document.getElementById("repoList");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");
const searchInput = document.getElementById("searchInput");
const totalRepo = document.getElementById("totalRepo");
const totalLanguage = document.getElementById("totalLanguage");
const filterChips = document.getElementById("filterChips");
const installBtn = document.getElementById("installBtn");
const updateToast = document.getElementById("updateToast");
const updateBtn = document.getElementById("updateBtn");
const sortSelect = document.getElementById("sortSelect");

const repoDetailModal = document.getElementById("repoDetailModal");
const repoDetailBackdrop = document.getElementById("repoDetailBackdrop");
const repoDetailClose = document.getElementById("repoDetailClose");
const repoDetailIcon = document.getElementById("repoDetailIcon");
const repoDetailTitle = document.getElementById("repoDetailTitle");
const repoDetailDescription = document.getElementById("repoDetailDescription");
const repoDetailStats = document.getElementById("repoDetailStats");
const repoDetailLanguage = document.getElementById("repoDetailLanguage");
const repoDetailBranch = document.getElementById("repoDetailBranch");
const repoDetailUpdated = document.getElementById("repoDetailUpdated");
const repoDetailTopics = document.getElementById("repoDetailTopics");
const repoDetailLink = document.getElementById("repoDetailLink");
const repoDetailAppLink = document.getElementById("repoDetailAppLink");
const repoDetailReadme = document.getElementById("repoDetailReadme");
const repoDetailReadmeText = document.getElementById("repoDetailReadmeText");

let allRepos = [];
let currentFilter = "all";
let sortMode = loadSortMode();
let deferredPrompt = null;
let waitingWorker = null;
let pinnedRepos = loadPinned();
const readmeCache = new Map();

const languageColors = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Python: "#3572A5",
  PHP: "#4F5D95",
  Java: "#b07219",
  Vue: "#41b883",
  Shell: "#89e051",
  Go: "#00ADD8",
  Ruby: "#701516",
  C: "#555555",
  "C#": "#178600",
  "C++": "#f34b7d",
  Rust: "#dea584",
  Dockerfile: "#384d54",
  JSON: "#f1e05a",
  Default: "#6ee7ff",
};

function loadPinned() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pinned);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? new Set(list.filter((name) => typeof name === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function savePinned() {
  try {
    localStorage.setItem(STORAGE_KEYS.pinned, JSON.stringify([...pinnedRepos]));
  } catch {
    // penyimpanan penuh atau mode privat: pin tetap aktif di sesi ini saja
  }
}

function loadSortMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.sort);
    return ["trend", "stars", "forks", "recent", "name"].includes(value) ? value : "trend";
  } catch {
    return "trend";
  }
}

function saveSortMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEYS.sort, mode);
  } catch {
    // abaikan, urutan tetap berlaku untuk sesi ini
  }
}

function showLoading(isLoading) {
  if (!loading) return;
  loading.classList.toggle("hidden", !isLoading);
}

function setError(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  if (!errorBox) return;
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function buildAppUrl(repo) {
  const homepage = typeof repo.homepage === "string" ? repo.homepage.trim() : "";
  const repoOwner = repo.owner && repo.owner.login ? repo.owner.login : username;
  const githubPagesUrl = repo.has_pages ? `https://${repoOwner}.github.io/${repo.name}/` : "";
  return homepage || githubPagesUrl || "";
}

function getCardIcon(name) {
  const initials = (name || "GH")
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || "GH";
}

function daysSincePush(repo) {
  const pushedAt = Date.parse(repo.pushed_at || "");
  if (Number.isNaN(pushedAt)) return Infinity;
  return (Date.now() - pushedAt) / 86400000;
}

function relativeTime(repo) {
  const days = daysSincePush(repo);
  if (days === Infinity) return "tidak diketahui";
  if (days < 1) return "hari ini";
  if (days < 2) return "1 hari lalu";
  if (days < 7) return `${Math.floor(days)} hari lalu`;
  if (days < 30) return `${Math.floor(days / 7)} minggu lalu`;
  if (days < 365) return `${Math.floor(days / 30)} bulan lalu`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 tahun lalu" : `${years} tahun lalu`;
}

// Skor tren dari sinyal publik GitHub yang nyata: makin baru aktivitas
// push, makin banyak fork, bintang, dan isu terbuka, makin tinggi skor.
function trendScore(repo) {
  const days = daysSincePush(repo);
  let recency = 0;
  if (days <= 7) recency = 40;
  else if (days <= 30) recency = 25;
  else if (days <= 90) recency = 10;

  return (
    (repo.stargazers_count || 0) * 2 +
    (repo.forks_count || 0) * 2 +
    (repo.open_issues_count || 0) +
    (repo.watchers_count || 0) +
    recency
  );
}

function sortByMode(repos, mode) {
  const sorted = [...repos];
  switch (mode) {
    case "stars":
      return sorted.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
    case "forks":
      return sorted.sort((a, b) => (b.forks_count || 0) - (a.forks_count || 0));
    case "recent":
      return sorted.sort(
        (a, b) => (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0)
      );
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));
    case "trend":
    default:
      return sorted.sort((a, b) => trendScore(b) - trendScore(a));
  }
}

async function fetchGitHubJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchProfile() {
  const profileNameEl = document.getElementById("profileName");
  const profileBioEl = document.getElementById("profileBio");
  const profileMetaEl = document.getElementById("profileMeta");

  try {
    const profile = await fetchGitHubJson(`https://api.github.com/users/${username}`);

    if (profileNameEl) profileNameEl.textContent = `@${profile.login || username}`;
    if (profileBioEl) {
      profileBioEl.textContent = profile.bio || "Membangun produk dan eksperimen digital.";
    }
    if (profileMetaEl) {
      profileMetaEl.innerHTML = `
        <span>Followers ${profile.followers || 0}</span>
        <span>Following ${profile.following || 0}</span>
        <span>Public Repos ${profile.public_repos || 0}</span>
      `;
    }
  } catch (error) {
    console.warn("Profile fetch failed:", error);
    if (profileNameEl) profileNameEl.textContent = `@${username}`;
    if (profileBioEl) profileBioEl.textContent = "Membangun produk dan eksperimen digital.";
    if (profileMetaEl) {
      profileMetaEl.innerHTML = `<span>GitHub API tidak tersedia</span>`;
    }
  }
}

async function fetchRepos() {
  showLoading(true);
  clearError();

  try {
    const data = await fetchGitHubJson(`https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`);

    allRepos = Array.isArray(data)
      ? data.filter((repo) => !repo.private && !repo.disabled)
      : [];

    renderFilters();
    renderRepos();
  } catch (error) {
    console.error("Repos fetch failed:", error);
    allRepos = [];
    renderFilters();
    renderRepos();
    setError(
      error && error.message && error.message.includes("403")
        ? "GitHub API rate limit tercapai. Coba beberapa saat lagi."
        : "Tidak dapat memuat data repositori saat ini. Coba lagi nanti."
    );
  } finally {
    showLoading(false);
  }
}

function getLanguageBadge(language) {
  return language || "Other";
}

function renderFilters() {
  const languages = ["all", ...new Set(allRepos.map((repo) => repo.language).filter(Boolean))];

  if (!filterChips) return;

  const chips = [...languages];
  if (pinnedRepos.size > 0) {
    chips.push("pinned");
  }

  // filter yang tersimpan tidak lagi ada (repo terhapus): kembali ke All
  if (currentFilter !== "all" && currentFilter !== "pinned" && !languages.includes(currentFilter)) {
    currentFilter = "all";
  }
  if (currentFilter === "pinned" && pinnedRepos.size === 0) {
    currentFilter = "all";
  }

  filterChips.innerHTML = chips
    .map((chip) => {
      const activeClass = currentFilter === chip ? "active" : "";
      const label =
        chip === "all" ? "All" : chip === "pinned" ? `Pinned (${pinnedRepos.size})` : chip;
      return `<button class="filter-chip ${activeClass}" type="button" data-filter="${chip}">${label}</button>`;
    })
    .join("");

  filterChips.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      currentFilter = chip.dataset.filter;
      renderFilters();
      renderRepos();
    });
  });
}

function getFilteredRepos() {
  const query = searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : "";

  return allRepos.filter((repo) => {
    const matchesFilter =
      currentFilter === "all" || currentFilter === "pinned"
        ? currentFilter === "all" || pinnedRepos.has(repo.name)
        : repo.language === currentFilter;
    const matchesSearch =
      !query ||
      [repo.name, repo.description || "", repo.language || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesFilter && matchesSearch;
  });
}

function togglePin(repoName) {
  if (pinnedRepos.has(repoName)) {
    pinnedRepos.delete(repoName);
  } else {
    pinnedRepos.add(repoName);
  }
  savePinned();
  renderFilters();
  renderRepos();
}

function renderRepos() {
  const filtered = sortByMode(getFilteredRepos(), sortSelect ? sortSelect.value : "trend");

  if (totalRepo) totalRepo.textContent = String(filtered.length);
  if (totalLanguage) {
    totalLanguage.textContent = String(new Set(filtered.map((repo) => repo.language).filter(Boolean)).size);
  }

  if (!repoList) return;

  if (!filtered.length) {
    const emptyHint =
      currentFilter === "pinned"
        ? "Tekan tombol Pin di kartu repo untuk menyematkannya di sini."
        : currentFilter === "all"
          ? "Coba kata kunci lain ya."
          : "Tidak ada repo dengan bahasa ini. Coba filter atau kata kunci lain.";

    repoList.innerHTML = `
      <div class="empty-state">
        <h3>Repo tidak ditemukan</h3>
        <p>${emptyHint || "Coba kata kunci lain atau ubah filter bahasa."}</p>
      </div>
    `;
    return;
  }

  repoList.innerHTML = filtered
    .map((repo, index) => {
      const color = languageColors[repo.language] || languageColors.Default;
      const description = repo.description || "Tidak ada deskripsi untuk repo ini.";
      const appUrl = buildAppUrl(repo);
      const appLink = appUrl
        ? `<a href="${appUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-live">Open App</a>`
        : `<span class="btn btn-disabled">No App</span>`;
      const badge = appUrl ? '<span class="status-badge live">Live</span>' : '<span class="status-badge repo">Repo</span>';
      const archivedBadge = repo.archived ? '<span class="status-badge archived">Archived</span>' : "";
      const forkBadge = repo.fork ? '<span class="status-badge repo">Fork</span>' : "";
      const pinBadge = pinnedRepos.has(repo.name) ? '<span class="status-badge pinned">Pinned</span>' : "";
      const iconText = getCardIcon(repo.name);
      const rank = sortSelect && sortSelect.value === "trend" && currentFilter === "all" ? `<span class="trend-rank">#${index + 1}</span>` : "";

      return `
        <article class="repo-card ${pinnedRepos.has(repo.name) ? "is-pinned" : ""}" style="--card-accent:${color};" data-repo-name="${repo.name}">
          <div class="card-top">
            <div class="mini-icon" style="background:${color};">${iconText}</div>
            <div class="badge-group">${rank}${archivedBadge}${forkBadge}${pinBadge}${badge}</div>
          </div>

          <div class="card-body">
            <h3><a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">${repo.name}</a></h3>
            <p>${description}</p>
          </div>

          <div class="activity-line">Aktivitas terakhir: ${relativeTime(repo)}</div>

          <div class="meta-row">
            <span>Bintang ${repo.stargazers_count || 0}</span>
            <span>Fork ${repo.forks_count || 0}</span>
            <span>Isu ${repo.open_issues_count || 0}</span>
            <span>${getLanguageBadge(repo.language)}</span>
          </div>

          <div class="card-actions">
            ${appLink}
            <button type="button" class="btn btn-secondary btn-detail" data-repo-name="${repo.name}">Detail</button>
            <button type="button" class="pin-btn" data-repo-name="${repo.name}" aria-pressed="${pinnedRepos.has(repo.name)}">
              ${pinnedRepos.has(repo.name) ? "Unpin" : "Pin"}
            </button>
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Open Repo</a>
          </div>
        </article>
      `;
    })
    .join("");

  repoList.querySelectorAll(".btn-detail").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const repo = allRepos.find((item) => item.name === button.dataset.repoName);
      if (repo) openRepoDetail(repo);
    });
  });

  repoList.querySelectorAll(".pin-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePin(button.dataset.repoName);
    });
  });

  repoList.querySelectorAll(".repo-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      const repo = allRepos.find((item) => item.name === card.dataset.repoName);
      if (repo) openRepoDetail(repo);
    });
  });
}

async function loadReadme(repo) {
  if (!repoDetailReadme || !repoDetailReadmeText) return;
  repoDetailReadme.classList.add("hidden");
  repoDetailReadmeText.textContent = "";

  const cacheKey = repo.full_name || repo.name;
  try {
    let text;
    if (readmeCache.has(cacheKey)) {
      text = readmeCache.get(cacheKey);
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(
          `https://api.github.com/repos/${cacheKey}/readme`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/vnd.github.raw+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        text = raw;
      } finally {
        clearTimeout(timeoutId);
      }
      readmeCache.set(cacheKey, text);
    }

    const snippet = text.replace(/\r\n/g, "\n").slice(0, 1200);
    repoDetailReadmeText.textContent = snippet + (text.length > snippet.length ? "\n\n(Baca selengkapnya di GitHub)" : "");
    repoDetailReadme.classList.remove("hidden");
  } catch {
    // README kosong, privat, atau rate limit: pratinjau tetap disembunyikan
  }
}

function openRepoDetail(repo) {
  if (!repoDetailModal || !repo) return;

  const appUrl = buildAppUrl(repo);
  const iconText = getCardIcon(repo.name);
  const description = repo.description || "Tidak ada deskripsi untuk repo ini.";
  const stats = [
    { label: "Bintang", value: repo.stargazers_count || 0 },
    { label: "Fork", value: repo.forks_count || 0 },
    { label: "Isu terbuka", value: repo.open_issues_count || 0 },
    { label: "Pengamat", value: repo.watchers_count || 0 },
  ];

  repoDetailIcon.textContent = iconText;
  repoDetailIcon.style.background =
    languageColors[repo.language] || languageColors.Default;
  repoDetailTitle.textContent = repo.name;
  repoDetailDescription.textContent = description;
  repoDetailLanguage.textContent = repo.language || "Belum diketahui";
  repoDetailBranch.textContent = repo.default_branch || "main";
  repoDetailUpdated.textContent = new Date(repo.pushed_at || Date.now()).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  repoDetailTopics.textContent =
    Array.isArray(repo.topics) && repo.topics.length ? repo.topics.slice(0, 5).join(", ") : "General";

  repoDetailStats.innerHTML = stats
    .map(
      (stat) => `
        <div class="detail-stat">
          <div>
            <strong>${stat.value}</strong>
            <small>${stat.label}</small>
          </div>
        </div>
      `
    )
    .join("");

  repoDetailLink.href = repo.html_url || "#";
  repoDetailLink.textContent = "Open Repo";

  if (appUrl) {
    repoDetailAppLink.href = appUrl;
    repoDetailAppLink.classList.remove("hidden");
    repoDetailAppLink.textContent = "Open App";
  } else {
    repoDetailAppLink.classList.add("hidden");
  }

  repoDetailModal.classList.remove("hidden");
  repoDetailModal.setAttribute("aria-hidden", "false");
  repoDetailClose?.focus();

  loadReadme(repo);
}

function closeRepoDetail() {
  if (!repoDetailModal) return;
  repoDetailModal.classList.add("hidden");
  repoDetailModal.setAttribute("aria-hidden", "true");
}

function showUpdateToast() {
  if (updateToast) updateToast.classList.remove("hidden");
}

function refreshApp() {
  if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
  window.location.reload();
}

if (searchInput) {
  searchInput.addEventListener("input", renderRepos);
}

if (sortSelect) {
  sortSelect.value = sortMode;
  sortSelect.addEventListener("change", () => {
    saveSortMode(sortSelect.value);
    renderRepos();
  });
}

if (installBtn) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("Install prompt outcome:", outcome);

    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });
}

if (updateBtn) {
  updateBtn.addEventListener("click", refreshApp);
}

if (repoDetailBackdrop) {
  repoDetailBackdrop.addEventListener("click", closeRepoDetail);
}

if (repoDetailClose) {
  repoDetailClose.addEventListener("click", closeRepoDetail);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && repoDetailModal && !repoDetailModal.classList.contains("hidden")) {
    closeRepoDetail();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }

      const registration = await navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`, {
        scope: "./",
        updateViaCache: "none",
      });

      console.log("Service Worker registered with version:", APP_VERSION);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast();
            waitingWorker = installing;
          }
        });
      });
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

async function initApp() {
  await fetchProfile();
  await fetchRepos();
}

initApp();
