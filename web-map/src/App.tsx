import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as mapboxgl from 'mapbox-gl/esm'
import 'mapbox-gl/dist/mapbox-gl.css'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ControlState,
  ServerToClientEvents,
  StateSnapshot,
} from '../../shared-types'
import './App.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()
const DISPLAY_CENTER: [number, number] = [-104.9903, 39.7392]
const EARTH_RADIUS_METERS = 6378137
const STALE_AFTER_MS = 1000
type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Visualization only: x/y remain authoritative local meter coordinates.
function displayPosition(x: number, y: number): [number, number] {
  const [longitude, latitude] = DISPLAY_CENTER
  const degreesPerRadian = 180 / Math.PI
  return [
    longitude + (x / (EARTH_RADIUS_METERS * Math.cos(latitude / degreesPerRadian))) * degreesPerRadian,
    latitude + (y / EARTH_RADIUS_METERS) * degreesPerRadian,
  ]
}

function App() {
  const socketRef = useRef<AdminSocket | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('Connecting…')
  const [mapStatus, setMapStatus] = useState(
    MAPBOX_TOKEN ? 'Loading map…' : 'Set VITE_MAPBOX_ACCESS_TOKEN in web-map/.env to load the map.',
  )
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [receivedAt, setReceivedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [draft, setDraft] = useState<ControlState>({ throttle: 0, brake: 0, steering: 0 })
  const [controlFeedback, setControlFeedback] = useState('')

  useEffect(() => {
    // The Vite proxy forwards polling and WebSocket requests to the server.
    const socket: AdminSocket = io()
    socketRef.current = socket
    socket.on('connect', () => {
      setConnected(true)
      setConnectionStatus('Connected')
    })
    socket.on('disconnect', () => {
      setConnected(false)
      setConnectionStatus('Disconnected')
    })
    socket.on('connect_error', (error) => {
      setConnected(false)
      setConnectionStatus(`Connection error: ${error.message}`)
    })
    socket.on('state:update', (next) => {
      const receiptTime = Date.now()
      setSnapshot(next)
      setReceivedAt(receiptTime)
      setNow(receiptTime)
    })

    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => {
      window.clearInterval(timer)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) return

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        accessToken: MAPBOX_TOKEN,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: DISPLAY_CENTER,
        zoom: 15,
      })
    } catch (error) {
      setMapStatus(`Map unavailable: ${error instanceof Error ? error.message : 'Unable to initialize map'}`)
      return
    }

    mapRef.current = map
    map.on('load', () => setMapStatus('Map ready'))
    map.on('error', (event) => setMapStatus(`Map error: ${event.error.message}`))
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(mapContainerRef.current)

    return () => {
      observer.disconnect()
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !snapshot) return
    const position = displayPosition(snapshot.vehicle.x, snapshot.vehicle.y)
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#2563eb' }).setLngLat(position).addTo(map)
    } else {
      markerRef.current.setLngLat(position)
    }
  }, [snapshot])

  function sendControls(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const valid = Object.values(draft).every(Number.isFinite)
      && draft.throttle >= 0 && draft.throttle <= 1
      && draft.brake >= 0 && draft.brake <= 1
      && draft.steering >= -1 && draft.steering <= 1
    if (!valid) {
      setControlFeedback('Enter throttle/brake from 0 to 1 and steering from -1 to 1.')
      return
    }
    if (!socketRef.current?.connected) {
      setControlFeedback('Connect to the server before sending controls.')
      return
    }
    socketRef.current.emit('control:update', { ...draft })
    setControlFeedback('Controls sent. Received state below shows the server values.')
  }

  const age = receivedAt === null ? null : Math.max(0, now - receivedAt)
  const freshness = age === null ? 'Waiting for state' : connected && age <= STALE_AFTER_MS ? 'Live' : 'Stale'
  const vehicle = snapshot?.vehicle

  return (
    <main className="admin-page">
      <header>
        <h1>Vehicle administration</h1>
        <p role="status">Connection: {connectionStatus}</p>
        <p>State: {freshness}{age === null ? '' : ` · received ${(age / 1000).toFixed(1)} s ago`}</p>
      </header>

      <div className="dashboard">
        <section className="panel map-panel" aria-labelledby="map-heading">
          <h2 id="map-heading">Vehicle map</h2>
          <p role="status">{mapStatus}</p>
          <div ref={mapContainerRef} className="map-container" aria-label="Map showing one vehicle marker" />
          <p className="note">Map position visualizes local meter offsets from a fixed display center; it is not authoritative geographic state.</p>
        </section>

        <div className="details">
          <section className="panel" aria-labelledby="state-heading">
            <h2 id="state-heading">Received vehicle state</h2>
            <dl className="state-values">
              <dt>X (m)</dt><dd>{vehicle ? vehicle.x.toFixed(2) : '—'}</dd>
              <dt>Y (m)</dt><dd>{vehicle ? vehicle.y.toFixed(2) : '—'}</dd>
              <dt>Heading (rad)</dt><dd>{vehicle ? vehicle.heading.toFixed(2) : '—'}</dd>
              <dt>Speed (m/s)</dt><dd>{vehicle ? vehicle.speed.toFixed(2) : '—'}</dd>
              <dt>Throttle</dt><dd>{vehicle ? vehicle.controls.throttle.toFixed(2) : '—'}</dd>
              <dt>Brake</dt><dd>{vehicle ? vehicle.controls.brake.toFixed(2) : '—'}</dd>
              <dt>Steering</dt><dd>{vehicle ? vehicle.controls.steering.toFixed(2) : '—'}</dd>
              <dt>Server time (Unix ms)</dt><dd>{snapshot ? snapshot.serverTimestamp : '—'}</dd>
            </dl>
          </section>

          <section className="panel" aria-labelledby="controls-heading">
            <h2 id="controls-heading">Send controls</h2>
            <form onSubmit={sendControls}>
              <fieldset disabled={!connected}>
                <legend>Complete control input</legend>
                {(['throttle', 'brake', 'steering'] as const).map((control) => (
                  <label key={control} htmlFor={control}>
                    {control === 'steering' ? 'Steering (-1–1)' : `${control === 'throttle' ? 'Throttle' : 'Brake'} (0–1)`}
                    <input
                      id={control}
                      type="number"
                      min={control === 'steering' ? -1 : 0}
                      max={1}
                      step="0.01"
                      required
                      value={Number.isNaN(draft[control]) ? '' : draft[control]}
                      onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber
                        setDraft((current) => ({ ...current, [control]: value }))
                        setControlFeedback('')
                      }}
                    />
                  </label>
                ))}
                <button type="submit">Send controls</button>
              </fieldset>
              <p role="status">{controlFeedback}</p>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}

export default App
