import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";

type TokenPayload = {
  sub: string;
  role: Role;
  email: string;
};

export function authenticationMiddleware(request: Request, _response: Response, next: NextFunction) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return next(new AppError("Unauthorized", 401));
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();

  try {
    const decodedToken = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

    if (!decodedToken.sub || !decodedToken.role || !decodedToken.email) {
      return next(new AppError("Unauthorized", 401));
    }

    request.authUser = {
      userId: decodedToken.sub,
      role: decodedToken.role,
      email: decodedToken.email
    };

    return next();
  } catch {
    return next(new AppError("Unauthorized", 401));
  }
}
