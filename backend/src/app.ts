import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middlewares/error-handler.middleware";
import { routes } from "./routes";

const app = express();

app.use(helmet());
app.use(cors());
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
