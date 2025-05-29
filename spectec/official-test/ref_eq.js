
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

// ref_eq.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xaf\x80\x80\x80\x00\x09\x50\x00\x5f\x00\x50\x00\x5f\x01\x7f\x00\x5e\x78\x00\x50\x01\x00\x5f\x00\x50\x01\x00\x5f\x00\x50\x01\x01\x5f\x01\x7f\x00\x50\x01\x01\x5f\x01\x7f\x00\x60\x00\x00\x60\x02\x7f\x7f\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x07\x08\x04\x84\x80\x80\x80\x00\x01\x6d\x00\x14\x07\x8d\x80\x80\x80\x00\x02\x04\x69\x6e\x69\x74\x00\x00\x02\x65\x71\x00\x01\x0a\xdc\x80\x80\x80\x00\x02\xc6\x80\x80\x80\x00\x00\x41\x00\xd0\x6d\x26\x00\x41\x01\xd0\x6c\x26\x00\x41\x02\x41\x07\xfb\x1c\x26\x00\x41\x03\x41\x07\xfb\x1c\x26\x00\x41\x04\x41\x08\xfb\x1c\x26\x00\x41\x05\xfb\x01\x00\x26\x00\x41\x06\xfb\x01\x00\x26\x00\x41\x07\x41\x00\xfb\x07\x02\x26\x00\x41\x08\x41\x00\xfb\x07\x02\x26\x00\x0b\x8b\x80\x80\x80\x00\x00\x20\x00\x25\x00\x20\x01\x25\x00\xd3\x0b");

// ref_eq.wast:1
let $1 = instance($$1);

// ref_eq.wast:29
run(() => call($1, "init", []));

// ref_eq.wast:31
assert_return(() => call($1, "eq", [0, 0]), 1);

// ref_eq.wast:32
assert_return(() => call($1, "eq", [0, 1]), 1);

// ref_eq.wast:33
assert_return(() => call($1, "eq", [0, 2]), 0);

// ref_eq.wast:34
assert_return(() => call($1, "eq", [0, 3]), 0);

// ref_eq.wast:35
assert_return(() => call($1, "eq", [0, 4]), 0);

// ref_eq.wast:36
assert_return(() => call($1, "eq", [0, 5]), 0);

// ref_eq.wast:37
assert_return(() => call($1, "eq", [0, 6]), 0);

// ref_eq.wast:38
assert_return(() => call($1, "eq", [0, 7]), 0);

// ref_eq.wast:39
assert_return(() => call($1, "eq", [0, 8]), 0);

// ref_eq.wast:41
assert_return(() => call($1, "eq", [1, 0]), 1);

// ref_eq.wast:42
assert_return(() => call($1, "eq", [1, 1]), 1);

// ref_eq.wast:43
assert_return(() => call($1, "eq", [1, 2]), 0);

// ref_eq.wast:44
assert_return(() => call($1, "eq", [1, 3]), 0);

// ref_eq.wast:45
assert_return(() => call($1, "eq", [1, 4]), 0);

// ref_eq.wast:46
assert_return(() => call($1, "eq", [1, 5]), 0);

// ref_eq.wast:47
assert_return(() => call($1, "eq", [1, 6]), 0);

// ref_eq.wast:48
assert_return(() => call($1, "eq", [1, 7]), 0);

// ref_eq.wast:49
assert_return(() => call($1, "eq", [1, 8]), 0);

// ref_eq.wast:51
assert_return(() => call($1, "eq", [2, 0]), 0);

// ref_eq.wast:52
assert_return(() => call($1, "eq", [2, 1]), 0);

// ref_eq.wast:53
assert_return(() => call($1, "eq", [2, 2]), 1);

// ref_eq.wast:54
assert_return(() => call($1, "eq", [2, 3]), 1);

// ref_eq.wast:55
assert_return(() => call($1, "eq", [2, 4]), 0);

// ref_eq.wast:56
assert_return(() => call($1, "eq", [2, 5]), 0);

// ref_eq.wast:57
assert_return(() => call($1, "eq", [2, 6]), 0);

// ref_eq.wast:58
assert_return(() => call($1, "eq", [2, 7]), 0);

// ref_eq.wast:59
assert_return(() => call($1, "eq", [2, 8]), 0);

// ref_eq.wast:61
assert_return(() => call($1, "eq", [3, 0]), 0);

// ref_eq.wast:62
assert_return(() => call($1, "eq", [3, 1]), 0);

// ref_eq.wast:63
assert_return(() => call($1, "eq", [3, 2]), 1);

// ref_eq.wast:64
assert_return(() => call($1, "eq", [3, 3]), 1);

// ref_eq.wast:65
assert_return(() => call($1, "eq", [3, 4]), 0);

// ref_eq.wast:66
assert_return(() => call($1, "eq", [3, 5]), 0);

// ref_eq.wast:67
assert_return(() => call($1, "eq", [3, 6]), 0);

// ref_eq.wast:68
assert_return(() => call($1, "eq", [3, 7]), 0);

// ref_eq.wast:69
assert_return(() => call($1, "eq", [3, 8]), 0);

// ref_eq.wast:71
assert_return(() => call($1, "eq", [4, 0]), 0);

// ref_eq.wast:72
assert_return(() => call($1, "eq", [4, 1]), 0);

// ref_eq.wast:73
assert_return(() => call($1, "eq", [4, 2]), 0);

// ref_eq.wast:74
assert_return(() => call($1, "eq", [4, 3]), 0);

// ref_eq.wast:75
assert_return(() => call($1, "eq", [4, 4]), 1);

// ref_eq.wast:76
assert_return(() => call($1, "eq", [4, 5]), 0);

// ref_eq.wast:77
assert_return(() => call($1, "eq", [4, 6]), 0);

// ref_eq.wast:78
assert_return(() => call($1, "eq", [4, 7]), 0);

// ref_eq.wast:79
assert_return(() => call($1, "eq", [4, 8]), 0);

// ref_eq.wast:81
assert_return(() => call($1, "eq", [5, 0]), 0);

// ref_eq.wast:82
assert_return(() => call($1, "eq", [5, 1]), 0);

// ref_eq.wast:83
assert_return(() => call($1, "eq", [5, 2]), 0);

// ref_eq.wast:84
assert_return(() => call($1, "eq", [5, 3]), 0);

// ref_eq.wast:85
assert_return(() => call($1, "eq", [5, 4]), 0);

// ref_eq.wast:86
assert_return(() => call($1, "eq", [5, 5]), 1);

// ref_eq.wast:87
assert_return(() => call($1, "eq", [5, 6]), 0);

// ref_eq.wast:88
assert_return(() => call($1, "eq", [5, 7]), 0);

// ref_eq.wast:89
assert_return(() => call($1, "eq", [5, 8]), 0);

// ref_eq.wast:91
assert_return(() => call($1, "eq", [6, 0]), 0);

// ref_eq.wast:92
assert_return(() => call($1, "eq", [6, 1]), 0);

// ref_eq.wast:93
assert_return(() => call($1, "eq", [6, 2]), 0);

// ref_eq.wast:94
assert_return(() => call($1, "eq", [6, 3]), 0);

// ref_eq.wast:95
assert_return(() => call($1, "eq", [6, 4]), 0);

// ref_eq.wast:96
assert_return(() => call($1, "eq", [6, 5]), 0);

// ref_eq.wast:97
assert_return(() => call($1, "eq", [6, 6]), 1);

// ref_eq.wast:98
assert_return(() => call($1, "eq", [6, 7]), 0);

// ref_eq.wast:99
assert_return(() => call($1, "eq", [6, 8]), 0);

// ref_eq.wast:101
assert_return(() => call($1, "eq", [7, 0]), 0);

// ref_eq.wast:102
assert_return(() => call($1, "eq", [7, 1]), 0);

// ref_eq.wast:103
assert_return(() => call($1, "eq", [7, 2]), 0);

// ref_eq.wast:104
assert_return(() => call($1, "eq", [7, 3]), 0);

// ref_eq.wast:105
assert_return(() => call($1, "eq", [7, 4]), 0);

// ref_eq.wast:106
assert_return(() => call($1, "eq", [7, 5]), 0);

// ref_eq.wast:107
assert_return(() => call($1, "eq", [7, 6]), 0);

// ref_eq.wast:108
assert_return(() => call($1, "eq", [7, 7]), 1);

// ref_eq.wast:109
assert_return(() => call($1, "eq", [7, 8]), 0);

// ref_eq.wast:111
assert_return(() => call($1, "eq", [8, 0]), 0);

// ref_eq.wast:112
assert_return(() => call($1, "eq", [8, 1]), 0);

// ref_eq.wast:113
assert_return(() => call($1, "eq", [8, 2]), 0);

// ref_eq.wast:114
assert_return(() => call($1, "eq", [8, 3]), 0);

// ref_eq.wast:115
assert_return(() => call($1, "eq", [8, 4]), 0);

// ref_eq.wast:116
assert_return(() => call($1, "eq", [8, 5]), 0);

// ref_eq.wast:117
assert_return(() => call($1, "eq", [8, 6]), 0);

// ref_eq.wast:118
assert_return(() => call($1, "eq", [8, 7]), 0);

// ref_eq.wast:119
assert_return(() => call($1, "eq", [8, 8]), 1);

// ref_eq.wast:121
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x87\x80\x80\x80\x00\x01\x60\x01\x64\x6e\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");

// ref_eq.wast:129
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x6e\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");

// ref_eq.wast:137
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x87\x80\x80\x80\x00\x01\x60\x01\x64\x70\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");

// ref_eq.wast:145
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x70\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");

// ref_eq.wast:153
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x87\x80\x80\x80\x00\x01\x60\x01\x64\x6f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");

// ref_eq.wast:161
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x6f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x07\x86\x80\x80\x80\x00\x01\x02\x65\x71\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\xd3\x0b");
