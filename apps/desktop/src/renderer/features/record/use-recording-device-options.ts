import { useCallback, useEffect, useState } from 'react';
import type { SystemAudioSourceOption } from '../../env.js';

export interface DeviceOption {
  id: string;
  label: string;
}

interface RecordingDeviceOptionsResult {
  micOptions: DeviceOption[];
  cameraOptions: DeviceOption[];
  systemAudioOptions: SystemAudioSourceOption[];
  refresh: () => Promise<void>;
}

function labelForDevice(device: MediaDeviceInfo, index: number): string {
  if (device.label) return device.label;
  if (device.kind === 'audioinput') return `Microphone ${index + 1}`;
  if (device.kind === 'videoinput') return `Camera ${index + 1}`;
  return `Device ${index + 1}`;
}

export function getSelectedOptionLabel(
  options: Array<{ id: string; label: string }>,
  selectedId: string | null,
  fallback = 'Default',
): string {
  if (!selectedId) return fallback;
  return options.find((option) => option.id === selectedId)?.label ?? fallback;
}

export function useRecordingDeviceOptions(): RecordingDeviceOptionsResult {
  const [micOptions, setMicOptions] = useState<DeviceOption[]>([]);
  const [cameraOptions, setCameraOptions] = useState<DeviceOption[]>([]);
  const [systemAudioOptions, setSystemAudioOptions] = useState<SystemAudioSourceOption[]>([]);

  const refresh = useCallback(async () => {
    const [devices, nextSystemAudioOptions] = await Promise.all([
      navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]),
      window.roughcut.recordingGetSystemAudioSources().catch(() => []),
    ]);

    const nextMicOptions = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({ id: device.deviceId, label: labelForDevice(device, index) }));
    const nextCameraOptions = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({ id: device.deviceId, label: labelForDevice(device, index) }));

    setMicOptions(Array.isArray(nextMicOptions) ? nextMicOptions : []);
    setCameraOptions(Array.isArray(nextCameraOptions) ? nextCameraOptions : []);
    setSystemAudioOptions(Array.isArray(nextSystemAudioOptions) ? nextSystemAudioOptions : []);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        await refresh();
      } catch (error) {
        if (active) {
          console.warn('[recording-device-options] Failed to load devices:', error);
          setMicOptions([]);
          setCameraOptions([]);
          setSystemAudioOptions([]);
        }
      }
    };

    void load();

    const handleDeviceChange = () => {
      void load();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refresh]);

  return { micOptions, cameraOptions, systemAudioOptions, refresh };
}
