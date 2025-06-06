
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

// ref_cast.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x91\x80\x80\x80\x00\x05\x60\x00\x00\x5f\x00\x5e\x78\x00\x60\x01\x6f\x00\x60\x01\x7f\x00\x03\x88\x80\x80\x80\x00\x07\x00\x03\x04\x04\x04\x04\x04\x04\x84\x80\x80\x80\x00\x01\x6e\x00\x0a\x07\xde\x80\x80\x80\x00\x06\x04\x69\x6e\x69\x74\x00\x01\x11\x72\x65\x66\x5f\x63\x61\x73\x74\x5f\x6e\x6f\x6e\x5f\x6e\x75\x6c\x6c\x00\x02\x0d\x72\x65\x66\x5f\x63\x61\x73\x74\x5f\x6e\x75\x6c\x6c\x00\x03\x0c\x72\x65\x66\x5f\x63\x61\x73\x74\x5f\x69\x33\x31\x00\x04\x0f\x72\x65\x66\x5f\x63\x61\x73\x74\x5f\x73\x74\x72\x75\x63\x74\x00\x05\x0e\x72\x65\x66\x5f\x63\x61\x73\x74\x5f\x61\x72\x72\x61\x79\x00\x06\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xd0\x81\x80\x80\x00\x07\x82\x80\x80\x80\x00\x00\x0b\xba\x80\x80\x80\x00\x00\x41\x00\xd0\x6e\x26\x00\x41\x01\x41\x07\xfb\x1c\x26\x00\x41\x02\xfb\x01\x01\x26\x00\x41\x03\x41\x00\xfb\x07\x02\x26\x00\x41\x04\x20\x00\xfb\x1a\x26\x00\x41\x05\xd0\x6c\x26\x00\x41\x06\xd0\x6b\x26\x00\x41\x07\xd0\x71\x26\x00\x0b\x90\x80\x80\x80\x00\x00\x20\x00\x25\x00\xd4\x1a\x20\x00\x25\x00\xfb\x17\x6e\x1a\x0b\xaa\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x17\x6e\x1a\x20\x00\x25\x00\xfb\x17\x6b\x1a\x20\x00\x25\x00\xfb\x17\x6a\x1a\x20\x00\x25\x00\xfb\x17\x6c\x1a\x20\x00\x25\x00\xfb\x17\x71\x1a\x0b\x92\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x16\x6c\x1a\x20\x00\x25\x00\xfb\x17\x6c\x1a\x0b\x92\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x16\x6b\x1a\x20\x00\x25\x00\xfb\x17\x6b\x1a\x0b\x92\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x16\x6a\x1a\x20\x00\x25\x00\xfb\x17\x6a\x1a\x0b");

// ref_cast.wast:3
let $1 = instance($$1);

// ref_cast.wast:49
run(() => call($1, "init", [hostref(0)]));

// ref_cast.wast:51
assert_trap(() => call($1, "ref_cast_non_null", [0]));

// ref_cast.wast:52
assert_return(() => call($1, "ref_cast_non_null", [1]));

// ref_cast.wast:53
assert_return(() => call($1, "ref_cast_non_null", [2]));

// ref_cast.wast:54
assert_return(() => call($1, "ref_cast_non_null", [3]));

// ref_cast.wast:55
assert_return(() => call($1, "ref_cast_non_null", [4]));

// ref_cast.wast:56
assert_trap(() => call($1, "ref_cast_non_null", [5]));

// ref_cast.wast:57
assert_trap(() => call($1, "ref_cast_non_null", [6]));

// ref_cast.wast:58
assert_trap(() => call($1, "ref_cast_non_null", [7]));

// ref_cast.wast:60
assert_return(() => call($1, "ref_cast_null", [0]));

// ref_cast.wast:61
assert_trap(() => call($1, "ref_cast_null", [1]));

// ref_cast.wast:62
assert_trap(() => call($1, "ref_cast_null", [2]));

// ref_cast.wast:63
assert_trap(() => call($1, "ref_cast_null", [3]));

// ref_cast.wast:64
assert_trap(() => call($1, "ref_cast_null", [4]));

// ref_cast.wast:65
assert_return(() => call($1, "ref_cast_null", [5]));

// ref_cast.wast:66
assert_return(() => call($1, "ref_cast_null", [6]));

// ref_cast.wast:67
assert_return(() => call($1, "ref_cast_null", [7]));

// ref_cast.wast:69
assert_trap(() => call($1, "ref_cast_i31", [0]));

// ref_cast.wast:70
assert_return(() => call($1, "ref_cast_i31", [1]));

// ref_cast.wast:71
assert_trap(() => call($1, "ref_cast_i31", [2]));

// ref_cast.wast:72
assert_trap(() => call($1, "ref_cast_i31", [3]));

// ref_cast.wast:73
assert_trap(() => call($1, "ref_cast_i31", [4]));

// ref_cast.wast:74
assert_trap(() => call($1, "ref_cast_i31", [5]));

// ref_cast.wast:75
assert_trap(() => call($1, "ref_cast_i31", [6]));

// ref_cast.wast:76
assert_trap(() => call($1, "ref_cast_i31", [7]));

// ref_cast.wast:78
assert_trap(() => call($1, "ref_cast_struct", [0]));

// ref_cast.wast:79
assert_trap(() => call($1, "ref_cast_struct", [1]));

// ref_cast.wast:80
assert_return(() => call($1, "ref_cast_struct", [2]));

// ref_cast.wast:81
assert_trap(() => call($1, "ref_cast_struct", [3]));

// ref_cast.wast:82
assert_trap(() => call($1, "ref_cast_struct", [4]));

// ref_cast.wast:83
assert_trap(() => call($1, "ref_cast_struct", [5]));

// ref_cast.wast:84
assert_trap(() => call($1, "ref_cast_struct", [6]));

// ref_cast.wast:85
assert_trap(() => call($1, "ref_cast_struct", [7]));

// ref_cast.wast:87
assert_trap(() => call($1, "ref_cast_array", [0]));

// ref_cast.wast:88
assert_trap(() => call($1, "ref_cast_array", [1]));

// ref_cast.wast:89
assert_trap(() => call($1, "ref_cast_array", [2]));

// ref_cast.wast:90
assert_return(() => call($1, "ref_cast_array", [3]));

// ref_cast.wast:91
assert_trap(() => call($1, "ref_cast_array", [4]));

// ref_cast.wast:92
assert_trap(() => call($1, "ref_cast_array", [5]));

// ref_cast.wast:93
assert_trap(() => call($1, "ref_cast_array", [6]));

// ref_cast.wast:94
assert_trap(() => call($1, "ref_cast_array", [7]));

// ref_cast.wast:99
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xbf\x80\x80\x80\x00\x09\x50\x00\x5f\x00\x50\x01\x00\x5f\x01\x7f\x00\x50\x01\x00\x5f\x01\x7f\x00\x50\x01\x01\x5f\x02\x7f\x00\x7f\x00\x50\x01\x02\x5f\x02\x7f\x00\x7f\x00\x50\x01\x00\x5f\x02\x7f\x00\x7f\x00\x50\x01\x00\x5f\x00\x50\x01\x06\x5f\x02\x7f\x00\x7f\x00\x60\x00\x00\x03\x84\x80\x80\x80\x00\x03\x08\x08\x08\x04\x84\x80\x80\x80\x00\x01\x6b\x00\x14\x07\x99\x80\x80\x80\x00\x02\x08\x74\x65\x73\x74\x2d\x73\x75\x62\x00\x01\x0a\x74\x65\x73\x74\x2d\x63\x61\x6e\x6f\x6e\x00\x02\x0a\xfa\x82\x80\x80\x00\x03\xba\x80\x80\x80\x00\x00\x41\x00\xfb\x01\x00\x26\x00\x41\x0a\xfb\x01\x00\x26\x00\x41\x01\xfb\x01\x01\x26\x00\x41\x0b\xfb\x01\x02\x26\x00\x41\x02\xfb\x01\x03\x26\x00\x41\x0c\xfb\x01\x04\x26\x00\x41\x03\xfb\x01\x05\x26\x00\x41\x04\xfb\x01\x07\x26\x00\x0b\xbc\x81\x80\x80\x00\x00\x10\x00\xd0\x6b\xfb\x17\x00\x1a\x41\x00\x25\x00\xfb\x17\x00\x1a\x41\x01\x25\x00\xfb\x17\x00\x1a\x41\x02\x25\x00\xfb\x17\x00\x1a\x41\x03\x25\x00\xfb\x17\x00\x1a\x41\x04\x25\x00\xfb\x17\x00\x1a\xd0\x6b\xfb\x17\x00\x1a\x41\x01\x25\x00\xfb\x17\x01\x1a\x41\x02\x25\x00\xfb\x17\x01\x1a\xd0\x6b\xfb\x17\x00\x1a\x41\x02\x25\x00\xfb\x17\x03\x1a\xd0\x6b\xfb\x17\x00\x1a\x41\x03\x25\x00\xfb\x17\x05\x1a\x41\x04\x25\x00\xfb\x17\x07\x1a\x41\x00\x25\x00\xfb\x16\x00\x1a\x41\x01\x25\x00\xfb\x16\x00\x1a\x41\x02\x25\x00\xfb\x16\x00\x1a\x41\x03\x25\x00\xfb\x16\x00\x1a\x41\x04\x25\x00\xfb\x16\x00\x1a\x41\x01\x25\x00\xfb\x16\x01\x1a\x41\x02\x25\x00\xfb\x16\x01\x1a\x41\x02\x25\x00\xfb\x16\x03\x1a\x41\x03\x25\x00\xfb\x16\x05\x1a\x41\x04\x25\x00\xfb\x16\x07\x1a\x0b\xf4\x80\x80\x80\x00\x00\x10\x00\x41\x00\x25\x00\xfb\x16\x00\x1a\x41\x01\x25\x00\xfb\x16\x00\x1a\x41\x02\x25\x00\xfb\x16\x00\x1a\x41\x03\x25\x00\xfb\x16\x00\x1a\x41\x04\x25\x00\xfb\x16\x00\x1a\x41\x0a\x25\x00\xfb\x16\x00\x1a\x41\x0b\x25\x00\xfb\x16\x00\x1a\x41\x0c\x25\x00\xfb\x16\x00\x1a\x41\x01\x25\x00\xfb\x16\x02\x1a\x41\x02\x25\x00\xfb\x16\x02\x1a\x41\x0b\x25\x00\xfb\x16\x01\x1a\x41\x0c\x25\x00\xfb\x16\x01\x1a\x41\x02\x25\x00\xfb\x16\x04\x1a\x41\x0c\x25\x00\xfb\x16\x03\x1a\x0b");

// ref_cast.wast:99
let $2 = instance($$2);

// ref_cast.wast:185
run(() => call($2, "test-sub", []));

// ref_cast.wast:186
run(() => call($2, "test-canon", []));
