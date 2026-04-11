import { computed, reactive, readonly } from "vue";
import { AUTH_TOKEN_STORAGE_KEY } from "../constants/auth";
import { api } from "../services/api";
import type {
  AuthUser,
  ChangePasswordResponse,
  ForgotPasswordResponse,
  ManagedUser,
  ResetPasswordResponse,
  UpdateProfilePayload
} from "../types/api";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  initialized: boolean;
  loading: boolean;
};

const state = reactive<AuthState>({
  token: localStorage.getItem(AUTH_TOKEN_STORAGE_KEY),
  user: null,
  initialized: false,
  loading: false
});

function toAuthUser(user: AuthUser | ManagedUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePhotoDataUrl: user.profilePhotoDataUrl,
    companyLogoDataUrl: user.companyLogoDataUrl,
    role: user.role,
    companyId: user.companyId,
    isFirstLogin: user.isFirstLogin,
    allowedBases: user.allowedBases
  };
}

function persistToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function resetSession() {
  state.token = null;
  state.user = null;
  persistToken(null);
}

async function bootstrap() {
  if (state.initialized) {
    return;
  }

  if (!state.token) {
    state.initialized = true;
    return;
  }

  try {
    const profile = await api.me(state.token);
    state.user = profile.user;
  } catch {
    resetSession();
  } finally {
    state.initialized = true;
  }
}

async function login(email: string, password: string) {
  state.loading = true;

  try {
    const response = await api.login({
      email,
      password
    });

    state.token = response.token;
    const authUser = toAuthUser(response.user);
    state.user = authUser;
    persistToken(response.token);

    return authUser;
  } finally {
    state.loading = false;
  }
}

function logout() {
  resetSession();
}

async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return api.forgotPassword({ email });
}

async function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResponse> {
  return api.resetPassword({ token, newPassword });
}

async function updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  if (!state.token) {
    throw new Error("Sessão não autenticada");
  }

  const response = await api.updateProfile(state.token, payload);
  const authUser = toAuthUser(response.user);
  state.user = authUser;

  return authUser;
}

async function refreshProfile(): Promise<AuthUser> {
  if (!state.token) {
    throw new Error("Sessão não autenticada");
  }

  const response = await api.getProfile(state.token);
  const authUser = toAuthUser(response.user);
  state.user = authUser;

  return authUser;
}

async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
  if (!state.token) {
    throw new Error("Sessão não autenticada");
  }

  const response = await api.changePassword(state.token, {
    currentPassword,
    newPassword
  });

  if (state.user?.isFirstLogin) {
    state.user = {
      ...state.user,
      isFirstLogin: false
    };
  }

  return response;
}

const isAuthenticated = computed(() => Boolean(state.token && state.user));

export function useAuthStore() {
  return {
    state: readonly(state),
    isAuthenticated,
    bootstrap,
    login,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    refreshProfile,
    changePassword
  };
}
