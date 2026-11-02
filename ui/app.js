const api = window.discordCode;
const $ = id => document.getElementById(id);
let state = null, raw = true, sending = false, uncertain = false, level = 2, selectedGroup = '@me', selectedRoute = null;
let lastRows = '', manualReadme = false, sidebarOpen = true, historyIndex = -1, firstAuthenticated = false, lastNav = '', lastTerminal = '', renderedLineCount = 0;
const messageCache = new Map();
let headerLines = null;
const drafts = new Map(), serverCache = new Map(), channelsCache = new Map(), history = [], sentHistory = new Map();
const text = (tag, value, cls) => { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; };
const icon = name => { const el = text('i', '', 'codicon codicon-' + name); el.setAttribute('aria-hidden', 'true'); return el; };
document.body.classList.toggle('win', !navigator.userAgent.includes('Macintosh'));
function notice(value) { $('send-status').textContent = value; if (value) $('output').textContent = '[discord-code] ' + value; }
async function showRaw(value) {
  raw = await api.raw(value);
  const label = raw ? '코드 화면' : '원본 화면 / 로그인';
  $('raw').title = label; $('raw').setAttribute('aria-label', label);
  $('raw').replaceChildren(icon(raw ? 'code' : 'open-preview'));
}
async function setSidebar(value) {
  sidebarOpen = value;
  document.body.classList.toggle('sidebar-hidden', !value);
  $('explorer').classList.toggle('selected', value);
  $('toggle-sidebar').setAttribute('aria-pressed', String(value));
  await api.sidebar(value);
}
async function findChannel() { if (!sidebarOpen) await setSidebar(true); $('filter').focus(); $('filter').select(); }
function panelTab(name) {
  const terminal = name === 'terminal';
  $('terminal').hidden = !terminal; $('output').hidden = terminal;
  for (const id of ['terminal', 'output']) {
    $(id + '-tab').classList.toggle('panel-active', id === name);
    $(id + '-tab').setAttribute('aria-selected', String(id === name));
  }
  if (terminal && !$('draft').disabled) $('draft').focus();
}
async function togglePanel() { if (raw) await showRaw(false); $('panel').hidden = !$('panel').hidden; if (!$('panel').hidden) { panelTab('terminal'); fitDraft(); } }
function renderTerminal() {
  const signature = JSON.stringify([state?.route, sentHistory.get(state?.route)]);
  if (signature === lastTerminal) return;
  lastTerminal = signature;
  $('terminal-log').replaceChildren(...(sentHistory.get(state?.route) || []).slice(-20).map(value => {
    const row = text('div', '', 'terminal-history');
    row.append(text('span', 'you@discord', 'terminal-user'), ' ', text('span', '$ ', 'terminal-dollar'), text('span', value));
    return row;
  }));
}
async function navigate(target) {
  if (sending) return;
  try {
    manualReadme = false;
    if (state?.route && $('draft').value) drafts.set(state.route, $('draft').value); else drafts.delete(state?.route);
    selectedRoute = target;
    $('draft').disabled = true; $('send').disabled = true;
    notice('채널을 여는 중…');
    await api.navigate(target);
    await showRaw(false);
  } catch (error) { selectedRoute = null; notice(error.message); }
}
function renderNav() {
  const signature = JSON.stringify([selectedGroup, state?.route, manualReadme, $('filter').value, [...serverCache.values()], [...channelsCache.values()]]);
  if (signature === lastNav) return;
  lastNav = signature;
  const list = $('channels'); list.remove();
  $('servers').replaceChildren(...[...serverCache.values()].map(server => {
    const b = text('button', '', 'tree-folder');
    b.append(icon(server.path.split('/')[2] === selectedGroup ? 'chevron-down' : 'chevron-right'), icon('folder'), text('span', server.name, 'folder-name'));
    b.title = server.name; b.setAttribute('aria-label', server.name);
    b.classList.toggle('selected', state?.route.split('/')[2] === server.path.split('/')[2]); b.onclick = () => navigate(server.path); return b;
  }));
  const activeServer = [...$('servers').children].find(b => b.classList.contains('selected'));
  (selectedGroup === '@me' || !activeServer ? $('dm') : activeServer).after(list);
  $('dm').classList.toggle('selected', selectedGroup === '@me');
  $('dm').firstElementChild.className = 'codicon codicon-chevron-' + (selectedGroup === '@me' ? 'down' : 'right');
  $('folder').textContent = selectedGroup === '@me' ? 'DIRECT MESSAGES' : 'TEXT CHANNELS';
  const query = $('filter').value.toLowerCase();
  list.replaceChildren(...[...channelsCache.values()].filter(c => c.group === selectedGroup && c.name.toLowerCase().includes(query)).map(c => {
    const b = text('button', '');
    b.append(icon('symbol-variable'), text('span', c.name + '.py', 'file-name'));
    b.title = c.name; b.classList.toggle('selected', c.path === state?.route && !manualReadme); b.onclick = () => navigate(c.path); return b;
  }));
}
function line(...children) { const el = text('div', '', 'code-line'); const content = text('span', '', 'line-content'); content.append(...children); el.append(content); return el; }
function syntax(value) {
  const tokens = [], pattern = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(import|from|as|return|if|else|for|in|def|class|with|True|False|None)\b|\b(\d+)\b|\b([a-zA-Z_]\w*)(?=\()/g;
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    tokens.push(value.slice(end, match.index), text('span', match[0], match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'keyword' : match[4] ? 'number' : 'function'));
    end = match.index + match[0].length;
  }
  tokens.push(value.slice(end)); return tokens;
}
function readme() {
  if ($('welcome').childElementCount) return;
  const rows = [
    '# Discord Code', '',
    'Discord messages, inside your editor.', '',
    '## 시작하기', '',
    '1. 오른쪽 위 미리보기 아이콘으로 Discord에 로그인합니다.',
    '2. 원본 화면에서 DM 또는 서버 채널을 엽니다.',
    '3. 코드 화면으로 돌아와 왼쪽의 .py 파일을 선택합니다.',
    '4. 아래 TERMINAL에서 메시지를 입력하고 Enter로 전송합니다.', '',
    '## 단축키', '',
    '`Enter`          메시지 전송',
    '`Shift+Enter`    줄바꿈',
    '`⌘P / Ctrl+P`   채널 찾기',
    '`⌘B / Ctrl+B`   탐색기 표시 전환',
    '`⌘J / Ctrl+J`   터미널 표시 전환', '',
    '## 대화 표시', '',
    '```python',
    'from discord import conversation', '',
    '# 친구 · 오후 3:20',
    'print("오늘 몇 시에 접속해?")', '',
    '# 메시지 입력은 아래 TERMINAL에서 합니다.',
    '```', '',
    '첨부 파일, 통화, 새 DM은 원본 화면을 사용하세요.',
  ];
  $('welcome').replaceChildren(...rows.map(value => line(text('span', value, value.startsWith('#') ? 'heading' : value.startsWith('`') ? 'string' : ''))));
}
function fitDraft() {
  const value = $('draft').value;
  $('draft').style.height = '20px'; $('draft').style.height = Math.min(100, $('draft').scrollHeight) + 'px';
  $('cursor').textContent = `Ln ${renderedLineCount + 2}, Col ${[...value].length + 16}`;
}
// Keep existing nodes, selection and scroll anchors when only a suffix is appended.
function reconcile(parent, nodes) {
  let cursor = parent.firstChild;
  for (const node of nodes) {
    if (node === cursor) cursor = cursor.nextSibling;
    else parent.insertBefore(node, cursor);
  }
  while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
}
function render(next) {
  const routeChanged = state?.route !== next.route;
  if (routeChanged) {
    messageCache.clear();
    if (state?.route && $('draft').value) drafts.set(state.route, $('draft').value); else drafts.delete(state?.route); $('draft').value = drafts.get(next.route) || '';
    lastRows = ''; uncertain = false; $('checked').hidden = true;
  }
  state = next;
  if (next.loggedIn && !firstAuthenticated) { firstAuthenticated = true; showRaw(false); }
  if (next.loggedIn && history[historyIndex] !== next.route) { history.splice(historyIndex + 1); history.push(next.route); if (history.length > 200) history.shift(); historyIndex = history.length - 1; }
  $('back').disabled = historyIndex <= 0;
  $('forward').disabled = historyIndex >= history.length - 1;
  if (selectedRoute && (next.route === selectedRoute || (!selectedRoute.split('/')[3] && next.route.startsWith(selectedRoute + '/')))) { selectedRoute = null; notice(''); }
  for (const server of next.servers) serverCache.set(server.path, server);
  for (const channel of next.channels) channelsCache.set(channel.path, channel);
  selectedGroup = next.route.split('/')[2] || '@me';
  renderNav();
  const ready = next.loggedIn && next.canSend && !selectedRoute;
  const isReadme = manualReadme || !next.canSend;
  $('connection').textContent = next.loggedIn ? 'Discord connected' : 'Login required';
  $('status').textContent = next.loggedIn ? `${next.rows.length} messages` : '로그인 대기';
  const name = channelsCache.get(next.route)?.name || next.title || 'README';
  $('filename').textContent = isReadme ? 'README.md' : name + '.py';
  $('file-icon').className = 'codicon codicon-' + (isReadme ? 'markdown' : 'symbol-variable');
  $('language').textContent = isReadme ? 'Markdown' : '{} Python';
  $('breadcrumb').textContent = isReadme ? 'discord-workspace › README.md' : `discord-workspace › ${selectedGroup === '@me' ? 'direct' : 'server'} › ${name}.py`;
  $('target').textContent = ready ? `전송 대상: ${name}` : '전송할 DM 또는 채널을 선택해 주세요';
  $('terminal-path').textContent = ready ? `~/${selectedGroup === '@me' ? 'direct' : 'server'}/${name}` : '~';
  renderTerminal();
  $('draft').disabled = !ready || sending; $('send').disabled = !ready || sending || uncertain;
  $('welcome').hidden = !isReadme;
  $('messages').hidden = isReadme;
  $('compose').hidden = false;
  $('readme').classList.toggle('selected', isReadme);
  if (isReadme) readme();
  if (routeChanged) fitDraft();
  const signature = JSON.stringify([next.route, next.rows, level]);
  if (signature === lastRows) return;
  lastRows = signature;
  const stick = $('code').scrollHeight - $('code').scrollTop - $('code').clientHeight < 140;
  if (!headerLines) headerLines = ['import json', 'import logging', 'from pathlib import Path', '', 'logger = logging.getLogger(__name__)', ''].map(value => line(...syntax(value)));
  const lines = next.canSend ? [...headerLines] : [];
  const keep = new Set();
  next.rows.forEach(row => {
    keep.add(row.id);
    const wrap = [...row.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 3, 0) === 0;
    const signature = JSON.stringify([row, level, wrap]);
    let cached = messageCache.get(row.id);
    if (!cached || cached.signature !== signature) {
      const nodes = [];
      const add = value => nodes.push(line(...syntax(value)));
      if (level && wrap) { add('def handle_event(event):'); add('    payload = json.loads(event["body"])'); }
      add((level ? '    ' : '') + '# ' + row.author + (row.time ? ' · ' + new Date(row.time).toLocaleString('ko-KR') : ''));
      const message = line(...syntax((level ? '    ' : '') + 'print(' + JSON.stringify(row.text) + ')')); message.classList.add('message'); nodes.push(message);
      for (const attachment of row.attachments) add((level ? '    ' : '') + '# attachment: ' + attachment.name);
      if (level === 4) add('    logger.debug("message processed")');
      if (level) add('');
      cached = { signature, nodes }; messageCache.set(row.id, cached);
    }
    lines.push(...cached.nodes);
  });
  // Only the currently displayed conversation is retained in the rendering cache.
  for (const id of messageCache.keys()) if (!keep.has(id)) messageCache.delete(id);
  if (!next.rows.length && next.canSend) lines.push(line(...syntax('# 아직 표시된 메시지가 없습니다.')));
  reconcile($('messages'), lines);
  renderedLineCount = lines.length;
  // Preserve a reader's position. New conversations open at the newest messages.
  if (stick && !isReadme) $('code').scrollTop = Math.max(0, $('messages').offsetTop + $('messages').offsetHeight - $('code').clientHeight + 32);
}
$('raw').onclick = () => showRaw(!raw);
$('account').onclick = $('remote').onclick = () => showRaw(true);
$('refresh').onclick = () => api.refresh();
$('dm').onclick = $('activity-dm').onclick = () => navigate('/channels/@me');
$('filter').oninput = renderNav;
$('search').onclick = $('command').onclick = findChannel;
$('explorer').onclick = $('toggle-sidebar').onclick = () => setSidebar(!sidebarOpen);
$('toggle-panel').onclick = $('close-panel').onclick = togglePanel;
$('terminal-tab').onclick = () => panelTab('terminal');
$('output-tab').onclick = () => panelTab('output');
$('external').onclick = () => api.external('https://discord.com' + (state?.loggedIn ? state.route : '/channels/@me'));
$('older').onclick = async () => { if (state?.loggedIn) { await api.older(state.route); await api.refresh(); } };
$('density').onclick = $('settings').onclick = () => { level = (level + 2) % 6; $('density').textContent = 'Spaces: ' + level; if (state) render(state); };
$('readme').onclick = $('close-tab').onclick = async () => { manualReadme = true; if (state) render(state); await showRaw(false); $('code').scrollTop = 0; };
$('back').onclick = () => { if (historyIndex > 0) navigate(history[--historyIndex]); };
$('forward').onclick = () => { if (historyIndex < history.length - 1) navigate(history[++historyIndex]); };
$('checked').onclick = () => { uncertain = false; $('checked').hidden = true; notice('원본 화면을 확인했습니다. 초안을 검토한 뒤 전송하세요.'); if (state) render(state); };
$('draft').oninput = () => { if (state) { if ($('draft').value) drafts.set(state.route, $('draft').value); else drafts.delete(state.route); } fitDraft(); };
$('draft').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('compose').requestSubmit(); } };
addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'p') { event.preventDefault(); findChannel(); }
  if (event.key.toLowerCase() === 'b') { event.preventDefault(); setSidebar(!sidebarOpen); }
  if (event.key.toLowerCase() === 'j') { event.preventDefault(); togglePanel(); }
});
$('compose').onsubmit = async event => {
  event.preventDefault();
  if (!state?.canSend || sending || uncertain || selectedRoute || !$('draft').value.trim()) return;
  const target = state.route, value = $('draft').value;
  sending = true; render(state); notice('디스코드 화면에서 전송을 확인 중…');
  try {
    const result = await api.send({ target, text: value });
    if (result.observed) {
      const sent = sentHistory.get(target) || []; sent.push(value); sentHistory.delete(target); sentHistory.set(target, sent.slice(-20)); if (sentHistory.size > 40) sentHistory.delete(sentHistory.keys().next().value);
      renderTerminal();
      drafts.delete(target); if (state.route === target) $('draft').value = '';
      fitDraft(); notice('새 메시지가 화면에 표시되었습니다.');
    } else {
      uncertain = true; $('checked').hidden = false;
      notice((result.error ? result.error + ' ' : '') + '전송 완료를 확인하지 못했습니다. 중복 전송을 막기 위해 잠갔습니다. 원본 화면에서 확인해 주세요.');
      await showRaw(true);
    }
  } catch (error) { uncertain = true; $('checked').hidden = false; notice(error.message + ' 원본 화면에서 확인해 주세요.'); }
  finally { sending = false; if (state) render(state); }
};
readme(); api.onState(render); api.onNotice(notice); api.refresh();
