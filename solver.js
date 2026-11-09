"use strict";

const Circuit = (() => {
  const key = ([x, y]) => `${x},${y}`;
  const onWire = ([x, y], { a: [ax, ay], b: [bx, by] }) =>
    (x - ax) * (by - ay) === (y - ay) * (bx - ax) &&
    x >= Math.min(ax, bx) && x <= Math.max(ax, bx) &&
    y >= Math.min(ay, by) && y <= Math.max(ay, by);

  const zero = [0, 0];
  const magnitude = ([real, imag]) => Math.hypot(real, imag);
  const subtract = ([a, b], [c, d]) => [a - c, b - d];
  const multiply = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  function divide([a, b], [c, d]) {
    const scale = Math.hypot(c, d);
    return multiply([a / scale, b / scale], [c / scale, -d / scale]);
  }
  const polar = (value, degrees = 0) => {
    const angle = (degrees % 360) * Math.PI / 180;
    return [value * Math.cos(angle), value * Math.sin(angle)];
  };

  function groups(points) {
    const parent = new Map(points.map(point => [point, point]));
    function find(point) {
      while (parent.get(point) !== point) {
        parent.set(point, parent.get(parent.get(point)));
        point = parent.get(point);
      }
      return point;
    }
    return { find, join: (a, b) => parent.set(find(a), find(b)) };
  }

  function eliminate(rows, size = rows.length, inverse = false, partial = false) {
    for (const row of rows) {
      let scale = 0;
      for (let j = 0; j < size; j++) scale = Math.max(scale, Math.abs(row[j]));
      if (scale) for (let j = 0; j <= size; j++) row[j] /= scale;
    }
    const rhsScale = rows.reduce((max, row) => Math.max(max, Math.abs(row[size])), 0);
    let rank = 0;
    const pivots = [];
    for (let column = 0; column < size && rank < rows.length; column++) {
      let pivot = rank;
      for (let row = rank + 1; row < rows.length; row++) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 1e-13) {
        if (inverse) continue;
        throw Error("Tidak ada solusi numerik tunggal. Periksa jalur balik, loop komponen ideal, atau kombinasi nilai yang terlalu ekstrem.");
      }
      [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
      const divisor = rows[rank][column];
      for (let j = column; j <= size; j++) rows[rank][j] /= divisor;
      for (let row = 0; row < rows.length; row++) {
        if (row === rank) continue;
        const factor = rows[row][column];
        if (factor === 0) continue;
        for (let j = column; j <= size; j++) rows[row][j] -= factor * rows[rank][j];
      }
      rank++;
      pivots.push(column);
    }
    if (rows.slice(rank).some(row => Math.abs(row[size]) > 1e-9 * rhsScale)) {
      throw Error("Data ukur saling bertentangan dengan persamaan rangkaian. Periksa nilai, arah, dan fase.");
    }
    if (partial) {
      const free = new Set(Array.from({ length: size }, (_, i) => i));
      for (const column of pivots) free.delete(column);
      // Reduce the requested linear expression by the solved equations.
      return terms => {
        const coefficients = new Float64Array(size);
        for (const [column, coefficient] of terms) {
          if (column !== undefined) coefficients[column] += coefficient;
        }
        let value = 0;
        for (let row = 0; row < rank; row++) {
          const factor = coefficients[pivots[row]];
          value += factor * rows[row][size];
          for (const column of free) coefficients[column] -= factor * rows[row][column];
        }
        return [...free].some(column => Math.abs(coefficients[column]) > 1e-12) ? null : value;
      };
    }
    if (rank < size) throw Error("Data ukur belum menentukan semua nilai secara unik. Tambahkan pengukuran yang independen, misalnya tegangan atau arus di cabang lain.");
    return rows.slice(0, size).map(row => row[size]);
  }

  function branchModel(part, frequency) {
    if (part.constraint) return part.constraint;
    const { type, value, phase } = part;
    const omega = 2 * Math.PI * frequency;
    if (type === "voltage" || type === "current") {
      return { kind: type, phasor: frequency ? polar(value, phase) : [value, 0] };
    }
    if (type === "ammeter" || (!frequency && type === "inductor")) {
      return { kind: "voltage", phasor: zero };
    }
    if (!frequency && type === "capacitor") return { kind: "open", phasor: zero };
    if (type === "resistor") return { kind: "admittance", phasor: [1 / value, 0] };
    return { kind: "admittance", phasor: [0, type === "capacitor" ? omega * value : -1 / (omega * value)] };
  }

  function wireNets(parts) {
    const points = new Map(parts.flatMap(({ a, b }) => [[key(a), a], [key(b), b]]));
    const nets = groups([...points.keys()]);
    for (const wire of parts.filter(part => part.type === "wire")) {
      for (const [id, point] of points) if (onWire(point, wire)) nets.join(key(wire.a), id);
    }
    return { points, nets };
  }

  function isWireBridged(parts, part) {
    const { nets } = wireNets(parts);
    return nets.find(key(part.a)) === nets.find(key(part.b));
  }

  function traceProbePath(parts, probes) {
    if (probes.length !== 2) return [];
    const points = new Map(parts.flatMap(({ a, b }) => [[key(a), a], [key(b), b]]));
    const terminals = [...points.keys()];
    // A probe in a wire's interior is private to that wire at a crossing.
    const ids = probes.map(({ point, wire }, i) => {
      const id = wire ? `probe-${i}` : key(point);
      if (wire) points.set(id, point);
      return id;
    });
    const edges = new Map([...points.keys()].map(id => [id, []]));
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const part of parts) {
      const route = part.type === "wire" ? [
        ...terminals.filter(id => onWire(points.get(id), part)),
        ...ids.filter((id, i) => probes[i].wire === part.name && onWire(points.get(id), part))
      ].sort((a, b) => distance(part.a, points.get(a)) - distance(part.a, points.get(b))) : [key(part.a), key(part.b)];
      for (let i = 1; i < route.length; i++) {
        const [a, b] = [route[i - 1], route[i]];
        const cost = distance(points.get(a), points.get(b));
        edges.get(a).push([b, cost]);
        edges.get(b).push([a, cost]);
      }
    }
    const [start, end] = ids;
    if (!edges.has(start) || !edges.has(end)) return [];
    const costs = new Map([[start, 0]]);
    const previous = new Map();
    const remaining = new Set(edges.keys());
    while (remaining.size) {
      let next;
      let best = Infinity;
      for (const id of remaining) {
        const cost = costs.get(id) ?? Infinity;
        if (cost < best) {
          next = id;
          best = cost;
        }
      }
      if (next === undefined) return [];
      if (next === end) {
        const path = [];
        for (let id = end; id !== undefined; id = previous.get(id)) path.push(points.get(id));
        return path.reverse();
      }
      remaining.delete(next);
      for (const [id, cost] of edges.get(next)) {
        if (best + cost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, best + cost);
        previous.set(id, next);
      }
    }
    return [];
  }

  function forward(parts, frequency, probes, testPort = false, observations = [], targetName) {
    const components = parts.filter(part => part.type !== "wire");
    if (!components.length && !probes) throw Error("Tambahkan komponen pada kanvas.");
    const { points, nets } = wireNets(parts);
    // Read a wire's existing net without inserting a junction at the probe.
    const portNodes = probes?.map(({ point, wire }) => {
      if (wire) {
        const segment = parts.find(part => part.type === "wire" && part.name === wire);
        if (segment && onWire(point, segment)) return nets.find(key(segment.a));
      } else if (points.has(key(point))) return nets.find(key(point));
      throw Error("Titik ukur sudah tidak terhubung. Pilih ulang A dan B pada skema.");
    }) ?? [];
    const branches = components.map(part => {
      let model = branchModel(part, frequency);
      if (testPort && part.type === "voltage") model = { kind: "voltage", phasor: zero };
      if (testPort && part.type === "current") model = { kind: "open", phasor: zero };
      const from = nets.find(key(part.a));
      const to = nets.find(key(part.b));
      if (from === to && model.kind === "voltage") {
        if (magnitude(model.phasor) !== 0) {
          const error = Error(`${part.name} menetapkan tegangan nonnol, tetapi kedua terminalnya terhubung oleh kabel ideal. Rangkaian tidak memiliki solusi yang memenuhi kedua syarat.`);
          error.short = { name: part.name, v: model.phasor };
          throw error;
        }
        model = { ...model, kind: "bypassed" };
      }
      return { ...part, ...model, from, to };
    });
    const nodes = [...new Set([...branches.flatMap(({ from, to }) => [from, to]), ...portNodes])];
    const islands = groups(nodes);
    for (const part of branches) if (part.kind !== "open") islands.join(part.from, part.to);
    if (testPort) {
      const [from, to] = portNodes;
      if (from === to) return { impedance: zero };
      if (islands.find(from) !== islands.find(to)) return { open: true };
      // The current source injects 1 A into A, with its return at B.
      branches.push({ kind: "current", phasor: [-1, 0], from, to });
    }
    const sources = branches.filter(part => part.kind === "voltage");
    const free = branches.filter(part => part.kind === "free");
    const references = new Map(nodes.map(node => [islands.find(node), node]));
    for (const part of sources) {
      references.set(islands.find(part.to), part.to);
    }
    const grounds = new Set(references.values());
    const unknowns = nodes.filter(node => !grounds.has(node));
    const index = new Map(unknowns.map((node, i) => [node, i]));
    const branchIndex = new Map([...sources, ...free].map((part, i) => [part, unknowns.length + i]));
    const fixed = unknowns.length + sources.length;
    const size = fixed + free.length;
    const count = frequency ? 2 * size : size;
    const rowCount = fixed + observations.length;
    const rows = Array.from({ length: frequency ? 2 * rowCount : rowCount }, () => new Float64Array(count + 1));
    function add(i, j, real, imag = 0) {
      if (i === undefined || j === undefined) return;
      if (j === size) {
        rows[i][count] += real;
        if (frequency) rows[i + rowCount][count] += imag;
      } else {
        rows[i][j] += real;
        if (frequency) {
          rows[i][j + size] -= imag;
          rows[i + rowCount][j] += imag;
          rows[i + rowCount][j + size] += real;
        }
      }
    }
    for (const part of branches) {
      const a = index.get(part.from);
      const b = index.get(part.to);
      const [real, imag] = part.phasor;
      if (part.kind === "admittance") {
        add(a, a, real, imag);
        add(b, b, real, imag);
        add(a, b, -real, -imag);
        add(b, a, -real, -imag);
      } else if (part.kind === "current") {
        add(a, size, -real, -imag);
        add(b, size, real, imag);
      } else if (branchIndex.has(part)) {
        const i = branchIndex.get(part);
        add(a, i, 1);
        add(b, i, -1);
        if (part.kind === "voltage") {
          add(i, a, 1);
          add(i, b, -1);
          add(i, size, real, imag);
        }
      }
    }
    observations.forEach((observation, position) => {
      const row = fixed + position;
      const target = frequency ? polar(observation.value, observation.phase) : [observation.value, 0];
      const branch = branches.find(part => part.name === observation.name);
      const ends = observation.port ? portNodes : branch && [branch.from, branch.to];
      if (!ends || ends.length !== 2) throw Error(`Data ukur ${position + 1} tidak memiliki lokasi pada skema.`);
      const [from, to] = ends;
      function voltage(real, imag = 0) {
        if (islands.find(from) !== islands.find(to)) throw Error(`Tegangan pada data ukur ${position + 1} tidak terdefinisi karena kedua titik memiliki acuan terpisah.`);
        add(row, index.get(from), real, imag);
        add(row, index.get(to), -real, -imag);
      }
      if (observation.port || observation.quantity === "v") voltage(1);
      else if (branchIndex.has(branch)) add(row, branchIndex.get(branch), 1);
      else if (branch.kind === "admittance") voltage(...branch.phasor);
      else if (branch.kind === "current") {
        add(row, size, ...subtract(target, branch.phasor));
        return;
      } else if (branch.kind === "bypassed") throw Error(`Arus cabang pada data ukur ${position + 1} tidak unik karena dijembatani kabel ideal.`);
      add(row, size, ...target);
    });
    const solution = eliminate(rows, count, Boolean(targetName || free.length || observations.length), Boolean(targetName));
    if (targetName) {
      const part = branches.find(item => item.name === targetName);
      const a = index.get(part.from);
      const b = index.get(part.to);
      function evaluate(terms) {
        const real = solution(terms);
        const imag = frequency ? solution(terms.map(([column, factor]) =>
          [column === undefined ? undefined : column + size, factor])) : 0;
        return real === null || imag === null ? null : [real, imag];
      }
      const v = evaluate([[a, 1], [b, -1]]);
      const i = branchIndex.has(part) ? evaluate([[branchIndex.get(part), 1]]) : null;
      return { v, i, voltage: v?.[0], current: i?.[0] };
    }
    if (solution.some(value => !Number.isFinite(value))) throw Error("Nilai rangkaian terlalu ekstrem untuk dihitung.");
    const at = i => [solution[i], frequency ? solution[i + size] : 0];
    const voltages = new Map(nodes.map(node => [node, grounds.has(node) ? zero : at(index.get(node))]));
    const names = new Map(nodes.map((node, i) => [node, `N${i + 1}`]));
    const voltageBetween = (a, b) => islands.find(a) === islands.find(b) ? subtract(voltages.get(a), voltages.get(b)) : null;
    if (testPort) return { impedance: voltageBetween(...portNodes) };
    const results = branches.map(part => {
      const va = voltages.get(part.from);
      const vb = voltages.get(part.to);
      const v = voltageBetween(part.from, part.to);
      let i = part.phasor;
      if (part.kind === "admittance") i = multiply(v, part.phasor);
      if (branchIndex.has(part)) i = at(branchIndex.get(part));
      if (part.kind === "bypassed") i = null;
      return {
        ...part, v, i, va: va[0], vb: vb[0], voltage: v?.[0] ?? null, current: i?.[0] ?? null,
        nodeA: names.get(part.from), nodeB: names.get(part.to)
      };
    });
    if (results.some(({ v, i }) => [...(v ?? zero), ...(i ?? zero)].some(value => !Number.isFinite(value)))) {
      throw Error("Nilai rangkaian terlalu ekstrem untuk dihitung.");
    }
    return {
      results, frequency, islands: grounds.size,
      port: probes ? { v: voltageBetween(...portNodes), names: portNodes.map(node => names.get(node)), sameNet: portNodes[0] === portNodes[1] } : null,
      nodes: nodes.map(node => ({ id: node, name: names.get(node), phasor: voltages.get(node), voltage: voltages.get(node)[0], ground: grounds.has(node) }))
    };
  }

  function identify(part, branch, frequency) {
    const { name, type } = part;
    if (type === "voltage" || type === "current") {
      const phasor = type === "voltage" ? branch.v : branch.i;
      if (!phasor) return null;
      return { name, type, branch, value: frequency ? magnitude(phasor) : phasor[0],
        phase: frequency && magnitude(phasor) ? Math.atan2(phasor[1], phasor[0]) * 180 / Math.PI : 0 };
    }
    if (!branch.v || !branch.i || !magnitude(branch.i)) return null;
    const impedance = divide(branch.v, branch.i);
    const [real, imag] = impedance;
    const desired = type === "resistor" ? real : imag;
    const leftover = type === "resistor" ? imag : real;
    if (Math.abs(leftover) > 1e-7 * Math.abs(desired)) return null;
    const omega = 2 * Math.PI * frequency;
    const value = type === "resistor" ? real : type === "inductor" ? imag / omega : -1 / (omega * imag);
    return value > 0 && Number.isFinite(value) ? { name, type, branch, value, phase: 0, impedance } : null;
  }

  function solve(parts, { frequency = 0, observation, observations, probes, targetName } = {}) {
    if (!Number.isFinite(frequency) || frequency < 0) throw Error("Frekuensi harus bernilai positif untuk mode AC.");
    if (probes && probes.length !== 2) throw Error("Pilih dua titik ukur pada skema.");
    function complete(result, resolvedParts) {
      if (!result.port) return result;
      try {
        Object.assign(result.port, forward(resolvedParts, frequency, probes, true));
      } catch (error) {
        result.port.error = error.message;
      }
      return result;
    }
    const unknown = parts.filter(part => part.unknown);
    if (unknown.length === 0) return complete(forward(parts, frequency, probes), parts);
    const data = observations ?? (Number.isFinite(observation?.value) ? [observation] : []);
    observation = data[0];
    if (targetName && unknown.length > 1) {
      const target = unknown.find(part => part.name === targetName);
      if (!target) throw Error("Pilih komponen bertanda ? yang ingin dihitung.");
      const forced = new Set(unknown.filter(part => part.type === "voltage" && isWireBridged(parts, part)));
      const dcReactive = part => !frequency && ["capacitor", "inductor"].includes(part.type);
      if (dcReactive(target)) throw Error(`${target.name} tidak bisa ditentukan pada DC tunak. Gunakan data AC dengan frekuensi diketahui.`);
      const trial = parts.map(part => forced.has(part) ? { ...part, value: 0, phase: 0 } :
        part.unknown && !dcReactive(part) ? { ...part, constraint: { kind: "free", phasor: zero } } : part);
      const branch = forward(trial, frequency, probes, false, data, targetName);
      const inferred = forced.has(target) ? { name: target.name, type: target.type, value: 0, phase: 0, forcedZero: true }
        : identify(target, branch, frequency);
      if (!inferred || !Number.isFinite(inferred.value)) {
        throw Error(`Nilai ${target.name} belum bisa ditentukan dari data ini. Tambahkan data ukur yang membantu menentukan ${target.type === "voltage" ? "tegangan" : target.type === "current" ? "arus" : "tegangan dan arus"} pada ${target.name}, atau hitung dulu komponen lain yang datanya sudah cukup.`);
      }
      return { frequency, inferences: [inferred], partial: true };
    }
    if (unknown.length > 1 || data.length > 1) {
      const forced = new Set(unknown.filter(part => part.type === "voltage" && isWireBridged(parts, part)));
      const free = unknown.filter(part => !forced.has(part));
      const dcReactive = !frequency && free.find(part => ["capacitor", "inductor"].includes(part.type));
      if (dcReactive) throw Error(`${dcReactive.name} tidak bisa ditentukan pada DC tunak. Gunakan data AC dengan frekuensi diketahui.`);
      if (data.length < free.length) throw Error(`Ada ${free.length} nilai yang perlu ditentukan. Masukkan setidaknya ${free.length} data ukur independen.`);
      const trial = parts.map(part => forced.has(part) ? { ...part, value: 0, phase: 0 } :
        part.unknown ? { ...part, constraint: { kind: "free", phasor: zero } } : part);
      const state = forward(trial, frequency, probes, false, data);
      const inferences = unknown.map(part => {
        if (forced.has(part)) return { name: part.name, type: part.type, value: 0, phase: 0, forcedZero: true };
        const branch = state.results.find(item => item.name === part.name);
        const inferred = identify(part, branch, frequency);
        if (!inferred) throw Error(`Data ukur belum menghasilkan nilai ${part.name} yang unik dan sesuai jenis komponennya. Periksa tegangan, arus, dan fase cabang.`);
        return inferred;
      });
      const values = new Map(inferences.map(item => [item.name, item]));
      const resolved = parts.map(part => {
        const inferred = values.get(part.name);
        return inferred ? { ...part, value: inferred.value, phase: inferred.phase } : part;
      });
      const result = forward(resolved, frequency, probes, false, data);
      return { ...complete(result, resolved), inferences };
    }
    const part = unknown[0];
    const measured = result => observation?.port ? result.port?.v : result.results.find(item => item.name === observation?.name)?.[observation?.quantity];
    if (part.type === "voltage" && isWireBridged(parts, part)) {
      const resolved = parts.map(item => item === part ? { ...item, value: 0, phase: 0 } : item);
      const result = forward(resolved, frequency, probes);
      if (Number.isFinite(observation?.value)) {
        const actual = measured(result);
        const target = frequency ? polar(observation.value, observation.phase) : [observation.value, 0];
        if (actual && magnitude(subtract(actual, target)) > 1e-7 * Math.max(magnitude(actual), magnitude(target))) {
          throw Error(`Data ukur tidak konsisten dengan rangkaian. Kabel ideal memaksa ${part.name} = 0 V.`);
        }
      }
      return { ...complete(result, resolved), inferred: { name: part.name, value: 0, phase: 0, forcedZero: true } };
    }
    if (!frequency && ["capacitor", "inductor"].includes(part.type)) {
      throw Error("Nilai kapasitor atau induktor tidak dapat ditentukan pada DC tunak. Gunakan data AC dengan frekuensi diketahui.");
    }
    if (!observation || !Number.isFinite(observation.value)) throw Error("Masukkan nilai tegangan atau arus yang diketahui dari soal.");
    if (observation.port && !probes) throw Error("Pilih titik A dan B untuk menggunakan tegangan antar titik sebagai data soal.");
    const target = frequency ? polar(observation.value, observation.phase) : [observation.value, 0];
    const constraints = ["voltage", "current"].includes(part.type) ? [part.type] : ["current", "voltage"];
    for (const kind of constraints) {
      try {
        const trial = phasor => forward(parts.map(item => item === part ? { ...item, constraint: { kind, phasor } } : item), frequency, probes);
        const base = measured(trial(zero));
        const one = measured(trial([1, 0]));
        if (!base || !one) continue;
        const gain = subtract(one, base);
        if (magnitude(gain) <= 1e-12 * Math.max(magnitude(base), magnitude(one))) continue;
        const inferred = divide(subtract(target, base), gain);
        const branch = trial(inferred).results.find(item => item.name === part.name);
        const identified = identify(part, branch, frequency);
        if (!identified) continue;
        const { value, phase } = identified;
        if (!Number.isFinite(value) || !Number.isFinite(phase)) continue;
        const resolvedParts = parts.map(item => item === part ? { ...item, value, phase } : item);
        const result = forward(resolvedParts, frequency, probes);
        const actual = measured(result);
        const tolerance = 1e-7 * Math.max(magnitude(target), magnitude(actual ?? zero)) +
          1e-12 * (magnitude(base) + magnitude(multiply(gain, inferred)));
        if (!actual || magnitude(subtract(actual, target)) > tolerance) continue;
        return { ...complete(result, resolvedParts), inferred: { ...identified, kind, base, gain, target } };
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        // The other equivalent terminal constraint can still provide a solution.
      }
    }
    throw Error("Data ini tidak menentukan satu nilai komponen yang sesuai. Periksa arah A ke B, fase AC, dan apakah besaran yang diketahui berubah saat nilai komponen berubah.");
  }

  return { solve, onWire, key, magnitude, isWireBridged, traceProbePath };
})();

if (typeof module === "object") module.exports = Circuit;
