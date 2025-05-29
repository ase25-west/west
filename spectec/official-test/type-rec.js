
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

// type-rec.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x02\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x4e\x02\x60\x00\x00\x5f\x01\x64\x02\x00\x03\x82\x80\x80\x80\x00\x01\x02\x06\x87\x80\x80\x80\x00\x01\x64\x00\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:3
let $1 = instance($$1);

// type-rec.wast:10
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xc1\x80\x80\x80\x00\x04\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x4e\x02\x60\x00\x00\x5f\x01\x64\x02\x00\x4e\x02\x60\x00\x00\x5f\x05\x64\x00\x00\x64\x00\x00\x64\x02\x00\x64\x02\x00\x64\x04\x00\x4e\x02\x60\x00\x00\x5f\x05\x64\x00\x00\x64\x02\x00\x64\x00\x00\x64\x02\x00\x64\x06\x00\x03\x82\x80\x80\x80\x00\x01\x06\x06\x87\x80\x80\x80\x00\x01\x64\x04\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:10
let $2 = instance($$2);

// type-rec.wast:25
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x02\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x02\x06\x87\x80\x80\x80\x00\x01\x64\x00\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:35
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x9f\x80\x80\x80\x00\x03\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x4e\x02\x60\x00\x00\x5f\x01\x64\x00\x00\x4e\x02\x60\x00\x00\x5f\x01\x64\x02\x00\x03\x82\x80\x80\x80\x00\x01\x04\x06\x87\x80\x80\x80\x00\x01\x64\x02\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:46
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8f\x80\x80\x80\x00\x02\x4e\x02\x60\x00\x00\x5f\x00\x4e\x02\x5f\x00\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x03\x06\x87\x80\x80\x80\x00\x01\x64\x00\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:56
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x92\x80\x80\x80\x00\x02\x4e\x02\x60\x00\x00\x5f\x00\x4e\x03\x60\x00\x00\x5f\x00\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x02\x06\x87\x80\x80\x80\x00\x01\x64\x00\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:69
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x01\x4e\x02\x60\x00\x00\x5f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x07\x85\x80\x80\x80\x00\x01\x01\x66\x00\x00\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");
let $M = $$3;

// type-rec.wast:69
let $3 = instance($M);
let M = $3;

// type-rec.wast:73
register("M", M)

// type-rec.wast:75
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x01\x4e\x02\x60\x00\x00\x5f\x00\x02\x87\x80\x80\x80\x00\x01\x01\x4d\x01\x66\x00\x00");

// type-rec.wast:75
let $4 = instance($$4);

// type-rec.wast:81
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x01\x4e\x02\x5f\x00\x60\x00\x00\x02\x87\x80\x80\x80\x00\x01\x01\x4d\x01\x66\x00\x01");

// type-rec.wast:80
assert_unlinkable($$5);

// type-rec.wast:89
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x02\x87\x80\x80\x80\x00\x01\x01\x4d\x01\x66\x00\x00");

// type-rec.wast:88
assert_unlinkable($$6);

// type-rec.wast:99
let $$7 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x92\x80\x80\x80\x00\x03\x4e\x02\x60\x00\x00\x5f\x00\x4e\x02\x60\x00\x00\x5f\x00\x60\x00\x00\x03\x83\x80\x80\x80\x00\x02\x00\x04\x04\x85\x80\x80\x80\x00\x01\x70\x01\x01\x01\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x01\x09\x89\x80\x80\x80\x00\x01\x04\x41\x00\x0b\x01\xd2\x00\x0b\x0a\x94\x80\x80\x80\x00\x02\x82\x80\x80\x80\x00\x00\x0b\x87\x80\x80\x80\x00\x00\x41\x00\x11\x02\x00\x0b");

// type-rec.wast:99
let $5 = instance($$7);

// type-rec.wast:106
assert_return(() => call($5, "run", []));

// type-rec.wast:108
let $$8 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x92\x80\x80\x80\x00\x03\x4e\x02\x60\x00\x00\x5f\x00\x4e\x02\x5f\x00\x60\x00\x00\x60\x00\x00\x03\x83\x80\x80\x80\x00\x02\x00\x04\x04\x85\x80\x80\x80\x00\x01\x70\x01\x01\x01\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x01\x09\x89\x80\x80\x80\x00\x01\x04\x41\x00\x0b\x01\xd2\x00\x0b\x0a\x94\x80\x80\x80\x00\x02\x82\x80\x80\x80\x00\x00\x0b\x87\x80\x80\x80\x00\x00\x41\x00\x11\x03\x00\x0b");

// type-rec.wast:108
let $6 = instance($$8);

// type-rec.wast:115
assert_trap(() => call($6, "run", []));

// type-rec.wast:117
let $$9 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8b\x80\x80\x80\x00\x02\x4e\x02\x60\x00\x00\x5f\x00\x60\x00\x00\x03\x83\x80\x80\x80\x00\x02\x00\x02\x04\x85\x80\x80\x80\x00\x01\x70\x01\x01\x01\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x01\x09\x89\x80\x80\x80\x00\x01\x04\x41\x00\x0b\x01\xd2\x00\x0b\x0a\x94\x80\x80\x80\x00\x02\x82\x80\x80\x80\x00\x00\x0b\x87\x80\x80\x80\x00\x00\x41\x00\x11\x02\x00\x0b");

// type-rec.wast:117
let $7 = instance($$9);

// type-rec.wast:124
assert_trap(() => call($7, "run", []));

// type-rec.wast:129
let $$10 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x88\x80\x80\x80\x00\x02\x5f\x00\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x01\x06\x87\x80\x80\x80\x00\x01\x64\x01\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:129
let $8 = instance($$10);

// type-rec.wast:136
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8f\x80\x80\x80\x00\x02\x4e\x02\x5f\x00\x60\x01\x64\x00\x00\x60\x01\x64\x00\x00\x03\x82\x80\x80\x80\x00\x01\x02\x06\x87\x80\x80\x80\x00\x01\x64\x01\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");

// type-rec.wast:148
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8b\x80\x80\x80\x00\x02\x4e\x02\x5f\x00\x60\x00\x00\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x02\x06\x87\x80\x80\x80\x00\x01\x64\x01\x00\xd2\x00\x0b\x0a\x88\x80\x80\x80\x00\x01\x82\x80\x80\x80\x00\x00\x0b");
