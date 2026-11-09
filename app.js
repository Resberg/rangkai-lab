"use strict";

const $ = id => document.getElementById(id);
const grid = 24;
const toolList = [
  ["select", "Pilih", "M4 2l14 8-7 1-3 6z"],
  ["wire", "Kabel", "M2 13h9V5h9"],
  ["resistor", "Resistor", "M1 9h4l2-5 3 10 3-10 3 10 2-5h3"],
  ["capacitor", "Kapasitor", "M1 9h7m0-6v12m5-12v12m0-6h8"],
  ["inductor", "Induktor", "M1 10h2a3 3 0 0 1 6 0 3 3 0 0 1 6 0 3 3 0 0 1 6 0"],
  ["ammeter", "Amperemeter", "M0 9h4m14 0h4M18 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0M8 13l3-8 3 8m-5-3h4"],
  ["voltage", "Sumber V", "M1 9h6m0-7v14m6-11v8m0-4h8"],
  ["current", "Sumber A", "M0 9h4m13 0h5M17 9a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M7 9h7m-3-3 3 3-3 3"],
  ["probe", "Ukur A–B", "M3 14l4-4m-2 6 4-4m-2-2 3 3 4-4-3-3zM14 9l5-5"],
  ["erase", "Hapus", "M4 6h14M9 6V3h4v3m3 0-1 10H7L6 6m3 2v5m4-5v5"]
];
const prefix = { wire: "K", resistor: "R", capacitor: "C", inductor: "L", ammeter: "AM", voltage: "V", current: "I" };
const units = { resistor: "Ω", capacitor: "F", inductor: "H", voltage: "V", current: "A" };
const initial = { resistor: 100, capacitor: 0.000001, inductor: 0.01, voltage: 6, current: 0.02 };
const isSource = type => type === "voltage" || type === "current";
const number = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 6 });
const fmt = value => number.format(Object.is(value, -0) ? 0 : value);
const amp = value => value !== 0 && Math.abs(value) < 1 ? `${fmt(value * 1000)} mA` : `${fmt(value)} A`;
const phaseOf = ([real, imag]) => Math.atan2(imag || 0, real || 0) * 180 / Math.PI;
const phasor = (value, unit) => {
  if (!value) return "tak terdefinisi";
  const rms = Circuit.magnitude(value);
  return rms ? `${fmt(rms)} ∠ ${fmt(phaseOf(value))}° ${unit}` : `0 ${unit}`;
};
const partValue = (type, value) => {
  if (type === "capacitor" && value < 0.001) return `${fmt(value * 1e6)} µF`;
  if (type === "inductor" && value < 1) return `${fmt(value * 1e3)} mH`;
  return `${fmt(value)} ${units[type]}`;
};
const bypassExplanation = "Kedua terminal terhubung melalui kabel ideal dan berada pada simpul yang sama. Arus yang terbagi antara kabel dan cabang ideal ini tidak bisa ditentukan secara unik.";
const pointEquals = (a, b) => Circuit.key(a) === Circuit.key(b);
const mathOptions = { trust: false, maxSize: 12, maxExpand: 300, throwOnError: true };
const tex = String.raw;
const texNumber = value => fmt(value).replaceAll(".", "").replace(",", "{,}");
const equation = (expression, latex) => {
  if (latex && window.katex) {
    return `<span class="formula">${window.katex.renderToString(latex, mathOptions)}</span>`;
  }
  return `<span class="formula">${expression}</span>`;
};
let parts = [];
let history = [];
let tool = "select";
let anchor = null;
let cursor = [8, 5];
let pointerStart = null;
let keyboard = false;
let selected = null;
let solution = null;
let probes = [];
let probeRoute = [];
let savedMeasurements = [];
let targetName = "";

function makePart(type, a, b, value = initial[type]) {
  let index = 1;
  while (parts.some(part => part.name === prefix[type] + index)) index++;
  return { name: prefix[type] + index, type, a, b, value };
}

function loadExample(example) {
  checkpoint();
  parts = [];
  probes = [];
  savedMeasurements = [];
  targetName = "";
  $("mode").value = example === "rlc" ? "ac" : "dc";
  $("frequency").value = "1000";
  $("measurement").value = "";
  $("measurement-phase").value = "0";
  $("quantity").value = "v";
  const add = (type, a, b, value) => parts.push(makePart(type, a, b, value));
  if (example !== "blank") {
    if (example === "current") add("current", [7, 12], [7, 5], 0.02);
    else add("voltage", [7, 5], [7, 12], 6);
    if (["series", "unknown", "multi", "rlc"].includes(example)) {
      add("wire", [7, 5], [11, 5]);
      add("resistor", [11, 5], [16, 5], 100);
      if (example === "multi") parts.at(-1).unknown = true;
      if (example === "rlc") {
        add("inductor", [16, 5], [22, 5], 0.01);
        add("capacitor", [24, 5], [24, 12], 0.000001);
      } else {
        add("resistor", [16, 5], [22, 5], 200);
        if (example === "unknown" || example === "multi") parts.at(-1).unknown = true;
        add("wire", [24, 5], [24, 12]);
      }
      add("wire", [22, 5], [24, 5]);
      add("wire", [24, 12], [7, 12]);
    } else {
      add("wire", [7, 5], [24, 5]);
      add("resistor", [24, 5], [24, 12], 100);
      add("wire", [24, 12], [7, 12]);
      if (example === "parallel") add("resistor", [16, 5], [16, 12], 200);
    }
  }
  anchor = null;
  selectPart(null);
  setTool("select");
  if (example === "multi") {
    savedMeasurements = ["R1", "R2"].flatMap(target => [
      { target, name: "R1", quantity: "i", value: 0.02, phase: 0 },
      { target, name: "R1", quantity: "v", value: 2, phase: 0 }
    ]);
  }
  syncSettings();
  if (example === "unknown") {
    $("observed-part").value = "R1";
    $("measurement").value = "2";
  }
  if (parts.length) calculate();
  else invalidate();
}

function checkpoint() {
  const settings = ["mode", "frequency", "observed-part", "quantity", "measurement", "measurement-phase"];
  history.push({ parts, probes, savedMeasurements, targetName, settings: settings.map(id => [id, $(id).value]) });
  if (history.length > 50) history.shift();
}

function invalidate() {
  solution = null;
  $("result").innerHTML = parts.some(part => part.unknown)
    ? '<p class="muted">Masukkan data soal untuk komponen terpilih, lalu tekan <strong>Hitung</strong>.</p>'
    : '<p class="muted">Tambahkan sumber dan komponen, lalu sambungkan kabel. Hasil simulasi muncul otomatis.</p>';
  render();
}

function refreshSimulation() {
  const isExercise = parts.some(part => part.unknown);
  const hasCircuit = parts.some(part => part.type !== "wire") || probes.length === 2;
  if (!isExercise && hasCircuit) calculate();
  else invalidate();
}

function syncSettings() {
  const ac = $("mode").value === "ac";
  $("frequency-row").hidden = !ac;
  $("measurement-phase-row").hidden = !ac;
  $("measurement-label").firstChild.textContent = ac ? "Magnitudo RMS" : "Nilai bertanda A ke B";
  $("board-label").textContent = ac ? "AC / SKEMA" : "DC / SKEMA";
  $("sweep").hidden = !ac;
  $("sweep-result").textContent = "";
  $("probe-strip").hidden = probes.length === 0;
  probeRoute = Circuit.traceProbePath(parts, probes);
  $("probe-status").textContent = probes.length === 1 ? "Titik A dipilih. Pilih titik B."
    : probeRoute.length > 1 ? "Panah kuning menunjukkan arah acuan A → B."
    : "A dan B dipilih. Tidak ada jalur skema yang menghubungkan keduanya.";
  const unknowns = parts.filter(part => part.unknown);
  $("analysis-status").textContent = unknowns.length ? "Mode soal" : "Simulasi otomatis";
  $("simulation-return").hidden = unknowns.length === 0;
  const target = unknowns.find(part => part.name === targetName) ?? unknowns[0];
  const next = target?.name ?? "";
  if (targetName && targetName !== next) $("measurement").value = "";
  targetName = next;
  $("solve-target").replaceChildren(...unknowns.map(part => new Option(`${part.name} · ?`, part.name)));
  $("solve-target").value = targetName;
  $("target-row").hidden = unknowns.length < 2;
  $("observation").hidden = !target || (target.type === "voltage" && Circuit.isWireBridged(parts, target));
  if ($("observation").hidden) return;
  $("observation-title").textContent = `Data soal untuk ${targetName}`;
  const select = $("observed-part");
  const old = select.value;
  select.replaceChildren(...parts.filter(part => part.type !== "wire").map(part => new Option(part.name, part.name)));
  if (probes.length === 2) select.append(new Option("Titik ukur A–B", "port"));
  select.value = [...select.options].some(option => option.value === old) ? old : targetName;
  if (old && select.value !== old) $("measurement").value = "";
  syncObservation();
  renderMeasurements();
}

function draftMeasurement() {
  const name = $("observed-part").value;
  return { target: targetName, name, quantity: name === "port" ? "v" : $("quantity").value, port: name === "port",
    value: $("measurement").valueAsNumber, phase: $("measurement-phase").valueAsNumber };
}

function renderMeasurements() {
  const ac = $("mode").value === "ac";
  $("saved-measurements").replaceChildren(...savedMeasurements.flatMap((item, index) => {
    if (item.target !== targetName) return [];
    const entry = document.createElement("li");
    const label = document.createElement("span");
    const unit = item.quantity === "v" ? "V" : "A";
    label.textContent = `${item.port ? "A–B" : item.name} · ${fmt(item.value)} ${unit}${ac ? ` RMS ∠ ${fmt(item.phase)}°` : ""}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Hapus";
    remove.setAttribute("aria-label", `Hapus data ukur ${index + 1}`);
    remove.addEventListener("click", () => {
      checkpoint();
      savedMeasurements = savedMeasurements.filter((_, i) => i !== index);
      renderMeasurements();
      invalidate();
    });
    entry.append(label, remove);
    return [entry];
  }));
  $("measurement-status").textContent = "";
}

function syncObservation() {
  $("quantity-row").hidden = $("observed-part").value === "port";
}

function syncEdit() {
  const part = parts.find(item => item.name === selected);
  const isUnknown = $("unknown").checked;
  const acSource = part && $("mode").value === "ac" && isSource(part.type);
  $("value").parentElement.hidden = isUnknown;
  $("edit-label").hidden = isUnknown;
  $("unknown-save").hidden = !isUnknown;
  $("phase-row").hidden = !acSource || isUnknown;
  if (part && units[part.type]) {
    $("edit-label").textContent = `Ubah nilai ${part.name} (${units[part.type]}${acSource ? " RMS" : ""})`;
  }
}

function selectPart(name) {
  selected = name;
  const part = parts.find(item => item.name === selected && units[item.type]);
  $("edit").hidden = !part;
  if (part) {
    $("value").value = part.value;
    $("value").setCustomValidity("");
    $("unknown").checked = Boolean(part.unknown);
    $("phase").value = part.phase ?? 0;
    syncEdit();
  }
  render();
}

function setTool(name) {
  tool = name;
  anchor = null;
  for (const button of $("tools").children) button.setAttribute("aria-pressed", String(button.dataset.tool === name));
  if (name !== "select") selectPart(null);
  render();
}

function undo() {
  if (!history.length) return;
  const previous = history.pop();
  parts = previous.parts;
  probes = previous.probes;
  savedMeasurements = previous.savedMeasurements;
  targetName = previous.targetName;
  for (const [id, value] of previous.settings) if (!["observed-part", "measurement"].includes(id)) $(id).value = value;
  syncSettings();
  for (const [id, value] of previous.settings) if (["observed-part", "measurement"].includes(id)) $(id).value = value;
  syncObservation();
  anchor = null;
  selectPart(null);
  refreshSimulation();
}

function svgPart(part) {
  const { a, b, type, name, value } = part;
  const [x, y] = a.map(n => n * grid);
  const dx = b[0] * grid - x;
  const dy = b[1] * grid - y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const cx = x + dx / 2;
  const cy = y + dy / 2;
  const edge = `M${-length / 2} 0H${length / 2}`;
  const source = isSource(type);
  let symbol = edge;
  if (type === "resistor") symbol = `M${-length / 2} 0H-19l3-7 6 14 6-14 6 14 6-14 6 14 5-7H${length / 2}`;
  if (type === "capacitor") symbol = `M${-length / 2} 0H-5M-5-13V13M5-13V13M5 0H${length / 2}`;
  if (type === "inductor") symbol = `M${-length / 2} 0H-20a5 8 0 0 1 10 0 5 8 0 0 1 10 0 5 8 0 0 1 10 0 5 8 0 0 1 10 0H${length / 2}`;
  if (type === "voltage") symbol = `M${-length / 2} 0H-5m0-12v24m10-19v14m0-7H${length / 2}`;
  if (type === "current") symbol = `M${-length / 2} 0H-12M12 0H${length / 2}M12 0a12 12 0 1 1-24 0 12 12 0 0 1 24 0M-6 0H6M2-4l4 4-4 4`;
  if (type === "ammeter") symbol = `M${-length / 2} 0H-12M12 0H${length / 2}M12 0a12 12 0 1 1-24 0 12 12 0 0 1 24 0M-5 6L0-6 5 6M-3 2H3`;
  const measured = solution?.results?.find(item => item.name === name);
  const vertical = Math.abs(dy) > Math.abs(dx);
  const labelY = vertical ? cy - 6 : Math.max(cy - 15, 14);
  const valueLabel = part.unknown ? "?" : units[type] ? partValue(type, value) : "";
  const inferred = (solution?.inferences ?? [solution?.inferred]).find(item => item?.name === name);
  let reading = inferred ? partValue(type, inferred.value) : "";
  if (measured) {
    const voltage = measured.v ? `${fmt(solution.frequency ? Circuit.magnitude(measured.v) : measured.voltage)} V` : "V —";
    const current = measured.i ? amp(solution.frequency ? Circuit.magnitude(measured.i) : measured.current) : "I —";
    reading = `${inferred ? reading + " · " : ""}${voltage} · ${current}`;
  }
  const halfWidth = Math.min(132, Math.max(name.length + valueLabel.length + 3, reading.length) * 4);
  const preferredX = vertical ? cx + 18 + halfWidth : cx;
  const labelX = Math.max(halfWidth, Math.min(768 - halfWidth,
    vertical && preferredX + halfWidth > 768 ? cx - 18 - halfWidth : preferredX));
  const labels = type === "wire" ? "" : `<text class="part-label" x="${labelX}" y="${labelY}">${name}${valueLabel ? " · " + valueLabel : ""}</text>
    ${reading ? `<text class="voltage-label" x="${labelX}" y="${vertical ? cy + 12 : Math.min(cy + 22, 425)}">${reading}</text>` : ""}`;
  const flow = measured && !solution.frequency && Math.abs(measured.current) > 1e-12
    ? `<path class="flow" style="animation-direction:${measured.current < 0 ? "reverse" : "normal"}" d="M${-length / 2} 0H-20M20 0H${length / 2}"/>` : "";
  return `<g class="part${selected === name ? " selected" : ""}${part.unknown ? " unknown-part" : ""}" data-part="${name}"><title>${[name, valueLabel, reading].filter(Boolean).join(" · ")}</title>
    <g transform="translate(${cx} ${cy}) rotate(${angle})"><path class="edge ${source ? "source" : ""}" d="${symbol}"/><path class="hit" d="${edge}"/>${flow}</g>${labels}</g>`;
}

function render(message) {
  const [x, y] = cursor.map(n => n * grid);
  const points = new Map(parts.flatMap(({ a, b }) => [[Circuit.key(a), a], [Circuit.key(b), b]]));
  const dots = [...points.values()].map(([px, py]) => `<circle class="terminal" cx="${px * grid}" cy="${py * grid}" r="3.8"/>`).join("");
  const preview = anchor ? `<line class="preview" x1="${anchor[0] * grid}" y1="${anchor[1] * grid}" x2="${x}" y2="${y}"/>` : "";
  const marker = keyboard || anchor || (tool !== "select" && tool !== "erase") ? `<circle class="cursor" cx="${x}" cy="${y}" r="6"/>` : "";
  const probeMarkers = probes.map(({ point: [px, py] }, i) =>
    `<g class="probe-mark" transform="translate(${px * grid} ${py * grid})"><circle r="${i ? 9 : 7}"/><text x="${i ? -21 : 11}" y="-10">${i ? "B" : "A"}</text></g>`).join("");
  const route = probeRoute.map(point => point.map(value => value * grid));
  const trace = route.length > 1 ? `<polyline class="probe-route" points="${route.map(point => point.join(",")).join(" ")}"/>` : "";
  const arrows = route.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = route[i];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 16) return "";
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    const tipX = x1 + (x2 - x1) * 0.72;
    const tipY = y1 + (y2 - y1) * 0.72;
    const baseX = tipX - 8 * dx;
    const baseY = tipY - 8 * dy;
    return `<path class="probe-arrow" d="M${baseX - dy * 4} ${baseY + dx * 4} L${tipX} ${tipY} L${baseX + dy * 4} ${baseY - dx * 4} Z"/>`;
  }).join("");
  $("drawing").innerHTML = trace + parts.map(svgPart).join("") + arrows + dots + preview + marker + probeMarkers;
  $("count").textContent = `${parts.filter(part => part.type !== "wire").length} komponen · ${parts.filter(part => part.type === "wire").length} kabel`;
  $("undo").disabled = history.length === 0;
  $("clear").disabled = parts.length === 0;
  const guidance = {
    select: "Pilih komponen pada skema untuk mengubah nilainya.",
    erase: "Pilih kabel atau komponen yang ingin dihapus.",
    wire: "Klik dua titik atau seret untuk menggambar kabel. Tambahkan ujung kabel di persilangan agar tersambung.",
    resistor: "Klik titik awal, lalu titik akhir resistor.",
    capacitor: "Klik dua terminal kapasitor ideal. Pada DC tunak, kapasitor membuka cabang.",
    inductor: "Klik dua terminal induktor ideal. Pada DC tunak, induktor menjadi jalur 0 V.",
    ammeter: "Pasang amperemeter secara seri pada cabang yang ingin diukur.",
    voltage: "Klik terminal positif terlebih dahulu, lalu terminal negatif.",
    current: "Klik titik asal, lalu titik tujuan arah panah arus."
  };
  guidance.probe = probes.length === 1 ? "Pilih terminal atau titik kabel sebagai B." :
    "Pilih terminal atau titik kabel sebagai A. Setelah itu pilih B.";
  const hint = message || (anchor ? "Pilih titik akhir. Tekan Esc untuk membatalkan." : guidance[tool]);
  if ($("hint").textContent !== hint) $("hint").textContent = hint;
}

function partAt(point) {
  return parts.findLast(part => Circuit.onWire(point, part))?.name;
}

function probeAt(point, name) {
  if (parts.some(part => pointEquals(part.a, point) || pointEquals(part.b, point))) return { point };
  const segments = parts.filter(part => part.type === "wire" && Circuit.onWire(point, part));
  const wire = segments.find(part => part.name === name) ?? (segments.length === 1 ? segments[0] : null);
  return wire ? { point, wire: wire.name } : null;
}

function act(point, name) {
  cursor = point;
  if (tool === "select") {
    selectPart(name);
    return;
  }
  if (tool === "probe") {
    const probe = probeAt(point, name);
    if (!probe) {
      render("Pilih ujung komponen atau titik grid yang tepat pada kabel.");
      return;
    }
    if (probes.length === 1 && pointEquals(probes[0].point, point) && probes[0].wire === probe.wire) {
      render("Pilih titik kedua yang berbeda.");
      return;
    }
    if (probes.length === 2) savedMeasurements = savedMeasurements.filter(item => !item.port);
    probes = probes.length === 1 ? [...probes, probe] : [probe];
    syncSettings();
    refreshSimulation();
    return;
  }
  if (tool === "erase") {
    if (!name) return;
    checkpoint();
    parts = parts.filter(part => part.name !== name);
    if (probes.some(probe => probe.wire ? probe.wire === name :
      !parts.some(part => pointEquals(part.a, probe.point) || pointEquals(part.b, probe.point)))) probes = [];
    savedMeasurements = savedMeasurements.filter(item => item.name !== name && item.target !== name && (!item.port || probes.length === 2));
    syncSettings();
    refreshSimulation();
    return;
  }
  if (!anchor) {
    anchor = point;
    render();
    return;
  }
  if (pointEquals(anchor, point)) return;
  if (tool !== "wire" && Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) < 2) {
    render("Beri jarak minimal dua kotak agar simbol komponen muat.");
    return;
  }
  if (parts.length >= 150) {
    render("Kanvas menampung hingga 150 garis dan komponen.");
    return;
  }
  checkpoint();
  const part = makePart(tool, anchor, point);
  parts = [...parts, part];
  syncSettings();
  anchor = null;
  if (part.type !== "wire") {
    setTool("select");
    selectPart(part.name);
  }
  refreshSimulation();
}

function pointerPoint(event) {
  const diagram = $("diagram");
  const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(diagram.getScreenCTM().inverse());
  return bound([Math.round(local.x / grid), Math.round(local.y / grid)]);
}

function bound([x, y]) {
  return [Math.max(1, Math.min(31, x)), Math.max(1, Math.min(17, y))];
}

function calculate() {
  try {
    const frequency = $("mode").value === "ac" ? $("frequency").valueAsNumber : 0;
    if ($("mode").value === "ac" && (!$("frequency").checkValidity() || !frequency)) {
      throw Error("Masukkan frekuensi antara 0,001 Hz dan 1 GHz.");
    }
    const draft = draftMeasurement();
    const observations = $("observation").hidden ? [] :
      [...savedMeasurements.filter(item => item.target === targetName), ...(Number.isFinite(draft.value) ? [draft] : [])];
    if (frequency && observations.some(item => item.value < 0 || !Number.isFinite(item.phase))) {
      throw Error("Untuk data AC, masukkan magnitudo RMS ≥ 0 dan fase dalam derajat.");
    }
    solution = Circuit.solve(parts, { frequency, observations, targetName, probes: probes.length === 2 ? probes : undefined });
    $("result").innerHTML = inverseMarkup(solution, observations[0]) +
      (solution.partial ? "" : portMarkup(solution) + (frequency ? acMarkup(solution) : analysisMarkup(solution)));
  } catch (error) {
    solution = null;
    const problem = document.createElement("p");
    problem.className = "problem";
    problem.textContent = error.message;
    $("result").replaceChildren(problem);
    if (error.short) {
      const { name, v } = error.short;
      const required = frequency ? phasor(v, "V") : `${fmt(v[0])} V`;
      $("result").insertAdjacentHTML("beforeend", equation("Kabel: VAB = VA − VB = 0 V", tex`V_{AB}=V_A-V_B=0\,\mathrm{V}`) +
        equation(`Sumber menetapkan VAB = ${required}`) +
        `<p>Jika ${name} adalah tegangan yang ingin diukur, gunakan Ukur A–B. Jika komponen itu memang sumber, periksa jalur kabel yang menyatukan kedua terminalnya.</p>`);
    }
  }
  render();
}

function portMarkup({ port, frequency }) {
  if (!port) return "";
  const [a, b] = port.names;
  const latexPhasor = ([real, imag], unit) => tex`${texNumber(Math.hypot(real, imag))}\,\angle\,${texNumber(phaseOf([real, imag]))}^{\circ}\,${unit}`;
  const voltage = port.v ? frequency ? phasor(port.v, "V") : `${fmt(port.v[0])} V` : "tak terdefinisi";
  const voltageTex = port.v && tex`V_{AB}=V_A-V_B=${frequency ? latexPhasor(port.v, "\\mathrm{V}") : tex`${texNumber(port.v[0])}\,\mathrm{V}`}`;
  const symbol = frequency ? "Z" : "R";
  let equivalent;
  if (port.open) {
    equivalent = equation(`${symbol}th → ∞`, tex`|${symbol}_{\mathrm{th}}|\to\infty`) +
      "<p>Port terbuka setelah sumber independen dinonaktifkan. Tidak ada jalur arus uji antara A dan B.</p>";
  } else if (port.error) {
    equivalent = '<p class="problem">Impedansi ekuivalen tidak dapat ditentukan. Periksa loop ideal atau resonansi.</p>';
  } else {
    const [real, imag] = port.impedance;
    const value = frequency ? `${fmt(real)} ${imag < 0 ? "−" : "+"} j${fmt(Math.abs(imag))}` : fmt(real);
    const latexValue = frequency ? tex`\left(${texNumber(real)}${imag < 0 ? "-" : "+"}j\,${texNumber(Math.abs(imag))}\right)` : texNumber(real);
    equivalent = equation(`${symbol}th = Vuji / Iuji = ${value} Ω`, tex`${symbol}_{\mathrm{th}}=\frac{V_{\mathrm{uji}}}{I_{\mathrm{uji}}}=${latexValue}\,\Omega`) +
      `<p>Sumber tegangan ideal diganti hubung singkat dan sumber arus ideal dibuka. Arus uji 1 A${frequency ? " RMS" : ""} masuk di A dan keluar di B. Semua komponen lain tetap terhubung.</p>`;
  }
  const reference = port.sameNet ? "A dan B berada pada simpul yang sama." : `A berada di ${a} dan B di ${b}.`;
  return `<section class="port-result"><h3>Pengukuran A–B</h3><p>${reference}</p>
    ${equation(`VAB = VA − VB = ${voltage}`, voltageTex)}${equivalent}</section>`;
}

function inverseMarkup({ inferred, inferences, frequency, partial }, observation) {
  if (inferences) {
    const rows = inferences.map(({ name, type, value, phase, branch, impedance, forcedZero }) => {
      const found = partValue(type, value) + (frequency && isSource(type) && value ? ` RMS ∠ ${fmt(phase)}°` : "");
      if (forcedZero) return `<p><strong>${name} = ${found}</strong> · Kedua terminal berada pada simpul yang sama.</p>`;
      const v = !branch.v ? "belum ditentukan" : frequency ? phasor(branch.v, "V") : `${fmt(branch.voltage)} V`;
      const i = !branch.i ? "belum ditentukan" : frequency ? phasor(branch.i, "A") : `${fmt(branch.current)} A`;
      const formulas = {
        resistor: frequency ? "R = Re(Vab / Iab)" : `R = Vab / Iab = (${v}) / (${i})`,
        capacitor: "C = −1 / (2πf × Im(Z))",
        inductor: "L = Im(Z) / (2πf)",
        voltage: "Vs = Vab",
        current: "Is = Iab"
      };
      const z = frequency && impedance ? equation(`Z = Vab / Iab = ${phasor(impedance, "Ω")}`) : "";
      return `<details open><summary><strong>${name} = ${found}</strong></summary>${equation(`Vab = ${v}; Iab = ${i}`)}${z}${equation(`${formulas[type]} = ${found}`)}</details>`;
    }).join("");
    return `<section class="answer"><p class="summary">${partial ? "Hasil untuk " + inferences[0].name : "Nilai yang ditemukan"}</p>
      <p>${partial ? "Data ukur dan persamaan Kirchhoff menentukan nilai komponen ini. Komponen lain tetap bertanda ?." :
        "Data ukur dan persamaan Kirchhoff menentukan tegangan dan arus cabang yang diperlukan."}</p>
      ${rows}<button type="button" id="apply-inferred">${partial || inferences.length === 1 ? "Pakai nilai hasil" : "Pakai semua nilai hasil"}</button></section>`;
  }
  if (!inferred) return "";
  if (inferred.forcedZero) {
    return `<section class="answer"><strong>${inferred.name} = 0 V</strong><p>${bypassExplanation}</p>
      ${equation("VAB = VA − VB = 0 V", tex`V_{AB}=V_A-V_B=0\,\mathrm{V}`)}
      <button type="button" id="apply-inferred">Pakai nilai hasil</button></section>`;
  }
  const { name, type, value, phase, impedance, kind, branch, base, gain, target } = inferred;
  const found = frequency && isSource(type) ? `${partValue(type, value)} RMS ∠ ${fmt(phase)}°` : partValue(type, value);
  const expressions = {
    resistor: "R = Vab / Iab",
    capacitor: "C = −1 / (ω × Im(Z))",
    inductor: "L = Im(Z) / ω",
    voltage: "Vs = Vab",
    current: "Is = Iab"
  };
  const v = frequency ? phasor(branch.v, "V") : `${fmt(branch.voltage)} V`;
  const i = frequency ? phasor(branch.i, "A") : `${fmt(branch.current)} A`;
  const z = impedance && frequency ? equation(`Z = Vab / Iab = (${v}) / (${i}) = ${phasor(impedance, "Ω")}`) : "";
  const rule = type === "resistor" ? ` = (${v}) / (${i})`
    : type === "capacitor" ? ` = −1 / (2π × ${fmt(frequency)} Hz × (${fmt(impedance[1])} Ω))`
    : type === "inductor" ? ` = ${fmt(impedance[1])} Ω / (2π × ${fmt(frequency)} Hz)` : "";
  const how = `Persamaan simpul menghubungkan data soal dengan ${kind === "current" ? "arus" : "tegangan"} pada cabang ${name}. Dari data itu, diperoleh Vab dan Iab berikut.`;
  const trialUnit = kind === "current" ? "A" : "V";
  const atPort = observation.port;
  const measuredName = atPort ? "A–B" : observation.name;
  const observedSymbol = atPort || observation.quantity === "v" ? "V" : "I";
  const observedUnit = observedSymbol === "V" ? "V" : "A";
  const show = (value, unit) => frequency ? phasor(value, unit) : `${fmt(value[0])} ${unit}`.trim();
  const gainUnit = observedUnit === trialUnit ? "" : `${observedUnit}/${trialUnit}`;
  const substitution = equation(`${observedSymbol}(${measuredName}) = (${show(base, observedUnit)}) + (${show(gain, gainUnit)}) × x = ${show(target, observedUnit)}`);
  return `<section class="answer"><strong>${name} = ${found}</strong><p>${how}</p>${equation(`Vab = ${v}; Iab = ${i}`)}${z}
    ${equation(`${expressions[type]}${rule} = ${found}`)}
    <details><summary>Bagaimana Vab dan Iab didapat?</summary>
      <p>Untuk sementara, tetapkan ${kind === "current" ? "arus" : "tegangan"} cabang ${name} sebagai x dalam ${trialUnit}. Hitung besaran yang diukur saat x = 0 dan x = 1 untuk memperoleh konstanta dan koefisien persamaan linier.</p>
      ${substitution}<p>Masukkan nilai x yang memenuhi data soal, lalu hitung kembali tegangan dan arus cabang.</p>
    </details>
    <button type="button" id="apply-inferred">Pakai nilai hasil</button></section>`;
}

function acMarkup({ results, nodes, frequency }) {
  const omega = 2 * Math.PI * frequency;
  const laws = {
    resistor: value => `Z = R = ${fmt(value)} Ω`,
    capacitor: value => `Z = 1 / (jωC) = −j${fmt(1 / (omega * value))} Ω`,
    inductor: value => `Z = jωL = j${fmt(omega * value)} Ω`,
    ammeter: () => "Vab = 0 V · arus cabang dibaca langsung",
    voltage: () => "Vab ditetapkan oleh fasor sumber tegangan.",
    current: () => "Iab ditetapkan oleh fasor sumber arus."
  };
  const details = results.map(({ name, type, value, v, i, nodeA, nodeB, kind }) => {
    const current = i ? phasor(i, "A") : "arus tidak unik";
    const voltage = phasor(v, "V");
    const rule = kind === "admittance" ? equation(`Iab = Vab / Z = ${current}`) : "";
    const explanation = kind === "bypassed" ? `<p>${bypassExplanation}</p>` : equation(laws[type](value));
    return `<details><summary>${name} · ${voltage} · ${current}</summary>${explanation}
      ${equation(`Vab = V(${nodeA}) − V(${nodeB}) = ${voltage}`)}${rule}</details>`;
  }).join("");
  const rows = nodes.map(node => `<p>${node.name} = ${phasor(node.phasor, "V")}${node.ground ? " · referensi" : ""}</p>`).join("");
  return `<p class="summary">AC fasor · ${fmt(frequency)} Hz</p><p class="muted">Magnitudo RMS ∠ fase. Tegangan dan arus mengacu pada orientasi A ke B.</p>
    ${equation(`ω = 2πf = ${fmt(omega)} rad/s`)}${details}<details><summary>Tegangan simpul (${nodes.length})</summary>${rows}</details>`;
}

function analysisMarkup({ results, nodes, islands }) {
  const resistors = results.filter(part => part.type === "resistor");
  const sources = results.filter(part => part.type === "voltage");
  const series = islands === 1 && sources.length === 1 && resistors.length > 0 &&
    results.length === resistors.length + 1 && results.every(part => part.from !== part.to) &&
    nodes.every(node => results.filter(part => part.from === node.id || part.to === node.id).length === 2);
  const parallel = nodes.length === 2 && sources.length === 1 && resistors.length > 1 &&
    results.length === resistors.length + 1 && results.every(part => part.from !== part.to);
  let summary = "Analisis simpul";
  let steps = "<p class=\"muted\">Titik yang terhubung kabel ideal memiliki tegangan yang sama. Pada tiap simpul, jumlah arus masuk sama dengan jumlah arus keluar (Hukum Kirchhoff).</p>";
  if (series) {
    const total = resistors.reduce((sum, part) => sum + part.value, 0);
    summary = "Rangkaian seri";
    steps = "<p class=\"muted\">Satu jalur tertutup membuat besar arus sama pada semua resistor.</p>" +
      equation(`Rtotal = ${resistors.map(part => fmt(part.value)).join(" + ")} = ${fmt(total)} Ω`,
        tex`R_{\mathrm{total}}=${resistors.map(part => texNumber(part.value)).join("+")}=${texNumber(total)}\,\Omega`) +
      equation(`|I| = |Vs| / Rtotal = ${fmt(Math.abs(sources[0].value))} V / ${fmt(total)} Ω = ${amp(Math.abs(sources[0].current))}`,
        tex`|I|=\frac{|V_s|}{R_{\mathrm{total}}}=\frac{${texNumber(Math.abs(sources[0].value))}\,\mathrm{V}}{${texNumber(total)}\,\Omega}=${texNumber(Math.abs(sources[0].current))}\,\mathrm{A}`);
  } else if (parallel) {
    summary = "Rangkaian paralel";
    steps = "<p class=\"muted\">Setiap resistor terhubung ke dua simpul sumber yang sama. Besar tegangannya sama, sedangkan arus terbagi.</p>" +
      equation(`|Is| = ${resistors.map(part => amp(Math.abs(part.current))).join(" + ")} = ${amp(Math.abs(sources[0].current))}`);
  }
  const cards = results.map(part => {
    const { name, type, value, voltage, current, nodeA, nodeB, va, vb } = part;
    const shownVoltage = voltage === null ? "tegangan tak terdefinisi" : `${fmt(voltage)} V`;
    const drop = voltage === null ? "<p>Kedua terminal berada di bagian rangkaian dengan acuan berbeda.</p>"
      : equation(`Vab = V(${nodeA}) − V(${nodeB}) = ${fmt(va)} − (${fmt(vb)}) = ${fmt(voltage)} V`);
    if (part.kind === "bypassed") return `<details open><summary>${name} · 0 V · arus tidak unik</summary><p>${bypassExplanation}</p>${drop}</details>`;
    let explanation;
    if (type === "resistor") {
      explanation = drop + equation(`I = Vab / R = ${fmt(voltage)} V / ${fmt(value)} Ω = ${amp(current)}`) +
        equation(`Vab = I × R = (${fmt(current)} A) × ${fmt(value)} Ω = ${fmt(voltage)} V`,
          tex`V_{ab}=I\times R=(${texNumber(current)}\,\mathrm{A})\times${texNumber(value)}\,\Omega=${texNumber(voltage)}\,\mathrm{V}`);
    } else if (type === "current") {
      explanation = "<p>Sumber arus menetapkan I. Nilai tegangan mengikuti rangkaian yang terhubung.</p>" +
        equation(`I = ${amp(value)}`) + drop;
    } else if (type === "voltage") {
      const adjacent = results.filter(item => item !== part && item.from !== item.to &&
        (item.from === part.from || item.to === part.from));
      const outgoing = adjacent.map(item => item.from === part.from ? item.current : -item.current);
      const expression = outgoing.length ? outgoing.map(value => `(${amp(value)})`).join(" + ") : "0 A";
      explanation = "<p>Sumber menetapkan Vab. Arusnya mengikuti Hukum Kirchhoff di terminal A.</p>" +
        equation(`Vab = ${fmt(value)} V`) +
        equation(`I = −[${expression}] = ${amp(current)}`);
    } else if (type === "capacitor") {
      explanation = "<p>Pada DC tunak, kapasitor ideal adalah cabang terbuka sehingga I = 0 A.</p>" + drop;
    } else {
      explanation = `<p>${type === "inductor" ? "Induktor ideal pada DC tunak" : "Amperemeter ideal"} memiliki beda tegangan nol. Arus cabangnya mengikuti Hukum Kirchhoff.</p>` + drop;
    }
    return `<details ${part === resistors[0] ? "open" : ""}><summary>${name} · ${shownVoltage} · ${amp(current)}</summary>${explanation}</details>`;
  }).join("");
  const nodeDetails = nodes.map(node => {
    const terms = results.filter(part => part.kind !== "open" && part.from !== part.to && (part.from === node.id || part.to === node.id)).map(part => {
      const forward = part.from === node.id;
      if (part.type === "resistor") {
        const other = forward ? part.nodeB : part.nodeA;
        return `(V(${node.name}) − V(${other})) / ${fmt(part.value)} Ω`;
      }
      if (part.type === "current") return `(${amp(forward ? part.value : -part.value)})`;
      return `${forward ? "" : "−"}I(${part.name})`;
    });
    return `<p>${node.name} = ${fmt(node.voltage)} V${node.ground ? " · referensi" : ""}</p>` +
      (!node.ground && terms.length ? equation(terms.join(" + ") + " = 0") : "");
  }).join("");
  return `<p class="summary">${summary}</p>${steps}${cards}<details><summary>Tegangan simpul (${nodes.length})</summary>
    <p>${islands > 1 ? "Ada beberapa bagian yang terpisah secara listrik pada DC. Masing-masing memiliki acuan 0 V sendiri." : "Semua tegangan simpul diukur dari titik acuan 0 V."} Persamaan di bawah menjumlahkan arus yang keluar dari tiap simpul selain acuan.</p>${nodeDetails}</details>
    <p class="muted">A adalah titik pertama yang kamu pilih. Arus positif mengalir A ke B. Tanda minus menunjukkan arah kebalikannya.</p>`;
}

for (const [name, label, path] of toolList) {
  const button = document.createElement("button");
  button.dataset.tool = name;
  button.innerHTML = `<svg viewBox="0 0 22 18" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${label}`;
  button.addEventListener("click", () => setTool(name));
  $("tools").append(button);
}

$("diagram").addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary) return;
  keyboard = false;
  pointerStart = pointerPoint(event);
});
$("diagram").addEventListener("pointermove", event => {
  if (event.pointerType === "touch" || keyboard || tool === "select" || tool === "erase") return;
  const point = pointerPoint(event);
  if (!pointEquals(point, cursor)) {
    cursor = point;
    render();
  }
});
$("diagram").addEventListener("pointercancel", () => { pointerStart = null; });
$("diagram").addEventListener("pointerup", event => {
  if (!pointerStart || !event.isPrimary || event.button !== 0) return;
  const point = pointerPoint(event);
  if (tool === "wire" && !anchor && !pointEquals(pointerStart, point)) anchor = pointerStart;
  pointerStart = null;
  act(point, event.target.closest("[data-part]")?.dataset.part ?? partAt(point));
});
$("diagram").addEventListener("keydown", event => {
  const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!movement && !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  keyboard = true;
  if (movement) {
    cursor = bound(cursor.map((value, i) => value + movement[i]));
    render();
  } else act(cursor, partAt(cursor));
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && anchor) {
    anchor = null;
    render();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.target.closest("input")) {
    event.preventDefault();
    undo();
  }
});

$("undo").addEventListener("click", undo);
$("clear").addEventListener("click", () => {
  $("example").value = "blank";
  loadExample("blank");
});
$("example").addEventListener("change", event => loadExample(event.target.value));
$("run").addEventListener("click", calculate);
$("clear-probes").addEventListener("click", () => {
  probes = [];
  savedMeasurements = savedMeasurements.filter(item => !item.port);
  syncSettings();
  refreshSimulation();
});
$("use-simulation-values").addEventListener("click", () => {
  checkpoint();
  parts = parts.map(part => part.unknown ? { ...part, unknown: false } : part);
  syncSettings();
  selectPart(selected);
  refreshSimulation();
});
$("result").addEventListener("click", event => {
  if (event.target.id !== "apply-inferred" || !solution) return;
  const inferred = solution.inferences ?? [solution.inferred];
  const values = new Map(inferred.map(item => [item.name, item]));
  checkpoint();
  parts = parts.map(part => {
    const item = values.get(part.name);
    return item ? { ...part, value: item.value, phase: item.phase, unknown: false } : part;
  });
  syncSettings();
  selectPart(inferred.length === 1 ? inferred[0].name : null);
  calculate();
});
$("mode").addEventListener("change", () => {
  savedMeasurements = [];
  $("measurement").value = "";
  syncSettings();
  syncEdit();
  refreshSimulation();
});
$("frequency").addEventListener("input", refreshSimulation);
for (const id of ["observed-part", "quantity", "measurement", "measurement-phase"]) {
  $(id).addEventListener("input", invalidate);
}
$("observed-part").addEventListener("change", syncObservation);
$("solve-target").addEventListener("change", event => {
  const draft = draftMeasurement();
  if (!$("observation").hidden && Number.isFinite(draft.value)) {
    if ($("mode").value === "ac" && (draft.value < 0 || !Number.isFinite(draft.phase))) {
      event.target.value = targetName;
      $("measurement-status").textContent = "Periksa magnitudo RMS dan fase sebelum pindah komponen.";
      return;
    }
    savedMeasurements = [...savedMeasurements, draft];
  }
  targetName = event.target.value;
  $("measurement").value = "";
  $("measurement-phase").value = "0";
  $("quantity").value = "v";
  syncSettings();
  if (!$("observation").hidden) {
    $("observed-part").value = targetName;
    syncObservation();
    invalidate();
  } else calculate();
});
$("add-measurement").addEventListener("click", () => {
  const item = draftMeasurement();
  const ac = $("mode").value === "ac";
  if (!Number.isFinite(item.value) || (ac && (item.value < 0 || !Number.isFinite(item.phase)))) {
    $("measurement-status").textContent = ac ? "Masukkan magnitudo RMS dan fase sebelum menambah data." : "Masukkan nilai sebelum menambah data.";
    return;
  }
  checkpoint();
  savedMeasurements = [...savedMeasurements, item];
  $("measurement").value = "";
  renderMeasurements();
  invalidate();
  $("measurement").focus();
});
$("unknown").addEventListener("change", () => {
  $("value").setCustomValidity("");
  syncEdit();
});
$("value").addEventListener("input", () => $("value").setCustomValidity(""));
$("edit").addEventListener("submit", event => {
  event.preventDefault();
  const part = parts.find(item => item.name === selected);
  const unknown = $("unknown").checked;
  if (unknown) {
    const first = !parts.some(item => item.unknown);
    checkpoint();
    parts = parts.map(item => item === part ? { ...item, unknown: true } : item);
    if (first) {
      savedMeasurements = [];
      $("measurement").value = "";
      $("measurement-phase").value = "0";
    }
    syncSettings();
    if (first) $("observed-part").value = part.name;
    if ($("observation").hidden) calculate();
    else {
      invalidate();
      $("measurement").focus();
    }
    return;
  }
  const value = $("value").valueAsNumber;
  const magnitude = Math.abs(value);
  const source = isSource(part.type);
  const ac = $("mode").value === "ac";
  const phase = source && ac ? $("phase").valueAsNumber : part.phase;
  if (!Number.isFinite(value) || magnitude > 1e12 || (value !== 0 && magnitude < 1e-15) ||
    (!source && value <= 0) || (source && ac && value < 0)) {
    $("value").setCustomValidity(source && !ac ? "Gunakan nol atau magnitudo 1e-15 sampai 1e12." :
      `Gunakan nilai ${source ? "nol atau " : ""}positif antara 1e-15 dan 1e12.`);
    $("value").reportValidity();
    return;
  }
  if (source && ac && !Number.isFinite(phase)) {
    render("Masukkan fase sumber dalam derajat, misalnya 0.");
    return;
  }
  checkpoint();
  parts = parts.map(item => item === part ? { ...item, value, phase, unknown: false } : item);
  syncSettings();
  calculate();
});

$("sweep-form").addEventListener("submit", async event => {
  event.preventDefault();
  const output = $("sweep-result");
  const [start, end, count] = ["sweep-start", "sweep-end", "sweep-points"].map(id => $(id).valueAsNumber);
  if (end <= start) {
    output.textContent = "Frekuensi akhir harus lebih tinggi daripada frekuensi awal.";
    return;
  }
  if (parts.some(part => part.unknown)) {
    output.textContent = "Isi nilai komponen bertanda ? sebelum menjalankan sweep.";
    return;
  }
  const circuit = parts;
  const button = event.submitter;
  button.disabled = true;
  output.textContent = "Menghitung sweep…";
  const rows = ["frequency_hz,component,type,value_si,v_real_rms,v_imag_rms,i_real_rms,i_imag_rms,v_rms,v_phase_deg,i_rms,i_phase_deg,error"];
  const escape = value => `"${value.replaceAll('"', '""')}"`;
  let failures = 0;
  try {
    for (let index = 0; index < count; index++) {
      if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const frequency = index === count - 1 ? end : start * (end / start) ** (index / (count - 1));
      try {
        const { results } = Circuit.solve(circuit, { frequency });
        for (const part of results) {
          const current = part.i ?? ["", ""];
          rows.push([frequency, part.name, part.type, part.value, ...part.v, ...current,
            Circuit.magnitude(part.v), phaseOf(part.v), part.i ? Circuit.magnitude(part.i) : "", part.i ? phaseOf(part.i) : "",
            part.i ? "" : "Arus cabang tidak unik"].join(","));
        }
      } catch (error) {
        failures++;
        rows.push([frequency, "", "", "", "", "", "", "", "", "", "", "", escape(error.message)].join(","));
      }
    }
    const url = URL.createObjectURL(new Blob([rows.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rangkai-lab-sweep.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    output.textContent = `${count - failures} dari ${count} frekuensi berhasil dihitung.${failures ? " Lihat kolom error untuk frekuensi yang gagal." : ""}`;
  } finally {
    button.disabled = false;
  }
});

$("ohm-form").addEventListener("submit", event => {
  event.preventDefault();
  const [v, i, r] = ["ohm-v", "ohm-i", "ohm-r"].map(id => $(id).valueAsNumber);
  const output = $("ohm-result");
  if ([v, i, r].filter(Number.isFinite).length !== 2) {
    output.textContent = "Isi tepat dua kolom agar besaran yang dicari bisa ditentukan.";
  } else if (r <= 0) {
    output.textContent = "Masukkan hambatan yang lebih besar dari 0 Ω.";
  } else if (Number.isNaN(v)) {
    output.textContent = Number.isFinite(i * r) ? `V = I × R = (${amp(i)}) × ${fmt(r)} Ω = ${fmt(i * r)} V` : "Hasil di luar rentang angka.";
  } else if (Number.isNaN(i)) {
    output.textContent = Number.isFinite(v / r) ? `I = V / R = ${fmt(v)} V / ${fmt(r)} Ω = ${amp(v / r)}` : "Hasil di luar rentang angka.";
  } else if (i === 0 || v / i <= 0 || !Number.isFinite(v / i)) {
    output.textContent = "Untuk mencari R positif, gunakan V dan I bertanda sama dan berbeda dari nol.";
  } else {
    output.textContent = `R = V / I = ${fmt(v)} V / (${amp(i)}) = ${fmt(v / i)} Ω`;
  }
});

function renderLatexPreview() {
  const preview = $("latex-preview");
  const status = $("latex-status");
  const raw = $("latex-input").value.trim();
  const delimiters = [["$$", "$$"], ["$", "$"], ["\\(", "\\)"], ["\\[", "\\]"]];
  const pair = delimiters.find(([left, right]) => raw.length >= left.length + right.length && raw.startsWith(left) && raw.endsWith(right));
  const expression = pair ? raw.slice(pair[0].length, -pair[1].length).trim() : raw;
  preview.replaceChildren();
  status.textContent = "";
  if (!expression) {
    preview.textContent = "Pratinjau muncul di sini.";
    return;
  }
  if (!window.katex) {
    preview.textContent = expression;
    status.textContent = "KaTeX belum termuat. Pastikan folder vendor ikut diekstrak.";
    return;
  }
  try {
    window.katex.render(expression, preview, { ...mathOptions, displayMode: true });
  } catch {
    status.textContent = "LaTeX belum dapat dibaca. Periksa pasangan kurung dan nama perintah.";
  }
}

$("latex-input").addEventListener("input", renderLatexPreview);
renderLatexPreview();
loadExample("series");
history = [];
render();
