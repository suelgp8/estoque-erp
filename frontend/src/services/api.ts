import {
  type BaseResponse,
  type ChangePasswordPayload,
  type ChangePasswordResponse,
  type CompanyResponse,
  type CategoryResponse,
  type CreateBasePayload,
  type CreateCategoryPayload,
  type CreateProductPayload,
  type CreateUserPayload,
  type CreateStockMovementPayload,
  type DeleteBaseResponse,
  type DeleteCategoryResponse,
  type DeleteProductResponse,
  type DeleteUserResponse,
  type ExportedFile,
  type ForgotPasswordResponse,
  type ListBasesResponse,
  type ListCategoriesResponse,
  type ListProductsResponse,
  type ListUsersResponse,
  type LoginResponse,
  type MeResponse,
  type MovementReportFilters,
  type MovementReportResponse,
  type ProductResponse,
  type ProfileResponse,
  type ReportFormat,
  type ResetPasswordResponse,
  type StockMovementDetailResponse,
  type StockMovementOperationResponse,
  type StockByBaseResponse,
  type StockReportFilters,
  type StockReportResponse,
  type TransferReportFilters,
  type TransferReportResponse,
  type UpdateBasePayload,
  type UpdateCategoryPayload,
  type UpdateCompanyPayload,
  type UpdateProductPayload,
  type UpdateProfilePayload,
  type UpdateUserPayload,
  type UserResponse
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") || "/api";

type QueryValue = string | number | boolean | undefined | null;
type QueryParams = object;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  query?: QueryParams;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`, window.location.origin);

  if (query) {
    for (const [key, rawValue] of Object.entries(query as Record<string, unknown>)) {
      const value = rawValue as QueryValue;

      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function parseFileNameFromDisposition(disposition: string | null): string {
  if (!disposition) {
    return "relatório";
  }

  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);

  if (!filenameMatch) {
    return "relatório";
  }

  return decodeURIComponent(filenameMatch[1] ?? filenameMatch[2] ?? "relatório");
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  const isJsonResponse = contentType.includes("application/json");

  if (!response.ok) {
    let payload: unknown = null;

    if (isJsonResponse) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    } else {
      payload = await response.text();
    }

    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Falha na requisição com status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  if (!isJsonResponse) {
    throw new ApiError("Resposta JSON era esperada", response.status, null);
  }

  return (await response.json()) as T;
}

async function requestFile(path: string, token: string, query?: QueryParams): Promise<ExportedFile> {
  const response = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const payloadText = await response.text();

    let payload: unknown = payloadText;

    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = payloadText;
    }

    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Falha na requisição com status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  const blob = await response.blob();
  const fileName = parseFileNameFromDisposition(response.headers.get("Content-Disposition"));

  return {
    blob,
    fileName
  };
}

export const api = {
  login(payload: { email: string; password: string }) {
    return requestJson<LoginResponse>("/auth/login", {
      method: "POST",
      body: payload
    });
  },

  me(token: string) {
    return requestJson<MeResponse>("/auth/me", {
      method: "GET",
      token
    });
  },

  forgotPassword(payload: { email: string }) {
    return requestJson<ForgotPasswordResponse>("/auth/forgot-password", {
      method: "POST",
      body: payload
    });
  },

  resetPassword(payload: { token: string; newPassword: string }) {
    return requestJson<ResetPasswordResponse>("/auth/reset-password", {
      method: "POST",
      body: payload
    });
  },

  listUsers(token: string) {
    return requestJson<ListUsersResponse>("/users", {
      method: "GET",
      token
    });
  },

  createUser(token: string, payload: CreateUserPayload) {
    return requestJson<UserResponse>("/users", {
      method: "POST",
      token,
      body: payload
    });
  },

  updateUser(token: string, userId: string, payload: UpdateUserPayload) {
    return requestJson<UserResponse>(`/users/${userId}`, {
      method: "PATCH",
      token,
      body: payload
    });
  },

  deleteUser(token: string, userId: string) {
    return requestJson<DeleteUserResponse>(`/users/${userId}`, {
      method: "DELETE",
      token,
      body: {}
    });
  },

  listBases(token: string) {
    return requestJson<ListBasesResponse>("/bases", {
      method: "GET",
      token
    });
  },

  createBase(token: string, payload: CreateBasePayload) {
    return requestJson<BaseResponse>("/bases", {
      method: "POST",
      token,
      body: payload
    });
  },

  updateBase(token: string, baseId: string, payload: UpdateBasePayload) {
    return requestJson<BaseResponse>(`/bases/${baseId}`, {
      method: "PATCH",
      token,
      body: payload
    });
  },

  deleteBase(token: string, baseId: string) {
    return requestJson<DeleteBaseResponse>(`/bases/${baseId}`, {
      method: "DELETE",
      token,
      body: {}
    });
  },

  listCategories(token: string) {
    return requestJson<ListCategoriesResponse>("/categories", {
      method: "GET",
      token
    });
  },

  createCategory(token: string, payload: CreateCategoryPayload) {
    return requestJson<CategoryResponse>("/categories", {
      method: "POST",
      token,
      body: payload
    });
  },

  updateCategory(token: string, categoryId: string, payload: UpdateCategoryPayload) {
    return requestJson<CategoryResponse>(`/categories/${categoryId}`, {
      method: "PATCH",
      token,
      body: payload
    });
  },

  deleteCategory(token: string, categoryId: string) {
    return requestJson<DeleteCategoryResponse>(`/categories/${categoryId}`, {
      method: "DELETE",
      token,
      body: {}
    });
  },

  listProducts(token: string) {
    return requestJson<ListProductsResponse>("/products", {
      method: "GET",
      token
    });
  },

  createProduct(token: string, payload: CreateProductPayload) {
    return requestJson<ProductResponse>("/products", {
      method: "POST",
      token,
      body: payload
    });
  },

  updateProduct(token: string, productId: string, payload: UpdateProductPayload) {
    return requestJson<ProductResponse>(`/products/${productId}`, {
      method: "PATCH",
      token,
      body: payload
    });
  },

  deleteProduct(token: string, productId: string) {
    return requestJson<DeleteProductResponse>(`/products/${productId}`, {
      method: "DELETE",
      token,
      body: {}
    });
  },

  getProfile(token: string) {
    return requestJson<ProfileResponse>("/profile", {
      method: "GET",
      token
    });
  },

  getCompany(token: string) {
    return requestJson<CompanyResponse>("/company", {
      method: "GET",
      token
    });
  },

  updateProfile(token: string, payload: UpdateProfilePayload) {
    return requestJson<ProfileResponse>("/profile", {
      method: "PATCH",
      token,
      body: payload
    });
  },

  updateCompany(token: string, payload: UpdateCompanyPayload) {
    return requestJson<CompanyResponse>("/company", {
      method: "PATCH",
      token,
      body: payload
    });
  },

  changePassword(token: string, payload: ChangePasswordPayload) {
    return requestJson<ChangePasswordResponse>("/profile/password", {
      method: "PATCH",
      token,
      body: payload
    });
  },

  createStockMovement(token: string, payload: CreateStockMovementPayload) {
    return requestJson<StockMovementOperationResponse>("/stock-movements", {
      method: "POST",
      token,
      body: payload
    });
  },

  getStockMovement(token: string, movementId: string) {
    return requestJson<StockMovementDetailResponse>(`/stock-movements/${movementId}`, {
      method: "GET",
      token
    });
  },

  approveStockMovement(token: string, movementId: string) {
    return requestJson<StockMovementOperationResponse>(`/stock-movements/${movementId}/approve`, {
      method: "POST",
      token,
      body: {}
    });
  },

  rejectStockMovement(token: string, movementId: string, reason: string) {
    return requestJson<StockMovementOperationResponse>(`/stock-movements/${movementId}/reject`, {
      method: "POST",
      token,
      body: {
        reason
      }
    });
  },

  cancelStockMovement(token: string, movementId: string, reason: string) {
    return requestJson<StockMovementOperationResponse>(`/stock-movements/${movementId}/cancel`, {
      method: "POST",
      token,
      body: {
        reason
      }
    });
  },

  reverseStockMovement(token: string, movementId: string, reason: string) {
    return requestJson<StockMovementOperationResponse>(`/stock-movements/${movementId}/reverse`, {
      method: "POST",
      token,
      body: {
        reason
      }
    });
  },

  confirmTransfer(token: string, movementId: string) {
    return requestJson<StockMovementOperationResponse>(`/stock-movements/${movementId}/confirm-transfer`, {
      method: "POST",
      token,
      body: {}
    });
  },

  exportStockMovement(token: string, movementId: string, format: ReportFormat) {
    return requestFile(`/stock-movements/${movementId}/export/${format}`, token);
  },

  getStockByBase(token: string, productId: string, baseId: string) {
    return requestJson<StockByBaseResponse>("/stock/by-base", {
      method: "GET",
      token,
      query: {
        productId,
        baseId
      }
    });
  },

  getStockReport(token: string, filters: StockReportFilters) {
    return requestJson<StockReportResponse>("/reports/stock", {
      method: "GET",
      token,
      query: filters
    });
  },

  getMovementsReport(token: string, filters: MovementReportFilters) {
    return requestJson<MovementReportResponse>("/reports/movements", {
      method: "GET",
      token,
      query: filters
    });
  },

  getTransfersReport(token: string, filters: TransferReportFilters) {
    return requestJson<TransferReportResponse>("/reports/transfers", {
      method: "GET",
      token,
      query: filters
    });
  },

  exportStockReport(token: string, format: ReportFormat, filters: StockReportFilters) {
    return requestFile(`/reports/stock/export/${format}`, token, filters);
  },

  exportProductsTable(token: string, format: ReportFormat, filters: { baseId?: string }) {
    return requestFile(`/products/export/${format}`, token, filters);
  },

  exportMovementsReport(token: string, format: ReportFormat, filters: MovementReportFilters) {
    return requestFile(`/reports/movements/export/${format}`, token, filters);
  },

  exportTransfersReport(token: string, format: ReportFormat, filters: TransferReportFilters) {
    return requestFile(`/reports/transfers/export/${format}`, token, filters);
  }
};
