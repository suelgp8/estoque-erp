import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

export function rbacMiddleware(roles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.authUser) {
      return next(new AppError("Unauthorized", 401));
    }

    if (!roles.includes(request.authUser.role)) {
      return next(new AppError("Forbidden", 403));
    }

    return next();
  };
}
