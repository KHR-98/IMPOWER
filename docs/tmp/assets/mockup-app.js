(function bootstrapMockup(globalScope, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.MockupApp = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => api.mount(document));
  }
})(typeof window !== "undefined" ? window : globalThis, function createMockupApp() {
  const screens = ["login", "user", "admin"];

  function normalizeScreen(value) {
    const normalized = String(value || "").replace(/^#/, "").toLowerCase();
    return screens.includes(normalized) ? normalized : "login";
  }

  function nextScreen(current) {
    const index = screens.indexOf(normalizeScreen(current));
    return screens[(index + 1) % screens.length];
  }

  function advanceAttendance(current) {
    if (current === "ready") {
      return {
        state: "checking",
        label: "위치 확인 중",
        message: "GPS 정확도와 출입구 반경을 확인하고 있습니다.",
        subtext: "잠시만 기다려 주세요",
      };
    }

    return {
      state: "success",
      label: "출근 완료",
      message: "07:42 출근이 기록되었습니다.",
      subtext: "07:42 기록 완료",
    };
  }

  function progressForState(state) {
    const completed = state === "success" ? 1 : 0;
    const total = 8;

    return {
      completed,
      total,
      percent: (completed / total) * 100,
      label: `${completed}/${total} 완료`,
    };
  }

  function closeMockControls(scope) {
    scope.querySelectorAll("[data-mock-controls]").forEach((details) => {
      details.open = false;
    });
  }

  function setScreen(scope, requestedScreen, updateHash) {
    const screen = normalizeScreen(requestedScreen);

    scope.querySelectorAll("[data-screen]").forEach((panel) => {
      const selected = panel.dataset.screen === screen;
      panel.hidden = !selected;
      panel.setAttribute("aria-hidden", String(!selected));
    });

    scope.querySelectorAll("[data-screen-target]").forEach((button) => {
      const selected = button.dataset.screenTarget === screen;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });

    if (scope.documentElement) {
      scope.documentElement.dataset.activeScreen = screen;
    }

    if (updateHash && typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${screen}`);
    }

    closeMockControls(scope);
    return screen;
  }

  function setAdminPanel(scope, requestedPanel) {
    const available = Array.from(scope.querySelectorAll("[data-admin-panel]"));
    const fallback = available[0]?.dataset.adminPanel || "overview";
    const panel = available.some((item) => item.dataset.adminPanel === requestedPanel)
      ? requestedPanel
      : fallback;

    available.forEach((item) => {
      const selected = item.dataset.adminPanel === panel;
      item.hidden = !selected;
      item.setAttribute("aria-hidden", String(!selected));
    });

    scope.querySelectorAll("[data-admin-target]").forEach((button) => {
      const selected = button.dataset.adminTarget === panel;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });

    return panel;
  }

  function updateAttendanceUI(scope, nextState) {
    scope.querySelectorAll("[data-attendance-action]").forEach((button) => {
      button.dataset.attendanceState = nextState.state;
      button.classList.toggle("is-checking", nextState.state === "checking");
      button.classList.toggle("is-success", nextState.state === "success");
      button.disabled = nextState.state !== "ready";
      const label = button.querySelector("[data-attendance-label]");
      if (label) label.textContent = nextState.label;
      const subtext = button.querySelector("[data-attendance-subtext]");
      if (subtext) subtext.textContent = nextState.subtext;
    });

    scope.querySelectorAll("[data-attendance-message]").forEach((message) => {
      message.textContent = nextState.message;
      message.dataset.state = nextState.state;
      message.hidden = false;
    });

    if (nextState.state !== "success") return;

    const progress = progressForState(nextState.state);
    scope.querySelectorAll("[data-checkin-status]").forEach((status) => {
      status.textContent = "출근 완료 · 07:42";
      status.dataset.state = "success";
    });
    scope.querySelectorAll("[data-current-step]").forEach((row) => {
      row.classList.add("is-complete");
    });
    scope.querySelectorAll("[data-progress-count]").forEach((label) => {
      label.textContent = progress.label;
    });
    scope.querySelectorAll("[data-progress-bar]").forEach((bar) => {
      bar.style.width = `${progress.percent}%`;
      bar.setAttribute("aria-valuenow", String(progress.percent));
    });
    scope.querySelectorAll("[data-next-window]").forEach((label) => {
      label.textContent = "다음 단계 · 오전 TBM 06:00–08:30";
    });
    scope.querySelectorAll("[data-next-title]").forEach((heading) => {
      heading.textContent = "오전 TBM을 진행하세요";
    });
    scope.querySelectorAll("[data-attendance-hint]").forEach((hint) => {
      hint.textContent = "출근 기록 저장됨 · 다음 단계가 활성화되었습니다";
    });
  }

  function mount(scope) {
    const initialScreen =
      typeof window !== "undefined" && window.location.hash
        ? normalizeScreen(window.location.hash)
        : normalizeScreen(scope.body?.dataset.defaultScreen);

    setScreen(scope, initialScreen, false);
    setAdminPanel(scope, "overview");

    scope.querySelectorAll("[data-screen-target]").forEach((button) => {
      button.addEventListener("click", () => setScreen(scope, button.dataset.screenTarget, true));
    });

    scope.querySelectorAll("[data-login-continue]").forEach((button) => {
      button.addEventListener("click", () => setScreen(scope, "user", true));
    });

    scope.querySelectorAll("[data-admin-target]").forEach((button) => {
      button.addEventListener("click", () => setAdminPanel(scope, button.dataset.adminTarget));
    });

    scope.querySelectorAll("[data-attendance-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const checking = advanceAttendance(button.dataset.attendanceState || "ready");
        updateAttendanceUI(scope, checking);

        if (checking.state === "checking") {
          window.setTimeout(() => updateAttendanceUI(scope, advanceAttendance("checking")), 850);
        }
      });
    });
  }

  return {
    advanceAttendance,
    mount,
    nextScreen,
    normalizeScreen,
    progressForState,
    setAdminPanel,
    setScreen,
  };
});
