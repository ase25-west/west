
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

// custom.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x24\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x20\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x11\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x00\x10\x00\x74\x68\x69\x73\x20\x69\x73\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x01\x00\x00\x24\x10\x00\x00\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x00\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x24\x10\xef\xbb\xbf\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x24\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\xe2\x8c\xa3\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x1f\x16\x6d\x6f\x64\x75\x6c\x65\x20\x77\x69\x74\x68\x69\x6e\x20\x61\x20\x6d\x6f\x64\x75\x6c\x65\x00\x61\x73\x6d\x01\x00\x00\x00");

// custom.wast:1
let $1 = instance($$1);

// custom.wast:14
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x01\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x02\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x03\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x04\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x05\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x06\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x07\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x09\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x0a\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x0b\x01\x00\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64\x00\x0e\x06\x63\x75\x73\x74\x6f\x6d\x70\x61\x79\x6c\x6f\x61\x64");

// custom.wast:14
let $2 = instance($$2);

// custom.wast:50
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x07\x01\x60\x02\x7f\x7f\x01\x7f\x00\x1a\x06\x63\x75\x73\x74\x6f\x6d\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x03\x02\x01\x00\x07\x0a\x01\x06\x61\x64\x64\x54\x77\x6f\x00\x00\x0a\x09\x01\x07\x00\x20\x00\x20\x01\x6a\x0b\x00\x1b\x07\x63\x75\x73\x74\x6f\x6d\x32\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64");

// custom.wast:50
let $3 = instance($$3);

// custom.wast:60
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00");

// custom.wast:68
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x00");

// custom.wast:76
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x00\x00\x05\x01\x00\x07\x00\x00");

// custom.wast:84
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x26\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64");

// custom.wast:92
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x25\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x00\x24\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64");

// custom.wast:101
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x07\x01\x60\x02\x7f\x7f\x01\x7f\x00\x25\x10\x61\x20\x63\x75\x73\x74\x6f\x6d\x20\x73\x65\x63\x74\x69\x6f\x6e\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64\x03\x02\x01\x00\x0a\x09\x01\x07\x00\x20\x00\x20\x01\x6a\x0b\x00\x1b\x07\x63\x75\x73\x74\x6f\x6d\x32\x74\x68\x69\x73\x20\x69\x73\x20\x74\x68\x65\x20\x70\x61\x79\x6c\x6f\x61\x64");

// custom.wast:114
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x00\x61\x73\x6d\x01\x00\x00\x00");

// custom.wast:122
assert_malformed("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x03\x01\x00\x01\x0c\x01\x02\x0b\x06\x01\x00\x41\x00\x0b\x00");
