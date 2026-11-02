const CHANNEL = /^\/channels\/(?:@me|\d+)(?:\/\d+)?$/;
function route(value) {
  if (typeof value !== 'string' || !CHANNEL.test(value)) throw new Error('올바른 디스코드 채널 주소가 아닙니다.');
  return value;
}
function allowed(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'discord.com'; } catch { return false; }
}
module.exports = { route, allowed };
