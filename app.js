const username = "wahyuar0709-web";
const repoList = document.getElementById("repoList");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");
const searchInput = document.getElementById("searchInput");
const totalRepo = document.getElementById("totalRepo");
const totalLanguage = document.getElementById("totalLanguage");
const filterChips = document.getElementById("filterChips");
const installBtn = document.getElementById("installBtn");

let allRepos = [];
let currentFilter = "all";
let deferredPrompt = null;

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

function buildAppUrl(repo) {
  const homepage = typeof repo.homepage === "string" ? repo.homepage.trim() : "";
  const repoOwner = repo.owner && repo.owner.login ? repo.owner.login : username;
  const githubPagesUrl = repo.has_pages ? `https://${repoOwner}.github.io/${repo.name}/` : "";
  return homepage || githubPagesUrl || "";
}

function getCardIcon(name) {
  const initials = name
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || "GH";
}

async function fetchRepos() {
  try {
    loading.classList.remove("hidden");
    errorBox.classList.add("hidden");

    const response = await fetch(
      `https://api.github.com/users/${username}/repos?per_page=100`
    );

    if (!response.ok) {
      throw new Error("Gagal memuat repositori dari GitHub.");
    }

    const data = await response.json();

    allRepos = data
      .filter((repo) => !repo.private)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));

    renderFilters();
    renderRepos();
  } catch (error) {
    console.error(error);
    errorBox.textContent = "Tidak dapat memuat data repositori saat ini. Coba lagi nanti.";
    errorBox.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
  }
}

function getLanguageBadge(language) {
  return language || "Other";
}

function renderFilters() {
  const languages = ["all", ...new Set(allRepos.map((repo) => repo.language).filter(Boolean))];
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
  const query = searchInput.value.trim().toLowerCase();

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

  totalRepo.textContent = String(filtered.length);
  totalLanguage.textContent = String(new Set(filtered.map((repo) => repo.language).filter(Boolean)).size);

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
        : "";
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

searchInput.addEventListener("input", renderRepos);

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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        console.log("Service Worker registered.");
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}

fetchRepos();
