const APP_VERSION = "2026-11-03-1";
const username = "wahyuar0709-web";

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

let allRepos = [];
let currentFilter = "all";
let deferredPrompt = null;
let waitingWorker = null;

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

function showLoading(isLoading) {
  if (!loading) return;
  if (isLoading) {
    loading.classList.remove("hidden");
  } else {
    loading.classList.add("hidden");
  }
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
    const data = await fetchGitHubJson(`https://api.github.com/users/${username}/repos?per_page=100`);

    allRepos = Array.isArray(data)
      ? data
          .filter((repo) => !repo.private)
          .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
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

  filterChips.innerHTML = languages
    .map((language) => {
      const activeClass = currentFilter === language ? "active" : "";
      const label = language === "all" ? "All" : language;
      return `<button class="filter-chip ${activeClass}" type="button" data-filter="${language}">${label}</button>`;
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
    const matchesFilter = currentFilter === "all" || repo.language === currentFilter;
    const matchesSearch =
      !query ||
      [repo.name, repo.description || "", repo.language || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesFilter && matchesSearch;
  });
}

function renderRepos() {
  const filtered = getFilteredRepos();

  if (totalRepo) totalRepo.textContent = String(filtered.length);
  if (totalLanguage) {
    totalLanguage.textContent = String(new Set(filtered.map((repo) => repo.language).filter(Boolean)).size);
  }

  if (!repoList) return;

  if (!filtered.length) {
    repoList.innerHTML = `
      <div class="empty-state">
        <h3>Repo tidak ditemukan</h3>
        <p>Coba kata kunci lain atau ubah filter bahasa.</p>
      </div>
    `;
    return;
  }

  repoList.innerHTML = filtered
    .map((repo) => {
      const color = languageColors[repo.language] || languageColors.Default;
      const description = repo.description || "Tidak ada deskripsi untuk repo ini.";
      const appUrl = buildAppUrl(repo);
      const appLink = appUrl
        ? `<a href="${appUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-live">Open App</a>`
        : `<span class="btn btn-disabled">No App</span>`;
      const badge = appUrl ? '<span class="status-badge live">Live</span>' : '<span class="status-badge repo">Repo</span>';
      const iconText = getCardIcon(repo.name);

      return `
        <article class="repo-card" style="--card-accent:${color};">
          <div class="card-top">
            <div class="mini-icon" style="background:${color};">${iconText}</div>
            ${badge}
          </div>

          <div class="card-body">
            <h3>${repo.name}</h3>
            <p>${description}</p>
          </div>

          <div class="meta-row">
            <span>⭐ ${repo.stargazers_count || 0}</span>
            <span>🍴 ${repo.forks_count || 0}</span>
            <span>⚠️ ${repo.open_issues_count || 0}</span>
            <span>${getLanguageBadge(repo.language)}</span>
          </div>

          <div class="card-actions">
            ${appLink}
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Open Repo</a>
          </div>
        </article>
      `;
    })
    .join("");
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
