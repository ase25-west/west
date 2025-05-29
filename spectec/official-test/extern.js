
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

// extern.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xa1\x80\x80\x80\x00\x08\x60\x00\x00\x5f\x00\x5e\x78\x00\x60\x01\x6f\x00\x60\x01\x6f\x01\x6e\x60\x01\x6e\x01\x6f\x60\x01\x7f\x01\x6f\x60\x01\x7f\x01\x6e\x03\x87\x80\x80\x80\x00\x06\x00\x03\x04\x05\x06\x07\x04\x84\x80\x80\x80\x00\x01\x6e\x00\x0a\x07\xc5\x80\x80\x80\x00\x05\x04\x69\x6e\x69\x74\x00\x01\x0b\x69\x6e\x74\x65\x72\x6e\x61\x6c\x69\x7a\x65\x00\x02\x0b\x65\x78\x74\x65\x72\x6e\x61\x6c\x69\x7a\x65\x00\x03\x0d\x65\x78\x74\x65\x72\x6e\x61\x6c\x69\x7a\x65\x2d\x69\x00\x04\x0e\x65\x78\x74\x65\x72\x6e\x61\x6c\x69\x7a\x65\x2d\x69\x69\x00\x05\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xe7\x80\x80\x80\x00\x06\x82\x80\x80\x80\x00\x00\x0b\xa8\x80\x80\x80\x00\x00\x41\x00\xd0\x6e\x26\x00\x41\x01\x41\x07\xfb\x1c\x26\x00\x41\x02\xfb\x01\x01\x26\x00\x41\x03\x41\x00\xfb\x07\x02\x26\x00\x41\x04\x20\x00\xfb\x1a\x26\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\xfb\x1a\x0b\x86\x80\x80\x80\x00\x00\x20\x00\xfb\x1b\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x1b\x0b\x8a\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x1b\xfb\x1a\x0b");

// extern.wast:1
let $1 = instance($$1);

// extern.wast:34
run(() => call($1, "init", [hostref(0)]));

// extern.wast:36
assert_return(() => call($1, "internalize", [hostref(1)]), hostref(1));

// extern.wast:37
assert_return(() => call($1, "internalize", [null]), null);

// extern.wast:39
assert_return(() => call($1, "externalize", [hostref(2)]), hostref(2));

// extern.wast:40
assert_return(() => call($1, "externalize", [null]), null);

// extern.wast:42
assert_return(() => call($1, "externalize-i", [0]), null);

// extern.wast:43
assert_return(() => call($1, "externalize-i", [1]), "ref.extern");

// extern.wast:44
assert_return(() => call($1, "externalize-i", [2]), "ref.extern");

// extern.wast:45
assert_return(() => call($1, "externalize-i", [3]), "ref.extern");

// extern.wast:46
assert_return(() => call($1, "externalize-i", [4]), "ref.extern");

// extern.wast:47
assert_return(() => call($1, "externalize-i", [5]), null);

// extern.wast:49
assert_return(() => call($1, "externalize-ii", [0]), null);

// extern.wast:50
assert_return(() => call($1, "externalize-ii", [1]), "ref.i31");

// extern.wast:51
assert_return(() => call($1, "externalize-ii", [2]), "ref.struct");

// extern.wast:52
assert_return(() => call($1, "externalize-ii", [3]), "ref.array");

// extern.wast:53
assert_return(() => call($1, "externalize-ii", [4]), hostref(0));

// extern.wast:54
assert_return(() => call($1, "externalize-ii", [5]), null);
