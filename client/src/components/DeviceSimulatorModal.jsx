import React, { useState, useEffect } from 'react';
import { X, Cpu, CheckCircle2, AlertTriangle, Fingerprint, ScanFace } from 'lucide-react';
import useEscapeClose from '../hooks/useEscapeClose';

export default function DeviceSimulatorModal({ isOpen, onClose }) {
  useEscapeClose(isOpen, onClose);
  const [employeeId, setEmployeeId] = useState('emp_01'); // Default: Sneha Goswami
  const [deviceId, setDeviceId] = useState('dev_01');
  const [punchType, setPunchType] = useState('IN');
  const [verificationMode, setVerificationMode] = useState('FACE');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/v1/biometrics/devices')
        .then(r => r.json())
        .then(d => { if (d.success) setDevices(d.devices); });

      fetch('/api/v1/organization/employees')
        .then(r => r.json())
        .then(d => { if (d.success) setEmployees(d.employees); });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/v1/biometrics/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          deviceId,
          punchType,
          verificationMode
        })
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Simulation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '1rem'
    }}>
      <div className="swaniki-card" style={{
        width: '100%',
        maxWidth: '34rem',
        padding: '1.75rem',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.75rem',
              background: 'var(--brand-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <Cpu size={20} color="var(--brand-primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                Biometric Hardware Simulator
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <em>Test eSSL / ZKTeco machine scans for Anubhav Infotech &amp; hospital staff</em>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-caption)',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Select Employee */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
              Select Staff Member:
            </label>
            <select
              className="input-field"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              {employees.length > 0 ? (
                employees.map(e => (
                  <option key={e.id} value={e.id} style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>
                    {e.full_name?.includes('Sneha') ? '🌟 ' : ''}{e.full_name} ({e.employee_code}) - {e.designation}
                  </option>
                ))
              ) : (
                <option value="emp_01" style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>🌟 Sneha Goswami (DNH-101) - Senior ICU Nurse</option>
              )}
            </select>
          </div>

          {/* Device & Mode */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                Biometric Machine Model:
              </label>
              <select
                className="input-field"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id} style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>
                    {d.device_name} ({d.model.split('(')[0]})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                Punch Direction:
              </label>
              <select
                className="input-field"
                value={punchType}
                onChange={(e) => setPunchType(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                <option value="IN" style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>PUNCH IN (Check-In)</option>
                <option value="OUT" style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>PUNCH OUT (Check-Out)</option>
              </select>
            </div>
          </div>

          {/* Verification Technology */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
              Biometric Sensor Mode:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setVerificationMode('FACE')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem',
                  borderRadius: '0.75rem',
                  background: verificationMode === 'FACE' ? 'var(--brand-primary-light)' : 'var(--bg-surface-subtle)',
                  border: verificationMode === 'FACE' ? '1px solid var(--brand-primary)' : '1px solid var(--border-color)',
                  color: verificationMode === 'FACE' ? 'var(--brand-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.8125rem'
                }}
              >
                <ScanFace size={16} />
                <span>Facial Recognition</span>
              </button>

              <button
                type="button"
                onClick={() => setVerificationMode('FINGERPRINT')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem',
                  borderRadius: '0.75rem',
                  background: verificationMode === 'FINGERPRINT' ? 'var(--brand-primary-light)' : 'var(--bg-surface-subtle)',
                  border: verificationMode === 'FINGERPRINT' ? '1px solid var(--brand-primary)' : '1px solid var(--border-color)',
                  color: verificationMode === 'FINGERPRINT' ? 'var(--brand-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.8125rem'
                }}
              >
                <Fingerprint size={16} />
                <span>Fingerprint Scan</span>
              </button>
            </div>
          </div>

          {/* Trigger Button */}
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="btn-swaniki btn-swaniki-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Simulating Hardware Ingestion...' : '⚡ Trigger Biometric Hardware Scan'}
          </button>

          {/* Result Box */}
          {result && (
            <div style={{
              padding: '0.875rem 1rem',
              borderRadius: '0.75rem',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}>
              <CheckCircle2 size={20} color="#10b981" style={{ marginTop: '0.125rem', flexShrink: 0 }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                <strong style={{ color: '#10b981' }}>Punch Ingested Successfully!</strong>
                <p>Staff: <strong>{result.employee?.name}</strong> ({result.employee?.code})</p>
                <p>Duty Date: {result.dutyDate} • Status: <strong style={{ color: 'var(--text-heading)' }}>{result.dayStatus}</strong></p>
                <p style={{ color: 'var(--text-muted)' }}>
                  Rule Applied: ≥ 7.45h (Full Day) | 3.45-7.44h (Half Day) | &lt; 3.45h (Absent)
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '0.875rem 1rem',
              borderRadius: '0.75rem',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: '#ef4444'
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
