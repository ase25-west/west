
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

// local_init.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x01\x64\x6f\x03\x84\x80\x80\x80\x00\x03\x00\x00\x00\x07\xba\x80\x80\x80\x00\x03\x0d\x67\x65\x74\x2d\x61\x66\x74\x65\x72\x2d\x73\x65\x74\x00\x00\x0d\x67\x65\x74\x2d\x61\x66\x74\x65\x72\x2d\x74\x65\x65\x00\x01\x16\x67\x65\x74\x2d\x69\x6e\x2d\x62\x6c\x6f\x63\x6b\x2d\x61\x66\x74\x65\x72\x2d\x73\x65\x74\x00\x02\x0a\xb6\x80\x80\x80\x00\x03\x8b\x80\x80\x80\x00\x01\x01\x64\x6f\x20\x00\x21\x01\x20\x01\x0b\x8c\x80\x80\x80\x00\x01\x01\x64\x6f\x20\x00\x22\x01\x1a\x20\x01\x0b\x8f\x80\x80\x80\x00\x01\x01\x64\x6f\x20\x00\x21\x01\x02\x64\x6f\x20\x01\x0b\x0b");

// local_init.wast:3
let $1 = instance($$1);

// local_init.wast:21
assert_return(() => call($1, "get-after-set", [hostref(1)]), hostref(1));

// local_init.wast:22
assert_return(() => call($1, "get-after-tee", [hostref(2)]), hostref(2));

// local_init.wast:23
assert_return(() => call($1, "get-in-block-after-set", [hostref(3)]), hostref(3));

// local_init.wast:25
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x01\x01\x64\x6f\x20\x00\x1a\x0b");

// local_init.wast:29
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x9a\x80\x80\x80\x00\x01\x94\x80\x80\x80\x00\x01\x01\x64\x6f\x02\x40\x20\x00\x21\x01\x20\x00\x22\x01\x1a\x0b\x20\x01\x1a\x0b");

// local_init.wast:39
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x97\x80\x80\x80\x00\x01\x91\x80\x80\x80\x00\x01\x01\x64\x6f\x41\x00\x04\x40\x20\x00\x21\x01\x05\x20\x01\x0b\x0b");

// local_init.wast:52
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x9c\x80\x80\x80\x00\x01\x96\x80\x80\x80\x00\x01\x01\x64\x6f\x41\x00\x04\x40\x20\x00\x21\x01\x05\x20\x00\x21\x01\x0b\x20\x01\x1a\x0b");

// local_init.wast:66
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x01\x64\x6f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x8c\x80\x80\x80\x00\x01\x08\x74\x65\x65\x2d\x69\x6e\x69\x74\x00\x00\x0a\x92\x80\x80\x80\x00\x01\x8c\x80\x80\x80\x00\x01\x01\x64\x6f\x20\x00\x22\x01\x1a\x20\x01\x0b");

// local_init.wast:66
let $2 = instance($$2);

// local_init.wast:74
assert_return(() => call($2, "tee-init", [hostref(1)]), hostref(1));
