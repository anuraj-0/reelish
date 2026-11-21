// Runs the web app and the worker together for local development. Ctrl-C stops both.
import { spawn } from "node:child_process";

const procs = [
  spawn("npm", ["run", "dev"], { stdio: "inherit" }),
  spawn("npm", ["run", "worker"], { stdio: "inherit" }),
];
let exiting = false;
const stopAll = (code = 0) => {
  if (exiting) return;
  exiting = true;
  for (const p of procs) if (p.exitCode === null) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
};
for (const p of procs) p.on("exit", (code) => stopAll(code ?? 0));
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
