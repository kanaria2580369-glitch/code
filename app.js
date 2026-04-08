const MAGIC_PART = strBytes('Z2WAVP');
const MAGIC_FULL = strBytes('Z2WAV1');
const VERSION = 0x0001;
const CHUNK_SIZE = 4 * 1024 * 1024;

const fileInput = document.getElementById('fileInput');
const partSizeInput = document.getElementById('partSize');
const convertBtn = document.getElementById('convertBtn');
const progressEl = document.getElementById('progress');
const logEl = document.getElementById('log');
const envInfoEl = document.getElementById('envInfo');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hasFsApi = typeof window.showSaveFilePicker === 'function';

if (isIOS) {
  partSizeInput.value = '256';
  envInfoEl.textContent = 'iOS検出: Blob方式のみ。推奨パートサイズを256MBに自動設定しました。';
} else if (!hasFsApi) {
  partSizeInput.value = '512';
  envInfoEl.textContent = 'File System Access API非対応: Blob方式で出力します（推奨512MB）。';
} else {
  envInfoEl.textContent = 'Desktopストリーミング対応環境: 大容量処理に適しています。';
}

convertBtn.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    appendLog('入力ファイルを選択してください。');
    return;
  }

  const partSizeMb = Number(partSizeInput.value);
  if (!Number.isFinite(partSizeMb) || partSizeMb < 32) {
    appendLog('パートサイズは32MB以上で指定してください。');
    return;
  }

  convertBtn.disabled = true;
  progressEl.value = 0;
  logEl.textContent = '';

  try {
    const partSize = partSizeMb * 1024 * 1024;
    appendLog(`変換開始: ${file.name} (${formatBytes(file.size)})`);
    const parts = await createZ2WavParts(file, partSize, (p, msg) => {
      progressEl.value = p;
      appendLog(msg);
    });

    for (let i = 0; i < parts.length; i += 1) {
      downloadBlob(parts[i], `${file.name}.part${String(i + 1).padStart(3, '0')}.wav`);
    }

    progressEl.value = 100;
    appendLog(`完了: ${parts.length} 個のWAVを生成しました。`);
  } catch (error) {
    appendLog(`失敗: ${error.message}`);
    console.error(error);
  } finally {
    convertBtn.disabled = false;
  }
});

async function createZ2WavParts(file, partSize, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
  const totalParts = Math.ceil(bytes.length / partSize);
  const wholeSha = await sha256(bytes);

  const chunksByPart = [];
  for (let p = 0; p < totalParts; p += 1) {
    const start = p * partSize;
    const end = Math.min(bytes.length, (p + 1) * partSize);
    const partRaw = bytes.subarray(start, end);
    chunksByPart.push(sliceChunks(partRaw, start));
  }

  const indexBody = buildIndex(chunksByPart.flat());
  const parts = [];
  let processed = 0;

  for (let p = 0; p < totalParts; p += 1) {
    const chunks = chunksByPart[p];
    const chunkBytes = concat(chunks.map(encodeChunk));
    const fullHeader = p === 0
      ? buildFullHeader({ zipSize: bytes.length, chunkCount: totalChunks, wholeSha, indexOffset: bytes.length, flags: 0 })
      : new Uint8Array(0);
    const index = p === totalParts - 1 ? indexBody : new Uint8Array(0);

    const body = concat([fullHeader, chunkBytes, index]);
    const partHeader = buildPartHeader({
      partIndex: p,
      partTotal: totalParts,
      globalOffset: p * partSize,
      partSize: body.length,
      partSha: new Uint8Array(32),
    });

    const partSha = await sha256(concat([partHeader, body]));
    const finalizedPartHeader = buildPartHeader({
      partIndex: p,
      partTotal: totalParts,
      globalOffset: p * partSize,
      partSize: body.length,
      partSha,
    });

    const payload = concat([finalizedPartHeader, body]);
    parts.push(wrapWav(payload));

    processed += chunks.length;
    const percent = Math.round((processed / totalChunks) * 100);
    onProgress(percent, `part ${p + 1}/${totalParts} を生成`);
  }

  return parts;
}

function sliceChunks(partRaw, globalStart) {
  const chunks = [];
  for (let i = 0; i < partRaw.length; i += CHUNK_SIZE) {
    const data = partRaw.subarray(i, Math.min(partRaw.length, i + CHUNK_SIZE));
    chunks.push({ id: Math.floor((globalStart + i) / CHUNK_SIZE), offset: globalStart + i, size: data.length, data });
  }
  return chunks;
}

function encodeChunk(chunk) {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, chunk.id, true);
  view.setUint32(4, chunk.size, true);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(chunk.data), true);
  return concat([header, chunk.data, crc]);
}

function buildPartHeader({ partIndex, partTotal, globalOffset, partSize, partSha }) {
  const out = new Uint8Array(64);
  out.set(MAGIC_PART, 0);
  const view = new DataView(out.buffer);
  view.setUint16(6, VERSION, true);
  view.setUint32(8, partIndex, true);
  view.setUint32(12, partTotal, true);
  view.setBigUint64(16, BigInt(globalOffset), true);
  view.setBigUint64(24, BigInt(partSize), true);
  out.set(partSha, 32);
  return out;
}

function buildFullHeader({ zipSize, chunkCount, wholeSha, indexOffset, flags }) {
  const out = new Uint8Array(72);
  out.set(MAGIC_FULL, 0);
  const view = new DataView(out.buffer);
  view.setUint16(6, VERSION, true);
  view.setBigUint64(8, BigInt(zipSize), true);
  view.setBigUint64(16, BigInt(chunkCount), true);
  out.set(wholeSha, 24);
  view.setBigUint64(56, BigInt(indexOffset), true);
  view.setBigUint64(64, BigInt(flags), true);
  return out;
}

function buildIndex(chunks) {
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, chunks.length, true);
  const entries = chunks.map((chunk) => {
    const row = new Uint8Array(16);
    const view = new DataView(row.buffer);
    view.setUint32(0, chunk.id, true);
    view.setBigUint64(4, BigInt(chunk.offset), true);
    view.setUint32(12, chunk.size, true);
    return row;
  });
  return concat([head, ...entries]);
}

function wrapWav(payload) {
  const fmtChunk = new Uint8Array(24);
  const fmtView = new DataView(fmtChunk.buffer);
  fmtChunk.set(strBytes('fmt '), 0);
  fmtView.setUint32(4, 16, true);
  fmtView.setUint16(8, 1, true);
  fmtView.setUint16(10, 1, true);
  fmtView.setUint32(12, 48000, true);
  fmtView.setUint32(16, 96000, true);
  fmtView.setUint16(20, 2, true);
  fmtView.setUint16(22, 16, true);

  const dataHeader = new Uint8Array(8);
  dataHeader.set(strBytes('data'), 0);
  new DataView(dataHeader.buffer).setUint32(4, payload.length, true);

  const riffHeader = new Uint8Array(12);
  riffHeader.set(strBytes('RIFF'), 0);
  new DataView(riffHeader.buffer).setUint32(4, 4 + fmtChunk.length + dataHeader.length + payload.length, true);
  riffHeader.set(strBytes('WAVE'), 8);

  return new Blob([riffHeader, fmtChunk, dataHeader, payload], { type: 'audio/wav' });
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

function strBytes(s) {
  return new TextEncoder().encode(s);
}

function concat(arrays) {
  const size = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  arrays.forEach((arr) => {
    out.set(arr, offset);
    offset += arr.length;
  });
  return out;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
