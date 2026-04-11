import { NextFunction, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";

export function notFoundMiddleware(_request: Request, response: Response) {
  response.status(404).json({ message: "Route not found" });
}

export function errorHandlerMiddleware(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      message: error.message
    });
  }

  if (error instanceof TRPCError) {
    const statusCode = error.code === "BAD_REQUEST" ? 400 : 500;

    return response.status(statusCode).json({
      message: error.message
    });
  }

  if (error instanceof ZodError) {
    return response.status(400).json({
      message: "Validation error",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  console.error(error);

  return response.status(500).json({
    message: "Internal server error"
  });
}
