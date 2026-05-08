<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useTheme } from "../composables/useTheme";
import type { Role } from "../types/api";
import { formatRole } from "../utils/format";

type NavigationItem = {
  name: string;
  to: string;
  caption: string;
  icon: string;
  roles?: Role[];
};

type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

const auth = useAuthStore();
const theme = useTheme();
const route = useRoute();
const router = useRouter();

const mobileMenuOpen = ref(false);
const profileMenuOpen = ref(false);
const profileMenuRef = ref<HTMLElement | null>(null);

const navigationSections: NavigationSection[] = [
  {
    label: "Visao geral",
    items: [{ name: "Painel", to: "/app/dashboard", caption: "Resumo do ambiente e indicadores", icon: "grid-outline" }]
  },
  {
    label: "Operacao",
    items: [
      { name: "Movimentacoes", to: "/app/movements", caption: "Entradas, saidas e transferencias", icon: "swap-horizontal-outline" },
      { name: "Relatorios", to: "/app/reports", caption: "Consulta e exportacao de dados", icon: "bar-chart-outline" }
    ]
  },
  {
    label: "Cadastros",
    items: [
      { name: "Bases", to: "/app/bases", caption: "Estrutura fisica e unidades", icon: "business-outline" },
      { name: "Categorias", to: "/app/categories", caption: "Organizacao do catalogo", icon: "pricetags-outline" },
      { name: "Produtos", to: "/app/products", caption: "Itens e disponibilidade por base", icon: "cube-outline" }
    ]
  },
  {
    label: "Administracao",
    items: [
      { name: "Empresa", to: "/app/company", caption: "Identidade visual e dados da empresa", icon: "storefront-outline", roles: ["ADMIN"] },
      { name: "Usuarios", to: "/app/users", caption: "Permissoes e acessos", icon: "people-outline", roles: ["ADMIN"] }
    ]
  }
];

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? "ERP");
const currentUserName = computed(() => auth.state.user?.name ?? "Usuario");
const currentUserInitial = computed(() => currentUserName.value.trim().charAt(0).toUpperCase() || "U");
const currentUserProfilePhoto = computed(() => auth.state.user?.profilePhotoDataUrl ?? null);
const currentCompanyLogo = computed(() => auth.state.user?.companyLogoDataUrl ?? null);
const currentRoleCode = computed(() => auth.state.user?.role);
const currentRole = computed(() => (auth.state.user?.role ? formatRole(auth.state.user.role) : "-"));
const firstLoginRequired = computed(() => auth.state.user?.isFirstLogin ?? false);
const isDarkTheme = computed(() => theme.state.mode === "dark");

const visibleNavigationSections = computed(() => {
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles || item.roles.length === 0) {
          return true;
        }

        return currentRoleCode.value ? item.roles.includes(currentRoleCode.value) : false;
      })
    }))
    .filter((section) => section.items.length > 0);
});

const activeNavigationItem = computed(() => {
  for (const section of visibleNavigationSections.value) {
    const match = section.items.find((item) => route.path === item.to || route.path.startsWith(`${item.to}/`));

    if (match) {
      return {
        ...match,
        sectionLabel: section.label
      };
    }
  }

  return null;
});

function isActive(target: string) {
  return route.path === target || route.path.startsWith(`${target}/`);
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
}

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
}

function toggleThemeMode() {
  theme.toggleTheme();
}

async function goToProfile() {
  closeProfileMenu();

  if (route.name === "profile") {
    return;
  }

  await router.push({ name: "profile" });
}

async function handleLogout() {
  closeProfileMenu();
  auth.logout();
  await router.push({ name: "login" });
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!profileMenuOpen.value || !profileMenuRef.value) {
    return;
  }

  const target = event.target;

  if (target instanceof Node && !profileMenuRef.value.contains(target)) {
    closeProfileMenu();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
    closeProfileMenu();
  }
);
</script>

<template>
  <div class="relative min-h-screen text-slate-800">
    <div class="relative mx-auto flex min-h-screen max-w-[1520px]">
      <div
        v-if="mobileMenuOpen"
        class="fixed inset-0 z-30 bg-slate-900/16 backdrop-blur-[1px] lg:hidden"
        @click="mobileMenuOpen = false"
      />

      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-[292px] flex-col border-r bg-white/88 px-4 py-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)] backdrop-blur transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0"
        :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
        style="border-color: var(--erp-border)"
      >
        <section class="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            <p class="font-heading text-[11px] uppercase tracking-[0.28em] text-slate-500">Estoque ERP</p>
          </div>
          <div class="mt-4 flex h-24 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-transparent px-4">
            <img
              v-if="currentCompanyLogo"
              :src="currentCompanyLogo"
              alt="Logo da empresa"
              class="block h-full w-full object-contain"
            />
          </div>
        </section>

        <nav class="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
          <section v-for="section in visibleNavigationSections" :key="section.label">
            <p class="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{{ section.label }}</p>
            <div class="mt-2 space-y-1.5">
              <RouterLink
                v-for="item in section.items"
                :key="item.to"
                :to="item.to"
                class="group block rounded-[22px] border px-4 py-3 transition duration-200"
                :class="
                  isActive(item.to)
                    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_14px_32px_-24px_rgba(15,23,42,0.75)]'
                    : 'border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
                "
              >
                <div class="flex items-start gap-3">
                  <span
                    class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition"
                    :class="
                      isActive(item.to)
                        ? 'border-white/15 bg-white/10 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:bg-slate-100 group-hover:text-slate-700'
                    "
                  >
                    <ion-icon :name="item.icon" class="text-lg"></ion-icon>
                  </span>

                  <div class="min-w-0">
                    <p class="text-sm font-semibold">{{ item.name }}</p>
                    <p
                      class="mt-1 text-xs leading-5"
                      :class="isActive(item.to) ? 'text-slate-300' : 'text-slate-400 group-hover:text-slate-500'"
                    >
                      {{ item.caption }}
                    </p>
                  </div>
                </div>
              </RouterLink>
            </div>
          </section>
        </nav>
      </aside>

      <div class="relative flex min-h-screen w-full flex-1 flex-col">
        <header class="sticky top-0 z-20 border-b bg-white/70 backdrop-blur">
          <div class="mx-auto flex min-h-[72px] w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 lg:hidden"
                @click="mobileMenuOpen = !mobileMenuOpen"
              >
                <ion-icon name="menu-outline" class="text-xl"></ion-icon>
              </button>

              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {{ activeNavigationItem?.sectionLabel ?? "Aplicacao" }}
                </p>
                <h2 class="font-heading mt-1 text-xl text-slate-900">{{ pageTitle }}</h2>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                class="theme-toggle"
                :aria-label="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
                :title="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
                :class="isDarkTheme ? 'is-dark' : 'is-light'"
                @click="toggleThemeMode"
              >
                <span class="theme-toggle__track"></span>
                <span class="theme-toggle__thumb">
                  <ion-icon :name="isDarkTheme ? 'moon-outline' : 'sunny-outline'" class="text-base"></ion-icon>
                </span>
              </button>

              <div ref="profileMenuRef" class="relative">
                <button
                  type="button"
                  class="flex min-w-[164px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-white sm:min-w-[236px] sm:px-4"
                  @click="toggleProfileMenu"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <div class="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-900 shadow-sm">
                      <img
                        v-if="currentUserProfilePhoto"
                        :src="currentUserProfilePhoto"
                        :alt="`Foto de ${currentUserName}`"
                        class="block h-full w-full rounded-full object-cover"
                      />
                      <div v-else class="flex h-full w-full items-center justify-center text-base font-semibold text-white">
                        {{ currentUserInitial }}
                      </div>
                    </div>

                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-900">{{ currentUserName }}</p>
                      <p class="mt-0.5 hidden text-xs text-slate-500 sm:block">{{ currentRole }}</p>
                    </div>
                  </div>

                  <svg
                    class="h-4 w-4 flex-none text-slate-400 transition-transform duration-200"
                    :class="profileMenuOpen ? 'rotate-180' : ''"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
                  </svg>
                </button>

                <div
                  v-if="profileMenuOpen"
                  class="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[280px] rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)]"
                >
                  <div class="flex items-center gap-3 rounded-[20px] bg-slate-50 px-4 py-3">
                    <div class="h-12 w-12 overflow-hidden rounded-full bg-slate-900">
                      <img
                        v-if="currentUserProfilePhoto"
                        :src="currentUserProfilePhoto"
                        :alt="`Foto de ${currentUserName}`"
                        class="h-full w-full rounded-full object-cover"
                      />
                      <div v-else class="flex h-full w-full items-center justify-center text-base font-semibold text-white">
                        {{ currentUserInitial }}
                      </div>
                    </div>

                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-900">{{ currentUserName }}</p>
                      <p class="mt-1 text-xs text-slate-500">{{ currentRole }}</p>
                    </div>
                  </div>

                  <p
                    v-if="firstLoginRequired"
                    class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
                  >
                    Primeiro acesso pendente. Atualize sua senha assim que possivel.
                  </p>

                  <div class="mt-3 space-y-2">
                    <button type="button" class="erp-button-muted w-full justify-center" @click="goToProfile">
                      <ion-icon name="person-circle-outline" class="text-base"></ion-icon>
                      Editar perfil
                    </button>
                    <button
                      type="button"
                      class="erp-button-muted w-full justify-center border-rose-200 text-rose-700 hover:bg-rose-50"
                      @click="handleLogout"
                    >
                      <ion-icon name="log-out-outline" class="text-base"></ion-icon>
                      Sair
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main class="flex-1">
          <div class="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-8">
            <RouterView />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
