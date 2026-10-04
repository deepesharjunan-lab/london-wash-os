// Chrome and Edge record voice notes as WebM/Opus, which WhatsApp doesn't
// accept; WhatsApp wants Ogg/Opus. The audio inside is the same, so this
// re-packs the Opus packets from WebM into an Ogg file (no re-encoding).
// Safari (audio/mp4) and Firefox (audio/ogg) recordings are sent as they are.

const ID = {
  SEGMENT: 0x18538067,
  CLUSTER: 0x1f43b675,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  AUDIO: 0xe1,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  SIMPLE_BLOCK: 0xa3,
  CODEC_PRIVATE: 0x63a2,
  CHANNELS: 0x9f,
  SAMPLING_FREQUENCY: 0xb5,
};
// Elements we step into rather than skip (their size may be "unknown" in live recordings).
const CONTAINERS = new Set([ID.SEGMENT, ID.CLUSTER, ID.TRACKS, ID.TRACK_ENTRY, ID.AUDIO, ID.BLOCK_GROUP]);

function readVint(b: Uint8Array, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || pos + length > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = (first & (0xff >> length)) === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function parseWebm(b: Uint8Array) {
  const packets: Uint8Array[] = [];
  let codecPrivate: Uint8Array | null = null;
  let channels = 1;
  let rate = 48000;
  let pos = 0;
  while (pos < b.length) {
    const id = readVint(b, pos, true);
    if (!id) break;
    const size = readVint(b, pos + id.length, false);
    if (!size) break;
    const start = pos + id.length + size.length;
    if (CONTAINERS.has(id.value)) {
      pos = start; // step inside
      continue;
    }
    if (size.unknown) break;
    const end = Math.min(start + size.value, b.length);
    const data = b.subarray(start, end);
    if (id.value === ID.CODEC_PRIVATE) codecPrivate = data.slice();
    else if (id.value === ID.CHANNELS) channels = data[0] || 1;
    else if (id.value === ID.SAMPLING_FREQUENCY) {
      const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
      rate = data.byteLength === 4 ? Math.round(v.getFloat32(0)) : data.byteLength === 8 ? Math.round(v.getFloat64(0)) : rate;
    } else if (id.value === ID.SIMPLE_BLOCK || id.value === ID.BLOCK) {
      const track = readVint(data, 0, false);
      if (track) {
        const flags = data[track.length + 2];
        if (((flags >> 1) & 3) === 0) packets.push(data.slice(track.length + 3)); // no lacing (what MediaRecorder writes)
      }
    }
    pos = end;
  }
  return { packets, codecPrivate, channels, rate };
}

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte. */
function opusSamples(p: Uint8Array): number {
  if (!p.length) return 0;
  const toc = p[0];
  const config = toc >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const c = toc & 3;
  const frames = c === 0 ? 1 : c === 3 ? (p[1] ?? 0) & 0x3f : 2;
  return Math.round(ms * 48) * frames;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function oggPage(packet: Uint8Array, granule: number, serial: number, seq: number, headerType: number): Uint8Array {
  const lacing: number[] = [];
  let left = packet.length;
  while (left >= 255) {
    lacing.push(255);
    left -= 255;
  }
  lacing.push(left);
  const page = new Uint8Array(27 + lacing.length + packet.length);
  const v = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0;
  page[5] = headerType;
  v.setUint32(6, granule % 0x100000000, true);
  v.setUint32(10, Math.floor(granule / 0x100000000), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  page.set(packet, 27 + lacing.length);
  let crc = 0;
  for (let i = 0; i < page.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
  v.setUint32(22, crc, true);
  return page;
}

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));

/** Converts a WebM/Opus recording into an Ogg/Opus file. Returns null if it isn't one. */
export async function webmOpusToOgg(blob: Blob): Promise<Blob | null> {
  const { packets, codecPrivate, channels, rate } = parseWebm(new Uint8Array(await blob.arrayBuffer()));
  if (!packets.length) return null;

  let head: Uint8Array;
  if (codecPrivate && codecPrivate.length >= 19 && String.fromCharCode(...codecPrivate.subarray(0, 8)) === "OpusHead") {
    head = codecPrivate;
  } else {
    head = new Uint8Array(19);
    const hv = new DataView(head.buffer);
    head.set(ascii("OpusHead"), 0);
    head[8] = 1; // version
    head[9] = channels;
    hv.setUint16(10, 312, true); // pre-skip
    hv.setUint32(12, rate, true);
    hv.setInt16(16, 0, true); // gain
    head[18] = 0; // mapping family
  }
  const vendor = ascii("London Wash OS");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(ascii("OpusTags"), 0);
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12); // comment count stays 0

  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [oggPage(head, 0, serial, 0, 0x02), oggPage(tags, 0, serial, 1, 0)];
  let granule = 0;
  packets.forEach((p, i) => {
    granule += opusSamples(p);
    pages.push(oggPage(p, granule, serial, i + 2, i === packets.length - 1 ? 0x04 : 0));
  });
  return new Blob(pages as BlobPart[], { type: "audio/ogg; codecs=opus" });
}
