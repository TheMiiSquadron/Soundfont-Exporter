const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const sampleTable = document.querySelector("#sampleTable");
const statusText = document.querySelector("#statusText");
const exportButton = document.querySelector("#exportButton");
const clearButton = document.querySelector("#clearButton");
const autoMapButton = document.querySelector("#autoMapButton");
const fontNameInput = document.querySelector("#fontName");
const presetNameInput = document.querySelector("#presetName");
const bankInput = document.querySelector("#bankNumber");
const presetInput = document.querySelector("#presetNumber");
const firstKeyInput = document.querySelector("#firstKey");
const wideRangeInput = document.querySelector("#wideRangeMode");

let samples = [];
let audioContext;
let importNotice = "";

const textEncoder = new TextEncoder();
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const exportSampleRate = 44100;

populateNoteSelect(firstKeyInput, 60);

fileInput.addEventListener("change", () => importFiles(fileInput.files));

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  importFiles(event.dataTransfer.files);
});

clearButton.addEventListener("click", () => {
  samples = [];
  importNotice = "";
  render();
});

autoMapButton.addEventListener("click", () => {
  const firstKey = clampNumber(firstKeyInput.value, 0, 127, 60);
  samples = samples.map((sample, index) => {
    const key = clampNumber(firstKey + index, 0, 127, 60);
    return { ...sample, rootKey: key, lowKey: key, highKey: key };
  });
  render();
});

exportButton.addEventListener("click", async () => {
  try {
    const sf2 = buildSoundFont(samples, {
      fontName: fontNameInput.value.trim() || "Custom Soundfont",
      presetName: presetNameInput.value.trim() || "Imported Samples",
      bank: clampNumber(bankInput.value, 0, 16383, 0),
      preset: clampNumber(presetInput.value, 0, 127, 0),
      wideRange: wideRangeInput.checked,
    });
    await saveBlob(sf2, `${safeFileName(fontNameInput.value || "soundfont")}.sf2`);
  } catch (error) {
    console.error(error);
    if (error.name !== "AbortError") {
      statusText.textContent = error.message || "Could not export this soundfont.";
    }
  }
});

async function importFiles(fileList) {
  const incomingFiles = [...fileList];
  const files = incomingFiles.filter((file) => file.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aiff?|aac)$/i.test(file.name));
  if (!files.length) return;

  audioContext ||= new AudioContext();
  setBusy(`Decoding ${files.length} file${files.length === 1 ? "" : "s"}...`);

  let imported = 0;
  const skipped = incomingFiles
    .filter((file) => !files.includes(file))
    .map((file) => ({ name: file.name, reason: "not a supported audio file" }));

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(buffer.slice(0));
      const index = samples.length;
      const key = clampNumber(Number(firstKeyInput.value) + index, 0, 127, 60);
      const pcm16 = audioBufferToMonoPcm16(decoded);
      samples.push({
        id: crypto.randomUUID(),
        name: stripExtension(file.name),
        duration: pcm16.length / exportSampleRate,
        sampleRate: exportSampleRate,
        pcm16,
        rootKey: key,
        lowKey: key,
        highKey: key,
      });
      imported += 1;
      setBusy(`Decoded ${imported} of ${files.length}...`);
      render();
    } catch (error) {
      console.warn(`Skipping ${file.name}`, error);
      skipped.push({ name: file.name, reason: readableError(error) });
    }
  }

  fileInput.value = "";
  importNotice = importResultMessage(imported, skipped);
  render();
}

function audioBufferToMonoPcm16(buffer) {
  const channelCount = buffer.numberOfChannels;
  const outputLength = Math.max(64, Math.round(buffer.duration * exportSampleRate));
  const pcm = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourcePosition = (i * buffer.sampleRate) / exportSampleRate;
    const sourceIndex = Math.min(buffer.length - 1, Math.floor(sourcePosition));
    const nextIndex = Math.min(buffer.length - 1, sourceIndex + 1);
    const blend = sourcePosition - sourceIndex;
    let mixed = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      mixed += data[sourceIndex] + (data[nextIndex] - data[sourceIndex]) * blend;
    }
    mixed /= channelCount;
    const clamped = Math.max(-1, Math.min(1, mixed));
    pcm[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }

  return pcm;
}

function render() {
  sampleTable.innerHTML = "";

  if (!samples.length) {
    sampleTable.innerHTML = '<tr class="empty-row"><td colspan="6">Import WAV, MP3, OGG, FLAC, M4A, AIFF, or any browser-decodable audio.</td></tr>';
    statusText.classList.remove("busy");
    statusText.textContent = "No audio imported yet.";
  } else {
    const fragment = document.createDocumentFragment();
    samples.forEach((sample) => fragment.appendChild(renderRow(sample)));
    sampleTable.appendChild(fragment);

    const totalSeconds = samples.reduce((sum, sample) => sum + sample.duration, 0);
    statusText.classList.remove("busy");
    statusText.textContent = importNotice || `${samples.length} sample${samples.length === 1 ? "" : "s"} loaded, ${formatDuration(totalSeconds)} total.`;
    const mappingWarning = singleKeyMappingWarning();
    if (mappingWarning) statusText.textContent += ` ${mappingWarning}`;
  }

  exportButton.disabled = samples.length === 0;
  clearButton.disabled = samples.length === 0;
  autoMapButton.disabled = samples.length === 0;
}

function renderRow(sample) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><span class="sample-name" title="${escapeHtml(sample.name)}">${escapeHtml(sample.name)}</span></td>
    <td>${formatDuration(sample.duration)}</td>
    <td>${noteSelectMarkup(sample.rootKey, "rootKey")}</td>
    <td>${noteSelectMarkup(sample.lowKey, "lowKey")}</td>
    <td>${noteSelectMarkup(sample.highKey, "highKey")}</td>
    <td><button class="remove-button" type="button" title="Remove sample">x</button></td>
  `;

  row.querySelectorAll("select").forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.field;
      sample[field] = clampNumber(input.value, 0, 127, sample[field]);
      if (sample.lowKey > sample.highKey) sample.highKey = sample.lowKey;
      if (sample.rootKey < sample.lowKey) sample.rootKey = sample.lowKey;
      if (sample.rootKey > sample.highKey) sample.rootKey = sample.highKey;
      render();
    });
  });

  row.querySelector("button").addEventListener("click", () => {
    samples = samples.filter((item) => item.id !== sample.id);
    render();
  });

  return row;
}

function populateNoteSelect(select, selectedKey = 60) {
  select.innerHTML = noteOptionsMarkup(selectedKey);
}

function noteSelectMarkup(selectedKey, field) {
  return `<select class="note-input" data-field="${field}">${noteOptionsMarkup(selectedKey)}</select>`;
}

function noteOptionsMarkup(selectedKey) {
  const key = clampNumber(selectedKey, 0, 127, 60);
  return Array.from({ length: 128 }, (_, value) => {
    const selected = value === key ? " selected" : "";
    return `<option value="${value}"${selected}>${value} - ${midiNoteName(value)}</option>`;
  }).join("");
}

function midiNoteName(key) {
  return `${noteNames[key % 12]}${Math.floor(key / 12) - 1}`;
}

function buildSoundFont(sourceSamples, options) {
  if (!sourceSamples.length) throw new Error("Import at least one audio file before exporting.");
  const normalized = sourceSamples.map((sample, index) => ({
    ...sample,
    sfName: uniqueSfName(sample.name, index),
    lowKey: options.wideRange ? 0 : clampNumber(sample.lowKey, 0, 127, 60),
    highKey: options.wideRange ? 127 : clampNumber(sample.highKey, 0, 127, 60),
    rootKey: clampNumber(sample.rootKey, 0, 127, 60),
  }));

  const info = listChunk("INFO", [
    versionChunk("ifil", 2, 1),
    stringChunk("isng", "EMU8000"),
    stringChunk("INAM", sfText(options.fontName || "Custom Soundfont", 64)),
    stringChunk("ICRD", new Date().toISOString().slice(0, 10)),
    stringChunk("ICMT", "Created for FL Studio and LMMS"),
    stringChunk("ISFT", "Soundfont Exporter"),
  ]);

  const { smplChunk, sampleHeaders } = buildSampleData(normalized);
  const sdta = listChunk("sdta", [chunk("smpl", smplChunk)]);
  const pdta = buildPresetData(normalized, sampleHeaders, options);

  return new Blob([riffChunk("sfbk", [info, sdta, pdta])], { type: "audio/x-soundfont" });
}

function buildSampleData(sourceSamples) {
  const totalLength = sourceSamples.reduce((sum, sample) => sum + sample.pcm16.length + 46, 0);
  const combined = new Int16Array(totalLength);
  const sampleHeaders = [];
  let cursor = 0;

  for (const sample of sourceSamples) {
    const start = cursor;
    combined.set(sample.pcm16, cursor);
    cursor += sample.pcm16.length;
    const end = cursor;
    cursor += 46;
    const loopStart = Math.min(start + 8, Math.max(start, end - 2));
    const loopEnd = Math.min(end, loopStart + Math.max(1, Math.min(32, end - loopStart)));
    sampleHeaders.push({
      name: sample.sfName,
      start,
      end,
      startLoop: loopStart,
      endLoop: loopEnd,
      sampleRate: clampNumber(sample.sampleRate, 400, 100000, 44100),
      originalPitch: sample.rootKey,
    });
  }

  const bytes = new Uint8Array(combined.length * 2);
  const view = new DataView(bytes.buffer);
  combined.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return { smplChunk: bytes, sampleHeaders };
}

function buildPresetData(sourceSamples, sampleHeaders, options) {
  return listChunk("pdta", [
    chunk("phdr", phdrData(sourceSamples, options)),
    chunk("pbag", presetBagData()),
    chunk("pmod", terminalModulatorData()),
    chunk("pgen", presetGeneratorData()),
    chunk("inst", instData(sourceSamples, options)),
    chunk("ibag", bagData(sourceSamples.length, 3)),
    chunk("imod", terminalModulatorData()),
    chunk("igen", instrumentGeneratorData(sourceSamples)),
    chunk("shdr", shdrData(sampleHeaders)),
  ]);
}

function phdrData(sourceSamples, options) {
  const writer = new ByteWriter();
  writer.fixedString(sfText(options.presetName || "Imported Samples", 20), 20);
  writer.u16(options.preset);
  writer.u16(options.bank);
  writer.u16(0);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  writer.fixedString("EOP", 20);
  writer.u16(0);
  writer.u16(0);
  writer.u16(1);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  return writer.bytes();
}

function presetBagData() {
  const writer = new ByteWriter();
  writer.u16(0);
  writer.u16(0);
  writer.u16(1);
  writer.u16(0);
  return writer.bytes();
}

function bagData(zoneCount, generatorsPerZone = 2) {
  const writer = new ByteWriter();
  for (let i = 0; i < zoneCount; i += 1) {
    writer.u16(i * generatorsPerZone);
    writer.u16(0);
  }
  writer.u16(zoneCount * generatorsPerZone);
  writer.u16(0);
  return writer.bytes();
}

function presetGeneratorData() {
  const writer = new ByteWriter();
  writer.u16(41);
  writer.u16(0);
  return writer.bytes();
}

function instData(sourceSamples, options) {
  const writer = new ByteWriter();
  writer.fixedString(sfText(`${options.presetName || "Imported Samples"} Inst`, 20), 20);
  writer.u16(0);
  writer.fixedString("EOI", 20);
  writer.u16(sourceSamples.length);
  return writer.bytes();
}

function instrumentGeneratorData(sourceSamples) {
  const writer = new ByteWriter();
  sourceSamples.forEach((sample, index) => {
    writer.u16(43);
    writer.u16(rangeAmount(sample.lowKey, sample.highKey));
    writer.u16(58);
    writer.u16(sample.rootKey);
    writer.u16(53);
    writer.u16(index);
  });
  return writer.bytes();
}

function shdrData(headers) {
  const writer = new ByteWriter();
  headers.forEach((header) => {
    writer.fixedString(header.name, 20);
    writer.u32(header.start);
    writer.u32(header.end);
    writer.u32(header.startLoop);
    writer.u32(header.endLoop);
    writer.u32(Math.round(header.sampleRate));
    writer.u8(header.originalPitch);
    writer.i8(0);
    writer.u16(0);
    writer.u16(1);
  });
  writer.fixedString("EOS", 20);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  writer.u8(0);
  writer.i8(0);
  writer.u16(0);
  writer.u16(0);
  return writer.bytes();
}

function terminalModulatorData() {
  return new Uint8Array(10);
}

function riffChunk(type, children) {
  return withHeader("RIFF", concat([ascii(type), ...children]));
}

function listChunk(type, children) {
  return withHeader("LIST", concat([ascii(type), ...children]));
}

function chunk(id, data) {
  return withHeader(id, data);
}

function stringChunk(id, value) {
  const text = textEncoder.encode(sfText(value, 255));
  const dataLength = text.byteLength + 1;
  const data = new Uint8Array(dataLength + (dataLength % 2));
  data.set(text, 0);
  return chunk(id, data);
}

function versionChunk(id, major, minor) {
  const writer = new ByteWriter();
  writer.u16(major);
  writer.u16(minor);
  return chunk(id, writer.bytes());
}

function withHeader(id, data) {
  const paddedSize = data.byteLength + (data.byteLength % 2);
  const output = new Uint8Array(8 + paddedSize);
  output.set(ascii(id), 0);
  new DataView(output.buffer).setUint32(4, data.byteLength, true);
  output.set(data, 8);
  return output;
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.byteLength + (part.byteLength % 2), 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength + (part.byteLength % 2);
  }
  return output;
}

function ascii(value) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function rangeAmount(low, high) {
  return (clampNumber(high, 0, 127, 127) << 8) | clampNumber(low, 0, 127, 0);
}

function uniqueSfName(name, index) {
  const base = sfText(stripExtension(name), 16) || `Sample ${index + 1}`;
  return `${index + 1}_${base}`.slice(0, 20);
}

function sfText(value, maxLength) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

function safeFileName(name) {
  return (name.trim() || "soundfont").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function importResultMessage(imported, skipped) {
  if (!skipped.length) return "";
  const firstSkipped = skipped[0];
  const importedText = `${imported} imported`;
  const skippedText = `${skipped.length} skipped`;
  return `${importedText}, ${skippedText}. First skipped: ${firstSkipped.name} (${firstSkipped.reason}).`;
}

function readableError(error) {
  if (error?.message) return error.message;
  if (error?.name) return error.name;
  return "browser could not decode it";
}

function singleKeyMappingWarning() {
  if (!samples.length || wideRangeInput.checked) return "";
  const firstKey = clampNumber(firstKeyInput.value, 0, 127, 60);
  const uniqueKeys = 128 - firstKey;
  if (samples.length <= uniqueKeys) return "";
  return `Only ${uniqueKeys} samples can get unique single-key mappings from ${midiNoteName(firstKey)} upward; later samples share MIDI 127 unless remapped.`;
}

function setBusy(message) {
  statusText.classList.add("busy");
  statusText.textContent = message;
}

async function saveBlob(blob, fileName) {
  if ("showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: "SoundFont 2 file",
          accept: { "audio/x-soundfont": [".sf2"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    statusText.classList.remove("busy");
    statusText.textContent = `Saved ${fileName}.`;
    return;
  }

  downloadBlob(blob, fileName);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class ByteWriter {
  constructor() {
    this.bytesArray = [];
  }

  u8(value) {
    this.bytesArray.push(value & 0xff);
  }

  i8(value) {
    this.u8(value);
  }

  u16(value) {
    this.bytesArray.push(value & 0xff, (value >> 8) & 0xff);
  }

  u32(value) {
    this.bytesArray.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
  }

  fixedString(value, length) {
    const bytes = textEncoder.encode(value.slice(0, length - 1));
    for (let i = 0; i < length; i += 1) {
      this.u8(bytes[i] || 0);
    }
  }

  bytes() {
    return Uint8Array.from(this.bytesArray);
  }
}

render();
