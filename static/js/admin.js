// static/js/admin.js - Redesigned Admin Dashboard

// ===== Utility Functions =====
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

async function getJSON(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ''; }
}

// Format structured text for Listener, Final Plan, etc.
function formatStructuredText(text, role) {
  if (!text) return '—';

  let html = escapeHtml(text);

  // For Listener or structured roles, apply enhanced formatting
  if (role === 'Listener' || role === 'Question Recommender' || text.includes('Final Plan') || text.includes('**')) {
    // Format bold text: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: var(--admin-primary);">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong style="color: var(--admin-primary);">$1</strong>');

    // Format section headers (lines ending with colon or starting with #)
    html = html.replace(/^(#+\s*)(.+)$/gm, '<div style="font-weight: 600; color: var(--admin-primary); margin: 0.75rem 0 0.375rem 0; font-size: 0.95rem;">$2</div>');
    html = html.replace(/^([A-Z][A-Za-z\s]+):(\s*)$/gm, '<div style="font-weight: 600; color: var(--admin-primary); margin: 0.75rem 0 0.25rem 0; border-bottom: 1px solid var(--admin-border); padding-bottom: 0.25rem;">$1</div>');

    // Format bullet points (-, *, •)
    html = html.replace(/^[\s]*[-*•]\s+(.+)$/gm, '<div style="display: flex; gap: 0.5rem; margin: 0.25rem 0 0.25rem 0.5rem;"><span style="color: var(--admin-primary);">•</span><span>$1</span></div>');

    // Format numbered lists
    html = html.replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<div style="display: flex; gap: 0.5rem; margin: 0.25rem 0 0.25rem 0.5rem;"><span style="color: var(--admin-primary); font-weight: 500; min-width: 1.25rem;">$1.</span><span>$2</span></div>');

    // Format key-value pairs (Key: Value)
    html = html.replace(/^([A-Za-z\s]+):\s+(.+)$/gm, (match, key, value) => {
      if (key.length < 25 && !key.includes('\n')) {
        return `<div style="margin: 0.25rem 0;"><span style="font-weight: 500; color: #4b5563;">${key}:</span> ${value}</div>`;
      }
      return match;
    });

    // Convert remaining newlines to line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up excessive line breaks
    html = html.replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>');
  } else {
    // Simple formatting: just preserve line breaks
    html = html.replace(/\n/g, '<br>');
  }

  return html;
}

function showAlert(message, type = 'error') {
  const alert = document.getElementById('admin-alert');
  const alertText = document.getElementById('admin-alert-text');
  if (alert && alertText) {
    alertText.textContent = message;
    alert.classList.add('show');
    setTimeout(() => alert.classList.remove('show'), 5000);
  }
}

function showLoading() {
  document.getElementById('loading-overlay')?.classList.add('show');
}

function hideLoading() {
  document.getElementById('loading-overlay')?.classList.remove('show');
}

// ===== Tab Navigation =====
function initTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.tab-content-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active panel
      panels.forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${tabName}`)?.classList.add('active');

      // Load data for specific tabs on first view
      if (tabName === 'clinicians' && !window.__cliniciansLoaded) {
        window.__cliniciansLoaded = true;
        loadCliniciansData();
      }
      if (tabName === 'users' && !window.__usersLoaded) {
        window.__usersLoaded = true;
        loadUsersData();
      }
      if (tabName === 'patients' && !window.__patientsLoaded) {
        window.__patientsLoaded = true;
        loadPatientsData();
      }
      if (tabName === 'analytics' && !window.__analyticsLoaded) {
        window.__analyticsLoaded = true;
        loadAnalyticsData();
      }
      if (tabName === 'history' && !window.__historyLoaded) {
        window.__historyLoaded = true;
        loadHistoryData();
      }
    });
  });
}

// ===== Modal Functions =====
function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('show');
}

window.closeModal = closeModal; // Make available globally for onclick handlers

// ===== KPI Rendering =====
function renderKPIs(summary) {
  const { users, conversations, messages } = summary;

  // Total Users
  document.getElementById('kpi-total-users').textContent = users.total || 0;
  document.getElementById('kpi-users-breakdown').textContent =
    `${users.clinicians || 0} clinicians, ${users.admins || 0} admins`;

  // Conversations
  document.getElementById('kpi-total-convos').textContent = conversations.total || 0;

  // Messages
  document.getElementById('kpi-total-messages').textContent = messages.total || 0;
  document.getElementById('kpi-messages-breakdown').textContent =
    `${messages.patient || 0} patient, ${messages.clinician || 0} clinician`;

  // Recommended Questions
  document.getElementById('kpi-reco-questions').textContent = messages.recommended || 0;
}

// ===== Charts =====
let _convChart, _symChart;

function renderConversationsChart(summary) {
  const ctx = document.getElementById('chart-convos');
  if (!ctx) return;

  const data = summary.series?.conversations_per_day || [];
  const labels = data.map(([date]) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const values = data.map(([, count]) => count);

  if (_convChart) _convChart.destroy();

  _convChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Conversations',
        data: values,
        borderColor: '#7bc148',
        backgroundColor: 'rgba(123, 193, 72, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderTopCliniciansTable(summary) {
  const tbody = document.querySelector('#tbl-top-clinicians tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const clinicians = summary.series?.top_clinicians || [];

  if (clinicians.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
    return;
  }

  clinicians.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.display_name || c.email || '—')}</td>
      <td style="text-align: right; font-weight: 600;">${c.count}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderGlobalSymptomsChart(symptomsData) {
  const ctx = document.getElementById('chart-symptoms');
  if (!ctx) return;

  const entries = Object.entries(symptomsData.global || {});
  if (entries.length === 0) {
    ctx.parentElement.innerHTML = '<p class="text-muted">No symptoms data available</p>';
    return;
  }

  const top20 = entries.slice(0, 20);
  const labels = top20.map(([symptom]) => symptom);
  const counts = top20.map(([, count]) => count);

  if (_symChart) _symChart.destroy();

  _symChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Mentions',
        data: counts,
        backgroundColor: '#7bc148',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

// ===== Conversations Management =====
const conversationState = {
  page: 1,
  size: 20,
  loading: false,
  done: false,
  clinicianId: null,
  patientId: null,
  allConversations: [],
  selectedConvId: null
};

function getConversationsUrl() {
  const params = new URLSearchParams({
    page: conversationState.page,
    size: conversationState.size
  });
  if (conversationState.clinicianId) {
    params.set('clinician_id', conversationState.clinicianId);
  }
  if (conversationState.patientId) {
    params.set('patient_id', conversationState.patientId);
  }
  return `/admin/api/conversations?${params}`;
}

async function loadConversations(append = false) {
  if (conversationState.loading) return;
  if (append && conversationState.done) return;

  const loadingEl = document.getElementById('convos-loading');
  const emptyEl = document.getElementById('convos-empty');
  const listEl = document.getElementById('convos-list');
  const loadMoreWrapper = document.getElementById('convos-load-more-wrapper');

  if (!append) {
    conversationState.page = 1;
    conversationState.done = false;
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.style.display = 'none';
    if (loadMoreWrapper) loadMoreWrapper.style.display = 'none';
  }

  conversationState.loading = true;

  try {
    const data = await getJSON(getConversationsUrl());
    if (!data.ok) throw new Error(data.error || 'Failed to load conversations');

    if (loadingEl) loadingEl.style.display = 'none';

    if (!append) {
      conversationState.allConversations = data.conversations || [];
    } else {
      conversationState.allConversations.push(...(data.conversations || []));
    }

    if (conversationState.allConversations.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (listEl) listEl.style.display = 'none';
      if (loadMoreWrapper) loadMoreWrapper.style.display = 'none';
    } else {
      if (listEl) listEl.style.display = 'block';
      renderConversationsList();

      conversationState.page += 1;
      const loaded = (conversationState.page - 1) * conversationState.size;
      if (loaded >= (data.total || 0)) {
        conversationState.done = true;
        if (loadMoreWrapper) loadMoreWrapper.style.display = 'none';
      } else {
        if (loadMoreWrapper) loadMoreWrapper.style.display = 'block';
        const btn = document.getElementById('load-more-convos');
        if (btn) btn.disabled = false;
      }
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    showAlert(err.message);
  } finally {
    conversationState.loading = false;
  }
}

function renderConversationsList(filteredList = null) {
  const listEl = document.getElementById('convos-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  const conversations = filteredList || conversationState.allConversations;

  if (conversations.length === 0) {
    listEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--admin-text-light);">No matching conversations</div>';
    return;
  }

  conversations.forEach(conv => {
    const isActive = conv.id === conversationState.selectedConvId;
    const date = conv.created_at ? new Date(conv.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';

    const clinician = conv.owner_display_name || '—';
    const patient = conv.patient_label || '—';

    const item = document.createElement('div');
    item.className = 'convos-item';
    item.style.cssText = `
      padding: 0.875rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 0.5rem;
      border: 1px solid ${isActive ? 'var(--admin-primary)' : 'transparent'};
      background: ${isActive ? 'rgba(123, 193, 72, 0.1)' : 'white'};
    `;
    item.dataset.id = conv.id;

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.375rem;">
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--admin-text);">
          👤 ${escapeHtml(patient)}
        </span>
        <button class="convos-delete-btn" data-id="${conv.id}" style="
          background: none; border: none; color: var(--admin-text-light); padding: 4px; cursor: pointer;
          border-radius: 4px; opacity: 0.5; transition: all 0.2s;
        " title="Delete conversation">🗑️</button>
      </div>
      <div style="font-size: 0.8rem; color: var(--admin-text-light); margin-bottom: 0.375rem;">
        🩺 ${escapeHtml(clinician)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: var(--admin-text-light);">
        <span>📅 ${date}</span>
        <span>💬 ${conv.message_count || 0} messages</span>
      </div>
    `;

    // Hover effect
    item.addEventListener('mouseenter', () => {
      if (!isActive) item.style.background = '#f9fafb';
      item.querySelector('.convos-delete-btn').style.opacity = '1';
    });
    item.addEventListener('mouseleave', () => {
      if (!isActive) item.style.background = 'white';
      item.querySelector('.convos-delete-btn').style.opacity = '0.5';
    });

    // Click to select
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.convos-delete-btn')) {
        selectConversation(conv.id);
      }
    });

    // Delete button
    const deleteBtn = item.querySelector('.convos-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    listEl.appendChild(item);
  });
}

async function selectConversation(convId) {
  conversationState.selectedConvId = convId;
  renderConversationsList(); // Update active state

  const placeholderEl = document.getElementById('convos-detail-placeholder');
  const loadingEl = document.getElementById('convos-detail-loading');
  const contentEl = document.getElementById('convos-detail-content');

  if (placeholderEl) placeholderEl.style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';

  try {
    const data = await getJSON(`/admin/api/conversation/${encodeURIComponent(convId)}`);
    if (!data.ok) throw new Error(data.error || 'Failed to load conversation');

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    renderConversationDetail(convId, data);
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (placeholderEl) {
      placeholderEl.innerHTML = `
        <div style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;">⚠️</div>
        <h4 style="margin: 0 0 0.5rem 0; color: var(--admin-text);">Error loading conversation</h4>
        <p>${escapeHtml(err.message)}</p>
      `;
      placeholderEl.style.display = 'block';
    }
  }
}

function renderConversationDetail(convId, data) {
  const contentEl = document.getElementById('convos-detail-content');
  if (!contentEl) return;

  const conv = conversationState.allConversations.find(c => c.id === convId);
  const messages = data.messages || [];
  const recs = data.recommended_questions || [];
  const date = conv && conv.created_at ? new Date(conv.created_at).toLocaleString() : '—';
  const clinician = conv ? (conv.owner_display_name || '—') : '—';
  const patient = conv ? (conv.patient_label || '—') : '—';

  // Build messages HTML
  let messagesHtml = '';
  if (messages.length === 0) {
    messagesHtml = `
      <div style="text-align: center; padding: 2rem; color: var(--admin-text-light);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">💬</div>
        <p>No messages in this conversation.</p>
      </div>
    `;
  } else {
    messagesHtml = messages.map(m => {
      const roleColors = {
        'patient': { bg: '#dbeafe', color: '#1e40af', icon: '👤' },
        'clinician': { bg: '#dcfce7', color: '#166534', icon: '🩺' },
        'Question Recommender': { bg: '#fef3c7', color: '#92400e', icon: '💡' },
        'Listener': { bg: 'rgba(123, 193, 72, 0.15)', color: '#166534', icon: '📋' }
      };
      const style = roleColors[m.role] || { bg: '#f3f4f6', color: '#4b5563', icon: '🤖' };
      const messageText = m.text || m.message || '—';
      const formattedText = formatStructuredText(messageText, m.role);

      return `
        <div style="padding: 1rem; border-bottom: 1px solid #f3f4f6;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.625rem;
              border-radius: 20px; font-size: 0.75rem; font-weight: 500; background: ${style.bg}; color: ${style.color};">
              ${style.icon} ${escapeHtml(m.role || 'message')}
            </span>
            <span style="font-size: 0.75rem; color: var(--admin-text-light);">${escapeHtml(m.timestamp || '')}</span>
          </div>
          <div style="color: var(--admin-text); line-height: 1.6; font-size: 0.9rem;">
            ${formattedText}
          </div>
        </div>
      `;
    }).join('');
  }

  // Recommended questions HTML for right column
  const recsHtml = recs.length > 0 ? `
    <div style="background: white; border-radius: 8px; overflow: hidden; height: fit-content;">
      <div style="background: #f97316; color: white; padding: 0.75rem 1rem; font-weight: 500; font-size: 0.85rem;">
        💡 Recommended Questions (${recs.length})
      </div>
      <div style="padding: 0.75rem; max-height: 400px; overflow-y: auto;">
        ${recs.map(r => `
          <div style="padding: 0.625rem; margin-bottom: 0.5rem; background: #fffbeb; border-radius: 6px; font-size: 0.825rem; line-height: 1.4;">
            ${escapeHtml(r.question)}
            ${r.symptom ? `<div style="margin-top: 0.375rem;"><span style="background: #dcfce7; color: #166534; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.7rem;">${escapeHtml(r.symptom)}</span></div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  ` : `
    <div style="background: white; border-radius: 8px; overflow: hidden; height: fit-content;">
      <div style="background: #f97316; color: white; padding: 0.75rem 1rem; font-weight: 500; font-size: 0.85rem;">
        💡 Recommended Questions
      </div>
      <div style="padding: 1.5rem; text-align: center; color: var(--admin-text-light); font-size: 0.85rem;">
        No recommended questions
      </div>
    </div>
  `;

  contentEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h4 style="margin: 0; color: var(--admin-primary); display: flex; align-items: center; gap: 0.5rem;">
        💬 Conversation Details
      </h4>
      <button id="convos-delete-current" class="btn-admin-danger btn-admin-sm">🗑️ Delete</button>
    </div>

    <div style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        📅 <strong>Started:</strong> ${escapeHtml(date)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        🩺 <strong>Clinician:</strong> ${escapeHtml(clinician)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        👤 <strong>Patient:</strong> ${escapeHtml(patient)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        💬 <strong>Messages:</strong> ${messages.length}
      </div>
    </div>

    <div class="convos-detail-columns">
      <!-- Messages Column -->
      <div class="convos-messages-col">
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <div style="background: var(--admin-primary); color: white; padding: 0.875rem 1.25rem; font-weight: 500; font-size: 0.9rem;">
            💬 Messages
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
            ${messagesHtml}
          </div>
        </div>
      </div>

      <!-- Recommended Questions Column -->
      <div class="convos-recs-col">
        ${recsHtml}
      </div>
    </div>
  `;

  // Wire delete button
  const deleteBtn = document.getElementById('convos-delete-current');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteConversation(convId));
  }
}

// Legacy viewConversation for modal (used by analytics tab)
async function viewConversation(convId) {
  showLoading();
  try {
    const data = await getJSON(`/admin/api/conversation/${encodeURIComponent(convId)}`);
    if (!data.ok) throw new Error(data.error || 'Failed to load conversation');

    const messages = data.messages || [];
    const recs = data.recommended_questions || [];

    const messagesHtml = messages.map(m => `
      <div style="margin-bottom: 1rem; padding: 0.75rem; background: #f9fafb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <strong style="color: #7bc148;">${escapeHtml(m.role || 'Unknown')}</strong>
          <span style="font-size: 0.8rem; color: #6b7280;">${escapeHtml(m.timestamp || '')}</span>
        </div>
        <div>${escapeHtml(m.text || m.message || '')}</div>
      </div>
    `).join('');

    const recsHtml = recs.length > 0 ? recs.map(r => `
      <li style="margin-bottom: 0.5rem;">
        ${escapeHtml(r.question)}
        ${r.symptom ? `<span class="status-badge active">${escapeHtml(r.symptom)}</span>` : ''}
      </li>
    `).join('') : '<p class="text-muted">No recommended questions</p>';

    const detailBody = document.getElementById('conversation-detail-body');
    if (detailBody) {
      detailBody.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
          <h6 style="margin-bottom: 1rem;">Conversation ID: ${escapeHtml(convId)}</h6>
        </div>
        <div style="margin-bottom: 1.5rem;">
          <h6 style="margin-bottom: 0.75rem;">Transcript</h6>
          <div style="max-height: 400px; overflow-y: auto;">
            ${messagesHtml}
          </div>
        </div>
        <div>
          <h6 style="margin-bottom: 0.75rem;">Recommended Questions</h6>
          <ul style="list-style: none; padding: 0;">
            ${recsHtml}
          </ul>
        </div>
      `;
    }

    openModal('modal-conversation');
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

async function deleteConversation(convId) {
  if (!confirm('Delete this conversation? This cannot be undone.')) return;

  showLoading();
  try {
    const response = await fetch(`/admin/api/conversation/${encodeURIComponent(convId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': window.CSRF_TOKEN || '' }
    });

    const data = await response.json().catch(() => ({}));
    if (data.ok) {
      // Remove from state
      conversationState.allConversations = conversationState.allConversations.filter(c => c.id !== convId);

      // If this was selected, clear detail
      if (conversationState.selectedConvId === convId) {
        conversationState.selectedConvId = null;
        const contentEl = document.getElementById('convos-detail-content');
        const placeholderEl = document.getElementById('convos-detail-placeholder');
        if (contentEl) contentEl.style.display = 'none';
        if (placeholderEl) {
          placeholderEl.innerHTML = `
            <div style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;">💬</div>
            <h4 style="margin: 0 0 0.5rem 0; color: var(--admin-text);">No conversation selected</h4>
            <p>Select a conversation from the list to view its messages</p>
          `;
          placeholderEl.style.display = 'block';
        }
      }

      // Re-render list or show empty
      if (conversationState.allConversations.length === 0) {
        document.getElementById('convos-list').style.display = 'none';
        document.getElementById('convos-empty').style.display = 'block';
        document.getElementById('convos-load-more-wrapper').style.display = 'none';
      } else {
        renderConversationsList();
      }

      showAlert('Conversation deleted successfully', 'success');
    } else {
      showAlert(data.error || 'Could not delete conversation');
    }
  } catch (err) {
    showAlert('Network error: ' + err.message);
  } finally {
    hideLoading();
  }
}

window.viewConversation = viewConversation;
window.deleteConversation = deleteConversation;

// ===== Clinicians Management =====
async function loadCliniciansData() {
  showLoading();
  try {
    const data = await getJSON('/admin/api/clinicians');
    if (!data.ok) throw new Error(data.error || 'Failed to load clinicians');

    renderCliniciansTable(data.clinicians || []);
    populateClinicianDropdowns(data.clinicians || []);
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function renderCliniciansTable(clinicians) {
  const tbody = document.querySelector('#tbl-clinicians tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (clinicians.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No clinicians found</td></tr>';
    return;
  }

  clinicians.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${escapeHtml(c.display_name || '—')}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td style="text-align: center; font-weight: 600;">${c.conversations || 0}</td>
      <td style="text-align: right;">
        <button class="btn-admin-secondary btn-admin-sm" onclick="filterByClinician(${c.id})">View Conversations</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateClinicianDropdowns(clinicians) {
  // Filter dropdown in conversations tab
  const filterSelect = document.getElementById('filter-clinician');
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">All Clinicians</option>';
    clinicians.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.display_name || c.email || `User ${c.id}`} (${c.conversations} convos)`;
      filterSelect.appendChild(opt);
    });
  }

  // Create patient modal dropdown
  const patientSelect = document.getElementById('patient-clinician-select');
  if (patientSelect) {
    patientSelect.innerHTML = '<option value="">Select a clinician</option>';
    clinicians.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.display_name || c.email || `User ${c.id}`;
      patientSelect.appendChild(opt);
    });
  }
}

// All patients (cached for cascading filter)
let _allPatients = [];

function updatePatientFilterDropdown(clinicianId) {
  const filterSelect = document.getElementById('filter-patient');
  if (!filterSelect) return;
  filterSelect.innerHTML = '<option value="">All Patients</option>';

  let patients = _allPatients || [];
  if (clinicianId) {
    patients = patients.filter(p => p.clinician_id === parseInt(clinicianId, 10));
  }

  patients.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const label = p.identifier || '—';
    const extra = clinicianId ? (p.display_name && p.display_name !== '—' ? ' – ' + p.display_name : '') : (' (' + (p.clinician_display_name || '—') + ')');
    opt.textContent = label + extra;
    filterSelect.appendChild(opt);
  });
}

function populatePatientFilterDropdown(patients) {
  _allPatients = patients || [];
  const clinicianFilter = document.getElementById('filter-clinician');
  const clinicianId = clinicianFilter ? clinicianFilter.value || null : null;
  updatePatientFilterDropdown(clinicianId || null);
}

function filterByClinician(clinicianId) {
  // Switch to conversations tab, select clinician, and update patient dropdown (cascading)
  document.querySelector('[data-tab="conversations"]')?.click();

  const clinicianFilter = document.getElementById('filter-clinician');
  if (clinicianFilter) {
    clinicianFilter.value = clinicianId;
    clinicianFilter.dispatchEvent(new Event('change'));
  }
}

window.filterByClinician = filterByClinician;

// ===== User Management =====
let availableRoles = [];

async function loadUsersData() {
  showLoading();
  try {
    // Load roles first
    const rolesData = await getJSON('/admin/api/roles');
    if (rolesData.ok) {
      availableRoles = rolesData.roles || [];
    }

    // Load users
    const data = await getJSON('/admin/api/users');
    if (!data.ok) throw new Error(data.error || 'Failed to load users');

    renderUsersTable(data.users || []);
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function renderUsersTable(users) {
  const tbody = document.querySelector('#tbl-users tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No users found</td></tr>';
    return;
  }

  users.forEach(u => {
    const rolesHtml = u.roles.length > 0
      ? u.roles.map(r => `<span class="status-badge active">${escapeHtml(r)}</span>`).join(' ')
      : '<span class="text-muted">No roles</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.username || '—')}</td>
      <td>${rolesHtml}</td>
      <td style="font-size: 0.85rem;">${u.created_at ? fmtDateTime(u.created_at) : '—'}</td>
      <td style="text-align: right;">
        <button class="btn-admin-secondary btn-admin-sm" onclick="openEditUserModal(${u.id})">Edit</button>
        <button class="btn-admin-danger btn-admin-sm" onclick="deleteUser(${u.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateRoleCheckboxes(containerId, selectedRoles = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  availableRoles.forEach(role => {
    const isChecked = selectedRoles.includes(role.name);
    const div = document.createElement('div');
    div.innerHTML = `
      <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
        <input type="checkbox" name="roles" value="${escapeHtml(role.name)}" ${isChecked ? 'checked' : ''}>
        <span>${escapeHtml(role.name)}</span>
      </label>
    `;
    container.appendChild(div);
  });
}

function openCreateUserModal() {
  populateRoleCheckboxes('user-roles-checkboxes');
  openModal('modal-create-user');
}

async function handleCreateUser(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const roles = Array.from(form.querySelectorAll('input[name="roles"]:checked'))
    .map(cb => cb.value);

  const data = {
    email: formData.get('email'),
    username: formData.get('username'),
    password: formData.get('password'),
    roles: roles
  };

  showLoading();
  try {
    const response = await fetch('/admin/api/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': window.CSRF_TOKEN || ''
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create user: ${text}`);
    }

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Failed to create user');

    closeModal('modal-create-user');
    form.reset();
    showAlert(`User created successfully: ${result.email}`, 'success');

    // Reload users list
    await loadUsersData();
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

async function openEditUserModal(userId) {
  showLoading();
  try {
    const data = await getJSON('/admin/api/users');
    if (!data.ok) throw new Error(data.error || 'Failed to load user');

    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-username').value = user.username || '';

    populateRoleCheckboxes('edit-user-roles-checkboxes', user.roles);
    openModal('modal-edit-user');
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

async function handleEditUser(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const userId = formData.get('user_id');
  const roles = Array.from(form.querySelectorAll('input[name="roles"]:checked'))
    .map(cb => cb.value);

  const data = {
    username: formData.get('username'),
    roles: roles
  };

  showLoading();
  try {
    const response = await fetch(`/admin/api/users/${userId}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': window.CSRF_TOKEN || ''
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to update user: ${text}`);
    }

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Failed to update user');

    closeModal('modal-edit-user');
    showAlert('User updated successfully', 'success');

    // Reload users list
    await loadUsersData();
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?\n\nThis action cannot be undone.')) {
    return;
  }

  showLoading();
  try {
    const response = await fetch(`/admin/api/users/${userId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        'X-CSRFToken': window.CSRF_TOKEN || ''
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Delete failed: ${text}`);
    }

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Delete failed');

    showAlert('User deleted successfully', 'success');

    // Reload users list
    await loadUsersData();
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

window.openCreateUserModal = openCreateUserModal;
window.handleCreateUser = handleCreateUser;
window.openEditUserModal = openEditUserModal;
window.handleEditUser = handleEditUser;
window.deleteUser = deleteUser;

// ===== Patient Management =====
async function loadPatientsData() {
  showLoading();
  try {
    const data = await getJSON('/admin/api/patients');
    if (!data.ok) throw new Error(data.error || 'Failed to load patients');
    renderPatientsTable(data.patients || []);
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function renderPatientsTable(patients) {
  const tbody = document.querySelector('#tbl-patients tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (patients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No patients found</td></tr>';
    return;
  }

  patients.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.identifier)}</td>
      <td>${escapeHtml(p.display_name)}</td>
      <td>${escapeHtml(p.clinician_display_name || '—')}</td>
      <td style="font-size: 0.85rem;">${p.created_at ? fmtDateTime(p.created_at) : '—'}</td>
      <td style="text-align: right;">
        <button class="btn-admin-secondary btn-admin-sm" onclick="filterConversationsByPatient(${p.id}, ${p.clinician_id || 'null'})">View Conversations</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterConversationsByPatient(patientId, clinicianId) {
  document.querySelector('[data-tab="conversations"]')?.click();
  const clinicianFilter = document.getElementById('filter-clinician');
  const patientFilter = document.getElementById('filter-patient');
  // Set clinician first (cascading), repopulate patient dropdown, then set patient
  if (clinicianFilter && clinicianId) {
    clinicianFilter.value = clinicianId;
    conversationState.clinicianId = String(clinicianId);
    updatePatientFilterDropdown(clinicianId);
  }
  if (patientFilter) {
    patientFilter.value = patientId;
    conversationState.patientId = String(patientId);
  }
  loadConversations(false);
}

function openCreatePatientModal() {
  openModal('modal-create-patient');
}

async function handleCreatePatient(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const clinicianId = parseInt(formData.get('clinician_id'), 10);
  if (!clinicianId || isNaN(clinicianId)) {
    showAlert('Please select a clinician');
    return;
  }
  const data = {
    identifier: formData.get('identifier') || undefined,
    display_name: formData.get('display_name') || undefined,
    clinician_id: clinicianId
  };

  showLoading();
  try {
    const response = await fetch('/admin/api/patients', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': window.CSRF_TOKEN || ''
      },
      body: JSON.stringify(data)
    });

    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error('Session may have expired. Please refresh the page and log in again.');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create patient: ${text}`);
    }

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Failed to create patient');

    closeModal('modal-create-patient');
    form.reset();
    showAlert(`Patient created successfully: ${result.identifier}`, 'success');
    if (window.__patientsLoaded) await loadPatientsData();
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

window.openCreatePatientModal = openCreatePatientModal;
window.handleCreatePatient = handleCreatePatient;

// ===== Analytics (Symptoms & Disease Likelihoods) =====
// Cache disease likelihood responses so we don't re-analyze every click
// Map: convId -> { data, fetchedAtIso }
const _diseaseLikelihoodCache = new Map();

async function loadAnalyticsData() {
  showLoading();
  try {
    const data = await getJSON('/admin/api/symptoms');
    if (!data.ok) throw new Error(data.error || 'Failed to load symptoms data');

    renderGlobalSymptomsChart(data);
    renderPerConversationSymptoms(data.by_conversation || []);
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function renderPerConversationSymptoms(conversations) {
  const tbody = document.querySelector('#tbl-conv-symptoms tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (conversations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No symptom data available</td></tr>';
    return;
  }

  const convIdsToFetch = [];

  conversations.forEach(conv => {
    const convId = String(conv.conversation_id || '').trim();
    const symptomsText = Object.entries(conv.symptoms || {})
      .slice(0, 5)
      .map(([s, count]) => `${s} (${count})`)
      .join(', ') || '—';

    const tr = document.createElement('tr');

    const tdPatient = document.createElement('td');
    tdPatient.textContent = (conv.patient_identifier || conv.patient_display_name || '—');

    const tdClinician = document.createElement('td');
    tdClinician.textContent = (conv.owner_display_name || '—');

    const tdSymptoms = document.createElement('td');
    tdSymptoms.textContent = symptomsText;

    // Likelihood column
    const tdLikelihood = document.createElement('td');
    tdLikelihood.style.textAlign = 'center';
    tdLikelihood.id = `likelihood-${convId}`;
    tdLikelihood.innerHTML = '<span style="color: var(--admin-text-light);">—</span>';

    // Check cache first
    if (_diseaseLikelihoodCache.has(convId)) {
      const cached = _diseaseLikelihoodCache.get(convId);
      const pct = cached?.data?.cancer_likelihood_pct;
      if (typeof pct === 'number') {
        tdLikelihood.innerHTML = formatLikelihoodBadge(pct);
      }
    } else {
      convIdsToFetch.push(convId);
    }

    const tdActions = document.createElement('td');
    tdActions.style.textAlign = 'right';

    const btnAnalyze = document.createElement('button');
    btnAnalyze.className = 'btn-admin-secondary btn-admin-sm';
    btnAnalyze.textContent = 'Analyze';
    btnAnalyze.addEventListener('click', () => viewDiseaseLikelihoods(convId));

    tdActions.appendChild(btnAnalyze);

    tr.appendChild(tdPatient);
    tr.appendChild(tdClinician);
    tr.appendChild(tdSymptoms);
    tr.appendChild(tdLikelihood);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });

  // Lazy-load likelihoods for conversations not in cache (limit to first 10)
  const toFetch = convIdsToFetch.slice(0, 10);
  toFetch.forEach(convId => {
    _getDiseaseLikelihoods(convId).then(entry => {
      const cell = document.getElementById(`likelihood-${convId}`);
      if (cell && entry?.data) {
        const pct = entry.data.cancer_likelihood_pct;
        if (typeof pct === 'number') {
          cell.innerHTML = formatLikelihoodBadge(pct);
        }
      }
    }).catch(() => {
      // Silently fail - keep the "—"
    });
  });
}

function formatLikelihoodBadge(pct) {
  const color = pct >= 50 ? '#dc2626' : pct >= 20 ? '#f97316' : '#22c55e';
  const bgColor = pct >= 50 ? '#fef2f2' : pct >= 20 ? '#fff7ed' : '#f0fdf4';
  return `<span style="display: inline-block; padding: 0.25rem 0.625rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600; background: ${bgColor}; color: ${color};">${pct}%</span>`;
}

async function _getDiseaseLikelihoods(convId, { force = false } = {}) {
  const key = String(convId || '').trim();
  if (!key) throw new Error('Missing conversation id');

  if (!force && _diseaseLikelihoodCache.has(key)) {
    return _diseaseLikelihoodCache.get(key);
  }

  const url = `/admin/api/conversation/${encodeURIComponent(key)}/disease_likelihoods${force ? '?force=1' : ''}`;
  const data = await getJSON(url);
  if (!data.ok) throw new Error(data.error || 'Failed to load disease likelihoods');

  const entry = { data, fetchedAtIso: new Date().toISOString() };
  _diseaseLikelihoodCache.set(key, entry);
  return entry;
}

async function viewDiseaseLikelihoods(convId, { force = false } = {}) {
  showLoading();
  try {
    const entry = await _getDiseaseLikelihoods(convId, { force });
    const data = entry.data;

    const panel = document.getElementById('disease-likelihood-panel');
    if (!panel) return;

    const symptomsText = Object.entries(data.symptoms || {})
      .map(([s, count]) => `${escapeHtml(s)} (${count})`)
      .join(', ') || 'None detected';

    const cancerPct = typeof data.cancer_likelihood_pct === 'number' ? data.cancer_likelihood_pct : null;
    const cancerHtml = cancerPct !== null
      ? `<div style="margin-bottom: 1rem; padding: 1rem; background: ${cancerPct >= 20 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; border-left: 4px solid ${cancerPct >= 20 ? '#dc2626' : '#22c55e'};">
          <h6 style="margin: 0 0 0.5rem 0; font-size: 0.95rem;">🩺 Cancer Likelihood</h6>
          <div style="font-size: 1.5rem; font-weight: 700; color: ${cancerPct >= 20 ? '#991b1b' : '#166534'};">
            ${cancerPct}%
          </div>
          <p style="font-size: 0.8rem; color: #6b7280; margin: 0.25rem 0 0;">Based on FAISS similarity to cases with cancer-related flags</p>
        </div>`
      : '';

    const diseasesHtml = (data.top_diseases || []).length > 0
      ? data.top_diseases.map(d => `
          <tr>
            <td><strong>${escapeHtml(d.disease)}</strong></td>
            <td style="text-align: right;">
              <span style="color: #7bc148; font-weight: 600;">${d.likelihood_pct}%</span>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="2" class="text-muted">No disease predictions available</td></tr>';

    const patientLabel = escapeHtml(data.patient_label || '—');
    const clinicianLabel = escapeHtml(data.clinician_label || '—');
    const analyzedAt = data.analyzed_at
      ? fmtDateTime(data.analyzed_at)
      : (entry.fetchedAtIso ? fmtDateTime(entry.fetchedAtIso) : '—');

    panel.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <h6 style="margin-bottom: 0.5rem;">Patient: ${patientLabel} &nbsp;|&nbsp; Clinician: ${clinicianLabel}</h6>
        <p style="font-size: 0.9rem; color: #6b7280; margin: 0;">
          <strong>Symptoms:</strong> ${symptomsText}
        </p>
        <div style="margin-top: 0.75rem;">
          <button id="btn-view-conv" class="btn-admin-primary btn-admin-sm">View conversation</button>
          <button id="btn-reanalyze" class="btn-admin-secondary btn-admin-sm" style="margin-left: 0.5rem;">Re-analyze</button>
          <span style="margin-left: 0.75rem; font-size: 0.85rem; color: #6b7280;">Last analyzed: ${escapeHtml(analyzedAt)}</span>
        </div>
      </div>
      ${cancerHtml}
      <div>
        <h6 style="margin-bottom: 0.75rem;">Predicted Diseases</h6>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Disease</th>
              <th style="text-align: right;">Likelihood</th>
            </tr>
          </thead>
          <tbody>${diseasesHtml}</tbody>
        </table>
      </div>
      <div style="margin-top: 1rem; padding: 0.75rem; background: #fef3c7; border-radius: 6px; font-size: 0.85rem;">
        <strong>Note:</strong> These predictions are based on FAISS similarity matching and should not be used for medical diagnosis.
      </div>
    `;

    // Attach handlers (avoid inline onclick quoting issues)
    const btnView = panel.querySelector('#btn-view-conv');
    if (btnView) btnView.addEventListener('click', () => viewConversation(String(convId || '')));
    const btnRe = panel.querySelector('#btn-reanalyze');
    if (btnRe) btnRe.addEventListener('click', () => viewDiseaseLikelihoods(String(convId || ''), { force: true }));
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

window.viewDiseaseLikelihoods = viewDiseaseLikelihoods;

// ===== History Tab (My Conversations) =====
const historyState = {
  conversations: [],
  selectedConvId: null
};

async function loadHistoryData() {
  const loadingEl = document.getElementById('history-loading');
  const emptyEl = document.getElementById('history-empty');
  const listEl = document.getElementById('history-list');

  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';
  if (listEl) listEl.style.display = 'none';

  try {
    const data = await getJSON('/api/my-conversations');
    if (!data.ok) throw new Error(data.error || 'Failed to load conversations');

    historyState.conversations = data.conversations || [];

    if (loadingEl) loadingEl.style.display = 'none';

    if (historyState.conversations.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (listEl) listEl.style.display = 'block';
    renderHistoryList();
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    showAlert(err.message);
  }
}

function renderHistoryList() {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  historyState.conversations.forEach(conv => {
    const isActive = conv.id === historyState.selectedConvId;
    const date = conv.created_at ? new Date(conv.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';

    const patient = conv.patient_label || '—';
    const preview = (conv.preview || 'No messages yet').substring(0, 80) + ((conv.preview || '').length > 80 ? '...' : '');

    const item = document.createElement('div');
    item.className = 'history-item';
    item.style.cssText = `
      padding: 0.875rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 0.5rem;
      border: 1px solid ${isActive ? 'var(--admin-primary)' : 'transparent'};
      background: ${isActive ? 'rgba(123, 193, 72, 0.1)' : 'white'};
    `;
    item.dataset.id = conv.id;

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.375rem;">
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--admin-text);">
          👤 ${escapeHtml(patient)}
        </span>
        <button class="history-delete-btn" data-id="${conv.id}" style="
          background: none; border: none; color: var(--admin-text-light); padding: 4px; cursor: pointer;
          border-radius: 4px; opacity: 0.5; transition: all 0.2s;
        " title="Delete conversation">🗑️</button>
      </div>
      <div style="font-size: 0.8rem; color: var(--admin-text-light); line-height: 1.4; margin-bottom: 0.5rem;">
        ${escapeHtml(preview)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: var(--admin-text-light);">
        <span>📅 ${date}</span>
        <span>💬 ${conv.message_count || 0} messages</span>
      </div>
    `;

    // Hover effect
    item.addEventListener('mouseenter', () => {
      if (!isActive) item.style.background = '#f9fafb';
      item.querySelector('.history-delete-btn').style.opacity = '1';
    });
    item.addEventListener('mouseleave', () => {
      if (!isActive) item.style.background = 'white';
      item.querySelector('.history-delete-btn').style.opacity = '0.5';
    });

    // Click to select
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.history-delete-btn')) {
        selectHistoryConversation(conv.id);
      }
    });

    // Delete button
    const deleteBtn = item.querySelector('.history-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteHistoryConversation(conv.id);
    });

    listEl.appendChild(item);
  });
}

async function selectHistoryConversation(convId) {
  historyState.selectedConvId = convId;
  renderHistoryList(); // Update active state

  const placeholderEl = document.getElementById('history-detail-placeholder');
  const loadingEl = document.getElementById('history-detail-loading');
  const contentEl = document.getElementById('history-detail-content');

  if (placeholderEl) placeholderEl.style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';

  try {
    const data = await getJSON(`/api/conversations/${encodeURIComponent(convId)}/messages`);
    if (!data.ok) throw new Error(data.error || 'Failed to load conversation');

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    renderHistoryDetail(convId, data);
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (placeholderEl) {
      placeholderEl.innerHTML = `
        <div style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;">⚠️</div>
        <h4 style="margin: 0 0 0.5rem 0; color: var(--admin-text);">Error loading conversation</h4>
        <p>${escapeHtml(err.message)}</p>
      `;
      placeholderEl.style.display = 'block';
    }
  }
}

function renderHistoryDetail(convId, data) {
  const contentEl = document.getElementById('history-detail-content');
  if (!contentEl) return;

  const conv = historyState.conversations.find(c => c.id === convId);
  const messages = data.messages || [];
  const date = conv && conv.created_at ? new Date(conv.created_at).toLocaleString() : '—';
  const patient = data.patient_label || (conv && conv.patient_label) || '—';
  const patientId = data.patient_id || (conv && conv.patient_id) || '';

  const newConvUrl = patientId ? `/?patient_id=${encodeURIComponent(patientId)}` : '/';

  // Build messages HTML
  let messagesHtml = '';
  if (messages.length === 0) {
    messagesHtml = `
      <div style="text-align: center; padding: 2rem; color: var(--admin-text-light);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">💬</div>
        <p>No messages in this conversation.</p>
      </div>
    `;
  } else {
    messagesHtml = messages.map(m => {
      const roleColors = {
        'patient': { bg: '#dbeafe', color: '#1e40af', icon: '👤' },
        'clinician': { bg: '#dcfce7', color: '#166534', icon: '🩺' },
        'Question Recommender': { bg: '#fef3c7', color: '#92400e', icon: '💡' },
        'Listener': { bg: 'rgba(123, 193, 72, 0.15)', color: '#166534', icon: '📋' }
      };
      const style = roleColors[m.role] || { bg: '#f3f4f6', color: '#4b5563', icon: '🤖' };
      const messageText = m.message || '—';
      const formattedText = formatStructuredText(messageText, m.role);

      return `
        <div style="padding: 1rem; border-bottom: 1px solid #f3f4f6;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.625rem;
              border-radius: 20px; font-size: 0.75rem; font-weight: 500; background: ${style.bg}; color: ${style.color};">
              ${style.icon} ${escapeHtml(m.role || 'message')}
            </span>
            <span style="font-size: 0.75rem; color: var(--admin-text-light);">${escapeHtml(m.timestamp || '')}</span>
          </div>
          <div style="color: var(--admin-text); line-height: 1.6; font-size: 0.9rem;">
            ${formattedText}
          </div>
        </div>
      `;
    }).join('');
  }

  contentEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h4 style="margin: 0; color: var(--admin-primary); display: flex; align-items: center; gap: 0.5rem;">
        💬 Conversation Details
      </h4>
      <div style="display: flex; gap: 0.5rem;">
        <button id="history-delete-current" class="btn-admin-danger btn-admin-sm">🗑️ Delete</button>
        <a href="${newConvUrl}" class="btn-admin-primary btn-admin-sm" style="text-decoration: none;">+ New Conversation</a>
      </div>
    </div>

    <div style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        📅 <strong>Started:</strong> ${escapeHtml(date)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        👤 <strong>Patient:</strong> ${escapeHtml(patient)}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--admin-text-light); font-size: 0.875rem;">
        💬 <strong>Messages:</strong> ${messages.length}
      </div>
    </div>

    <div style="background: white; border-radius: 8px; overflow: hidden;">
      <div style="background: var(--admin-primary); color: white; padding: 0.875rem 1.25rem; font-weight: 500; font-size: 0.9rem;">
        💬 Messages
      </div>
      <div style="max-height: 400px; overflow-y: auto;">
        ${messagesHtml}
      </div>
    </div>
  `;

  // Wire delete button
  const deleteBtn = document.getElementById('history-delete-current');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteHistoryConversation(convId));
  }
}

async function deleteHistoryConversation(convId) {
  if (!confirm('Delete this conversation? This cannot be undone.')) return;

  showLoading();
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(convId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': window.CSRF_TOKEN || '' }
    });

    const data = await response.json().catch(() => ({}));
    if (data.ok) {
      // Remove from state
      historyState.conversations = historyState.conversations.filter(c => c.id !== convId);

      // If this was selected, clear detail
      if (historyState.selectedConvId === convId) {
        historyState.selectedConvId = null;
        const contentEl = document.getElementById('history-detail-content');
        const placeholderEl = document.getElementById('history-detail-placeholder');
        if (contentEl) contentEl.style.display = 'none';
        if (placeholderEl) {
          placeholderEl.innerHTML = `
            <div style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;">💬</div>
            <h4 style="margin: 0 0 0.5rem 0; color: var(--admin-text);">No conversation selected</h4>
            <p>Select a conversation from the list to view its messages</p>
          `;
          placeholderEl.style.display = 'block';
        }
      }

      // Re-render list or show empty
      if (historyState.conversations.length === 0) {
        document.getElementById('history-list').style.display = 'none';
        document.getElementById('history-empty').style.display = 'block';
      } else {
        renderHistoryList();
      }

      showAlert('Conversation deleted successfully', 'success');
    } else {
      showAlert(data.error || 'Could not delete conversation');
    }
  } catch (err) {
    showAlert('Network error: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ===== Search & Filters =====
function initSearchAndFilters() {
  // Clinician filter
  const clinicianFilter = document.getElementById('filter-clinician');
  if (clinicianFilter) {
    clinicianFilter.addEventListener('change', () => {
      conversationState.clinicianId = clinicianFilter.value ? String(clinicianFilter.value) : null;
      loadConversations(false);
    });
  }

  // Patient filter
  const patientFilter = document.getElementById('filter-patient');
  if (patientFilter) {
    patientFilter.addEventListener('change', () => {
      conversationState.patientId = patientFilter.value ? String(patientFilter.value) : null;
      loadConversations(false);
    });
  }

  // Search conversation by ID, clinician name, or patient name
  const searchInput = document.getElementById('search-conversation');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        // Show all conversations when search is cleared
        renderConversationsList();
        return;
      }
      const filtered = conversationState.allConversations.filter(conv => {
        const id = String(conv.id).toLowerCase();
        const clinician = (conv.owner_display_name || '').toLowerCase();
        const patient = (conv.patient_label || '').toLowerCase();

        return id.includes(query) ||
               clinician.includes(query) ||
               patient.includes(query);
      });
      renderConversationsList(filtered);
    });
  }

  // Load more button
  const loadMoreBtn = document.getElementById('load-more-convos');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadConversations(true));
  }
}

// ===== Main Initialization =====
async function adminInit() {
  try {
    // Initialize tabs
    initTabs();

    // Get CSRF token
    try {
      const csrfData = await getJSON('/csrf-token');
      if (csrfData.csrfToken) window.CSRF_TOKEN = csrfData.csrfToken;
    } catch (e) {
      console.warn('Failed to load CSRF token:', e);
    }

    // Load overview data
    showLoading();
    const summary = await getJSON('/admin/api/summary');
    if (!summary.ok) throw new Error(summary.error || 'Failed to load summary');

    renderKPIs(summary);
    renderConversationsChart(summary);
    renderTopCliniciansTable(summary);

    // Load clinicians for dropdowns
    const cliniciansData = await getJSON('/admin/api/clinicians');
    if (cliniciansData.ok) {
      populateClinicianDropdowns(cliniciansData.clinicians || []);
    }

    // Load patients for filter dropdown
    try {
      const patientsData = await getJSON('/admin/api/patients');
      if (patientsData.ok) populatePatientFilterDropdown(patientsData.patients || []);
    } catch (e) { console.warn('Patients load:', e); }

    // Load conversations (first page)
    await loadConversations(false);

    // Analytics and Patients load lazily when tab is clicked

    // Initialize search and filters
    initSearchAndFilters();

    hideLoading();
  } catch (err) {
    hideLoading();
    showAlert(err.message);
    console.error('Admin initialization error:', err);
  }
}

// Run on admin page
if (location.pathname === '/admin' || location.pathname === '/admin/') {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.__ADMIN_INIT_ATTACHED__) return;
    window.__ADMIN_INIT_ATTACHED__ = true;
    adminInit();
  });
}
