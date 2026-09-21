import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Cpu, Terminal, Copy, Check, ShieldCheck, Wifi, RefreshCw, Settings2, Key, Server, Radio } from 'lucide-react';

export default function AnubhavPartnerHub({ onOpenSimulator }) {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState([]);
  const [supportedModels, setSupportedModels] = useState([]);
  const [copied, setCopied] = useState(false);
  const [updatingDevId, setUpdatingDevId] = useState(null);
  const [updateMessage, setUpdateMessage] = useState(null);

  const loadData = () => {
    fetch('/api/v1/biometrics/devices')
      .then(r => r.json())
      .then(d => { if (d.success) setDevices(d.devices); });

    fetch('/api/v1/organization/devices/models')
      .then(r => r.json())
      .then(d => { if (d.success) setSupportedModels(d.models); });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleModelChange = async (deviceId, newModel) => {
    setUpdatingDevId(deviceId);
    setUpdateMessage(null);
    try {
      const res = await fetch(`/api/v1/organization/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel })
      });
      const data = await res.json();
      if (data.success) {
        setUpdateMessage(`Device model updated to: ${newModel}`);
        loadData();
      } else {
        alert(data.error || 'Failed to update device model');
      }
    } catch (err) {
      alert(`Error updating device: ${err.message}`);
    } finally {
      setUpdatingDevId(null);
    }
  };

  const curlSnippet = `curl -X POST "http://localhost:4010/api/v1/biometrics/punch" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ANUBHAV_DNH_SECRET_2026" \\
  -d '{
    "deviceId": "dev_01",
    "biometricUserId": "101",
    "punchTime": "2026-09-15T08:00:00Z",
    "verificationMode": "FACE",
    "inOutMode": "AUTO"
  }'`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
            <span className="pill-badge pill-indigo" style={{ fontSize: '0.6875rem' }}>
              PARTNER GATEWAY
            </span>
            <span className="eyebrow-italic">
              Hardware Alignment • ABC Pvt Ltd
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
            Anubhav Infotech <em style={{ fontStyle: 'italic', color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)' }}>Hardware Gateway</em>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Direct biometric ingestion gateway, choosable hardware models, and offline edge daemon bridge for field technicians.
          </p>
        </div>

        <button
          onClick={onOpenSimulator}
          className="btn-swaniki btn-swaniki-primary"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.8125rem',
            background: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)',
            color: isDark ? '#0a0c10' : '#ffffff'
          }}
        >
          <Cpu size={16} />
          <span>Launch Biometric Simulator</span>
        </button>
      </div>

      {updateMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '0.75rem',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: '#10b981',
          fontWeight: 600
        }}>
          <Check size={16} />
          <span>{updateMessage}</span>
        </div>
      )}

      {/* Hardware Fleet Inventory with Choosable Models */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {devices.map(dev => (
          <div key={dev.id} className="swaniki-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '2.75rem',
                    height: '2.75rem',
                    borderRadius: '0.75rem',
                    background: isDark ? 'rgba(0, 242, 254, 0.12)' : 'var(--brand-primary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${isDark ? 'rgba(0, 242, 254, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`
                  }}>
                    <Radio size={20} color={isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)'} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                      {dev.device_name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <em>{dev.location}</em>
                    </p>
                  </div>
                </div>

                <span className="pill-badge pill-emerald">
                  <span className="live-beacon" style={{ width: '5px', height: '5px' }}></span>
                  <span>{dev.status}</span>
                </span>
              </div>

              {/* Model Chooser Dropdown */}
              <div style={{
                margin: '1rem 0',
                padding: '0.875rem',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.75rem'
              }}>
                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                  Hardware Model Selection (Phase 2 Choice):
                </label>
                <select
                  className="input-field"
                  value={dev.model}
                  onChange={(e) => handleModelChange(dev.id, e.target.value)}
                  disabled={updatingDevId === dev.id}
                  style={{ fontWeight: 700 }}
                >
                  {supportedModels.map((m, idx) => (
                    <option key={idx} value={m} style={{ background: 'var(--bg-surface)', color: 'var(--text-heading)' }}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <p>Serial Number: <strong style={{ color: 'var(--text-heading)' }}>{dev.serial_number}</strong></p>
              <p>LAN IP Address: <code style={{ color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)', fontWeight: 700 }}>{dev.ip_address}:{dev.port}</code></p>
              <p>Sync Protocol: <strong style={{ color: 'var(--text-heading)' }}>{dev.protocol} (Push Webhook)</strong></p>
            </div>
          </div>
        ))}
      </div>

      {/* Partner Webhook Credentials */}
      <div className="swaniki-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Key size={18} color={isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'} />
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            Anubhav Infotech Secret API Key &amp; Hardware Credentials
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Configured in the local Python sync daemon on the reception PC for zero-touch authentication.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.8125rem' }}>
          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '0.875rem 1rem', borderRadius: '0.75rem' }}>
            <span style={{ color: 'var(--text-caption)', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' }}>HEADER PARAMETER</span>
            <p style={{ fontWeight: 800, color: 'var(--text-heading)', marginTop: '0.25rem' }}>x-api-key</p>
          </div>
          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '0.875rem 1rem', borderRadius: '0.75rem' }}>
            <span style={{ color: 'var(--text-caption)', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' }}>PRE-CONFIGURED SECRET TOKEN</span>
            <p style={{ fontWeight: 800, color: isDark ? 'var(--brand-cyan)' : 'var(--brand-primary)', marginTop: '0.25rem' }}>ANUBHAV_DNH_SECRET_2026</p>
          </div>
        </div>
      </div>

      {/* Interactive cURL Test Snippet */}
      <div className="swaniki-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={18} color={isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'} />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              Direct Biometric Hardware Push Sample (cURL)
            </h3>
          </div>
          <button
            onClick={copyToClipboard}
            className="btn-swaniki btn-swaniki-ghost"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy cURL Snippet'}</span>
          </button>
        </div>

        <pre style={{
          background: isDark ? '#05070a' : '#0f172a',
          padding: '1.125rem',
          borderRadius: '0.75rem',
          fontSize: '0.8125rem',
          color: '#34d399',
          overflowX: 'auto',
          border: '1px solid var(--border-color)',
          fontFamily: 'monospace',
          lineHeight: 1.5
        }}>
          {curlSnippet}
        </pre>
      </div>

      {/* Phase 2 Discussion Points with Anubhav Infotech */}
      <div className="swaniki-card" style={{
        padding: '1.5rem',
        background: isDark ? 'rgba(0, 242, 254, 0.04)' : 'rgba(79, 70, 229, 0.03)',
        border: isDark ? '1px solid rgba(0, 242, 254, 0.25)' : '1px solid rgba(79, 70, 229, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Settings2 size={18} color={isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)'} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: isDark ? 'var(--brand-cyan)' : 'var(--brand-indigo)' }}>
            Phase 2 Technical Discussion Agenda with Anubhav Infotech
          </h3>
        </div>
        <ul style={{ fontSize: '0.8125rem', color: 'var(--text-body)', lineHeight: 1.7, paddingLeft: '1.25rem' }}>
          <li><strong style={{ color: 'var(--text-heading)' }}>Device Selection Alignment</strong>: Evaluate whether to deploy <em>eSSL uFace 302</em> (contactless dual-camera facial recognition, highly recommended for ICU hygiene) vs <em>eSSL K90 Pro</em> (economical optical fingerprint with internal battery backup for power failures).</li>
          <li><strong style={{ color: 'var(--text-heading)' }}>Zero-Cost Cloud Connectivity</strong>: Demonstrate how Cloudflare Tunnels eliminate the need for Anubhav Infotech or ABC Pvt Ltd to buy static IP addresses or reconfigure hospital Wi-Fi router firewalls.</li>
          <li><strong style={{ color: 'var(--text-heading)' }}>No Mediator MS-SQL Database</strong>: Spine HR required an extra MS-SQL database instance that Anubhav had to configure and support. Show how our direct REST webhook handles punches directly into SQLite/Postgres with zero maintenance.</li>
        </ul>
      </div>
    </div>
  );
}

