
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

// array_init_data.wast:5
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x89\x80\x80\x80\x00\x02\x5e\x78\x00\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x07\x9d\x80\x80\x80\x00\x01\x19\x61\x72\x72\x61\x79\x2e\x69\x6e\x69\x74\x5f\x64\x61\x74\x61\x2d\x69\x6d\x6d\x75\x74\x61\x62\x6c\x65\x00\x00\x0c\x81\x80\x80\x80\x00\x01\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x41\x00\x41\x00\xfb\x12\x00\x00\x0b\x0b\x84\x80\x80\x80\x00\x01\x01\x01\x61");

// array_init_data.wast:18
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x89\x80\x80\x80\x00\x02\x5e\x70\x01\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x07\x9d\x80\x80\x80\x00\x01\x19\x61\x72\x72\x61\x79\x2e\x69\x6e\x69\x74\x5f\x64\x61\x74\x61\x2d\x69\x6e\x76\x61\x6c\x69\x64\x2d\x31\x00\x00\x0c\x81\x80\x80\x80\x00\x01\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x41\x00\x41\x00\xfb\x12\x00\x00\x0b\x0b\x84\x80\x80\x80\x00\x01\x01\x01\x61");

// array_init_data.wast:31
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x98\x80\x80\x80\x00\x06\x5e\x78\x00\x5e\x78\x01\x5e\x77\x01\x60\x01\x7f\x01\x7f\x60\x00\x00\x60\x03\x7f\x7f\x7f\x00\x03\x87\x80\x80\x80\x00\x06\x03\x03\x04\x05\x05\x04\x06\x9e\x80\x80\x80\x00\x03\x64\x00\x00\x41\x0a\x41\x0c\xfb\x06\x00\x0b\x64\x01\x01\x41\x0c\xfb\x07\x01\x0b\x64\x02\x00\x41\x06\xfb\x07\x02\x0b\x07\xf0\x80\x80\x80\x00\x06\x0d\x61\x72\x72\x61\x79\x5f\x67\x65\x74\x5f\x6e\x74\x68\x00\x00\x11\x61\x72\x72\x61\x79\x5f\x67\x65\x74\x5f\x6e\x74\x68\x5f\x69\x31\x36\x00\x01\x14\x61\x72\x72\x61\x79\x5f\x69\x6e\x69\x74\x5f\x64\x61\x74\x61\x2d\x6e\x75\x6c\x6c\x00\x02\x0f\x61\x72\x72\x61\x79\x5f\x69\x6e\x69\x74\x5f\x64\x61\x74\x61\x00\x03\x13\x61\x72\x72\x61\x79\x5f\x69\x6e\x69\x74\x5f\x64\x61\x74\x61\x5f\x69\x31\x36\x00\x04\x09\x64\x72\x6f\x70\x5f\x73\x65\x67\x73\x00\x05\x0c\x81\x80\x80\x80\x00\x01\x0a\xe0\x80\x80\x80\x00\x06\x89\x80\x80\x80\x00\x00\x23\x01\x20\x00\xfb\x0d\x01\x0b\x89\x80\x80\x80\x00\x00\x23\x02\x20\x00\xfb\x0d\x02\x0b\x8e\x80\x80\x80\x00\x00\xd0\x01\x41\x00\x41\x00\x41\x00\xfb\x12\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x23\x01\x20\x00\x20\x01\x20\x02\xfb\x12\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x23\x02\x20\x00\x20\x01\x20\x02\xfb\x12\x02\x00\x0b\x85\x80\x80\x80\x00\x00\xfc\x09\x00\x0b\x0b\x8f\x80\x80\x80\x00\x01\x01\x0c\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c");

// array_init_data.wast:31
let $1 = instance($$1);

// array_init_data.wast:68
assert_trap(() => call($1, "array_init_data-null", []));

// array_init_data.wast:71
assert_trap(() => call($1, "array_init_data", [13, 0, 0]));

// array_init_data.wast:72
assert_trap(() => call($1, "array_init_data", [0, 13, 0]));

// array_init_data.wast:75
assert_trap(() => call($1, "array_init_data", [0, 0, 13]));

// array_init_data.wast:76
assert_trap(() => call($1, "array_init_data", [0, 0, 13]));

// array_init_data.wast:77
assert_trap(() => call($1, "array_init_data_i16", [0, 0, 7]));

// array_init_data.wast:80
assert_return(() => call($1, "array_init_data", [12, 0, 0]));

// array_init_data.wast:81
assert_return(() => call($1, "array_init_data", [0, 12, 0]));

// array_init_data.wast:82
assert_return(() => call($1, "array_init_data_i16", [0, 6, 0]));

// array_init_data.wast:85
assert_return(() => call($1, "array_get_nth", [0]), 0);

// array_init_data.wast:86
assert_return(() => call($1, "array_get_nth", [5]), 0);

// array_init_data.wast:87
assert_return(() => call($1, "array_get_nth", [11]), 0);

// array_init_data.wast:88
assert_trap(() => call($1, "array_get_nth", [12]));

// array_init_data.wast:89
assert_return(() => call($1, "array_get_nth_i16", [0]), 0);

// array_init_data.wast:90
assert_return(() => call($1, "array_get_nth_i16", [2]), 0);

// array_init_data.wast:91
assert_return(() => call($1, "array_get_nth_i16", [5]), 0);

// array_init_data.wast:92
assert_trap(() => call($1, "array_get_nth_i16", [6]));

// array_init_data.wast:95
assert_return(() => call($1, "array_init_data", [4, 2, 2]));

// array_init_data.wast:96
assert_return(() => call($1, "array_get_nth", [3]), 0);

// array_init_data.wast:97
assert_return(() => call($1, "array_get_nth", [4]), 99);

// array_init_data.wast:98
assert_return(() => call($1, "array_get_nth", [5]), 100);

// array_init_data.wast:99
assert_return(() => call($1, "array_get_nth", [6]), 0);

// array_init_data.wast:101
assert_return(() => call($1, "array_init_data_i16", [2, 5, 2]));

// array_init_data.wast:102
assert_return(() => call($1, "array_get_nth_i16", [1]), 0);

// array_init_data.wast:103
assert_return(() => call($1, "array_get_nth_i16", [2]), 26_470);

// array_init_data.wast:104
assert_return(() => call($1, "array_get_nth_i16", [3]), 26_984);

// array_init_data.wast:105
assert_return(() => call($1, "array_get_nth_i16", [4]), 0);

// array_init_data.wast:108
assert_return(() => call($1, "drop_segs", []));

// array_init_data.wast:109
assert_return(() => call($1, "array_init_data", [0, 0, 0]));

// array_init_data.wast:110
assert_trap(() => call($1, "array_init_data", [0, 0, 1]));
