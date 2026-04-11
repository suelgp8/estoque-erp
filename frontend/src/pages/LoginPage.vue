<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotifier } from "../composables/useNotifier";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const notifier = useNotifier();

const activeTab = ref<"login" | "forgot" | "reset">("login");

const loginEmail = ref("admin@estoque.local");
const loginPassword = ref("admin123");
const loginLoading = ref(false);

const forgotEmail = ref("admin@estoque.local");
const forgotLoading = ref(false);

const resetToken = ref("");
const resetPassword = ref("");
const resetLoading = ref(false);

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.payload &&
      typeof error.payload === "object" &&
      "message" in error.payload &&
      typeof (error.payload as { message?: unknown }).message === "string"
    ) {
      return (error.payload as { message: string }).message;
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado";
}

async function handleLogin() {
  loginLoading.value = true;

  try {
    await auth.login(loginEmail.value.trim(), loginPassword.value);
    notifier.success("Sessao iniciada", "Autenticacao concluida com sucesso.");
    await router.push({ name: "dashboard" });
  } catch (error) {
    notifier.error("Falha no login", resolveErrorMessage(error));
  } finally {
    loginLoading.value = false;
  }
}

async function handleForgotPassword() {
  forgotLoading.value = true;

  try {
    const response = await auth.forgotPassword(forgotEmail.value.trim());
    notifier.info("Recuperacao iniciada", response.message);
  } catch (error) {
    notifier.error("Falha na recuperacao", resolveErrorMessage(error));
  } finally {
    forgotLoading.value = false;
  }
}

async function handleResetPassword() {
  resetLoading.value = true;

  try {
    const response = await auth.resetPassword(resetToken.value.trim(), resetPassword.value);
    notifier.success("Senha atualizada", response.message);
    resetToken.value = "";
    resetPassword.value = "";
    activeTab.value = "login";
  } catch (error) {
    notifier.error("Falha ao redefinir", resolveErrorMessage(error));
  } finally {
    resetLoading.value = false;
  }
}

onMounted(async () => {
  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  if (auth.isAuthenticated.value) {
    await router.push({ name: "dashboard" });
  }
});
</script>

<template>
  <main class="min-h-screen px-4 py-8 sm:px-8">
    <section class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[640px] items-center justify-center">
      <article class="erp-surface w-full p-6 sm:p-9">
        <div class="mb-8">
          <p class="font-heading text-[11px] uppercase tracking-[0.28em] text-slate-500">Acesso</p>
          <h2 class="font-heading mt-3 text-3xl text-slate-900">Entre na plataforma</h2>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Escolha a opcao desejada para acessar, recuperar ou redefinir sua conta.
          </p>
        </div>

        <div class="mb-6 flex rounded-[22px] border border-slate-200 bg-slate-100/80 p-1">
          <button
            type="button"
            class="flex-1 rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition"
            :class="activeTab === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="activeTab = 'login'"
          >
            Entrar
          </button>
          <button
            type="button"
            class="flex-1 rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition"
            :class="activeTab === 'forgot' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="activeTab = 'forgot'"
          >
            Recuperar
          </button>
          <button
            type="button"
            class="flex-1 rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition"
            :class="activeTab === 'reset' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="activeTab = 'reset'"
          >
            Redefinir
          </button>
        </div>

        <form v-if="activeTab === 'login'" class="space-y-4" @submit.prevent="handleLogin">
          <div>
            <label class="erp-label">Email</label>
            <input v-model="loginEmail" class="erp-field" type="email" autocomplete="username" required />
          </div>

          <div>
            <label class="erp-label">Senha</label>
            <input v-model="loginPassword" class="erp-field" type="password" autocomplete="current-password" required />
          </div>

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="loginLoading">
            {{ loginLoading ? "Entrando..." : "Acessar painel" }}
          </button>
        </form>

        <form v-else-if="activeTab === 'forgot'" class="space-y-4" @submit.prevent="handleForgotPassword">
          <p class="text-sm leading-6 text-slate-600">Informe o email para gerar o fluxo de recuperacao.</p>

          <div>
            <label class="erp-label">Email</label>
            <input v-model="forgotEmail" class="erp-field" type="email" required />
          </div>

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="forgotLoading">
            {{ forgotLoading ? "Enviando..." : "Solicitar recuperacao" }}
          </button>
        </form>

        <form v-else class="space-y-4" @submit.prevent="handleResetPassword">
          <p class="text-sm leading-6 text-slate-600">Use o codigo recebido para definir uma nova senha.</p>

          <div>
            <label class="erp-label">Codigo de recuperacao</label>
            <input v-model="resetToken" class="erp-field" type="text" required />
          </div>

          <div>
            <label class="erp-label">Nova senha</label>
            <input v-model="resetPassword" class="erp-field" type="password" minlength="6" required />
          </div>

          <button type="submit" class="erp-button-primary h-11 w-full" :disabled="resetLoading">
            {{ resetLoading ? "Atualizando..." : "Atualizar senha" }}
          </button>
        </form>
      </article>
    </section>
  </main>
</template>
