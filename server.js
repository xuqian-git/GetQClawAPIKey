const crypto = require('crypto');
const jpeg = require('jpeg-js');

const JPRX_BASE_URL = 'https://jprx.m.qq.com';
const WX_BASE_URL = 'https://open.weixin.qq.com';
const WX_LONGPOLL_BASE_URL = 'https://long.open.weixin.qq.com';
const APP_VERSION = '1.4.0';
const APP_ENV = 'release';
const POLL_INTERVAL_MS = 2000;

const WX_LOGIN_INFO = {
  appid: 'wx9d11056dd75b7240',
  redirectUri: 'https://security.guanjia.qq.com/login',
};

function timestamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function log(message) {
  process.stdout.write(`[${timestamp()}] ${message}\n`);
}

function flattenCandidates(input, out = []) {
  if (input == null) {
    return out;
  }
  out.push(input);
  if (Array.isArray(input)) {
    for (const item of input) {
      flattenCandidates(item, out);
    }
    return out;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input)) {
      flattenCandidates(value, out);
    }
  }
  return out;
}

function firstString(...candidates) {
  for (const candidate of flattenCandidates(candidates)) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function firstObject(...candidates) {
  for (const candidate of flattenCandidates(candidates)) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function normalizeJprxResponse(raw, response) {
  const nestedCode =
    raw?.data?.resp?.common?.code ??
    raw?.data?.common?.code ??
    raw?.resp?.common?.code ??
    raw?.common?.code;
  const nestedMessage =
    raw?.data?.resp?.common?.message ??
    raw?.data?.common?.message ??
    raw?.resp?.common?.message ??
    raw?.common?.message ??
    raw?.message ??
    response.statusText;

  if (!response.ok) {
    return {
      success: false,
      code: response.status,
      message: nestedMessage || `HTTP ${response.status}`,
      data: raw,
      raw,
    };
  }

  const ret = raw?.ret;
  const data =
    raw?.data?.resp?.data ??
    raw?.data?.data ??
    raw?.resp?.data ??
    raw?.data ??
    raw;

  if (ret === 0 && (nestedCode == null || nestedCode === 0)) {
    return {
      success: true,
      code: 0,
      message: 'Success',
      data,
      raw,
    };
  }

  return {
    success: false,
    code: nestedCode ?? ret ?? response.status,
    message: nestedMessage || '业务请求失败',
    data,
    raw,
  };
}

async function postJprx(endpoint, payload, session) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Version': '1',
    'X-Token': session.loginKey || '',
    'X-Guid': session.guid || '1',
    'X-Account': session.userId || '1',
    'X-Session': '',
  };

  if (session.jwtToken) {
    headers['X-OpenClaw-Token'] = session.jwtToken;
  }

  const requestBody = {
    ...payload,
    web_version: APP_VERSION,
    web_env: APP_ENV,
  };

  const response = await fetch(`${JPRX_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  const headerJwt = response.headers.get('x-new-token') || response.headers.get('X-New-Token') || '';
  if (headerJwt) {
    session.jwtToken = headerJwt;
  }

  let raw = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }

  return normalizeJprxResponse(raw, response);
}

function mapUserInfo(rawUserInfo, fallbackGuid) {
  const source = rawUserInfo && typeof rawUserInfo === 'object' ? rawUserInfo : {};
  return {
    nickname: firstString(source.nickname, source.nick_name),
    avatar: firstString(source.avatar, source.avatar_url, source.head_img_url, source.head_img),
    guid: firstString(source.guid, fallbackGuid),
    userId: firstString(source.userId, source.user_id),
    ...source,
  };
}

function applyLoginContext(session, result) {
  const bodyToken = firstString(
    result.data?.token,
    result.raw?.data?.resp?.data?.token,
    result.raw?.data?.data?.token,
    result.raw?.resp?.data?.token
  );

  const rawUserInfo =
    firstObject(
      result.data?.userInfo,
      result.data?.user_info,
      result.raw?.data?.userInfo,
      result.raw?.data?.user_info,
      result.raw?.data?.resp?.data?.userInfo,
      result.raw?.data?.resp?.data?.user_info,
      result.raw?.data?.data?.userInfo,
      result.raw?.data?.data?.user_info,
      result.raw?.resp?.data?.userInfo,
      result.raw?.resp?.data?.user_info
    ) || {};

  const userInfo = mapUserInfo(rawUserInfo, session.guid);
  const userId = firstString(
    userInfo.userId,
    userInfo.user_id,
    result.data?.userId,
    result.data?.user_id
  );
  const guid = firstString(
    userInfo.guid,
    result.data?.guid,
    result.data?.user_guid,
    session.guid
  );
  const loginKey = firstString(
    userInfo.loginKey,
    userInfo.login_key,
    result.data?.loginKey,
    result.data?.login_key,
    result.raw?.data?.loginKey,
    result.raw?.data?.login_key,
    result.raw?.data?.resp?.data?.loginKey,
    result.raw?.data?.resp?.data?.login_key
  );
  const openclawChannelToken = firstString(
    result.data?.openclawChannelToken,
    result.data?.openclaw_channel_token,
    result.raw?.data?.resp?.data?.openclawChannelToken,
    result.raw?.data?.resp?.data?.openclaw_channel_token,
    result.raw?.data?.data?.openclawChannelToken,
    result.raw?.data?.data?.openclaw_channel_token
  );

  session.userInfo = userInfo;
  session.userId = userId || session.userId || '';
  session.guid = guid || session.guid || '';
  session.loginKey = loginKey || session.loginKey || '';
  session.jwtToken = bodyToken || session.jwtToken || '';
  session.openclawChannelToken = openclawChannelToken || session.openclawChannelToken || '';
}

function buildQrConnectUrl(state) {
  const redirectUri = encodeURIComponent(WX_LOGIN_INFO.redirectUri);
  return `${WX_BASE_URL}/connect/qrconnect?appid=${WX_LOGIN_INFO.appid}&scope=snsapi_login&redirect_uri=${redirectUri}&state=${state}&login_type=jssdk&self_redirect=true&style=white`;
}

async function fetchQrChallenge(session) {
  session.guid = crypto.randomUUID();
  session.state = '';
  session.uuid = '';
  session.loginKey = '';
  session.userId = '';
  session.userInfo = null;
  session.jwtToken = '';
  session.openclawChannelToken = '';
  session.apiKey = '';

  log('正在请求登录 state...');
  const stateResult = await postJprx('/data/4050/forward', { guid: session.guid }, session);
  if (!stateResult.success) {
    throw new Error(`获取登录 state 失败: ${stateResult.message}`);
  }

  const state = firstString(stateResult.data?.state);
  if (!state) {
    throw new Error('获取登录 state 失败: 响应里没有 state');
  }

  session.state = state;

  const qrPageUrl = buildQrConnectUrl(state);
  log('正在获取微信二维码页面...');
  const html = await fetch(qrPageUrl).then((response) => response.text());

  const uuid =
    html.match(/\/connect\/qrcode\/([A-Za-z0-9]+)/)?.[1] ||
    html.match(/var G="([A-Za-z0-9]+)"/)?.[1] ||
    '';

  if (!uuid) {
    throw new Error('解析二维码 uuid 失败');
  }

  session.uuid = uuid;
  return { state, uuid, qrPageUrl };
}

function decodeJpegToBinaryMatrix(buffer) {
  const image = jpeg.decode(buffer, { useTArray: true });
  const { width, height, data } = image;
  const rowBits = [];
  const y = Math.floor(height / 2);

  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const gray = data[index];
    rowBits.push(gray < 128 ? 1 : 0);
  }

  const runs = [];
  let current = rowBits[0];
  let count = 1;
  for (let i = 1; i < rowBits.length; i += 1) {
    if (rowBits[i] === current) {
      count += 1;
    } else {
      runs.push(count);
      current = rowBits[i];
      count = 1;
    }
  }
  runs.push(count);

  let moduleSize = runs[0] || 1;
  for (const run of runs.slice(1)) {
    moduleSize = gcd(moduleSize, run);
  }

  if (moduleSize < 2 || width % moduleSize !== 0 || height % moduleSize !== 0) {
    throw new Error(`二维码模块尺寸识别失败: moduleSize=${moduleSize}, width=${width}, height=${height}`);
  }

  const moduleCountX = width / moduleSize;
  const moduleCountY = height / moduleSize;
  const matrix = [];

  for (let my = 0; my < moduleCountY; my += 1) {
    const row = [];
    for (let mx = 0; mx < moduleCountX; mx += 1) {
      const sampleX = Math.min(width - 1, mx * moduleSize + Math.floor(moduleSize / 2));
      const sampleY = Math.min(height - 1, my * moduleSize + Math.floor(moduleSize / 2));
      const index = (sampleY * width + sampleX) * 4;
      const gray = data[index];
      row.push(gray < 128);
    }
    matrix.push(row);
  }

  return matrix;
}

function trimQrMatrix(matrix, padding = 1) {
  let top = 0;
  let bottom = matrix.length - 1;
  let left = 0;
  let right = matrix[0]?.length - 1 || 0;

  while (top <= bottom && matrix[top].every((cell) => !cell)) {
    top += 1;
  }
  while (bottom >= top && matrix[bottom].every((cell) => !cell)) {
    bottom -= 1;
  }
  while (left <= right && matrix.every((row) => !row[left])) {
    left += 1;
  }
  while (right >= left && matrix.every((row) => !row[right])) {
    right -= 1;
  }

  const cropped = matrix
    .slice(top, bottom + 1)
    .map((row) => row.slice(left, right + 1));

  const width = cropped[0]?.length || 0;
  const emptyRow = new Array(width + padding * 2).fill(false);
  const padded = cropped.map((row) => [
    ...new Array(padding).fill(false),
    ...row,
    ...new Array(padding).fill(false),
  ]);

  return [
    ...new Array(padding).fill(null).map(() => emptyRow.slice()),
    ...padded,
    ...new Array(padding).fill(null).map(() => emptyRow.slice()),
  ];
}

function renderQrMatrix(matrix) {
  const compactMatrix = trimQrMatrix(matrix, 1);
  const lines = [];

  for (let y = 0; y < compactMatrix.length; y += 2) {
    const topRow = compactMatrix[y];
    const bottomRow = compactMatrix[y + 1] || new Array(topRow.length).fill(false);
    let line = '';

    for (let x = 0; x < topRow.length; x += 1) {
      const top = topRow[x];
      const bottom = bottomRow[x];
      if (top && bottom) {
        line += '█';
      } else if (top) {
        line += '▀';
      } else if (bottom) {
        line += '▄';
      } else {
        line += ' ';
      }
    }

    lines.push(line);
  }

  return `\n${lines.join('\n')}\n`;
}

async function printQrCode(uuid) {
  log(`正在下载二维码图片，uuid=${uuid}`);
  const imageBuffer = Buffer.from(await fetch(`${WX_BASE_URL}/connect/qrcode/${uuid}`).then((response) => response.arrayBuffer()));
  const matrix = decodeJpegToBinaryMatrix(imageBuffer);
  process.stdout.write(renderQrMatrix(matrix));
}

function parseLongPollScript(script) {
  const errcode = Number(script.match(/window\.wx_errcode=(\d+)/)?.[1] || NaN);
  const code = script.match(/window\.wx_code='([^']*)'/)?.[1] || '';
  return { errcode, code };
}

async function waitForWxCode(uuid) {
  log('开始轮询扫码状态...');
  let last = '';

  while (true) {
    const script = await fetch(`${WX_LONGPOLL_BASE_URL}/connect/l/qrconnect?uuid=${uuid}${last ? `&last=${last}` : ''}`).then((response) => response.text());
    const { errcode, code } = parseLongPollScript(script);

    if (errcode === 404) {
      log('二维码已扫描，等待微信里点击允许...');
      last = String(errcode);
      await sleep(100);
      continue;
    }

    if (errcode === 403) {
      log('用户取消了本次登录，继续等待下一次扫描...');
      last = String(errcode);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (errcode === 408) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (errcode === 402) {
      throw new Error('二维码已过期');
    }

    if (errcode === 405 && code) {
      log('微信确认完成，已拿到登录 code。');
      return code;
    }

    if (!Number.isNaN(errcode)) {
      log(`收到未处理的微信状态码: ${errcode}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    throw new Error(`解析微信轮询响应失败: ${script.slice(0, 120)}`);
  }
}

async function completeLogin(session, code) {
  log('正在调用 4026 换取登录态...');
  const callbackResult = await postJprx('/data/4026/forward', {
    guid: session.guid,
    state: session.state,
    code,
  }, session);

  if (!callbackResult.success) {
    throw new Error(`登录回调失败: ${callbackResult.message}`);
  }

  applyLoginContext(session, callbackResult);

  if ((!session.userInfo || !session.userInfo.userId) && session.guid) {
    log('4026 未返回完整 user_info，补调 4027...');
    const userInfoResult = await postJprx('/data/4027/forward', { guid: session.guid }, session);
    if (userInfoResult.success) {
      applyLoginContext(session, userInfoResult);
    }
  }

  if (!session.openclawChannelToken) {
    log('当前没有 openclaw_channel_token，补调 4058...');
    const channelTokenResult = await postJprx('/data/4058/forward', {}, session);
    if (channelTokenResult.success) {
      applyLoginContext(session, channelTokenResult);
    }
  }

  log(
    `登录成功，loginKey=${session.loginKey ? 'yes' : 'no'}，jwt=${session.jwtToken ? 'yes' : 'no'}，channelToken=${session.openclawChannelToken ? 'yes' : 'no'}。`
  );
}

async function fetchApiKey(session) {
  log('正在调用 4055 获取 apiKey...');
  const apiKeyResult = await postJprx('/data/4055/forward', {}, session);
  if (!apiKeyResult.success) {
    throw new Error(`获取 apiKey 失败: ${apiKeyResult.message}`);
  }

  const apiKey = firstString(
    apiKeyResult.data?.key,
    apiKeyResult.raw?.data?.key,
    apiKeyResult.raw?.data?.resp?.data?.key,
    apiKeyResult.raw?.resp?.data?.key
  );

  if (!apiKey) {
    throw new Error('4055 返回成功，但响应里没有 key');
  }

  session.apiKey = apiKey;
  return apiKey;
}

function printApiKey(apiKey) {
  process.stdout.write('\n');
  log('apiKey 获取成功。');
  process.stdout.write(`${apiKey}\n\n`);
  process.stdout.write(
    `curl 'https://mmgrcalltoken.3g.qq.com/aizone/v1/chat/completions' \\\n` +
      `  -H 'Authorization: Bearer ${apiKey}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -d '{\n` +
      `    "model": "modelroute",\n` +
      `    "messages": [\n` +
      `      { "role": "user", "content": "hi" }\n` +
      `    ],\n` +
      `    "max_tokens": 10000\n` +
      `  }'\n`
  );
}

async function run() {
  const session = {};

  process.on('SIGINT', () => {
    process.stdout.write('\n');
    log('已中断。');
    process.exit(130);
  });

  while (true) {
    try {
      const { uuid } = await fetchQrChallenge(session);
      log(`guid=${session.guid}`);
      log(`state=${session.state}`);
      log('请使用微信扫描下面的二维码：');
      await printQrCode(uuid);

      const code = await waitForWxCode(uuid);
      await completeLogin(session, code);
      const apiKey = await fetchApiKey(session);
      printApiKey(apiKey);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(message);

      if (message.includes('二维码已过期')) {
        log('正在重新生成二维码...');
        continue;
      }

      process.exitCode = 1;
      return;
    }
  }
}

run();
