export interface ControlState {
  /** Normalized accelerator input: 0 to 1. */
  throttle: number;
  /** Normalized brake input: 0 to 1. */
  brake: number;
  /** Normalized steering input: -1 (left) to 1 (right). */
  steering: number;
}

export interface VehicleState {
  /** Position in meters. */
  x: number;
  y: number;
  /** Heading in radians; zero points along positive x. */
  heading: number;
  /** Speed in meters per second. */
  speed: number;
  controls: ControlState;
}

export interface StateSnapshot {
  vehicle: VehicleState;
  /** Server time in milliseconds since the Unix epoch. */
  serverTimestamp: number;
}

export interface ClientToServerEvents {
  "control:update": (controls: ControlState) => void;
}

export interface ServerToClientEvents {
  "state:update": (snapshot: StateSnapshot) => void;
}
