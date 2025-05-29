
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

// linking3.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x05\x8a\x80\x80\x80\x00\x03\x01\x00\x00\x01\x05\x05\x01\x00\x00\x07\x9d\x80\x80\x80\x00\x04\x04\x6d\x65\x6d\x30\x02\x00\x04\x6d\x65\x6d\x31\x02\x01\x04\x6d\x65\x6d\x32\x02\x02\x04\x6c\x6f\x61\x64\x00\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x00\x0b\x0b\x91\x80\x80\x80\x00\x01\x02\x01\x41\x0a\x0b\x0a\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09");
let $Mm = $$1;

// linking3.wast:1
let $1 = instance($Mm);
let Mm = $1;

// linking3.wast:12
register("Mm", Mm)

// linking3.wast:15
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x02\xa8\x80\x80\x80\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x05\x70\x72\x69\x6e\x74\x00\x00\x02\x4d\x6d\x04\x6d\x65\x6d\x31\x02\x00\x01\x02\x4d\x6d\x03\x74\x61\x62\x01\x70\x00\x00\x0b\x89\x80\x80\x80\x00\x01\x00\x41\x00\x0b\x03\x61\x62\x63");

// linking3.wast:14
assert_unlinkable($$2);

// linking3.wast:23
assert_return(() => call(Mm, "load", [0]), 0);

// linking3.wast:28
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x8c\x80\x80\x80\x00\x01\x02\x4d\x6d\x04\x6d\x65\x6d\x31\x02\x00\x01\x0b\xa2\x80\x80\x80\x00\x02\x00\x41\x00\x0b\x03\x61\x62\x63\x00\x41\xf6\xff\x13\x0b\x12\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a\x7a");

// linking3.wast:27
assert_uninstantiable($$3);

// linking3.wast:36
assert_return(() => call(Mm, "load", [0]), 97);

// linking3.wast:37
assert_return(() => call(Mm, "load", [327_670]), 0);

// linking3.wast:40
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x02\x8c\x80\x80\x80\x00\x01\x02\x4d\x6d\x04\x6d\x65\x6d\x31\x02\x00\x01\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x00\x09\x87\x80\x80\x80\x00\x01\x00\x41\x00\x0b\x01\x00\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b\x0b\x89\x80\x80\x80\x00\x01\x00\x41\x00\x0b\x03\x61\x62\x63");

// linking3.wast:39
assert_uninstantiable($$4);

// linking3.wast:49
assert_return(() => call(Mm, "load", [0]), 97);

// linking3.wast:52
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x01\x05\x83\x80\x80\x80\x00\x01\x00\x01\x07\xb1\x80\x80\x80\x00\x04\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x05\x74\x61\x62\x6c\x65\x01\x00\x0d\x67\x65\x74\x20\x6d\x65\x6d\x6f\x72\x79\x5b\x30\x5d\x00\x00\x0c\x67\x65\x74\x20\x74\x61\x62\x6c\x65\x5b\x30\x5d\x00\x01\x0a\x99\x80\x80\x80\x00\x02\x87\x80\x80\x80\x00\x00\x41\x00\x2d\x00\x00\x0b\x87\x80\x80\x80\x00\x00\x41\x00\x11\x00\x00\x0b");
let $Ms = $$5;

// linking3.wast:52
let $2 = instance($Ms);
let Ms = $2;

// linking3.wast:63
register("Ms", Ms)

// linking3.wast:66
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x60\x00\x01\x7f\x60\x00\x00\x02\x9b\x80\x80\x80\x00\x02\x02\x4d\x73\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x01\x02\x4d\x73\x05\x74\x61\x62\x6c\x65\x01\x70\x00\x01\x03\x83\x80\x80\x80\x00\x02\x00\x01\x08\x81\x80\x80\x80\x00\x01\x09\x87\x80\x80\x80\x00\x01\x00\x41\x00\x0b\x01\x00\x0a\x94\x80\x80\x80\x00\x02\x86\x80\x80\x80\x00\x00\x41\xad\xbd\x03\x0b\x83\x80\x80\x80\x00\x00\x00\x0b\x0b\x8b\x80\x80\x80\x00\x01\x00\x41\x00\x0b\x05\x68\x65\x6c\x6c\x6f");

// linking3.wast:65
assert_uninstantiable($$6);

// linking3.wast:82
assert_return(() => call(Ms, "get memory[0]", []), 104);

// linking3.wast:83
assert_return(() => call(Ms, "get table[0]", []), 57_005);
