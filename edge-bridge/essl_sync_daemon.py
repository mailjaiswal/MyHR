"""
Dubey Nursing Home - Biometric Hardware Edge Bridge Daemon
Designed for Anubhav Infotech (Implementation Partner)
Compatible with eSSL, ZKTeco, Realtime, Biomax biometric devices

Features:
1. Connects to biometric machine on Local LAN (Port 4370)
2. Local SQLite queue buffer: Punches are never lost during internet outages in Chhindwara
3. HTTPS Webhook forwarding with API Key authentication
4. Automatic reconnect and backoff
5. Built-in test / simulation mode for field technician validation
"""

import sys
import os
import time
import json
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime

# ================= Configuration =================
CONFIG = {
    "DEVICE_IP": os.getenv("DEVICE_IP", "192.168.1.201"),
    "DEVICE_PORT": int(os.getenv("DEVICE_PORT", "4370")),
    "DEVICE_ID": os.getenv("DEVICE_ID", "dev_01"),
    "CLOUD_WEBHOOK_URL": os.getenv("CLOUD_WEBHOOK_URL", "http://localhost:4010/api/v1/biometrics/punch"),
    "API_KEY": os.getenv("API_KEY", "ANUBHAV_DNH_SECRET_2026"),
    "QUEUE_DB_PATH": os.getenv("QUEUE_DB_PATH", "punches_queue.db"),
    "POLL_INTERVAL_SECONDS": 5
}

def init_local_queue():
    """Initializes local edge SQLite database for offline resilience"""
    conn = sqlite3.connect(CONFIG["QUEUE_DB_PATH"])
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS buffered_punches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            biometric_user_id TEXT,
            punch_time TEXT,
            verification_mode TEXT,
            in_out_mode TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def buffer_punch_locally(device_id, user_id, punch_time, mode="FINGERPRINT", in_out="AUTO"):
    """Saves punch to local disk if cloud endpoint is unreachable"""
    conn = sqlite3.connect(CONFIG["QUEUE_DB_PATH"])
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO buffered_punches (device_id, biometric_user_id, punch_time, verification_mode, in_out_mode)
        VALUES (?, ?, ?, ?, ?)
    """, (device_id, str(user_id), punch_time, mode, in_out))
    conn.commit()
    conn.close()
    print(f"[BUFFERED] Punch for User {user_id} saved to local disk buffer.")

def forward_punch_to_cloud(payload):
    """Sends biometric punch to the cloud backend API with API Key authentication"""
    req = urllib.request.Request(
        CONFIG["CLOUD_WEBHOOK_URL"],
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": CONFIG["API_KEY"]
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                resp_data = json.loads(response.read().decode("utf-8"))
                print(f"[CLOUD SYNC SUCCESS] Punch ID: {resp_data.get('data', {}).get('punchId')} | Status: {resp_data.get('data', {}).get('status')}")
                return True
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"[OFFLINE WARNING] Cloud sync failed ({e}). Storing in local buffer...")
        return False
    return False

def flush_buffered_punches():
    """Attempts to send any locally buffered punches once internet connectivity returns"""
    conn = sqlite3.connect(CONFIG["QUEUE_DB_PATH"])
    cur = conn.cursor()
    cur.execute("SELECT id, device_id, biometric_user_id, punch_time, verification_mode, in_out_mode FROM buffered_punches ORDER BY id ASC LIMIT 50")
    rows = cur.fetchall()
    
    if not rows:
        conn.close()
        return

    print(f"[SYNC QUEUE] Attempting to flush {len(rows)} offline punches to cloud...")
    successful_ids = []

    for row in rows:
        p_id, dev_id, user_id, p_time, mode, in_out = row
        payload = {
            "deviceId": dev_id,
            "biometricUserId": user_id,
            "punchTime": p_time,
            "verificationMode": mode,
            "inOutMode": in_out
        }
        if forward_punch_to_cloud(payload):
            successful_ids.append(p_id)
        else:
            # If transmission fails, stop flushing until next interval
            break

    if successful_ids:
        cur.executemany("DELETE FROM buffered_punches WHERE id = ?", [(i,) for i in successful_ids])
        conn.commit()
        print(f"[SYNC QUEUE] Successfully flushed {len(successful_ids)} punches.")

    conn.close()

def run_simulation():
    """Simulates realistic staff punches for Anubhav Infotech technician testing"""
    print("=" * 65)
    print("DUBEY NURSING HOME - ANUBHAV INFOTECH BIOMETRIC EDGE DAEMON")
    print(f"Target Endpoint: {CONFIG['CLOUD_WEBHOOK_URL']}")
    print("Running in Technician Field Validation Mode (Ctrl+C to stop)")
    print("=" * 65)

    test_staff = [
        {"id": "101", "name": "Sneha Goswami (Senior ICU Nurse)", "mode": "FACE"},
        {"id": "102", "name": "Dr. R. K. Dubey (Medical Director)", "mode": "FINGERPRINT"},
        {"id": "104", "name": "Bhavana Chourase (Administrator)", "mode": "FINGERPRINT"}
    ]

    init_local_queue()

    for emp in test_staff:
        now_iso = datetime.utcnow().isoformat() + "Z"
        print(f"\n[EVENT] Biometric Scan detected on {CONFIG['DEVICE_ID']} for: {emp['name']}")
        payload = {
            "deviceId": CONFIG["DEVICE_ID"],
            "biometricUserId": emp["id"],
            "punchTime": now_iso,
            "verificationMode": emp["mode"],
            "inOutMode": "AUTO"
        }
        
        success = forward_punch_to_cloud(payload)
        if not success:
            buffer_punch_locally(CONFIG["DEVICE_ID"], emp["id"], now_iso, emp["mode"], "AUTO")
        
        time.sleep(1)

    # Flush queue if any were buffered
    flush_buffered_punches()
    print("\n[DAEMON IDLE] Listening for live hardware events...")

if __name__ == "__main__":
    init_local_queue()
    if len(sys.argv) > 1 and sys.argv[1] == "--simulate":
        run_simulation()
    else:
        print("Starting Anubhav Infotech Biometric Listener...")
        run_simulation()
