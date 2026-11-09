"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { solve, traceProbePath } = require("../solver");

const a = [0, 0];
const b = [3, 0];
const c = [6, 0];
const source = { type: "voltage", name: "V1", a, b: c, value: 6 };
const resistor = { type: "resistor", name: "R1", a, b, value: 100 };
const load = { name: "R2", type: "resistor", a: b, b: c, value: 200 };
const capacitor = { ...load, name: "C1", type: "capacitor", value: 1e-6 };
const inductor = { ...load, name: "L1", type: "inductor", value: 0.01 };
const observe = (name, quantity, value, phase = 0) => ({ name, quantity, value, phase });
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8 * Math.max(Math.abs(expected), 1e-8), `${actual} ≠ ${expected}`);

test("DC infers a resistor or source from a different branch", () => {
  const parts = [source, resistor, load];
  near(solve(parts).results[1].voltage, 2);
  near(solve([source, resistor, { ...load, unknown: true }], {
    observation: observe("R1", "v", 2)
  }).inferred.value, 200);
  near(solve([{ ...source, unknown: true }, resistor, load], {
    observation: observe("R1", "i", 0.02)
  }).inferred.value, 6);
  assert.throws(() => solve([source, resistor, { ...load, unknown: true }], {
    observation: observe("V1", "v", 6)
  }), /tidak menentukan/);
});

test("DC capacitor is open, inductor and ammeter have zero drop", () => {
  const parts = [source, resistor];
  const cap = solve([...parts, capacitor]).results[2];
  near(cap.current, 0);
  near(cap.voltage, 6);
  assert.equal(solve([capacitor]).results[0].voltage, null);
  const meter = { ...load, name: "AM1", type: "ammeter" };
  for (const part of [inductor, meter]) {
    const branch = solve([...parts, part]).results[2];
    near(branch.current, 0.06);
    near(branch.voltage, 0);
  }
  assert.throws(() => solve([...parts, { ...capacitor, unknown: true }], {
    observation: observe("R1", "i", 0)
  }), /DC tunak/);
});

test("AC RC and RL agree with analytic current and recover C or L", () => {
  const frequency = 1000;
  const omega = 2 * Math.PI * frequency;
  for (const [part, reactance] of [[capacitor, -1 / (omega * capacitor.value)], [inductor, omega * inductor.value]]) {
    const denominator = resistor.value ** 2 + reactance ** 2;
    const real = source.value * resistor.value / denominator;
    const imag = -source.value * reactance / denominator;
    const [actualReal, actualImag] = solve([source, resistor, part], { frequency }).results[1].i;
    near(actualReal, real);
    near(actualImag, imag);
    const observation = observe("R1", "i", Math.hypot(real, imag), Math.atan2(imag, real) * 180 / Math.PI);
    near(solve([source, resistor, { ...part, unknown: true }], { frequency, observation }).inferred.value, part.value);
  }
});

test("AC uses RMS source phase and cancels series LC reactance at resonance", () => {
  const end = [9, 0];
  const phased = { ...source, b: end, phase: 90 };
  const finalCap = { ...capacitor, a: c, b: end };
  const frequency = 1 / (2 * Math.PI * Math.sqrt(inductor.value * finalCap.value));
  const [real, imag] = solve([phased, resistor, inductor, finalCap], { frequency }).results[1].i;
  near(real, 0);
  near(imag, 0.06);
});

test("A–B measures signed voltage and equivalent resistance, and can drive inverse solving", () => {
  const end = [9, 0];
  const wire = { name: "K1", type: "wire", a, b: [0, 3] };
  const probes = [{ point: [0, 1], wire: "K1" }, { point: b }];
  const parts = [source, resistor, load, wire];
  const { port } = solve(parts, { probes });
  near(port.v[0], 2);
  near(port.impedance[0], 1 / (1 / resistor.value + 1 / load.value));
  const reversed = solve(parts, { probes: probes.toReversed() }).port;
  near(reversed.v[0], -2);
  near(reversed.impedance[0], port.impedance[0]);
  const observation = { ...observe("", "v", 2), port: true };
  near(solve([source, resistor, { ...load, unknown: true }, wire], { probes, observation }).inferred.value, 200);
  const parallelCurrent = { ...source, name: "I1", type: "current", value: 0.02 };
  near(solve([parallelCurrent, { ...resistor, b: c }], { probes: [{ point: a }, { point: c }] }).port.impedance[0], 100);
  const sameNet = solve([wire, { ...load, a: end }], { probes: [{ point: a }, { point: [0, 3] }] }).port;
  assert.equal(sameNet.sameNet, true);
  assert.deepEqual(sameNet.impedance, [0, 0]);
});

test("A–B distinguishes a DC open port from capacitive AC impedance", () => {
  const probes = [{ point: b }, { point: c }];
  const dc = solve([capacitor], { probes }).port;
  assert.equal(dc.open, true);
  assert.equal(dc.v, null);
  const frequency = 1000;
  const ac = solve([capacitor], { frequency, probes }).port;
  near(ac.impedance[0], 0);
  near(ac.impedance[1], -1 / (2 * Math.PI * frequency * capacitor.value));
});

test("measuring crossing wires does not turn the crossing into a junction", () => {
  const parts = [
    { name: "K1", type: "wire", a: [0, 2], b: [4, 2] },
    { name: "K2", type: "wire", a: [2, 0], b: [2, 4] }
  ];
  const probes = parts.map(({ name }) => ({ point: [2, 2], wire: name }));
  const { port } = solve(parts, { probes });
  assert.equal(port.open, true);
  assert.equal(port.sameNet, false);
});

test("a wire forces an unknown voltage source to zero without inventing its current", () => {
  const d = [3, 3];
  const shorted = { ...source, name: "V2", a: b, b: d, value: 2 };
  const wire = { name: "K1", type: "wire", a: b, b: d };
  const parts = [source, resistor, load, wire];
  for (const frequency of [0, 1000]) {
    assert.throws(() => solve([...parts, shorted], { frequency }), error => error.short?.name === "V2");
    const result = solve([...parts, { ...shorted, unknown: true }], { frequency });
    assert.equal(result.inferred.value, 0);
    assert.equal(result.inferred.forcedZero, true);
    assert.equal(result.results.at(-1).current, null);
    assert.deepEqual(result.results.at(-1).v, [0, 0]);
    near(result.results[1].voltage, 2);
    const knownZero = solve([...parts, { ...shorted, value: 0 }], { frequency });
    assert.equal(knownZero.results.at(-1).i, null);
    assert.throws(() => solve([...parts, { ...shorted, unknown: true }], {
      frequency, observation: observe("V2", "v", 2)
    }), /tidak konsisten/);
  }
});

test("multiple DC unknowns need independent, consistent measurements", () => {
  const parts = [source, { ...resistor, unknown: true }, { ...load, unknown: true }];
  const current = observe("R1", "i", 0.02);
  const voltage = observe("R1", "v", 2);
  const result = solve(parts, { observations: [current, voltage, observe("R2", "v", 4)] });
  near(result.inferences[0].value, 100);
  near(result.inferences[1].value, 200);
  assert.throws(() => solve(parts, { observations: [current] }), /setidaknya 2/);
  assert.throws(() => solve(parts, { observations: [current, observe("R2", "i", 0.02)] }), /secara unik/);
  assert.throws(() => solve(parts, { observations: [current, voltage, observe("R2", "v", 3)] }), /bertentangan/);
});

test("multiple AC unknowns recover R and L from two measured phasors", () => {
  const frequency = 1000;
  const parts = [source, resistor, inductor];
  const known = solve(parts, { frequency });
  const measurement = (name, quantity, [real, imag]) =>
    observe(name, quantity, Math.hypot(real, imag), Math.atan2(imag, real) * 180 / Math.PI);
  const observations = [
    measurement("R1", "i", known.results[1].i),
    measurement("R1", "v", known.results[1].v)
  ];
  const result = solve([source, { ...resistor, unknown: true }, { ...inductor, unknown: true }], {
    frequency, observations
  });
  near(result.inferences[0].value, 100);
  near(result.inferences[1].value, 0.01);
});

test("a wire-forced zero voltage does not consume an independent measurement", () => {
  const d = [3, 3];
  const shorted = { ...source, name: "V2", a: b, b: d, unknown: true };
  const wire = { name: "K1", type: "wire", a: b, b: d };
  const result = solve([source, resistor, { ...load, unknown: true }, shorted, wire], {
    observations: [observe("R1", "v", 2)]
  });
  near(result.inferences[0].value, 200);
  near(result.inferences[1].value, 0);
});

test("a selected source can be inferred while an unrelated resistor stays unknown", () => {
  const parallel = { ...resistor, b: c };
  const parts = [{ ...source, unknown: true }, parallel, { ...load, a, unknown: true }];
  const observations = [observe("R1", "i", 0.06)];
  const result = solve(parts, { targetName: "V1", observations });
  assert.equal(result.partial, true);
  assert.deepEqual(result.inferences.map(item => item.name), ["V1"]);
  near(result.inferences[0].value, 6);
  assert.throws(() => solve(parts, { targetName: "R2", observations }), /Nilai R2 belum bisa ditentukan/);
  const next = solve([source, parallel, parts[2]], { targetName: "R2", observations: [observe("R2", "i", 0.03)] });
  near(next.inferred.value, 200);
});

test("targeted voltage works when neither terminal voltage is individually fixed", () => {
  const d = [9, 0];
  const unknown = { ...source, name: "V2", a: b, b: d, unknown: true };
  const parts = [source, { ...resistor, unknown: true }, { ...load, a: d, unknown: true }, unknown];
  const result = solve(parts, { targetName: "V2", observations: [observe("V2", "v", 2)] });
  near(result.inferences[0].value, 2);
});

test("probe path follows wire segments in A-to-B order without joining crossings", () => {
  const wire = { name: "K1", type: "wire", a: [0, 2], b: [4, 2] };
  const crossing = { name: "K2", type: "wire", a: [2, 0], b: [2, 4] };
  const branch = { ...resistor, a: [4, 2], b: [6, 2] };
  const parts = [wire, crossing, branch];
  const probes = [{ point: [1, 2], wire: "K1" }, { point: [6, 2] }];
  const path = [[1, 2], [4, 2], [6, 2]];
  assert.deepEqual(traceProbePath(parts, probes), path);
  assert.deepEqual(traceProbePath(parts, probes.toReversed()), path.toReversed());
  assert.deepEqual(traceProbePath(parts, [probes[0], { point: [2, 2], wire: "K2" }]), []);
});
