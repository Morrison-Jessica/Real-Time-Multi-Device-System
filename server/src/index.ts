import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ControlState,
  ServerToClientEvents,
  StateSnapshot,
  VehicleState,
} from "../../shared-types/index.js";

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
const testClientPath = fileURLToPath(
  new URL("../public/test-client.html", import.meta.url),
);

const vehicle: VehicleState = {
  x: 0,
  y: 0,
  heading: 0,
  speed: 0,
  controls: { throttle: 0, brake: 0, steering: 0 },
};

function isInRange(value: unknown, minimum: number, maximum: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isControlState(payload: unknown): payload is ControlState {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }

  const controls = payload as Record<string, unknown>;
  return (
    isInRange(controls.throttle, 0, 1) &&
    isInRange(controls.brake, 0, 1) &&
    isInRange(controls.steering, -1, 1)
  );
}

function snapshot(): StateSnapshot {
  return {
    vehicle: { ...vehicle, controls: { ...vehicle.controls } },
    serverTimestamp: Date.now(),
  };
}

app.get("/", (_request, response) => {
  response.sendFile(testClientPath);
});

io.on("connection", (socket) => {
  socket.emit("state:update", snapshot());

  socket.on("control:update", (payload: unknown) => {
    if (!isControlState(payload)) return;

    // Copy only validated controls; clients cannot replace vehicle state.
    vehicle.controls = {
      throttle: payload.throttle,
      brake: payload.brake,
      steering: payload.steering,
    };
  });
});

// This checkpoint broadcasts stationary vehicle state without a physics loop.
setInterval(() => {
  io.emit("state:update", snapshot());
}, 1000 / 10);

httpServer.listen(3000, () => {
  console.log("Server and browser test client: http://localhost:3000/");
});
