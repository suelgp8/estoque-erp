import { Role } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: {
      userId: string;
      role: Role;
      email: string;
    };
  }
}
