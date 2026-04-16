interface DeviceOption {
  id: string;
  label: string;
}

interface RecordDeviceSelectorsProps {
  micOptions: DeviceOption[];
  selectedMicDeviceId: string | null;
  onSelectMicDevice: (id: string | null) => void;
  cameraOptions: DeviceOption[];
  selectedCameraDeviceId: string | null;
  onSelectCameraDevice: (id: string | null) => void;
  systemAudioOptions: DeviceOption[];
  selectedSystemAudioSourceId: string | null;
  onSelectSystemAudioSource: (id: string | null) => void;
}

function Selector({
  testId,
  label,
  value,
  options,
  defaultLabel,
  onChange,
}: {
  testId: string;
  label: string;
  value: string | null;
  options: DeviceOption[];
  defaultLabel: string;
  onChange: (id: string | null) => void;
}) {
  const hasSelectedOption = value ? options.some((option) => option.id === value) : false;

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 180,
        flex: 1,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        {label}
      </span>
      <select
        data-testid={testId}
        value={hasSelectedOption ? (value ?? '') : ''}
        onChange={(event) => onChange(event.target.value || null)}
        style={{
          height: 32,
          background: 'rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '0 10px',
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      >
        <option value="">{defaultLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RecordDeviceSelectors({
  micOptions,
  selectedMicDeviceId,
  onSelectMicDevice,
  cameraOptions,
  selectedCameraDeviceId,
  onSelectCameraDevice,
  systemAudioOptions,
  selectedSystemAudioSourceId,
  onSelectSystemAudioSource,
}: RecordDeviceSelectorsProps) {
  return (
    <div
      data-testid="record-device-selectors"
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        padding: '12px 24px 14px',
        background: '#0e0e0e',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <Selector
        testId="record-mic-select"
        label="Microphone"
        value={selectedMicDeviceId}
        options={micOptions}
        defaultLabel="Default microphone"
        onChange={onSelectMicDevice}
      />
      <Selector
        testId="record-camera-select"
        label="Camera"
        value={selectedCameraDeviceId}
        options={cameraOptions}
        defaultLabel="Default camera"
        onChange={onSelectCameraDevice}
      />
      <Selector
        testId="record-system-audio-select"
        label="System Audio"
        value={selectedSystemAudioSourceId}
        options={systemAudioOptions}
        defaultLabel="Default system audio"
        onChange={onSelectSystemAudioSource}
      />
    </div>
  );
}
