interface DeviceOption {
  id: string;
  label: string;
}

interface RecordDeviceSelectorsProps {
  micOptions: DeviceOption[];
  selectedMicDeviceId: string | null;
  micIssue?: string | null;
  onSelectMicDevice: (id: string | null) => void;
  cameraOptions: DeviceOption[];
  selectedCameraDeviceId: string | null;
  cameraIssue?: string | null;
  onSelectCameraDevice: (id: string | null) => void;
  systemAudioOptions: DeviceOption[];
  selectedSystemAudioSourceId: string | null;
  systemAudioGainPercent: number;
  systemAudioIssue?: string | null;
  onSelectSystemAudioSource: (id: string | null) => void;
  onSystemAudioGainChange: (percent: number) => void;
}

function GainSlider({
  testId,
  value,
  accentColor,
  ariaLabel,
  onChange,
}: {
  testId: string;
  value: number;
  accentColor: string;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.48)',
          minWidth: 26,
        }}
      >
        VOL
      </span>
      <input
        data-testid={testId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ flex: 1, height: 4, accentColor, cursor: 'pointer' }}
      />
      <span
        style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.55)',
          minWidth: 28,
          textAlign: 'right',
        }}
      >
        {value}%
      </span>
    </label>
  );
}

function Selector({
  testId,
  label,
  value,
  issue,
  options,
  defaultLabel,
  onChange,
}: {
  testId: string;
  label: string;
  value: string | null;
  issue?: string | null;
  options: DeviceOption[];
  defaultLabel: string;
  onChange: (id: string | null) => void;
}) {
  const safeOptions = Array.isArray(options) ? options : [];
  const hasSelectedOption = value ? safeOptions.some((option) => option.id === value) : false;

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
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        <span>{label}</span>
        {issue && (
          <span
            data-testid={`${testId}-offline-badge`}
            title={issue}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.02em',
              textTransform: 'none',
              color: '#fcd34d',
              border: '1px solid rgba(245,158,11,0.28)',
              background: 'rgba(245,158,11,0.1)',
              borderRadius: 999,
              padding: '2px 6px',
            }}
          >
            Offline
          </span>
        )}
      </span>
      <select
        data-testid={testId}
        value={hasSelectedOption ? (value ?? '') : ''}
        onPointerDown={() => onChange(hasSelectedOption ? value : null)}
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
        {safeOptions.map((option) => (
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
  micIssue,
  onSelectMicDevice,
  cameraOptions,
  selectedCameraDeviceId,
  cameraIssue,
  onSelectCameraDevice,
  systemAudioOptions,
  selectedSystemAudioSourceId,
  systemAudioGainPercent,
  systemAudioIssue,
  onSelectSystemAudioSource,
  onSystemAudioGainChange,
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
        issue={micIssue}
        options={micOptions}
        defaultLabel="Default microphone"
        onChange={onSelectMicDevice}
      />
      <Selector
        testId="record-camera-select"
        label="Camera"
        value={selectedCameraDeviceId}
        issue={cameraIssue}
        options={cameraOptions}
        defaultLabel="Default camera"
        onChange={onSelectCameraDevice}
      />
      <div style={{ minWidth: 180, flex: 1 }}>
        <Selector
          testId="record-system-audio-select"
          label="System Audio"
          value={selectedSystemAudioSourceId}
          issue={systemAudioIssue}
          options={systemAudioOptions}
          defaultLabel="Default system audio"
          onChange={onSelectSystemAudioSource}
        />
        <GainSlider
          testId="record-system-audio-gain-slider"
          value={systemAudioGainPercent}
          accentColor="#60a5fa"
          ariaLabel="System audio volume"
          onChange={onSystemAudioGainChange}
        />
      </div>
    </div>
  );
}
