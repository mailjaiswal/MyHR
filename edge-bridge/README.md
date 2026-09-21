# Anubhav Infotech Hardware Integration Guide
### Dubey Nursing Home Enterprise Biometric Platform

This directory contains integration documentation, sample scripts, and the edge sync daemon for Anubhav Infotech (biometric hardware implementation partner in Bhopal & Chhindwara, MP).

---

## 1. Direct Cloud Push Configuration (Recommended)

If the installed device (e.g. **eSSL uFace 302, eSSL K90 Pro, ZKTeco MB20, Biomax**) supports **ADMS / Cloud Server** mode:

1. On the physical biometric device, press `M/OK` to open the Admin Menu.
2. Navigate to: `Comm.` -> `Cloud Server Server / ADMS`.
3. Set the following parameters:
   - **Server Address**: `your-app-domain.vercel.app` (or your Cloudflare Tunnel host)
   - **Server Port**: `443` (HTTPS) or `80` (HTTP)
   - **Enable Proxy Server**: `OFF`
4. The machine will automatically push face and fingerprint punches directly to `/api/v1/biometrics/punch`.

---

## 2. Local LAN Bridge Daemon (For Standard IP Devices)

If the device only supports local Ethernet LAN communication (Port 4370):

1. Connect the biometric device to Dubey Nursing Home's local Wi-Fi router or switch.
2. Assign a static local IP to the device (e.g., `192.168.1.201`).
3. Run the lightweight Python bridge on any Windows PC at the Reception or Billing counter:

```bash
# Run test simulation
python essl_sync_daemon.py --simulate

# Run continuously as a background Windows service
python essl_sync_daemon.py
```

### Key Advantages for Anubhav Infotech:
- **Zero Data Loss**: Features an automatic local SQLite buffer (`punches_queue.db`). If the broadband drops in Chhindwara, punches are safely stored on the local PC disk and automatically transmitted as soon as connectivity resumes.
- **Deduplication Safeguard**: Automatically prevents repeated rapid finger taps within 60 seconds from distorting duty hours.
- **No Static IP Needed**: Works 100% seamlessly through free Cloudflare Tunnels (`cloudflared tunnel --url http://localhost:4010`), saving clients from buying costly static IPs.
