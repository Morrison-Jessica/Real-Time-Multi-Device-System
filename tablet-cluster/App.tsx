import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  StateSnapshot,
} from '../shared-types';

// Set this to http://<computer-LAN-IP>:3000 in the Expo terminal environment.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const STALE_AFTER_MS = 1000;
type DashboardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function gaugePoint(fraction: number, radius: number) {
  return {
    x: 150 - Math.cos(fraction * Math.PI) * radius,
    y: 140 - Math.sin(fraction * Math.PI) * radius,
  };
}

interface GaugeProps {
  title: string;
  value: number | null;
  maximum: number;
  unit: string;
  displayDivisor?: number;
  redline?: number;
}

function Gauge({ title, value, maximum, unit, displayDivisor = 1, redline }: GaugeProps) {
  const fraction = Math.max(0, Math.min(1, (value ?? 0) / maximum));
  const needle = gaugePoint(fraction, 85);
  const redlineStart = redline === undefined ? null : gaugePoint(redline / maximum, 105);

  return (
    <View style={styles.gaugeCard}>
      <Text style={styles.gaugeTitle}>{title}</Text>
      <View style={styles.gaugeDrawing}>
        <Svg width="100%" height="100%" viewBox="0 0 300 190">
          <Path d="M 45 140 A 105 105 0 0 1 255 140" fill="none" stroke="#cbd5e1" strokeWidth={8} />
          {redlineStart && (
            <Path
              d={`M ${redlineStart.x} ${redlineStart.y} A 105 105 0 0 1 255 140`}
              fill="none"
              stroke="#dc2626"
              strokeWidth={8}
            />
          )}
          {Array.from({ length: 7 }, (_, index) => {
            const tickFraction = index / 6;
            const inner = gaugePoint(tickFraction, 95);
            const outer = gaugePoint(tickFraction, 110);
            const label = gaugePoint(tickFraction, 127);
            return (
              <G key={index}>
                <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#334155" strokeWidth={2} />
                <SvgText x={label.x} y={label.y + 5} fontSize={14} textAnchor="middle" fill="#0f172a">
                  {Math.round((tickFraction * maximum) / displayDivisor)}
                </SvgText>
              </G>
            );
          })}
          <Line x1={150} y1={140} x2={needle.x} y2={needle.y} stroke="#2563eb" strokeWidth={4} />
          <Circle cx={150} cy={140} r={6} fill="#2563eb" />
          <SvgText x={150} y={178} fontSize={22} textAnchor="middle" fill="#0f172a">
            {value === null ? '—' : (value / displayDivisor).toFixed(1)} {unit}
          </SvgText>
        </Svg>
      </View>
    </View>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(
    SERVER_URL ? 'Connecting…' : 'Set EXPO_PUBLIC_SERVER_URL to your server address',
  );
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!SERVER_URL) return;

    const socket: DashboardSocket = io(SERVER_URL);
    socket.on('connect', () => {
      setConnected(true);
      setStatus('Connected');
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setStatus('Disconnected');
    });
    socket.on('connect_error', (error) => {
      setConnected(false);
      setStatus(`Connection error: ${error.message}`);
    });
    socket.on('state:update', (next) => {
      const receiptTime = Date.now();
      setSnapshot(next);
      setReceivedAt(receiptTime);
      setNow(receiptTime);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const age = receivedAt === null ? null : Math.max(0, now - receivedAt);
  const freshness = age === null ? 'Waiting for state' : connected && age <= STALE_AFTER_MS ? 'Live' : 'Stale';
  const controls = snapshot?.vehicle.controls;
  // Tablet-only display derivation: this is not authoritative vehicle RPM.
  const displayRpm = controls ? controls.throttle * 6000 : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tablet dashboard</Text>
      <Text accessibilityLiveRegion="polite">Connection: {status}</Text>
      <Text>State: {freshness}{age === null ? '' : ` · received ${(age / 1000).toFixed(1)} s ago`}</Text>
      <View style={styles.gauges}>
        <Gauge title="Speed" value={snapshot?.vehicle.speed ?? null} maximum={60} unit="m/s" />
        {/* Preserve the lesson's thousands-based display with the RPM unit label for Module 2.5. */}
        <Gauge title="RPM (derived)" value={displayRpm} maximum={6000} redline={5000} displayDivisor={1000} unit="RPM" />
      </View>
      <Text>RPM display derived locally from throttle.</Text>
      <View style={styles.indicators}>
        <Text>Throttle: {controls ? `${(controls.throttle * 100).toFixed(0)}%` : '—'}</Text>
        <Text>Brake: {controls ? `${(controls.brake * 100).toFixed(0)}%` : '—'}</Text>
        <Text>Steering: {controls ? controls.steering.toFixed(2) : '—'}</Text>
      </View>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '600' },
  gauges: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  gaugeCard: { flex: 1, minWidth: 240, padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8 },
  gaugeTitle: { fontSize: 18, textAlign: 'center' },
  gaugeDrawing: { width: '100%', maxWidth: 420, aspectRatio: 300 / 190, alignSelf: 'center' },
  indicators: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 8 },
});
