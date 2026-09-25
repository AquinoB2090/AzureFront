const API_BASE = "https://pruebadeploy-gmg5hvd5dbg6f8am.westus3-01.azurewebsites.net";
const DEADLINE = new Date("2026-09-25T21:00:00-06:00");
const BUCKETS = [
  { label: "0%", min: 0, max: 0 },
  { label: "1% - 40%", min: 1, max: 40 },
  { label: "41% - 80%", min: 41, max: 80 },
  { label: "81% - 99%", min: 81, max: 99 },
  { label: "100%", min: 100, max: 100 },
];

const state = {
  dashboard: null,
  students: [],
  query: "",
};

const elements = {
  countdown: document.querySelector("#countdown"),
  studentsCount: document.querySelector("#students-count"),
  averageProgress: document.querySelector("#average-progress"),
  completedCount: document.querySelector("#completed-count"),
  progressChart: document.querySelector("#progress-chart"),
  searchInput: document.querySelector("#search-input"),
  studentsBody: document.querySelector("#students-body"),
  emptyState: document.querySelector("#empty-state"),
  refreshButton: document.querySelector("#refresh-button"),
  missionDialog: document.querySelector("#mission-dialog"),
  dialogCarnet: document.querySelector("#dialog-carnet"),
  dialogName: document.querySelector("#dialog-name"),
  missionList: document.querySelector("#mission-list"),
  toast: document.querySelector("#toast"),
};

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getProgress(student) {
  const total = Number(student?.progreso?.total || 0);
  const completed = Number(student?.progreso?.completadas || 0);
  const percentage = total > 0 ? Number(student?.progreso?.porcentaje || (completed / total) * 100) : 0;

  return {
    total,
    completed,
    percentage: Math.max(0, Math.min(100, Math.round(percentage))),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || `Error ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function loadDashboard() {
  document.body.classList.add("is-loading");
  try {
    state.dashboard = await request("/api/dashboard");
    state.students = Array.isArray(state.dashboard?.estudiantes) ? state.dashboard.estudiantes : [];
    renderDashboard();
  } catch (error) {
    showToast(`No se pudo cargar el tablero: ${error.message}`);
  } finally {
    document.body.classList.remove("is-loading");
  }
}

function renderDashboard() {
  renderStats();
  renderChart();
  renderStudents();
}

function renderStats() {
  const totalStudents = state.students.length;
  const progressValues = state.students.map((student) => getProgress(student).percentage);
  const average = totalStudents
    ? progressValues.reduce((total, current) => total + current, 0) / totalStudents
    : 0;
  const completed = progressValues.filter((value) => value === 100).length;

  elements.studentsCount.textContent = totalStudents;
  elements.averageProgress.textContent = formatPercent(average);
  elements.completedCount.textContent = completed;
}

function renderChart() {
  const counts = BUCKETS.map((bucket) => {
    return state.students.filter((student) => {
      const percentage = getProgress(student).percentage;
      return percentage >= bucket.min && percentage <= bucket.max;
    }).length;
  });
  const maxCount = Math.max(1, ...counts);

  elements.progressChart.style.setProperty("--max-count", maxCount);
  elements.progressChart.innerHTML = BUCKETS.map((bucket, index) => {
    const count = counts[index];
    return `
      <div class="bar-group" title="${bucket.label}: ${count}">
        <div class="bar" style="--value: ${count}" data-empty="${count === 0}"></div>
        <span class="bar-label">${bucket.label}</span>
      </div>
    `;
  }).join("");
}

function renderStudents() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.students.filter((student) => {
    const carnet = String(student.Carnet || "").toLowerCase();
    const name = String(student.Nombre || "").toLowerCase();
    const email = String(student.Correo || "").toLowerCase();
    return !query || carnet.includes(query) || name.includes(query) || email.includes(query);
  });

  elements.emptyState.hidden = filtered.length > 0;
  elements.studentsBody.innerHTML = filtered.map(renderStudentRow).join("");
}

function renderStudentRow(student) {
  const progress = getProgress(student);
  const isDone = progress.percentage === 100;
  const statusText = isDone ? "Completado" : "En progreso";
  const statusIcon = isDone ? "✓" : "•";

  return `
    <tr>
      <td><strong>${escapeHtml(student.Carnet || "")}</strong></td>
      <td>${escapeHtml(student.Nombre || "")}</td>
      <td>${escapeHtml(student.Correo || "")}</td>
      <td class="progress-cell">${progress.completed} / ${progress.total}</td>
      <td>
        <div class="progress-bar" aria-label="${progress.percentage}% completado">
          <span style="--progress: ${progress.percentage}%">${progress.percentage}%</span>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <span class="status ${isDone ? "status--done" : ""}">${statusIcon} ${statusText}</span>
          <button class="button button--small button--ghost" type="button" data-carnet="${escapeHtml(student.Carnet || "")}">
            Misiones
          </button>
        </div>
      </td>
    </tr>
  `;
}

function openMissionDialog(carnet) {
  const student = state.students.find((item) => item.Carnet === carnet);
  if (!student) return;

  elements.dialogCarnet.textContent = student.Carnet;
  elements.dialogName.textContent = student.Nombre;
  elements.missionList.innerHTML = (student.misiones || []).map((mission) => {
    const done = Boolean(mission.Estado);
    return `
      <div class="mission-item">
        <div>
          <strong>${escapeHtml(mission.Nombre || "")}</strong>
          <span>${done ? "Misión completada" : "Pendiente"}</span>
        </div>
        <button
          class="button button--small ${done ? "button--ghost" : "button--primary"}"
          type="button"
          data-mission="${mission.MisionID}"
          data-carnet="${escapeHtml(student.Carnet)}"
          ${done ? "disabled" : ""}
        >
          ${done ? "Completada" : "Completar"}
        </button>
      </div>
    `;
  }).join("");

  elements.missionDialog.showModal();
}

async function completeMission(carnet, missionId) {
  const payloads = [
    { Carnet: carnet, MisionID: Number(missionId) },
    { carnet, mision_id: Number(missionId) },
  ];

  let lastError = null;
  for (const payload of payloads) {
    try {
      await request("/api/registro", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Misión registrada como completada.");
      elements.missionDialog.close();
      await loadDashboard();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  showToast(`No se pudo completar la misión: ${lastError?.message || "Error desconocido"}`);
}

function updateCountdown() {
  const diff = DEADLINE.getTime() - Date.now();

  if (diff <= 0) {
    elements.countdown.textContent = "Entrega cerrada";
    return;
  }

  const seconds = Math.floor(diff / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  elements.countdown.textContent = `${days}d  ${hours}h  ${minutes}m  ${remainingSeconds}s`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderStudents();
});

elements.refreshButton.addEventListener("click", loadDashboard);

elements.studentsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-carnet]");
  if (!button) return;
  openMissionDialog(button.dataset.carnet);
});

elements.missionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mission]");
  if (!button) return;
  completeMission(button.dataset.carnet, button.dataset.mission);
});

updateCountdown();
setInterval(updateCountdown, 1000);
loadDashboard();
