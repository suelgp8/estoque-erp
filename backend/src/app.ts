import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middlewares/error-handler.middleware";
import { routes } from "./routes";

const app = express();
const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  })
);
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200
  })
);

app.use(routes);
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export { app };
