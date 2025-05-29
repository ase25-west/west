
'use strict';

if (typeof console === 'undefined') {
  var Console = function () {
      this.log = function(msg) { debug(msg); };
  };
  var console = new Console();
}

let hostrefs = {};
let hostsym = Symbol("hostref");
function hostref(s) {
  if (! (s in hostrefs)) hostrefs[s] = {[hostsym]: s};
  return hostrefs[s];
}
function eq_ref(x, y) {
  return x === y ? 1 : 0;
}

let spectest = {
  hostref: hostref,
  eq_ref: eq_ref,
  print: console.log.bind(console),
  print_i32: console.log.bind(console),
  print_i64: console.log.bind(console),
  print_i32_f32: console.log.bind(console),
  print_f64_f64: console.log.bind(console),
  print_f32: console.log.bind(console),
  print_f64: console.log.bind(console),
  global_i32: 666,
  global_i64: 666n,
  global_f32: 666.6,
  global_f64: 666.6,
  table: new WebAssembly.Table({initial: 10, maximum: 20, element: 'anyfunc'}),
  memory: new WebAssembly.Memory({initial: 1, maximum: 2})
};

let handler = {
  get(target, prop) {
    return (prop in target) ?  target[prop] : {};
  }
};
let registry = new Proxy({spectest}, handler);

function register(name, instance) {
  registry[name] = instance.exports;
}

function module(bytes, valid = true) {
  let buffer = new ArrayBuffer(bytes.length);
  let view = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; ++i) {
    view[i] = bytes.charCodeAt(i);
  }
  let validated;
  try {
    validated = WebAssembly.validate(buffer);
  } catch (e) {
    throw new Error("Wasm validate throws");
  }
  if (validated !== valid) {
    if (!validated) WebAssembly.compile(buffer).catch(e => console.log(e));
    throw new Error("Wasm validate failure" + (valid ? "" : " expected"));
  }
  return new WebAssembly.Module(buffer);
}

function instance(mod, imports = registry) {
  return new WebAssembly.Instance(mod, imports);
}

function call(instance, name, args) {
  return instance.exports[name](...args);
}

function get(instance, name) {
  let v = instance.exports[name];
  return (v instanceof WebAssembly.Global) ? v.value : v;
}

function exports(instance) {
  return {module: instance.exports, spectest: spectest};
}

function run(action) {
  action();
}

function assert_malformed(bytes) {
  try { module(bytes, false) } catch (e) {
    if (e instanceof WebAssembly.CompileError) return;
  }
  throw new Error("Wasm decoding failure expected");
}

function assert_malformed_custom(bytes) {
  return;
}

function assert_invalid(bytes) {
  try { module(bytes, false) } catch (e) {
    if (e instanceof WebAssembly.CompileError) return;
  }
  throw new Error("Wasm validation failure expected");
}

function assert_invalid_custom(bytes) {
  return;
}

function assert_unlinkable(mod) {
  try { new WebAssembly.Instance(mod, registry) } catch (e) {
    if (e instanceof WebAssembly.LinkError) return;
  }
  throw new Error("Wasm linking failure expected");
}

function assert_uninstantiable(mod) {
  try { new WebAssembly.Instance(mod, registry) } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) return;
    throw new Error("Wasm trap expected, but got: " + e);
  }
  throw new Error("Wasm trap expected");
}

function assert_uninstantiable_inlined(bytes) {
  let mod = module(bytes);
  assert_uninstantiable(mod);
}

function assert_trap(action) {
  try { action() } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) return;
    throw new Error("Wasm trap expected, but got: " + e);
  }
  throw new Error("Wasm trap expected");
}

function assert_exception(action) {
  try { action() } catch (e) { return; }
  throw new Error("exception expected");
}

let StackOverflow;
try { (function f() { 1 + f() })() } catch (e) { StackOverflow = e.constructor }

function assert_exhaustion(action) {
  try { action() } catch (e) {
    if (e instanceof StackOverflow) return;
  }
  throw new Error("Wasm resource exhaustion expected");
}

function assert_return(action, ...expected) {
  let actual = action();
  if (actual === undefined) {
    actual = [];
  } else if (!Array.isArray(actual)) {
    actual = [actual];
  }
  if (actual.length !== expected.length) {
    throw new Error(expected.length + " value(s) expected, got " + actual.length);
  }
  for (let i = 0; i < actual.length; ++i) {
    switch (expected[i]) {
      case "nan:canonical":
      case "nan:arithmetic":
      case "nan:any":
        // Note that JS can't reliably distinguish different NaN values,
        // so there's no good way to test that it's a canonical NaN.
        if (!Number.isNaN(actual[i])) {
          throw new Error("Wasm NaN return value expected, got " + actual[i]);
        };
        return;
      case "ref.i31":
        if (typeof actual[i] !== "number" || (actual[i] & 0x7fffffff) !== actual[i]) {
          throw new Error("Wasm i31 return value expected, got " + actual[i]);
        };
        return;
      case "ref.any":
      case "ref.eq":
      case "ref.struct":
      case "ref.array":
        // For now, JS can't distinguish exported Wasm GC values,
        // so we only test for object.
        if (typeof actual[i] !== "object") {
          throw new Error("Wasm object return value expected, got " + actual[i]);
        };
        return;
      case "ref.func":
        if (typeof actual[i] !== "function") {
          throw new Error("Wasm function return value expected, got " + actual[i]);
        };
        return;
      case "ref.extern":
        if (actual[i] === null) {
          throw new Error("Wasm reference return value expected, got " + actual[i]);
        };
        return;
      case "ref.null":
        if (actual[i] !== null) {
          throw new Error("Wasm null return value expected, got " + actual[i]);
        };
        return;
      default:
        if (!Object.is(actual[i], expected[i])) {
          throw new Error("Wasm return value " + expected[i] + " expected, got " + actual[i]);
        };
    }
  }
}

// instance.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x0a\x05\x83\x80\x80\x80\x00\x01\x00\x01\x0d\x83\x80\x80\x80\x00\x01\x00\x00\x06\x86\x80\x80\x80\x00\x01\x7f\x01\x41\x00\x0b\x07\x9a\x80\x80\x80\x00\x04\x04\x67\x6c\x6f\x62\x03\x00\x03\x74\x61\x62\x01\x00\x03\x6d\x65\x6d\x02\x00\x03\x74\x61\x67\x04\x00");
let $M = $$1;

// instance.wast:10
let $1 = instance($M);
let I1 = $1;

// instance.wast:11
let $2 = instance($M);
let I2 = $2;

// instance.wast:12
register("I1", I1)

// instance.wast:13
register("I2", I2)

// instance.wast:15
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8c\x80\x80\x80\x00\x03\x60\x00\x00\x60\x00\x01\x7f\x60\x00\x01\x70\x02\xd5\x80\x80\x80\x00\x08\x02\x49\x31\x04\x67\x6c\x6f\x62\x03\x7f\x01\x02\x49\x32\x04\x67\x6c\x6f\x62\x03\x7f\x01\x02\x49\x31\x03\x74\x61\x62\x01\x70\x00\x0a\x02\x49\x32\x03\x74\x61\x62\x01\x70\x00\x0a\x02\x49\x31\x03\x6d\x65\x6d\x02\x00\x01\x02\x49\x32\x03\x6d\x65\x6d\x02\x00\x01\x02\x49\x31\x03\x74\x61\x67\x04\x00\x00\x02\x49\x32\x03\x74\x61\x67\x04\x00\x00\x03\x86\x80\x80\x80\x00\x05\x00\x01\x02\x01\x01\x07\x9a\x80\x80\x80\x00\x04\x04\x67\x6c\x6f\x62\x00\x01\x03\x74\x61\x62\x00\x02\x03\x6d\x65\x6d\x00\x03\x03\x74\x61\x67\x00\x04\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xd9\x80\x80\x80\x00\x05\x82\x80\x80\x80\x00\x00\x0b\x88\x80\x80\x80\x00\x00\x41\x01\x24\x00\x23\x01\x0b\x8c\x80\x80\x80\x00\x00\x41\x00\xd2\x00\x26\x00\x41\x00\x25\x01\x0b\x8f\x80\x80\x80\x00\x00\x41\x00\x41\x01\x36\x02\x00\x41\x00\x28\x42\x01\x00\x0b\x9a\x80\x80\x80\x00\x00\x02\x40\x02\x40\x1f\x40\x02\x00\x00\x01\x02\x00\x08\x01\x0b\x00\x0b\x41\x00\x0f\x0b\x41\x01\x0f\x0b");

// instance.wast:15
let $3 = instance($$2);

// instance.wast:54
assert_return(() => call($3, "glob", []), 0);

// instance.wast:55
assert_return(() => call($3, "tab", []), "ref.null");

// instance.wast:56
assert_return(() => call($3, "mem", []), 0);

// instance.wast:57
assert_return(() => call($3, "tag", []), 0);

// instance.wast:62
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8c\x80\x80\x80\x00\x03\x60\x00\x00\x60\x00\x01\x7f\x60\x00\x01\x70\x02\xd5\x80\x80\x80\x00\x08\x02\x49\x31\x04\x67\x6c\x6f\x62\x03\x7f\x01\x02\x49\x31\x04\x67\x6c\x6f\x62\x03\x7f\x01\x02\x49\x31\x03\x74\x61\x62\x01\x70\x00\x0a\x02\x49\x31\x03\x74\x61\x62\x01\x70\x00\x0a\x02\x49\x31\x03\x6d\x65\x6d\x02\x00\x01\x02\x49\x31\x03\x6d\x65\x6d\x02\x00\x01\x02\x49\x31\x03\x74\x61\x67\x04\x00\x00\x02\x49\x31\x03\x74\x61\x67\x04\x00\x00\x03\x86\x80\x80\x80\x00\x05\x00\x01\x02\x01\x01\x07\x9a\x80\x80\x80\x00\x04\x04\x67\x6c\x6f\x62\x00\x01\x03\x74\x61\x62\x00\x02\x03\x6d\x65\x6d\x00\x03\x03\x74\x61\x67\x00\x04\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xd9\x80\x80\x80\x00\x05\x82\x80\x80\x80\x00\x00\x0b\x88\x80\x80\x80\x00\x00\x41\x01\x24\x00\x23\x01\x0b\x8c\x80\x80\x80\x00\x00\x41\x00\xd2\x00\x26\x00\x41\x00\x25\x01\x0b\x8f\x80\x80\x80\x00\x00\x41\x00\x41\x01\x36\x02\x00\x41\x00\x28\x42\x01\x00\x0b\x9a\x80\x80\x80\x00\x00\x02\x40\x02\x40\x1f\x40\x02\x00\x00\x01\x02\x00\x08\x01\x0b\x00\x0b\x41\x00\x0f\x0b\x41\x01\x0f\x0b");

// instance.wast:62
let $4 = instance($$3);

// instance.wast:101
assert_return(() => call($4, "glob", []), 1);

// instance.wast:102
assert_return(() => call($4, "tab", []), "ref.func");

// instance.wast:103
assert_return(() => call($4, "mem", []), 1);

// instance.wast:104
assert_return(() => call($4, "tag", []), 1);

// instance.wast:109
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x0a\x05\x83\x80\x80\x80\x00\x01\x00\x01\x0d\x83\x80\x80\x80\x00\x01\x00\x00\x06\x86\x80\x80\x80\x00\x01\x7f\x01\x41\x00\x0b\x07\xbb\x80\x80\x80\x00\x08\x05\x67\x6c\x6f\x62\x31\x03\x00\x05\x67\x6c\x6f\x62\x32\x03\x00\x04\x74\x61\x62\x31\x01\x00\x04\x74\x61\x62\x32\x01\x00\x04\x6d\x65\x6d\x31\x02\x00\x04\x6d\x65\x6d\x32\x02\x00\x04\x74\x61\x67\x31\x04\x00\x04\x74\x61\x67\x32\x04\x00");
let $N = $$4;

// instance.wast:125
let $5 = instance($N);
let I = $5;

// instance.wast:126
register("I", I)

// instance.wast:128
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8c\x80\x80\x80\x00\x03\x60\x00\x00\x60\x00\x01\x7f\x60\x00\x01\x70\x02\xd5\x80\x80\x80\x00\x08\x01\x49\x05\x67\x6c\x6f\x62\x31\x03\x7f\x01\x01\x49\x05\x67\x6c\x6f\x62\x32\x03\x7f\x01\x01\x49\x04\x74\x61\x62\x31\x01\x70\x00\x0a\x01\x49\x04\x74\x61\x62\x32\x01\x70\x00\x0a\x01\x49\x04\x6d\x65\x6d\x31\x02\x00\x01\x01\x49\x04\x6d\x65\x6d\x32\x02\x00\x01\x01\x49\x04\x74\x61\x67\x31\x04\x00\x00\x01\x49\x04\x74\x61\x67\x32\x04\x00\x00\x03\x86\x80\x80\x80\x00\x05\x00\x01\x02\x01\x01\x07\x9a\x80\x80\x80\x00\x04\x04\x67\x6c\x6f\x62\x00\x01\x03\x74\x61\x62\x00\x02\x03\x6d\x65\x6d\x00\x03\x03\x74\x61\x67\x00\x04\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xd9\x80\x80\x80\x00\x05\x82\x80\x80\x80\x00\x00\x0b\x88\x80\x80\x80\x00\x00\x41\x01\x24\x00\x23\x01\x0b\x8c\x80\x80\x80\x00\x00\x41\x00\xd2\x00\x26\x00\x41\x00\x25\x01\x0b\x8f\x80\x80\x80\x00\x00\x41\x00\x41\x01\x36\x02\x00\x41\x00\x28\x42\x01\x00\x0b\x9a\x80\x80\x80\x00\x00\x02\x40\x02\x40\x1f\x40\x02\x00\x00\x01\x02\x00\x08\x01\x0b\x00\x0b\x41\x00\x0f\x0b\x41\x01\x0f\x0b");

// instance.wast:128
let $6 = instance($$5);

// instance.wast:167
assert_return(() => call($6, "glob", []), 1);

// instance.wast:168
assert_return(() => call($6, "tab", []), "ref.func");

// instance.wast:169
assert_return(() => call($6, "mem", []), 1);

// instance.wast:170
assert_return(() => call($6, "tag", []), 1);
