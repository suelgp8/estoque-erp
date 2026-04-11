export type Role = "ADMIN" | "GESTOR" | "TECNICO";

export type StockMovementType = "ENTRY" | "EXIT" | "TRANSFER";

export type StockMovementStatus = "PENDING" | "APPROVED" | "COMPLETED" | "REJECTED" | "CANCELED" | "REVERSED";

export type ReportFormat = "excel" | "pdf";

export interface AllowedBaseSummary {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  profilePhotoDataUrl: string | null;
  companyLogoDataUrl: string | null;
  role: Role;
  companyId: string;
  isFirstLogin: boolean;
  allowedBases: AllowedBaseSummary[];
}

export interface ManagedUser extends AuthUser {
  createdAt: string;
  updatedAt: string;
}

export interface CompanyEntity {
  id: string;
  name: string;
  logoDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface ListUsersResponse {
  users: ManagedUser[];
}

export interface UserResponse {
  user: ManagedUser;
}

export interface DeleteUserResponse {
  message: string;
}

export interface BaseEntity {
  id: string;
  name: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryEntity {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  productsCount: number;
  allowedBases: AllowedBaseSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductEntity {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  minimumStock: number;
  companyId: string;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
  } | null;
  allowedBases: AllowedBaseSummary[];
  stocksCount: number;
  stockQuantity: number;
  stockByBase: Array<{
    baseId: string;
    quantity: number;
  }>;
  movementItemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListBasesResponse {
  bases: BaseEntity[];
}

export interface BaseResponse {
  base: BaseEntity;
}

export interface DeleteBaseResponse {
  message: string;
}

export interface ListCategoriesResponse {
  categories: CategoryEntity[];
}

export interface CategoryResponse {
  category: CategoryEntity;
}

export interface DeleteCategoryResponse {
  message: string;
}

export interface ListProductsResponse {
  products: ProductEntity[];
}

export interface ProductResponse {
  product: ProductEntity;
}

export interface DeleteProductResponse {
  message: string;
}

export interface ProfileResponse {
  user: ManagedUser;
}

export interface CompanyResponse {
  company: CompanyEntity;
}

export interface ChangePasswordResponse {
  message: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowedBaseIds?: string[];
}

export interface CreateBasePayload {
  name: string;
}

export interface UpdateBasePayload {
  name?: string;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
  allowedBaseIds: string[];
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string | null;
  allowedBaseIds?: string[];
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  minimumStock?: number;
  categoryId?: string;
  allowedBaseIds: string[];
}

export interface UpdateProductPayload {
  name?: string;
  description?: string | null;
  minimumStock?: number;
  categoryId?: string | null;
  allowedBaseIds?: string[];
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: Role;
  allowedBaseIds?: string[];
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  profilePhotoDataUrl?: string | null;
}

export interface UpdateCompanyPayload {
  name?: string;
  logoDataUrl?: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface MovementItemInput {
  productId: string;
  quantity: number;
}

export interface CreateStockMovementPayload {
  type: StockMovementType;
  sourceBaseId?: string;
  destinationBaseId?: string;
  reason?: string;
  items: MovementItemInput[];
}

export interface StockMovementOperationResponse {
  movement: {
    id: string;
    type: StockMovementType;
    status: StockMovementStatus;
    reason?: string | null;
    rejectionReason?: string | null;
    cancellationReason?: string | null;
    reversalReason?: string | null;
    sourceBaseId?: string | null;
    destinationBaseId?: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

export interface StockMovementDetail {
  id: string;
  type: StockMovementType;
  status: StockMovementStatus;
  reason: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  reversalReason: string | null;
  sourceBase: AllowedBaseSummary | null;
  destinationBase: AllowedBaseSummary | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  approvedBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
  }>;
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  originalMovementId: string | null;
  reversalMovementId: string | null;
  permissions: {
    canApprove: boolean;
    canReject: boolean;
    canConfirmTransfer: boolean;
    canCancel: boolean;
    canReverse: boolean;
  };
}

export interface StockMovementDetailResponse {
  movement: StockMovementDetail;
}

export interface StockByBaseResponse {
  productId: string;
  baseId: string;
  quantity: number;
}

export interface StockReportRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  baseId: string;
  base: string;
  quantity: number;
  updatedAt: string;
}

export interface StockReportResponse {
  filters: {
    baseId?: string;
    categoryId?: string;
    productId?: string;
    search?: string;
  };
  summary: {
    rows: number;
    totalQuantity: number;
  };
  rows: StockReportRow[];
}

export interface MovementReportRow {
  id: string;
  type: StockMovementType;
  status: StockMovementStatus;
  sourceBase: string;
  destinationBase: string;
  createdBy: string;
  approvedBy: string;
  itemsCount: number;
  totalQuantity: number;
  items: string;
  reason: string;
  rejectionReason: string;
  statusNote?: string;
  createdAt: string;
  approvedAt: string;
  completedAt: string;
}

export interface MovementReportResponse {
  filters: {
    baseId?: string;
    type?: StockMovementType;
    status?: StockMovementStatus;
    sourceBaseId?: string;
    destinationBaseId?: string;
    productId?: string;
    createdById?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  summary: {
    rows: number;
    totalQuantity: number;
  };
  rows: MovementReportRow[];
}

export interface TransferReportResponse {
  filters: {
    baseId?: string;
    status?: StockMovementStatus;
    sourceBaseId?: string;
    destinationBaseId?: string;
    productId?: string;
    createdById?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  summary: {
    rows: number;
    totalQuantity: number;
  };
  rows: MovementReportRow[];
}

export interface ExportedFile {
  fileName: string;
  blob: Blob;
}

export interface StockReportFilters {
  baseId?: string;
  categoryId?: string;
  productId?: string;
  search?: string;
}

export interface MovementReportFilters {
  baseId?: string;
  type?: StockMovementType;
  status?: StockMovementStatus;
  sourceBaseId?: string;
  destinationBaseId?: string;
  productId?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TransferReportFilters {
  baseId?: string;
  status?: StockMovementStatus;
  sourceBaseId?: string;
  destinationBaseId?: string;
  productId?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ApiErrorPayload {
  message?: string;
  issues?: Array<{ path: string; message: string }>;
}
