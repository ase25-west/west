
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

// imports2.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x89\x80\x80\x80\x00\x03\x01\x00\x00\x00\x02\x01\x02\x04\x07\xa1\x80\x80\x80\x00\x03\x01\x7a\x02\x00\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x01\x0a\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x34\x02\x02");

// imports2.wast:1
let $1 = instance($$1);

// imports2.wast:7
register("test", $1)

// imports2.wast:9
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x02\x9f\x80\x80\x80\x00\x02\x04\x74\x65\x73\x74\x01\x7a\x02\x00\x00\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x01\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x88\x80\x80\x80\x00\x01\x04\x6c\x6f\x61\x64\x00\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x20\x00\x28\x42\x01\x00\x0b\x0b\x88\x80\x80\x80\x00\x01\x02\x01\x41\x0a\x0b\x01\x10");

// imports2.wast:9
let $2 = instance($$2);

// imports2.wast:17
assert_return(() => call($2, "load", [0]), 0);

// imports2.wast:18
assert_return(() => call($2, "load", [10]), 16);

// imports2.wast:19
assert_return(() => call($2, "load", [8]), 1_048_576);

// imports2.wast:20
assert_trap(() => call($2, "load", [1_000_000]));

// imports2.wast:22
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x02\x95\x80\x80\x80\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x01\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x88\x80\x80\x80\x00\x01\x04\x6c\x6f\x61\x64\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x20\x00\x28\x02\x00\x0b\x0b\x87\x80\x80\x80\x00\x01\x00\x41\x0a\x0b\x01\x10");

// imports2.wast:22
let $3 = instance($$3);

// imports2.wast:28
assert_return(() => call($3, "load", [0]), 0);

// imports2.wast:29
assert_return(() => call($3, "load", [10]), 16);

// imports2.wast:30
assert_return(() => call($3, "load", [8]), 1_048_576);

// imports2.wast:31
assert_trap(() => call($3, "load", [1_000_000]));

// imports2.wast:33
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\xc0\x80\x80\x80\x00\x03\x04\x74\x65\x73\x74\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x00\x02\x04\x74\x65\x73\x74\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x00\x01\x04\x74\x65\x73\x74\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x00\x00");

// imports2.wast:33
let $4 = instance($$4);

// imports2.wast:39
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\xf7\x80\x80\x80\x00\x06\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x00\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x01\x02\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x00\x02\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x01\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x00\x03");

// imports2.wast:39
let $5 = instance($$5);

// imports2.wast:49
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x91\x80\x80\x80\x00\x01\x04\x74\x65\x73\x74\x07\x75\x6e\x6b\x6e\x6f\x77\x6e\x02\x00\x01");

// imports2.wast:48
assert_unlinkable($$6);

// imports2.wast:53
let $$7 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x95\x80\x80\x80\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x75\x6e\x6b\x6e\x6f\x77\x6e\x02\x00\x01");

// imports2.wast:52
assert_unlinkable($$7);

// imports2.wast:58
let $$8 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x96\x80\x80\x80\x00\x01\x04\x74\x65\x73\x74\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x00\x03");

// imports2.wast:57
assert_unlinkable($$8);

// imports2.wast:62
let $$9 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x97\x80\x80\x80\x00\x01\x04\x74\x65\x73\x74\x0c\x6d\x65\x6d\x6f\x72\x79\x2d\x32\x2d\x69\x6e\x66\x02\x01\x02\x03");

// imports2.wast:61
assert_unlinkable($$9);

// imports2.wast:66
let $$10 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x94\x80\x80\x80\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x02");

// imports2.wast:65
assert_unlinkable($$10);

// imports2.wast:70
let $$11 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x95\x80\x80\x80\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x6d\x65\x6d\x6f\x72\x79\x02\x01\x01\x01");

// imports2.wast:69
assert_unlinkable($$11);
