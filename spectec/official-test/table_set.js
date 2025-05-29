
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

// table_set.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xac\x80\x80\x80\x00\x09\x60\x00\x00\x60\x01\x7f\x01\x6f\x60\x01\x7f\x01\x70\x60\x01\x7e\x01\x70\x60\x02\x7f\x6f\x00\x60\x02\x7f\x70\x00\x60\x02\x7f\x7f\x00\x60\x02\x7e\x70\x00\x60\x01\x7f\x01\x7f\x03\x8a\x80\x80\x80\x00\x09\x00\x01\x02\x03\x04\x05\x06\x07\x08\x04\x8a\x80\x80\x80\x00\x03\x6f\x00\x01\x70\x00\x02\x70\x04\x02\x07\x86\x81\x80\x80\x00\x08\x0d\x67\x65\x74\x2d\x65\x78\x74\x65\x72\x6e\x72\x65\x66\x00\x01\x0b\x67\x65\x74\x2d\x66\x75\x6e\x63\x72\x65\x66\x00\x02\x0f\x67\x65\x74\x2d\x66\x75\x6e\x63\x72\x65\x66\x2d\x74\x36\x34\x00\x03\x0d\x73\x65\x74\x2d\x65\x78\x74\x65\x72\x6e\x72\x65\x66\x00\x04\x0b\x73\x65\x74\x2d\x66\x75\x6e\x63\x72\x65\x66\x00\x05\x10\x73\x65\x74\x2d\x66\x75\x6e\x63\x72\x65\x66\x2d\x66\x72\x6f\x6d\x00\x06\x0f\x73\x65\x74\x2d\x66\x75\x6e\x63\x72\x65\x66\x2d\x74\x36\x34\x00\x07\x0f\x69\x73\x5f\x6e\x75\x6c\x6c\x2d\x66\x75\x6e\x63\x72\x65\x66\x00\x08\x09\x89\x80\x80\x80\x00\x01\x02\x01\x41\x01\x0b\x00\x01\x00\x0a\xeb\x80\x80\x80\x00\x09\x82\x80\x80\x80\x00\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x01\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x20\x01\x26\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x20\x01\x26\x01\x0b\x8a\x80\x80\x80\x00\x00\x20\x00\x20\x01\x25\x01\x26\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x20\x01\x26\x02\x0b\x87\x80\x80\x80\x00\x00\x20\x00\x10\x02\xd1\x0b");

// table_set.wast:1
let $1 = instance($$1);

// table_set.wast:36
assert_return(() => call($1, "get-externref", [0]), null);

// table_set.wast:37
assert_return(() => call($1, "set-externref", [0, hostref(1)]));

// table_set.wast:38
assert_return(() => call($1, "get-externref", [0]), hostref(1));

// table_set.wast:39
assert_return(() => call($1, "set-externref", [0, null]));

// table_set.wast:40
assert_return(() => call($1, "get-externref", [0]), null);

// table_set.wast:42
assert_return(() => call($1, "set-funcref-t64", [0n, null]));

// table_set.wast:43
assert_return(() => call($1, "get-funcref-t64", [0n]), null);

// table_set.wast:45
assert_return(() => call($1, "get-funcref", [0]), null);

// table_set.wast:46
assert_return(() => call($1, "set-funcref-from", [0, 1]));

// table_set.wast:47
assert_return(() => call($1, "is_null-funcref", [0]), 0);

// table_set.wast:48
assert_return(() => call($1, "set-funcref", [0, null]));

// table_set.wast:49
assert_return(() => call($1, "get-funcref", [0]), null);

// table_set.wast:51
assert_trap(() => call($1, "set-externref", [2, null]));

// table_set.wast:52
assert_trap(() => call($1, "set-funcref", [3, null]));

// table_set.wast:53
assert_trap(() => call($1, "set-externref", [-1, null]));

// table_set.wast:54
assert_trap(() => call($1, "set-funcref", [-1, null]));

// table_set.wast:56
assert_trap(() => call($1, "set-externref", [2, hostref(0)]));

// table_set.wast:57
assert_trap(() => call($1, "set-funcref-from", [3, 1]));

// table_set.wast:58
assert_trap(() => call($1, "set-externref", [-1, hostref(0)]));

// table_set.wast:59
assert_trap(() => call($1, "set-funcref-from", [-1, 1]));

// table_set.wast:64
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x26\x00\x0b");

// table_set.wast:73
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\xd0\x6f\x26\x00\x0b");

// table_set.wast:82
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x41\x01\x26\x00\x0b");

// table_set.wast:91
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x91\x80\x80\x80\x00\x01\x8b\x80\x80\x80\x00\x00\x43\x00\x00\x80\x3f\xd0\x6f\x26\x00\x0b");

// table_set.wast:100
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x01\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x0a\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x41\x01\x20\x00\x26\x00\x0b");

// table_set.wast:110
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x01\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x87\x80\x80\x80\x00\x02\x6f\x00\x01\x70\x00\x01\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x41\x00\x20\x00\x26\x01\x0b");

// table_set.wast:121
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x41\x00\xd0\x6f\x26\x00\x0b");
