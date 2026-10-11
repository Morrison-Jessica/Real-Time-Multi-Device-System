import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ControlState,
  ServerToClientEvents,
} from '../shared-types';

// Set this to http://<computer-LAN-IP>:3000 in the Expo terminal environment.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;
type ControllerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function App() {
  const socketRef = useRef<ControllerSocket | null>(null);
  const controlsRef = useRef<ControlState>({ throttle: 0, brake: 0, steering: 0 });
  const trackWidthRef = useRef(0);
  const dragStartRef = useRef(0);
  const [controls, setControls] = useState<ControlState>(controlsRef.current);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(
    SERVER_URL ? 'Connecting…' : 'Set EXPO_PUBLIC_SERVER_URL to your server address',
  );

  useEffect(() => {
    if (!SERVER_URL) return;

    const socket: ControllerSocket = io(SERVER_URL);
    socketRef.current = socket;
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

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const updateControl = useCallback((control: keyof ControlState, value: number) => {
    const next = { ...controlsRef.current, [control]: value };
    controlsRef.current = next;
    setControls(next);
    if (socketRef.current?.connected) {
      socketRef.current.emit('control:update', next);
    }
  }, []);

  const updateSteering = useCallback((position: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    updateControl('steering', Math.max(-1, Math.min(1, (position / width) * 2 - 1)));
  }, [updateControl]);

  const steeringResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => socketRef.current?.connected === true,
    onMoveShouldSetPanResponder: () => socketRef.current?.connected === true,
    onPanResponderGrant: (event) => {
      dragStartRef.current = event.nativeEvent.locationX;
      updateSteering(dragStartRef.current);
    },
    onPanResponderMove: (_event, gesture) => {
      updateSteering(dragStartRef.current + gesture.dx);
    },
    onPanResponderRelease: () => updateControl('steering', 0),
    onPanResponderTerminate: () => updateControl('steering', 0),
  }), [updateControl, updateSteering]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phone controller</Text>
      <Text accessibilityLiveRegion="polite">{status}</Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          disabled={!connected}
          onPressIn={() => updateControl('brake', 1)}
          onPressOut={() => updateControl('brake', 0)}
          style={({ pressed }) => [styles.pedal, pressed && styles.active, !connected && styles.disabled]}
        >
          <Text>Brake</Text>
          <Text>{controls.brake}</Text>
        </Pressable>
        <View style={styles.steering}>
          <Text>Steering: {controls.steering.toFixed(2)}</Text>
          <View
            {...steeringResponder.panHandlers}
            onLayout={(event) => { trackWidthRef.current = event.nativeEvent.layout.width; }}
            style={[styles.track, !connected && styles.disabled]}
          >
            <View pointerEvents="none" style={styles.centerMark} />
            <View
              pointerEvents="none"
              style={[styles.thumb, { left: `${((controls.steering + 1) / 2) * 100}%` }]}
            />
          </View>
          <Text>Drag left or right. Release to center.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!connected}
          onPressIn={() => updateControl('throttle', 1)}
          onPressOut={() => updateControl('throttle', 0)}
          style={({ pressed }) => [styles.pedal, pressed && styles.active, !connected && styles.disabled]}
        >
          <Text>Throttle</Text>
          <Text>{controls.throttle}</Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  controls: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 24 },
  pedal: {
    width: 100,
    height: 100,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  active: { backgroundColor: '#93c5fd' },
  disabled: { opacity: 0.4 },
  steering: { flex: 1, alignItems: 'center', gap: 12 },
  track: {
    width: '100%',
    height: 72,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
  centerMark: { position: 'absolute', left: '50%', top: 8, bottom: 8, width: 1, backgroundColor: '#9ca3af' },
  thumb: { position: 'absolute', top: 16, width: 16, height: 40, marginLeft: -8, backgroundColor: '#2563eb', borderRadius: 4 },
});
