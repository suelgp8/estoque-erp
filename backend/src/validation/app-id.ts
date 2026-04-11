import { z } from "zod";

const numericAppIdPattern = /^\d{1,12}$/;
const legacyCuidPattern = /^c[a-z0-9]{8,}$/;
const legacyUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const appIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(36)
  .refine((value) => numericAppIdPattern.test(value) || legacyCuidPattern.test(value) || legacyUuidPattern.test(value), {
    message: "ID invalido",
  });

export const appIdArraySchema = z.array(appIdSchema);

export const numericSkuSchema = z.string().regex(/^\d{8}$/, {
  message: "SKU invalido",
});
