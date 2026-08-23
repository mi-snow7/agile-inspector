import express from "express";
import cors from "cors";
import { boardRouter } from "./routes/board.js";
import { issuesRouter } from "./routes/issues.js";
import { storiesRouter } from "./routes/stories.js";
import { retroRouter } from "./routes/retro.js";
import { tasksRouter } from "./routes/tasks.js";
import { PROJECT_ROOT } from "./projectRoot.js";

const PORT = process.env.BOARD_UI_PORT ? Number(process.env.BOARD_UI_PORT) : 4174;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", boardRouter);
app.use("/api", issuesRouter);
app.use("/api", storiesRouter);
app.use("/api", retroRouter);
app.use("/api", tasksRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.code === "not_found" ? 404 : 500).json({ error: "gh_error", message: err.message });
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`board-ui server listening on http://127.0.0.1:${PORT} (project: ${PROJECT_ROOT})`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `board-ui: port ${PORT} is already in use (probably another board-ui server, or something else). ` +
        `Set BOARD_UI_PORT to a different port and try again.`,
    );
    process.exit(1);
  }
  throw err;
});
