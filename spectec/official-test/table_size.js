
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

// table_size.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8d\x80\x80\x80\x00\x03\x60\x00\x01\x7f\x60\x00\x01\x7e\x60\x01\x7f\x00\x03\x8a\x80\x80\x80\x00\x09\x00\x00\x00\x00\x01\x02\x02\x02\x02\x04\x93\x80\x80\x80\x00\x05\x6f\x00\x00\x6f\x00\x01\x6f\x01\x00\x02\x6f\x01\x03\x08\x6f\x05\x2a\x2a\x07\xdc\x80\x80\x80\x00\x09\x07\x73\x69\x7a\x65\x2d\x74\x30\x00\x00\x07\x73\x69\x7a\x65\x2d\x74\x31\x00\x01\x07\x73\x69\x7a\x65\x2d\x74\x32\x00\x02\x07\x73\x69\x7a\x65\x2d\x74\x33\x00\x03\x08\x73\x69\x7a\x65\x2d\x74\x36\x34\x00\x04\x07\x67\x72\x6f\x77\x2d\x74\x30\x00\x05\x07\x67\x72\x6f\x77\x2d\x74\x31\x00\x06\x07\x67\x72\x6f\x77\x2d\x74\x32\x00\x07\x07\x67\x72\x6f\x77\x2d\x74\x33\x00\x08\x0a\xef\x80\x80\x80\x00\x09\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x01\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x02\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x03\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x04\x0b\x8a\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x00\x1a\x0b\x8a\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x01\x1a\x0b\x8a\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x02\x1a\x0b\x8a\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x03\x1a\x0b");

// table_size.wast:1
let $1 = instance($$1);

// table_size.wast:28
assert_return(() => call($1, "size-t0", []), 0);

// table_size.wast:29
assert_return(() => call($1, "grow-t0", [1]));

// table_size.wast:30
assert_return(() => call($1, "size-t0", []), 1);

// table_size.wast:31
assert_return(() => call($1, "grow-t0", [4]));

// table_size.wast:32
assert_return(() => call($1, "size-t0", []), 5);

// table_size.wast:33
assert_return(() => call($1, "grow-t0", [0]));

// table_size.wast:34
assert_return(() => call($1, "size-t0", []), 5);

// table_size.wast:36
assert_return(() => call($1, "size-t1", []), 1);

// table_size.wast:37
assert_return(() => call($1, "grow-t1", [1]));

// table_size.wast:38
assert_return(() => call($1, "size-t1", []), 2);

// table_size.wast:39
assert_return(() => call($1, "grow-t1", [4]));

// table_size.wast:40
assert_return(() => call($1, "size-t1", []), 6);

// table_size.wast:41
assert_return(() => call($1, "grow-t1", [0]));

// table_size.wast:42
assert_return(() => call($1, "size-t1", []), 6);

// table_size.wast:44
assert_return(() => call($1, "size-t2", []), 0);

// table_size.wast:45
assert_return(() => call($1, "grow-t2", [3]));

// table_size.wast:46
assert_return(() => call($1, "size-t2", []), 0);

// table_size.wast:47
assert_return(() => call($1, "grow-t2", [1]));

// table_size.wast:48
assert_return(() => call($1, "size-t2", []), 1);

// table_size.wast:49
assert_return(() => call($1, "grow-t2", [0]));

// table_size.wast:50
assert_return(() => call($1, "size-t2", []), 1);

// table_size.wast:51
assert_return(() => call($1, "grow-t2", [4]));

// table_size.wast:52
assert_return(() => call($1, "size-t2", []), 1);

// table_size.wast:53
assert_return(() => call($1, "grow-t2", [1]));

// table_size.wast:54
assert_return(() => call($1, "size-t2", []), 2);

// table_size.wast:56
assert_return(() => call($1, "size-t3", []), 3);

// table_size.wast:57
assert_return(() => call($1, "grow-t3", [1]));

// table_size.wast:58
assert_return(() => call($1, "size-t3", []), 4);

// table_size.wast:59
assert_return(() => call($1, "grow-t3", [3]));

// table_size.wast:60
assert_return(() => call($1, "size-t3", []), 7);

// table_size.wast:61
assert_return(() => call($1, "grow-t3", [0]));

// table_size.wast:62
assert_return(() => call($1, "size-t3", []), 7);

// table_size.wast:63
assert_return(() => call($1, "grow-t3", [2]));

// table_size.wast:64
assert_return(() => call($1, "size-t3", []), 7);

// table_size.wast:65
assert_return(() => call($1, "grow-t3", [1]));

// table_size.wast:66
assert_return(() => call($1, "size-t3", []), 8);

// table_size.wast:68
assert_return(() => call($1, "size-t64", []), 42n);

// table_size.wast:72
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x01\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b");

// table_size.wast:81
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7d\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x01\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b");
