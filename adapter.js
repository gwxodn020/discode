// Only the visible Discord DOM is read. No API requests, tokens, internal stores or webpack access.
function snapshot() {
  const visible = el => !!(el && el.getClientRects().length);
  const label = el => (el.getAttribute('aria-label') || el.getAttribute('data-dnd-name') || el.querySelector('[aria-label]')?.getAttribute('aria-label') || el.textContent || '').trim();
  const links = [...document.querySelectorAll('a[href^="/channels/"]')];
  const groups = new Map();
  const channels = new Map();
  const current = location.pathname;
  for (const el of links) {
    const href = el.getAttribute('href');
    const parts = href.match(/^\/channels\/(@me|\d+)(?:\/(\d+))?$/);
    if (!parts || !visible(el)) continue;
    const name = label(el).replace(/\s+/g, ' ').slice(0, 180);
    if (!name) continue;
    if (parts[2]) channels.set(href, { path: href, name, group: parts[1] });
    else if (parts[1] !== '@me') groups.set(parts[1], { path: href, name });
  }
  // The server rail uses buttons rather than links in some Discord builds.
  for (const el of document.querySelectorAll('[data-list-item-id^="guildsnav___"]')) {
    if (!visible(el)) continue;
    const id = el.getAttribute('data-list-item-id').split('___').pop();
    if (/^\d+$/.test(id)) groups.set(id, { path: '/channels/' + id, name: label(el) || '서버 ' + id });
  }
  const rows = [];
  let author = '';
  for (const el of document.querySelectorAll('[id^="chat-messages-"]')) {
    if (!visible(el) || !el.querySelector('[id^="message-content-"], [id^="message-username-"], time, img')) continue;
    const who = el.querySelector('[id^="message-username-"], [class*="username_"]');
    if (who) author = who.textContent.trim();
    const content = el.querySelector('[id^="message-content-"]');
    const time = el.querySelector('time');
    const attachments = [...el.querySelectorAll('a[href]')].filter(a => {
      try { const u = new URL(a.href); return u.protocol === 'https:' && /(^|\.)discordapp\.(com|net)$/.test(u.hostname); } catch { return false; }
    }).map(a => ({ name: a.textContent.trim() || 'attachment', url: a.href }));
    const text = content?.textContent || '';
    if (text || attachments.length) rows.push({ id: el.id, author: author || '메시지', text, time: time?.getAttribute('datetime') || '', attachments });
  }
  const composer = [...document.querySelectorAll('[role="textbox"][contenteditable="true"][data-slate-editor="true"], [role="textbox"][contenteditable="true"]')].find(visible);
  const header = document.querySelector('section[aria-label] h1, [class*="titleWrapper_"] h1, main h1');
  return { route: current, loggedIn: current.startsWith('/channels/') && !!(composer || channels.size || groups.size || document.querySelector('[data-list-item-id="guildsnav___home"]')), servers: [...groups.values()], channels: [...channels.values()], rows, canSend: !!composer, title: header?.textContent?.trim() || document.title.replace(/ \| Discord$/, ''), composerText: composer?.textContent || '' };
}
function focusComposer(expected) {
  if (location.pathname !== expected) throw new Error('채널이 변경되었습니다. 다시 선택해 주세요.');
  const box = [...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(el => el.getClientRects().length);
  if (!box) throw new Error('이 채널에서 메시지를 작성할 수 없습니다.');
  if (box.textContent.trim()) throw new Error('디스코드 원본 화면에 작성 중인 내용이 있습니다. 먼저 확인해 주세요.');
  box.focus();
  return true;
}
function older(expected) {
  if (location.pathname !== expected) return false;
  const first = document.querySelector('[id^="chat-messages-"]');
  let parent = first?.parentElement;
  while (parent) {
    if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) { parent.scrollBy(0, -parent.clientHeight * .8); return true; }
    parent = parent.parentElement;
  }
  return false;
}
// Install once per document. A cheap read returns null until DOM, route or viewport changes.
function installWatcher(snapshotFn) {
  window.__discordCodeReader?.dispose();
  let dirty = true, previousRoute = '', viewport = '', lastRead = 0;
  const observer = new MutationObserver(() => { dirty = true; });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'contenteditable', 'hidden', 'data-list-item-id'] });
  window.__discordCodeReader = {
    read(force) {
      const dimensions = innerWidth + ':' + innerHeight;
      const now = performance.now();
      // Safety sweep catches CSS-only visibility changes and unobserved attributes.
      if (!force && !dirty && previousRoute === location.pathname && viewport === dimensions && now - lastRead < 15000) return null;
      const state = snapshotFn();
      dirty = false; previousRoute = location.pathname; viewport = dimensions; lastRead = now;
      return state;
    },
    dispose() { observer.disconnect(); },
  };
}
function readWatched(force) {
  return window.__discordCodeReader ? window.__discordCodeReader.read(force) : { installWatcher: true };
}
module.exports = { snapshot, focusComposer, older, installWatcher, readWatched };
