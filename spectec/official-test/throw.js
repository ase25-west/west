
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

// throw.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xa3\x80\x80\x80\x00\x08\x60\x00\x00\x60\x01\x7f\x00\x60\x01\x7d\x00\x60\x01\x7e\x00\x60\x01\x7c\x00\x60\x02\x7f\x7f\x00\x60\x01\x7f\x01\x7f\x60\x00\x02\x7f\x7f\x03\x89\x80\x80\x80\x00\x08\x06\x02\x03\x04\x00\x00\x00\x00\x0d\x8d\x80\x80\x80\x00\x06\x00\x00\x00\x01\x00\x02\x00\x03\x00\x04\x00\x05\x07\x81\x81\x80\x80\x00\x07\x08\x74\x68\x72\x6f\x77\x2d\x69\x66\x00\x00\x0f\x74\x68\x72\x6f\x77\x2d\x70\x61\x72\x61\x6d\x2d\x66\x33\x32\x00\x01\x0f\x74\x68\x72\x6f\x77\x2d\x70\x61\x72\x61\x6d\x2d\x69\x36\x34\x00\x02\x0f\x74\x68\x72\x6f\x77\x2d\x70\x61\x72\x61\x6d\x2d\x66\x36\x34\x00\x03\x11\x74\x68\x72\x6f\x77\x2d\x70\x6f\x6c\x79\x6d\x6f\x72\x70\x68\x69\x63\x00\x04\x17\x74\x68\x72\x6f\x77\x2d\x70\x6f\x6c\x79\x6d\x6f\x72\x70\x68\x69\x63\x2d\x62\x6c\x6f\x63\x6b\x00\x05\x0e\x74\x65\x73\x74\x2d\x74\x68\x72\x6f\x77\x2d\x31\x2d\x32\x00\x07\x0a\xfd\x80\x80\x80\x00\x08\x8e\x80\x80\x80\x00\x00\x20\x00\x41\x00\x47\x04\x40\x08\x00\x0b\x41\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x08\x02\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x08\x03\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x08\x04\x0b\x86\x80\x80\x80\x00\x00\x08\x00\x08\x01\x0b\x89\x80\x80\x80\x00\x00\x02\x7f\x08\x00\x0b\x08\x01\x0b\x88\x80\x80\x80\x00\x00\x41\x01\x41\x02\x08\x05\x0b\x9d\x80\x80\x80\x00\x00\x02\x07\x1f\x40\x01\x00\x05\x00\x10\x06\x0b\x0f\x0b\x41\x02\x47\x04\x40\x00\x0b\x41\x01\x47\x04\x40\x00\x0b\x0b");

// throw.wast:3
let $1 = instance($$1);

// throw.wast:38
assert_return(() => call($1, "throw-if", [0]), 0);

// throw.wast:39
assert_exception(() => call($1, "throw-if", [10]));

// throw.wast:40
assert_exception(() => call($1, "throw-if", [-1]));

// throw.wast:42
assert_exception(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x01\x7d\x00\x02\xbf\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x0f\x74\x68\x72\x6f\x77\x2d\x70\x61\x72\x61\x6d\x2d\x66\x33\x32\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x02\x40\x43\x00\x00\xa0\x40\x10\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_exception(() => call($1, "throw-param-f32", [5.]))

// throw.wast:43
assert_exception(() => call($1, "throw-param-i64", [5n]));

// throw.wast:44
assert_exception(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x01\x7c\x00\x02\xbf\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x0f\x74\x68\x72\x6f\x77\x2d\x70\x61\x72\x61\x6d\x2d\x66\x36\x34\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x98\x80\x80\x80\x00\x01\x92\x80\x80\x80\x00\x00\x02\x40\x44\x00\x00\x00\x00\x00\x00\x14\x40\x10\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_exception(() => call($1, "throw-param-f64", [5.]))

// throw.wast:46
assert_exception(() => call($1, "throw-polymorphic", []));

// throw.wast:47
assert_exception(() => call($1, "throw-polymorphic-block", []));

// throw.wast:49
assert_return(() => call($1, "test-throw-1-2", []));

// throw.wast:51
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x08\x00\x0b");

// throw.wast:52
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x01\x7f\x00\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x0d\x83\x80\x80\x80\x00\x01\x00\x00\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x08\x00\x0b");

// throw.wast:54
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x01\x7f\x00\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x0d\x83\x80\x80\x80\x00\x01\x00\x00\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x42\x05\x08\x00\x0b");
