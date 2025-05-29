
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

// ref_test.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x92\x80\x80\x80\x00\x05\x60\x00\x00\x5f\x00\x5e\x78\x00\x60\x01\x6f\x00\x60\x01\x7f\x01\x7f\x03\x8d\x80\x80\x80\x00\x0c\x00\x03\x04\x04\x04\x04\x04\x04\x04\x04\x04\x04\x04\x8a\x80\x80\x80\x00\x03\x6e\x00\x0a\x70\x00\x0a\x6f\x00\x0a\x07\xba\x81\x80\x80\x00\x0b\x04\x69\x6e\x69\x74\x00\x01\x12\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x6e\x75\x6c\x6c\x5f\x64\x61\x74\x61\x00\x02\x0c\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x61\x6e\x79\x00\x03\x0b\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x65\x71\x00\x04\x0c\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x69\x33\x31\x00\x05\x0f\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x73\x74\x72\x75\x63\x74\x00\x06\x0e\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x61\x72\x72\x61\x79\x00\x07\x12\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x6e\x75\x6c\x6c\x5f\x66\x75\x6e\x63\x00\x08\x0d\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x66\x75\x6e\x63\x00\x09\x14\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x6e\x75\x6c\x6c\x5f\x65\x78\x74\x65\x72\x6e\x00\x0a\x0f\x72\x65\x66\x5f\x74\x65\x73\x74\x5f\x65\x78\x74\x65\x72\x6e\x00\x0b\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\xde\x82\x80\x80\x00\x0c\x82\x80\x80\x80\x00\x00\x0b\xfb\x80\x80\x80\x00\x00\x41\x00\xd0\x6e\x26\x00\x41\x01\xd0\x6b\x26\x00\x41\x02\xd0\x71\x26\x00\x41\x03\x41\x07\xfb\x1c\x26\x00\x41\x04\xfb\x01\x01\x26\x00\x41\x05\x41\x00\xfb\x07\x02\x26\x00\x41\x06\x20\x00\xfb\x1a\x26\x00\x41\x07\xd0\x6f\xfb\x1a\x26\x00\x41\x00\xd0\x73\x26\x01\x41\x01\xd0\x70\x26\x01\x41\x02\xd2\x00\x26\x01\x41\x00\xd0\x72\x26\x02\x41\x01\xd0\x6f\x26\x02\x41\x02\x20\x00\x26\x02\x41\x03\x41\x08\xfb\x1c\xfb\x1b\x26\x02\x41\x04\xfb\x01\x01\xfb\x1b\x26\x02\x41\x05\xd0\x6e\xfb\x1b\x26\x02\x0b\x8f\x80\x80\x80\x00\x00\x20\x00\x25\x00\xd1\x20\x00\x25\x00\xfb\x15\x71\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x14\x6e\x20\x00\x25\x00\xfb\x15\x6e\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x14\x6d\x20\x00\x25\x00\xfb\x15\x6d\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x14\x6c\x20\x00\x25\x00\xfb\x15\x6c\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x14\x6b\x20\x00\x25\x00\xfb\x15\x6b\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x14\x6a\x20\x00\x25\x00\xfb\x15\x6a\x6a\x0b\x8f\x80\x80\x80\x00\x00\x20\x00\x25\x01\xd1\x20\x00\x25\x01\xfb\x15\x73\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x01\xfb\x14\x70\x20\x00\x25\x01\xfb\x15\x70\x6a\x0b\x8f\x80\x80\x80\x00\x00\x20\x00\x25\x02\xd1\x20\x00\x25\x02\xfb\x15\x72\x6a\x0b\x91\x80\x80\x80\x00\x00\x20\x00\x25\x02\xfb\x14\x6f\x20\x00\x25\x02\xfb\x15\x6f\x6a\x0b");

// ref_test.wast:3
let $1 = instance($$1);

// ref_test.wast:101
run(() => call($1, "init", [hostref(0)]));

// ref_test.wast:103
assert_return(() => call($1, "ref_test_null_data", [0]), 2);

// ref_test.wast:104
assert_return(() => call($1, "ref_test_null_data", [1]), 2);

// ref_test.wast:105
assert_return(() => call($1, "ref_test_null_data", [2]), 2);

// ref_test.wast:106
assert_return(() => call($1, "ref_test_null_data", [3]), 0);

// ref_test.wast:107
assert_return(() => call($1, "ref_test_null_data", [4]), 0);

// ref_test.wast:108
assert_return(() => call($1, "ref_test_null_data", [5]), 0);

// ref_test.wast:109
assert_return(() => call($1, "ref_test_null_data", [6]), 0);

// ref_test.wast:110
assert_return(() => call($1, "ref_test_null_data", [7]), 2);

// ref_test.wast:112
assert_return(() => call($1, "ref_test_any", [0]), 1);

// ref_test.wast:113
assert_return(() => call($1, "ref_test_any", [1]), 1);

// ref_test.wast:114
assert_return(() => call($1, "ref_test_any", [2]), 1);

// ref_test.wast:115
assert_return(() => call($1, "ref_test_any", [3]), 2);

// ref_test.wast:116
assert_return(() => call($1, "ref_test_any", [4]), 2);

// ref_test.wast:117
assert_return(() => call($1, "ref_test_any", [5]), 2);

// ref_test.wast:118
assert_return(() => call($1, "ref_test_any", [6]), 2);

// ref_test.wast:119
assert_return(() => call($1, "ref_test_any", [7]), 1);

// ref_test.wast:121
assert_return(() => call($1, "ref_test_eq", [0]), 1);

// ref_test.wast:122
assert_return(() => call($1, "ref_test_eq", [1]), 1);

// ref_test.wast:123
assert_return(() => call($1, "ref_test_eq", [2]), 1);

// ref_test.wast:124
assert_return(() => call($1, "ref_test_eq", [3]), 2);

// ref_test.wast:125
assert_return(() => call($1, "ref_test_eq", [4]), 2);

// ref_test.wast:126
assert_return(() => call($1, "ref_test_eq", [5]), 2);

// ref_test.wast:127
assert_return(() => call($1, "ref_test_eq", [6]), 0);

// ref_test.wast:128
assert_return(() => call($1, "ref_test_eq", [7]), 1);

// ref_test.wast:130
assert_return(() => call($1, "ref_test_i31", [0]), 1);

// ref_test.wast:131
assert_return(() => call($1, "ref_test_i31", [1]), 1);

// ref_test.wast:132
assert_return(() => call($1, "ref_test_i31", [2]), 1);

// ref_test.wast:133
assert_return(() => call($1, "ref_test_i31", [3]), 2);

// ref_test.wast:134
assert_return(() => call($1, "ref_test_i31", [4]), 0);

// ref_test.wast:135
assert_return(() => call($1, "ref_test_i31", [5]), 0);

// ref_test.wast:136
assert_return(() => call($1, "ref_test_i31", [6]), 0);

// ref_test.wast:137
assert_return(() => call($1, "ref_test_i31", [7]), 1);

// ref_test.wast:139
assert_return(() => call($1, "ref_test_struct", [0]), 1);

// ref_test.wast:140
assert_return(() => call($1, "ref_test_struct", [1]), 1);

// ref_test.wast:141
assert_return(() => call($1, "ref_test_struct", [2]), 1);

// ref_test.wast:142
assert_return(() => call($1, "ref_test_struct", [3]), 0);

// ref_test.wast:143
assert_return(() => call($1, "ref_test_struct", [4]), 2);

// ref_test.wast:144
assert_return(() => call($1, "ref_test_struct", [5]), 0);

// ref_test.wast:145
assert_return(() => call($1, "ref_test_struct", [6]), 0);

// ref_test.wast:146
assert_return(() => call($1, "ref_test_struct", [7]), 1);

// ref_test.wast:148
assert_return(() => call($1, "ref_test_array", [0]), 1);

// ref_test.wast:149
assert_return(() => call($1, "ref_test_array", [1]), 1);

// ref_test.wast:150
assert_return(() => call($1, "ref_test_array", [2]), 1);

// ref_test.wast:151
assert_return(() => call($1, "ref_test_array", [3]), 0);

// ref_test.wast:152
assert_return(() => call($1, "ref_test_array", [4]), 0);

// ref_test.wast:153
assert_return(() => call($1, "ref_test_array", [5]), 2);

// ref_test.wast:154
assert_return(() => call($1, "ref_test_array", [6]), 0);

// ref_test.wast:155
assert_return(() => call($1, "ref_test_array", [7]), 1);

// ref_test.wast:157
assert_return(() => call($1, "ref_test_null_func", [0]), 2);

// ref_test.wast:158
assert_return(() => call($1, "ref_test_null_func", [1]), 2);

// ref_test.wast:159
assert_return(() => call($1, "ref_test_null_func", [2]), 0);

// ref_test.wast:161
assert_return(() => call($1, "ref_test_func", [0]), 1);

// ref_test.wast:162
assert_return(() => call($1, "ref_test_func", [1]), 1);

// ref_test.wast:163
assert_return(() => call($1, "ref_test_func", [2]), 2);

// ref_test.wast:165
assert_return(() => call($1, "ref_test_null_extern", [0]), 2);

// ref_test.wast:166
assert_return(() => call($1, "ref_test_null_extern", [1]), 2);

// ref_test.wast:167
assert_return(() => call($1, "ref_test_null_extern", [2]), 0);

// ref_test.wast:168
assert_return(() => call($1, "ref_test_null_extern", [3]), 0);

// ref_test.wast:169
assert_return(() => call($1, "ref_test_null_extern", [4]), 0);

// ref_test.wast:170
assert_return(() => call($1, "ref_test_null_extern", [5]), 2);

// ref_test.wast:172
assert_return(() => call($1, "ref_test_extern", [0]), 1);

// ref_test.wast:173
assert_return(() => call($1, "ref_test_extern", [1]), 1);

// ref_test.wast:174
assert_return(() => call($1, "ref_test_extern", [2]), 2);

// ref_test.wast:175
assert_return(() => call($1, "ref_test_extern", [3]), 2);

// ref_test.wast:176
assert_return(() => call($1, "ref_test_extern", [4]), 2);

// ref_test.wast:177
assert_return(() => call($1, "ref_test_extern", [5]), 1);

// ref_test.wast:182
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xbf\x80\x80\x80\x00\x09\x50\x00\x5f\x00\x50\x01\x00\x5f\x01\x7f\x00\x50\x01\x00\x5f\x01\x7f\x00\x50\x01\x01\x5f\x02\x7f\x00\x7f\x00\x50\x01\x02\x5f\x02\x7f\x00\x7f\x00\x50\x01\x00\x5f\x02\x7f\x00\x7f\x00\x50\x01\x00\x5f\x00\x50\x01\x06\x5f\x02\x7f\x00\x7f\x00\x60\x00\x00\x03\x84\x80\x80\x80\x00\x03\x08\x08\x08\x04\x84\x80\x80\x80\x00\x01\x6b\x00\x14\x07\x99\x80\x80\x80\x00\x02\x08\x74\x65\x73\x74\x2d\x73\x75\x62\x00\x01\x0a\x74\x65\x73\x74\x2d\x63\x61\x6e\x6f\x6e\x00\x02\x0a\xca\x86\x80\x80\x00\x03\xba\x80\x80\x80\x00\x00\x41\x00\xfb\x01\x00\x26\x00\x41\x0a\xfb\x01\x00\x26\x00\x41\x01\xfb\x01\x01\x26\x00\x41\x0b\xfb\x01\x02\x26\x00\x41\x02\xfb\x01\x03\x26\x00\x41\x0c\xfb\x01\x04\x26\x00\x41\x03\xfb\x01\x05\x26\x00\x41\x04\xfb\x01\x07\x26\x00\x0b\xeb\x84\x80\x80\x00\x00\x10\x00\x02\x40\xd0\x6b\xfb\x15\x00\x45\x0d\x00\xd0\x00\xfb\x15\x00\x45\x0d\x00\xd0\x01\xfb\x15\x00\x45\x0d\x00\xd0\x03\xfb\x15\x00\x45\x0d\x00\xd0\x05\xfb\x15\x00\x45\x0d\x00\xd0\x07\xfb\x15\x00\x45\x0d\x00\x41\x00\x25\x00\xfb\x15\x00\x45\x0d\x00\x41\x01\x25\x00\xfb\x15\x00\x45\x0d\x00\x41\x02\x25\x00\xfb\x15\x00\x45\x0d\x00\x41\x03\x25\x00\xfb\x15\x00\x45\x0d\x00\x41\x04\x25\x00\xfb\x15\x00\x45\x0d\x00\xd0\x6b\xfb\x15\x01\x45\x0d\x00\xd0\x00\xfb\x15\x01\x45\x0d\x00\xd0\x01\xfb\x15\x01\x45\x0d\x00\xd0\x03\xfb\x15\x01\x45\x0d\x00\xd0\x05\xfb\x15\x01\x45\x0d\x00\xd0\x07\xfb\x15\x01\x45\x0d\x00\x41\x01\x25\x00\xfb\x15\x01\x45\x0d\x00\x41\x02\x25\x00\xfb\x15\x01\x45\x0d\x00\xd0\x6b\xfb\x15\x03\x45\x0d\x00\xd0\x00\xfb\x15\x03\x45\x0d\x00\xd0\x01\xfb\x15\x03\x45\x0d\x00\xd0\x03\xfb\x15\x03\x45\x0d\x00\xd0\x05\xfb\x15\x03\x45\x0d\x00\xd0\x07\xfb\x15\x03\x45\x0d\x00\x41\x02\x25\x00\xfb\x15\x03\x45\x0d\x00\xd0\x6b\xfb\x15\x05\x45\x0d\x00\xd0\x00\xfb\x15\x05\x45\x0d\x00\xd0\x01\xfb\x15\x05\x45\x0d\x00\xd0\x03\xfb\x15\x05\x45\x0d\x00\xd0\x05\xfb\x15\x05\x45\x0d\x00\xd0\x07\xfb\x15\x05\x45\x0d\x00\x41\x03\x25\x00\xfb\x15\x05\x45\x0d\x00\xd0\x6b\xfb\x15\x07\x45\x0d\x00\xd0\x00\xfb\x15\x07\x45\x0d\x00\xd0\x01\xfb\x15\x07\x45\x0d\x00\xd0\x03\xfb\x15\x07\x45\x0d\x00\xd0\x05\xfb\x15\x07\x45\x0d\x00\xd0\x07\xfb\x15\x07\x45\x0d\x00\x41\x04\x25\x00\xfb\x15\x07\x45\x0d\x00\x41\x00\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x01\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x03\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x04\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x01\x25\x00\xfb\x14\x01\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x01\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x03\x45\x0d\x00\x41\x03\x25\x00\xfb\x14\x05\x45\x0d\x00\x41\x04\x25\x00\xfb\x14\x07\x45\x0d\x00\xd0\x6b\xfb\x14\x00\x0d\x00\xd0\x6b\xfb\x14\x01\x0d\x00\xd0\x6b\xfb\x14\x03\x0d\x00\xd0\x6b\xfb\x14\x05\x0d\x00\xd0\x6b\xfb\x14\x07\x0d\x00\x41\x00\x25\x00\xfb\x14\x01\x0d\x00\x41\x03\x25\x00\xfb\x14\x01\x0d\x00\x41\x04\x25\x00\xfb\x14\x01\x0d\x00\x41\x00\x25\x00\xfb\x14\x03\x0d\x00\x41\x01\x25\x00\xfb\x14\x03\x0d\x00\x41\x03\x25\x00\xfb\x14\x03\x0d\x00\x41\x04\x25\x00\xfb\x14\x03\x0d\x00\x41\x00\x25\x00\xfb\x14\x05\x0d\x00\x41\x01\x25\x00\xfb\x14\x05\x0d\x00\x41\x02\x25\x00\xfb\x14\x05\x0d\x00\x41\x04\x25\x00\xfb\x14\x05\x0d\x00\x41\x00\x25\x00\xfb\x14\x07\x0d\x00\x41\x01\x25\x00\xfb\x14\x07\x0d\x00\x41\x02\x25\x00\xfb\x14\x07\x0d\x00\x41\x03\x25\x00\xfb\x14\x07\x0d\x00\x0f\x0b\x00\x0b\x95\x81\x80\x80\x00\x00\x10\x00\x02\x40\x41\x00\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x01\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x03\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x04\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x0a\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x0b\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x0c\x25\x00\xfb\x14\x00\x45\x0d\x00\x41\x01\x25\x00\xfb\x14\x02\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x02\x45\x0d\x00\x41\x0b\x25\x00\xfb\x14\x01\x45\x0d\x00\x41\x0c\x25\x00\xfb\x14\x01\x45\x0d\x00\x41\x02\x25\x00\xfb\x14\x04\x45\x0d\x00\x41\x0c\x25\x00\xfb\x14\x03\x45\x0d\x00\x0f\x0b\x00\x0b");

// ref_test.wast:182
let $2 = instance($$2);

// ref_test.wast:329
assert_return(() => call($2, "test-sub", []));

// ref_test.wast:330
assert_return(() => call($2, "test-canon", []));
