
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

// call_ref.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x9c\x80\x80\x80\x00\x05\x60\x01\x7f\x01\x7f\x60\x01\x7e\x01\x7e\x60\x02\x7e\x7e\x01\x7e\x60\x02\x64\x00\x7f\x01\x7f\x60\x00\x01\x7f\x03\x8b\x80\x80\x80\x00\x0a\x03\x00\x00\x00\x04\x01\x02\x01\x01\x01\x06\x9f\x80\x80\x80\x00\x05\x64\x01\x00\xd2\x05\x0b\x64\x02\x00\xd2\x06\x0b\x64\x01\x00\xd2\x07\x0b\x64\x01\x00\xd2\x08\x0b\x64\x01\x00\xd2\x09\x0b\x07\xb1\x80\x80\x80\x00\x07\x03\x72\x75\x6e\x00\x03\x04\x6e\x75\x6c\x6c\x00\x04\x03\x66\x61\x63\x00\x05\x07\x66\x61\x63\x2d\x61\x63\x63\x00\x06\x03\x66\x69\x62\x00\x07\x04\x65\x76\x65\x6e\x00\x08\x03\x6f\x64\x64\x00\x09\x09\x97\x80\x80\x80\x00\x05\x03\x00\x02\x01\x02\x03\x00\x01\x05\x03\x00\x01\x06\x03\x00\x01\x07\x03\x00\x02\x08\x09\x0a\xe1\x81\x80\x80\x00\x0a\x88\x80\x80\x80\x00\x00\x20\x01\x20\x00\x14\x00\x0b\x87\x80\x80\x80\x00\x00\x20\x00\x20\x00\x6c\x0b\x87\x80\x80\x80\x00\x00\x41\x00\x20\x00\x6b\x0b\x97\x80\x80\x80\x00\x01\x02\x63\x00\xd2\x01\x21\x01\xd2\x02\x21\x02\x20\x00\x20\x01\x14\x00\x20\x02\x14\x00\x0b\x88\x80\x80\x80\x00\x00\x41\x01\xd0\x00\x14\x00\x0b\x97\x80\x80\x80\x00\x00\x20\x00\x50\x04\x7e\x42\x01\x05\x20\x00\x20\x00\x42\x01\x7d\x23\x00\x14\x01\x7e\x0b\x0b\x99\x80\x80\x80\x00\x00\x20\x00\x50\x04\x7e\x20\x01\x05\x20\x00\x42\x01\x7d\x20\x00\x20\x01\x7e\x23\x01\x14\x02\x0b\x0b\xa0\x80\x80\x80\x00\x00\x20\x00\x42\x01\x58\x04\x7e\x42\x01\x05\x20\x00\x42\x02\x7d\x23\x02\x14\x01\x20\x00\x42\x01\x7d\x23\x02\x14\x01\x7c\x0b\x0b\x94\x80\x80\x80\x00\x00\x20\x00\x50\x04\x7e\x42\x2c\x05\x20\x00\x42\x01\x7d\x23\x04\x14\x01\x0b\x0b\x95\x80\x80\x80\x00\x00\x20\x00\x50\x04\x7e\x42\xe3\x00\x05\x20\x00\x42\x01\x7d\x23\x03\x14\x01\x0b\x0b");

// call_ref.wast:1
let $1 = instance($$1);

// call_ref.wast:94
assert_return(() => call($1, "run", [0]), 0);

// call_ref.wast:95
assert_return(() => call($1, "run", [3]), -9);

// call_ref.wast:97
assert_trap(() => call($1, "null", []));

// call_ref.wast:99
assert_return(() => call($1, "fac", [0n]), 1n);

// call_ref.wast:100
assert_return(() => call($1, "fac", [1n]), 1n);

// call_ref.wast:101
assert_return(() => call($1, "fac", [5n]), 120n);

// call_ref.wast:102
assert_return(() => call($1, "fac", [25n]), 7_034_535_277_573_963_776n);

// call_ref.wast:103
assert_return(() => call($1, "fac-acc", [0n, 1n]), 1n);

// call_ref.wast:104
assert_return(() => call($1, "fac-acc", [1n, 1n]), 1n);

// call_ref.wast:105
assert_return(() => call($1, "fac-acc", [5n, 1n]), 120n);

// call_ref.wast:106
assert_return(() => call($1, "fac-acc", [25n, 1n]), 7_034_535_277_573_963_776n);

// call_ref.wast:111
assert_return(() => call($1, "fib", [0n]), 1n);

// call_ref.wast:112
assert_return(() => call($1, "fib", [1n]), 1n);

// call_ref.wast:113
assert_return(() => call($1, "fib", [2n]), 2n);

// call_ref.wast:114
assert_return(() => call($1, "fib", [5n]), 8n);

// call_ref.wast:115
assert_return(() => call($1, "fib", [20n]), 10_946n);

// call_ref.wast:117
assert_return(() => call($1, "even", [0n]), 44n);

// call_ref.wast:118
assert_return(() => call($1, "even", [1n]), 99n);

// call_ref.wast:119
assert_return(() => call($1, "even", [100n]), 44n);

// call_ref.wast:120
assert_return(() => call($1, "even", [77n]), 99n);

// call_ref.wast:121
assert_return(() => call($1, "odd", [0n]), 99n);

// call_ref.wast:122
assert_return(() => call($1, "odd", [1n]), 44n);

// call_ref.wast:123
assert_return(() => call($1, "odd", [200n]), 99n);

// call_ref.wast:124
assert_return(() => call($1, "odd", [77n]), 44n);

// call_ref.wast:129
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x00\x00\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x01\x07\x8f\x80\x80\x80\x00\x01\x0b\x75\x6e\x72\x65\x61\x63\x68\x61\x62\x6c\x65\x00\x00\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\x00\x14\x00\x0b");

// call_ref.wast:129
let $2 = instance($$2);

// call_ref.wast:136
assert_trap(() => call($2, "unreachable", []));

// call_ref.wast:138
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x00\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x01\x07\x8f\x80\x80\x80\x00\x01\x0b\x75\x6e\x72\x65\x61\x63\x68\x61\x62\x6c\x65\x00\x01\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\x96\x80\x80\x80\x00\x02\x84\x80\x80\x80\x00\x00\x20\x00\x0b\x87\x80\x80\x80\x00\x00\x00\xd2\x00\x14\x00\x0b");

// call_ref.wast:138
let $3 = instance($$3);

// call_ref.wast:149
assert_trap(() => call($3, "unreachable", []));

// call_ref.wast:151
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x00\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x01\x07\x8f\x80\x80\x80\x00\x01\x0b\x75\x6e\x72\x65\x61\x63\x68\x61\x62\x6c\x65\x00\x01\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\x9b\x80\x80\x80\x00\x02\x84\x80\x80\x80\x00\x00\x20\x00\x0b\x8c\x80\x80\x80\x00\x00\x00\x41\x00\xd2\x00\x14\x00\x1a\x41\x00\x0b");

// call_ref.wast:151
let $4 = instance($$4);

// call_ref.wast:165
assert_trap(() => call($4, "unreachable", []));

// call_ref.wast:167
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x00\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x01\x07\x8f\x80\x80\x80\x00\x01\x0b\x75\x6e\x72\x65\x61\x63\x68\x61\x62\x6c\x65\x00\x01\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\x98\x80\x80\x80\x00\x02\x84\x80\x80\x80\x00\x00\x20\x00\x0b\x89\x80\x80\x80\x00\x00\x00\x42\x00\xd2\x00\x14\x00\x0b");

// call_ref.wast:183
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x00\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x01\x07\x8f\x80\x80\x80\x00\x01\x0b\x75\x6e\x72\x65\x61\x63\x68\x61\x62\x6c\x65\x00\x01\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\x99\x80\x80\x80\x00\x02\x84\x80\x80\x80\x00\x00\x20\x00\x0b\x8a\x80\x80\x80\x00\x00\x00\xd2\x00\x14\x00\x1a\x42\x00\x0b");

// call_ref.wast:200
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x00\x00\x60\x01\x6f\x00\x03\x82\x80\x80\x80\x00\x01\x01\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x20\x00\x14\x00\x0b");

// call_ref.wast:210
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x00\x00\x60\x01\x70\x00\x03\x82\x80\x80\x80\x00\x01\x01\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x20\x00\x14\x00\x0b");
