
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

// array_init_elem.wast:5
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x89\x80\x80\x80\x00\x02\x5e\x70\x00\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x07\x9d\x80\x80\x80\x00\x01\x19\x61\x72\x72\x61\x79\x2e\x69\x6e\x69\x74\x5f\x65\x6c\x65\x6d\x2d\x69\x6d\x6d\x75\x74\x61\x62\x6c\x65\x00\x00\x09\x84\x80\x80\x80\x00\x01\x05\x70\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x41\x00\x41\x00\xfb\x13\x00\x00\x0b");

// array_init_elem.wast:18
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x89\x80\x80\x80\x00\x02\x5e\x78\x01\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x07\x9d\x80\x80\x80\x00\x01\x19\x61\x72\x72\x61\x79\x2e\x69\x6e\x69\x74\x5f\x65\x6c\x65\x6d\x2d\x69\x6e\x76\x61\x6c\x69\x64\x2d\x31\x00\x00\x09\x84\x80\x80\x80\x00\x01\x05\x70\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x41\x00\x41\x00\xfb\x13\x00\x00\x0b");

// array_init_elem.wast:31
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x89\x80\x80\x80\x00\x02\x5e\x70\x01\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x07\x9d\x80\x80\x80\x00\x01\x19\x61\x72\x72\x61\x79\x2e\x69\x6e\x69\x74\x5f\x65\x6c\x65\x6d\x2d\x69\x6e\x76\x61\x6c\x69\x64\x2d\x32\x00\x00\x09\x84\x80\x80\x80\x00\x01\x05\x6f\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x41\x00\x41\x00\xfb\x13\x00\x00\x0b");

// array_init_elem.wast:44
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x05\x60\x00\x00\x5e\x64\x00\x00\x5e\x70\x01\x60\x01\x7f\x00\x60\x03\x7f\x7f\x7f\x00\x03\x86\x80\x80\x80\x00\x05\x00\x03\x00\x04\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x01\x06\x95\x80\x80\x80\x00\x02\x64\x01\x00\xd2\x00\x41\x0c\xfb\x06\x01\x0b\x64\x02\x00\x41\x0c\xfb\x07\x02\x0b\x07\xc7\x80\x80\x80\x00\x04\x0e\x61\x72\x72\x61\x79\x5f\x63\x61\x6c\x6c\x5f\x6e\x74\x68\x00\x01\x14\x61\x72\x72\x61\x79\x5f\x69\x6e\x69\x74\x5f\x65\x6c\x65\x6d\x2d\x6e\x75\x6c\x6c\x00\x02\x0f\x61\x72\x72\x61\x79\x5f\x69\x6e\x69\x74\x5f\x65\x6c\x65\x6d\x00\x03\x09\x64\x72\x6f\x70\x5f\x73\x65\x67\x73\x00\x04\x09\x90\x80\x80\x80\x00\x01\x01\x00\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0a\xcf\x80\x80\x80\x00\x05\x82\x80\x80\x80\x00\x00\x0b\x92\x80\x80\x80\x00\x00\x41\x00\x23\x01\x20\x00\xfb\x0b\x02\x26\x00\x41\x00\x11\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\xd0\x02\x41\x00\x41\x00\x41\x00\xfb\x13\x02\x00\x0b\x8e\x80\x80\x80\x00\x00\x23\x01\x20\x00\x20\x01\x20\x02\xfb\x13\x02\x00\x0b\x85\x80\x80\x80\x00\x00\xfc\x0d\x00\x0b");

// array_init_elem.wast:44
let $1 = instance($$1);

// array_init_elem.wast:78
assert_trap(() => call($1, "array_init_elem-null", []));

// array_init_elem.wast:81
assert_trap(() => call($1, "array_init_elem", [13, 0, 0]));

// array_init_elem.wast:82
assert_trap(() => call($1, "array_init_elem", [0, 13, 0]));

// array_init_elem.wast:85
assert_trap(() => call($1, "array_init_elem", [0, 0, 13]));

// array_init_elem.wast:86
assert_trap(() => call($1, "array_init_elem", [0, 0, 13]));

// array_init_elem.wast:89
assert_return(() => call($1, "array_init_elem", [12, 0, 0]));

// array_init_elem.wast:90
assert_return(() => call($1, "array_init_elem", [0, 12, 0]));

// array_init_elem.wast:93
assert_trap(() => call($1, "array_call_nth", [0]));

// array_init_elem.wast:94
assert_trap(() => call($1, "array_call_nth", [5]));

// array_init_elem.wast:95
assert_trap(() => call($1, "array_call_nth", [11]));

// array_init_elem.wast:96
assert_trap(() => call($1, "array_call_nth", [12]));

// array_init_elem.wast:99
assert_return(() => call($1, "array_init_elem", [2, 3, 2]));

// array_init_elem.wast:100
assert_trap(() => call($1, "array_call_nth", [1]));

// array_init_elem.wast:101
assert_return(() => call($1, "array_call_nth", [2]));

// array_init_elem.wast:102
assert_return(() => call($1, "array_call_nth", [3]));

// array_init_elem.wast:103
assert_trap(() => call($1, "array_call_nth", [4]));

// array_init_elem.wast:106
assert_return(() => call($1, "drop_segs", []));

// array_init_elem.wast:107
assert_return(() => call($1, "array_init_elem", [0, 0, 0]));

// array_init_elem.wast:108
assert_trap(() => call($1, "array_init_elem", [0, 0, 1]));
