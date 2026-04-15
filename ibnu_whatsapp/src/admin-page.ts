export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ibnu_whatsapp admin</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #0b1020; color: #eef2ff; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .card { background: #121933; border: 1px solid #26304f; border-radius: 16px; padding: 16px; }
    .muted { color: #a5b4fc; }
    .ok { color: #86efac; }
    .bad { color: #fca5a5; }
    .warn { color: #fcd34d; }
    .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #1e293b; margin-right: 6px; margin-bottom: 6px; }
    .pill.ok { background: rgba(34,197,94,.15); color: #86efac; }
    .pill.bad { background: rgba(239,68,68,.15); color: #fca5a5; }
    .pill.warn { background: rgba(245,158,11,.15); color: #fcd34d; }
    code { background: #0f172a; padding: 2px 6px; border-radius: 8px; }
    button { background: #4f46e5; color: white; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: #334155; }
    button.danger { background: #b91c1c; }
    button.small { padding: 8px 10px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td, th { padding: 10px; border-bottom: 1px solid #26304f; text-align: left; vertical-align: top; }
    input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: white; }
    a { color: #c7d2fe; }
    pre { white-space: pre-wrap; word-break: break-word; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ibnu_whatsapp admin</h1>
    <p class="muted">Admin skeleton for gateway status, diagnostics, and account lifecycle actions.</p>

    <div class="grid">
      <div class="card">
        <h3>Service</h3>
        <div id="service">Loading...</div>
      </div>
      <div class="card">
        <h3>Quick links</h3>
        <p><a href="/admin/overview">/admin/overview</a></p>
        <p><a href="/admin/contracts">/admin/contracts</a></p>
        <p><a href="/diagnostics">/diagnostics</a></p>
        <p><a href="/accounts">/accounts</a></p>
        <p class="muted">Stop / restart / reset / remove bisa dijalankan langsung dari tabel account.</p>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Start account</h3>
      <div class="grid">
        <div>
          <label>Account ID</label>
          <input id="accountId" placeholder="acc-2" />
        </div>
        <div>
          <label>Pairing number (optional)</label>
          <input id="pairingNumber" placeholder="6281234567890" />
        </div>
      </div>
      <p style="margin-top:12px;"><button onclick="startAccount()">Start account</button></p>
      <pre id="startResult"></pre>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Accounts</h3>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Status</th>
            <th>Connection</th>
            <th>Phone / Platform</th>
            <th>Error / Disconnect</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="accountsTable">
          <tr><td colspan="6">Loading...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Diagnostics snapshot</h3>
      <pre id="diagnosticsBox">Loading...</pre>
    </div>
  </div>

  <script>
    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function statusPill(text, cls) {
      return '<span class="pill ' + cls + '">' + escapeHtml(text) + '</span>';
    }

    async function apiCall(path, method, body) {
      const res = await fetch(path, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      document.getElementById('startResult').textContent = JSON.stringify(data, null, 2);
      await loadOverview();
      return data;
    }

    async function loadOverview() {
      const [overviewRes, diagnosticsRes] = await Promise.all([
        fetch('/admin/overview'),
        fetch('/diagnostics')
      ]);
      const data = await overviewRes.json();
      const diagnostics = await diagnosticsRes.json();

      document.getElementById('service').innerHTML =
        '<div><strong>' + escapeHtml(data.service.name) + '</strong></div>' +
        '<div class="muted">version ' + escapeHtml(data.service.version) + '</div>' +
        '<div class="muted">uptime ' + Math.round(data.service.uptimeSec) + 's</div>' +
        '<div style="margin-top:10px;">' +
          statusPill('accounts ' + (diagnostics.summary?.accountCount ?? 0), 'ok') +
          statusPill('connected ' + (diagnostics.summary?.connectedCount ?? 0), (diagnostics.summary?.connectedCount ?? 0) > 0 ? 'ok' : 'warn') +
          statusPill('registered ' + (diagnostics.summary?.registeredCount ?? 0), (diagnostics.summary?.registeredCount ?? 0) > 0 ? 'ok' : 'warn') +
          statusPill('errors ' + (diagnostics.summary?.accountsWithErrors ?? 0), (diagnostics.summary?.accountsWithErrors ?? 0) > 0 ? 'bad' : 'ok') +
        '</div>';

      const rows = (data.accounts || []).map(function(acc) {
        const statusBits = [
          statusPill(acc.connected ? 'connected' : 'disconnected', acc.connected ? 'ok' : 'bad'),
          statusPill(acc.registered ? 'registered' : 'unregistered', acc.registered ? 'ok' : 'warn')
        ].join('');

        const connectionInfo =
          '<div><strong>' + escapeHtml(acc.lastConnection || '-') + '</strong></div>' +
          '<div class="muted">at: ' + escapeHtml(acc.lastConnectionAt || '-') + '</div>' +
          '<div class="muted">qr: ' + escapeHtml(acc.lastQrAt || '-') + '</div>';

        const phoneInfo =
          '<div>' + escapeHtml(acc.phoneNumber || '-') + '</div>' +
          '<div class="muted">' + escapeHtml(acc.platform || '-') + '</div>';

        const errorInfo =
          '<div class="bad">' + escapeHtml(acc.lastError || '-') + '</div>' +
          '<div class="muted">disconnect: ' + escapeHtml(acc.lastDisconnectReason || '-') + '</div>';

        const actions =
          '<div class="actions">' +
            '<button class="small secondary" onclick="restartAccount(\'' + escapeHtml(acc.accountId) + '\')">Restart</button>' +
            '<button class="small secondary" onclick="stopAccount(\'' + escapeHtml(acc.accountId) + '\')">Stop</button>' +
            '<button class="small" onclick="resetSession(\'' + escapeHtml(acc.accountId) + '\')">Reset</button>' +
            '<button class="small danger" onclick="removeAccount(\'' + escapeHtml(acc.accountId) + '\')">Remove</button>' +
          '</div>';

        return '<tr>' +
          '<td><code>' + escapeHtml(acc.accountId) + '</code></td>' +
          '<td>' + statusBits + '</td>' +
          '<td>' + connectionInfo + '</td>' +
          '<td>' + phoneInfo + '</td>' +
          '<td>' + errorInfo + '</td>' +
          '<td>' + actions + '</td>' +
        '</tr>';
      }).join('');

      document.getElementById('accountsTable').innerHTML = rows || '<tr><td colspan="6">No accounts yet</td></tr>';
      document.getElementById('diagnosticsBox').textContent = JSON.stringify(diagnostics, null, 2);
    }

    async function startAccount() {
      const accountId = document.getElementById('accountId').value;
      const pairingNumber = document.getElementById('pairingNumber').value;
      await apiCall('/accounts', 'POST', { accountId, pairingNumber });
    }

    async function stopAccount(accountId) {
      await apiCall('/accounts/' + encodeURIComponent(accountId) + '/stop', 'POST');
    }

    async function restartAccount(accountId) {
      const pairingNumber = document.getElementById('pairingNumber').value;
      await apiCall('/accounts/' + encodeURIComponent(accountId) + '/restart', 'POST', { pairingNumber });
    }

    async function resetSession(accountId) {
      await apiCall('/accounts/' + encodeURIComponent(accountId) + '/reset-session', 'POST');
    }

    async function removeAccount(accountId) {
      const ok = window.confirm('Remove account ' + accountId + '? This deletes registry + session state.');
      if (!ok) return;
      await apiCall('/accounts/' + encodeURIComponent(accountId), 'DELETE');
    }

    loadOverview();
    setInterval(loadOverview, 5000);
  </script>
</body>
</html>`
}
