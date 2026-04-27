/**
 * stdio transport adapter.
 *
 * Spawns a child process and exchanges line-delimited JSON-RPC over
 * stdin/stdout, per MCP spec.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { StdioTarget } from "../types.js";
import type {
  JsonRpcResponse,
  TargetAdapter,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class StdioTargetAdapter implements TargetAdapter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly target: StdioTarget;
  private buffer = "";
  private readonly pending = new Map<
    string | number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private readonly unmatchedQueue: JsonRpcResponse[] = [];
  private readonly stderrChunks: string[] = [];
  private closed = false;
  private nextId = 1;

  constructor(target: StdioTarget) {
    this.target = target;
  }

  async open(): Promise<void> {
    if (this.child) return;
    this.child = spawn(this.target.cmd, this.target.args ?? [], {
      cwd: this.target.cwd,
      env: { ...process.env, ...(this.target.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrChunks.push(chunk);
    });
    this.child.on("error", (err) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(err);
      }
      this.pending.clear();
    });
    this.child.on("exit", () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("Target stdio process exited before responding"));
      }
      this.pending.clear();
    });

    // give the child a tick to come alive
    await delay(20);
    if (this.closed) {
      throw new Error(
        `Target stdio process exited immediately: ${this.stderrChunks.join("")}`,
      );
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line) as JsonRpcResponse;
    } catch {
      // Non-JSON output on stdout is a conformance violation but we tolerate
      // it by surfacing later via stderr capture.
      return;
    }
    const id = "id" in parsed ? parsed.id : null;
    if (id != null && this.pending.has(id)) {
      const handler = this.pending.get(id)!;
      clearTimeout(handler.timer);
      this.pending.delete(id);
      handler.resolve(parsed);
      return;
    }
    // notification or unmatched response — keep for readNext()
    this.unmatchedQueue.push(parsed);
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<JsonRpcResponse<T>> {
    if (!this.child) throw new Error("Adapter not opened");
    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `JSON-RPC timeout after ${options?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms for method ${method}`,
          ),
        );
      }, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: resolve as (r: JsonRpcResponse) => void,
        reject,
        timer,
      });
      this.child!.stdin.write(payload + "\n", (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.child) throw new Error("Adapter not opened");
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin.write(payload + "\n", (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async sendRaw(payload: string): Promise<void> {
    if (!this.child) throw new Error("Adapter not opened");
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin.write(payload + "\n", (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async readNext(
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<JsonRpcResponse | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const next = this.unmatchedQueue.shift();
      if (next) return next;
      await delay(20);
    }
    return null;
  }

  async close(): Promise<void> {
    if (!this.child || this.closed) return;
    this.closed = true;
    try {
      this.child.stdin.end();
    } catch {
      // ignore
    }
    this.child.kill("SIGTERM");
    // M3 fix Round 3: poll for graceful exit up to 2s with 50ms cadence
    // before SIGKILL. The fixed 100ms delay was a flake source under CI
    // load and forced SIGKILL on well-behaved servers that need slightly
    // more time to flush stdio buffers and tear down DB connections.
    const SHUTDOWN_TIMEOUT_MS = 2000;
    const POLL_INTERVAL_MS = 50;
    const start = Date.now();
    while (Date.now() - start < SHUTDOWN_TIMEOUT_MS) {
      if (this.child.exitCode !== null || this.child.killed) {
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill("SIGKILL");
    }
  }

  getStderr(): string {
    return this.stderrChunks.join("");
  }
}
