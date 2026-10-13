# Real-Time Multi-Device System

## Project overview

A real-time vehicle control and monitoring system. A phone sends controls, a tablet shows the dashboard, and a web app displays state and a map.

## Components

- **mobile-controls:** Phone app with throttle, brake, and touch steering in landscape.
- **tablet-cluster:** Tablet dashboard with speed, RPM, and control indicators.
- **web-map:** Web dashboard with a Mapbox vehicle marker and control inputs.
- **server:** Validates controls and broadcasts vehicle state.
- **shared-types:** TypeScript types for state and Socket.IO events.

## Tech stack

TypeScript, Node.js, Express, Socket.IO, React Native, Expo, React, Vite, Mapbox GL JS, and react-native-svg.

## Architecture

The server is the authoritative state source. Phone and web controls send control:update. The server broadcasts state:update to the tablet and web at 10 Hz.

The web map converts local x/y meter offsets into map coordinates around a fixed display center. The tablet derives RPM from throttle for visualization only.

## Setup

Use Node **22.18.0** and npm. Install dependencies from the repository root:
```css
npm install --prefix server
npm install --prefix mobile-controls
npm install --prefix tablet-cluster
npm install --prefix web-map
```

Create `web-map/.env` with your public Mapbox token:
```ini
VITE_MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
```

## Run

Run each command in a separate terminal from the repository root. Replace `192.168.1.10` with your computer’s local IP address.
```arduino
npm --prefix server run dev

EXPO_PUBLIC_SERVER_URL=http://192.168.1.10:3000 npm --prefix mobile-controls start -- --port 8081

EXPO_PUBLIC_SERVER_URL=http://192.168.1.10:3000 npm --prefix tablet-cluster start -- --port 8082

npm --prefix web-map run dev
```

Open the phone and tablet sessions in Expo Go or the simulator. Open the web address printed by Vite. Its development proxy connects to the server on port 3000.
