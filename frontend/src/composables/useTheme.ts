import { computed, reactive, readonly } from "vue";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "erp-theme-mode";

type ThemeState = {
  initialized: boolean;
  mode: ThemeMode;
};

const state = reactive<ThemeState>({
  initialized: false,
  mode: "light"
});

function resolveInitialTheme(): ThemeMode {
  const storedValue = localStorage.getItem(THEME_STORAGE_KEY);

  if (storedValue === "light" || storedValue === "dark") {
    return storedValue;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;

  root.classList.toggle("theme-dark", mode === "dark");
  root.dataset.theme = mode;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  state.mode = mode;
}

function initTheme() {
  if (state.initialized) {
    return;
  }

  applyTheme(resolveInitialTheme());
  state.initialized = true;
}

function setTheme(mode: ThemeMode) {
  if (!state.initialized) {
    initTheme();
  }

  applyTheme(mode);
}

function toggleTheme() {
  setTheme(state.mode === "dark" ? "light" : "dark");
}

export function useTheme() {
  return {
    state: readonly(state),
    isDark: computed(() => state.mode === "dark"),
    initTheme,
    setTheme,
    toggleTheme
  };
}
