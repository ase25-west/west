
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

// table_fill.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x97\x80\x80\x80\x00\x04\x60\x03\x7f\x6f\x7f\x00\x60\x01\x7f\x01\x6f\x60\x03\x7e\x6f\x7e\x00\x60\x01\x7e\x01\x6f\x03\x86\x80\x80\x80\x00\x05\x00\x00\x01\x02\x03\x04\x87\x80\x80\x80\x00\x02\x6f\x00\x0a\x6f\x04\x0a\x07\xb1\x80\x80\x80\x00\x05\x04\x66\x69\x6c\x6c\x00\x00\x0b\x66\x69\x6c\x6c\x2d\x61\x62\x62\x72\x65\x76\x00\x01\x03\x67\x65\x74\x00\x02\x08\x66\x69\x6c\x6c\x2d\x74\x36\x34\x00\x03\x07\x67\x65\x74\x2d\x74\x36\x34\x00\x04\x0a\xc7\x80\x80\x80\x00\x05\x8b\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x11\x00\x0b\x8b\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x11\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x00\x0b\x8b\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x11\x01\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x01\x0b");

// table_fill.wast:1
let $1 = instance($$1);

// table_fill.wast:27
assert_return(() => call($1, "get", [1]), null);

// table_fill.wast:28
assert_return(() => call($1, "get", [2]), null);

// table_fill.wast:29
assert_return(() => call($1, "get", [3]), null);

// table_fill.wast:30
assert_return(() => call($1, "get", [4]), null);

// table_fill.wast:31
assert_return(() => call($1, "get", [5]), null);

// table_fill.wast:33
assert_return(() => call($1, "fill", [2, hostref(1), 3]));

// table_fill.wast:34
assert_return(() => call($1, "get", [1]), null);

// table_fill.wast:35
assert_return(() => call($1, "get", [2]), hostref(1));

// table_fill.wast:36
assert_return(() => call($1, "get", [3]), hostref(1));

// table_fill.wast:37
assert_return(() => call($1, "get", [4]), hostref(1));

// table_fill.wast:38
assert_return(() => call($1, "get", [5]), null);

// table_fill.wast:40
assert_return(() => call($1, "fill", [4, hostref(2), 2]));

// table_fill.wast:41
assert_return(() => call($1, "get", [3]), hostref(1));

// table_fill.wast:42
assert_return(() => call($1, "get", [4]), hostref(2));

// table_fill.wast:43
assert_return(() => call($1, "get", [5]), hostref(2));

// table_fill.wast:44
assert_return(() => call($1, "get", [6]), null);

// table_fill.wast:46
assert_return(() => call($1, "fill", [4, hostref(3), 0]));

// table_fill.wast:47
assert_return(() => call($1, "get", [3]), hostref(1));

// table_fill.wast:48
assert_return(() => call($1, "get", [4]), hostref(2));

// table_fill.wast:49
assert_return(() => call($1, "get", [5]), hostref(2));

// table_fill.wast:51
assert_return(() => call($1, "fill", [8, hostref(4), 2]));

// table_fill.wast:52
assert_return(() => call($1, "get", [7]), null);

// table_fill.wast:53
assert_return(() => call($1, "get", [8]), hostref(4));

// table_fill.wast:54
assert_return(() => call($1, "get", [9]), hostref(4));

// table_fill.wast:56
assert_return(() => call($1, "fill-abbrev", [9, null, 1]));

// table_fill.wast:57
assert_return(() => call($1, "get", [8]), hostref(4));

// table_fill.wast:58
assert_return(() => call($1, "get", [9]), null);

// table_fill.wast:60
assert_return(() => call($1, "fill", [10, hostref(5), 0]));

// table_fill.wast:61
assert_return(() => call($1, "get", [9]), null);

// table_fill.wast:63
assert_trap(() => call($1, "fill", [8, hostref(6), 3]));

// table_fill.wast:67
assert_return(() => call($1, "get", [7]), null);

// table_fill.wast:68
assert_return(() => call($1, "get", [8]), hostref(4));

// table_fill.wast:69
assert_return(() => call($1, "get", [9]), null);

// table_fill.wast:71
assert_trap(() => call($1, "fill", [11, null, 0]));

// table_fill.wast:76
assert_trap(() => call($1, "fill", [11, null, 10]));

// table_fill.wast:83
assert_return(() => call($1, "get-t64", [1n]), null);

// table_fill.wast:84
assert_return(() => call($1, "get-t64", [2n]), null);

// table_fill.wast:85
assert_return(() => call($1, "get-t64", [3n]), null);

// table_fill.wast:86
assert_return(() => call($1, "get-t64", [4n]), null);

// table_fill.wast:87
assert_return(() => call($1, "get-t64", [5n]), null);

// table_fill.wast:89
assert_return(() => call($1, "fill-t64", [2n, hostref(1), 3n]));

// table_fill.wast:90
assert_return(() => call($1, "get-t64", [1n]), null);

// table_fill.wast:91
assert_return(() => call($1, "get-t64", [2n]), hostref(1));

// table_fill.wast:92
assert_return(() => call($1, "get-t64", [3n]), hostref(1));

// table_fill.wast:93
assert_return(() => call($1, "get-t64", [4n]), hostref(1));

// table_fill.wast:94
assert_return(() => call($1, "get-t64", [5n]), null);

// table_fill.wast:96
assert_return(() => call($1, "fill-t64", [4n, hostref(2), 2n]));

// table_fill.wast:97
assert_return(() => call($1, "get-t64", [3n]), hostref(1));

// table_fill.wast:98
assert_return(() => call($1, "get-t64", [4n]), hostref(2));

// table_fill.wast:99
assert_return(() => call($1, "get-t64", [5n]), hostref(2));

// table_fill.wast:100
assert_return(() => call($1, "get-t64", [6n]), null);

// table_fill.wast:102
assert_return(() => call($1, "fill-t64", [4n, hostref(3), 0n]));

// table_fill.wast:103
assert_return(() => call($1, "get-t64", [3n]), hostref(1));

// table_fill.wast:104
assert_return(() => call($1, "get-t64", [4n]), hostref(2));

// table_fill.wast:105
assert_return(() => call($1, "get-t64", [5n]), hostref(2));

// table_fill.wast:107
assert_return(() => call($1, "fill-t64", [8n, hostref(4), 2n]));

// table_fill.wast:108
assert_return(() => call($1, "get-t64", [7n]), null);

// table_fill.wast:109
assert_return(() => call($1, "get-t64", [8n]), hostref(4));

// table_fill.wast:110
assert_return(() => call($1, "get-t64", [9n]), hostref(4));

// table_fill.wast:112
assert_return(() => call($1, "fill-t64", [9n, null, 1n]));

// table_fill.wast:113
assert_return(() => call($1, "get-t64", [8n]), hostref(4));

// table_fill.wast:114
assert_return(() => call($1, "get-t64", [9n]), null);

// table_fill.wast:116
assert_return(() => call($1, "fill-t64", [10n, hostref(5), 0n]));

// table_fill.wast:117
assert_return(() => call($1, "get-t64", [9n]), null);

// table_fill.wast:119
assert_trap(() => call($1, "fill-t64", [8n, hostref(6), 3n]));

// table_fill.wast:123
assert_return(() => call($1, "get-t64", [7n]), null);

// table_fill.wast:124
assert_return(() => call($1, "get-t64", [8n]), hostref(4));

// table_fill.wast:125
assert_return(() => call($1, "get-t64", [9n]), null);

// table_fill.wast:127
assert_trap(() => call($1, "fill-t64", [11n, null, 0n]));

// table_fill.wast:132
assert_trap(() => call($1, "fill-t64", [11n, null, 10n]));

// table_fill.wast:139
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfc\x11\x00\x0b");

// table_fill.wast:148
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x6f\x41\x01\xfc\x11\x00\x0b");

// table_fill.wast:157
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\x41\x01\x41\x01\xfc\x11\x00\x0b");

// table_fill.wast:166
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x0a\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\x41\x01\xd0\x6f\xfc\x11\x00\x0b");

// table_fill.wast:175
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x43\x00\x00\x80\x3f\xd0\x6f\x41\x01\xfc\x11\x00\x0b");

// table_fill.wast:184
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x01\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x00\x0a\x91\x80\x80\x80\x00\x01\x8b\x80\x80\x80\x00\x00\x41\x01\x20\x00\x41\x01\xfc\x11\x00\x0b");

// table_fill.wast:193
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x41\x01\xd0\x6f\x43\x00\x00\x80\x3f\xfc\x11\x00\x0b");

// table_fill.wast:203
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x01\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x87\x80\x80\x80\x00\x02\x6f\x00\x01\x70\x00\x01\x0a\x91\x80\x80\x80\x00\x01\x8b\x80\x80\x80\x00\x00\x41\x00\x20\x00\x41\x01\xfc\x11\x01\x0b");

// table_fill.wast:214
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x01\x0a\x91\x80\x80\x80\x00\x01\x8b\x80\x80\x80\x00\x00\x41\x00\xd0\x6f\x41\x01\xfc\x11\x00\x0b");
