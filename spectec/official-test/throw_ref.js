
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

// throw_ref.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8d\x80\x80\x80\x00\x03\x60\x00\x00\x60\x01\x7f\x01\x7f\x60\x01\x69\x00\x03\x88\x80\x80\x80\x00\x07\x00\x01\x00\x01\x01\x01\x00\x0d\x85\x80\x80\x80\x00\x02\x00\x00\x00\x00\x07\x9d\x81\x80\x80\x00\x07\x11\x63\x61\x74\x63\x68\x2d\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x30\x00\x00\x11\x63\x61\x74\x63\x68\x2d\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x31\x00\x01\x14\x63\x61\x74\x63\x68\x61\x6c\x6c\x2d\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x30\x00\x02\x14\x63\x61\x74\x63\x68\x61\x6c\x6c\x2d\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x31\x00\x03\x10\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x6e\x65\x73\x74\x65\x64\x00\x04\x11\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x72\x65\x63\x61\x74\x63\x68\x00\x05\x1c\x74\x68\x72\x6f\x77\x5f\x72\x65\x66\x2d\x73\x74\x61\x63\x6b\x2d\x70\x6f\x6c\x79\x6d\x6f\x72\x70\x68\x69\x73\x6d\x00\x06\x0a\xf3\x81\x80\x80\x00\x07\x90\x80\x80\x80\x00\x00\x02\x69\x1f\x40\x01\x01\x00\x00\x08\x00\x0b\x00\x0b\x0a\x0b\x9a\x80\x80\x80\x00\x00\x02\x69\x1f\x7f\x01\x01\x00\x00\x08\x00\x0b\x0f\x0b\x20\x00\x45\x04\x02\x0a\x05\x1a\x0b\x41\x17\x0b\x8e\x80\x80\x80\x00\x00\x02\x69\x1f\x69\x01\x03\x00\x08\x00\x0b\x0b\x0a\x0b\x99\x80\x80\x80\x00\x00\x02\x69\x1f\x7f\x01\x03\x00\x08\x00\x0b\x0f\x0b\x20\x00\x45\x04\x02\x0a\x05\x1a\x0b\x41\x17\x0b\xba\x80\x80\x80\x00\x01\x02\x69\x02\x69\x1f\x7f\x01\x01\x01\x00\x08\x01\x0b\x0f\x0b\x21\x01\x02\x69\x1f\x7f\x01\x01\x00\x00\x08\x00\x0b\x0f\x0b\x21\x02\x20\x00\x41\x00\x46\x04\x40\x20\x01\x0a\x0b\x20\x00\x41\x01\x46\x04\x40\x20\x02\x0a\x0b\x41\x17\x0b\xac\x80\x80\x80\x00\x01\x01\x69\x02\x69\x1f\x7f\x01\x01\x00\x00\x08\x00\x0b\x0f\x0b\x21\x01\x02\x69\x1f\x7f\x01\x01\x00\x00\x20\x00\x45\x04\x40\x20\x01\x0a\x0b\x41\x2a\x0b\x0f\x0b\x1a\x41\x17\x0b\x98\x80\x80\x80\x00\x01\x01\x69\x02\x69\x1f\x7c\x01\x01\x00\x00\x08\x00\x0b\x00\x0b\x21\x00\x41\x01\x20\x00\x0a\x0b");

// throw_ref.wast:3
let $1 = instance($$1);

// throw_ref.wast:99
assert_exception(() => call($1, "catch-throw_ref-0", []));

// throw_ref.wast:101
assert_exception(() => call($1, "catch-throw_ref-1", [0]));

// throw_ref.wast:102
assert_return(() => call($1, "catch-throw_ref-1", [1]), 23);

// throw_ref.wast:104
assert_exception(() => call($1, "catchall-throw_ref-0", []));

// throw_ref.wast:106
assert_exception(() => call($1, "catchall-throw_ref-1", [0]));

// throw_ref.wast:107
assert_return(() => call($1, "catchall-throw_ref-1", [1]), 23);

// throw_ref.wast:108
assert_exception(() => call($1, "throw_ref-nested", [0]));

// throw_ref.wast:109
assert_exception(() => call($1, "throw_ref-nested", [1]));

// throw_ref.wast:110
assert_return(() => call($1, "throw_ref-nested", [2]), 23);

// throw_ref.wast:112
assert_return(() => call($1, "throw_ref-recatch", [0]), 23);

// throw_ref.wast:113
assert_return(() => call($1, "throw_ref-recatch", [1]), 42);

// throw_ref.wast:115
assert_exception(() => call($1, "throw_ref-stack-polymorphism", []));

// throw_ref.wast:117
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x89\x80\x80\x80\x00\x01\x83\x80\x80\x80\x00\x00\x0a\x0b");

// throw_ref.wast:118
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x02\x40\x0a\x0b\x0b");
