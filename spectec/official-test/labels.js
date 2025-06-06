
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

// labels.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x00\x01\x7f\x60\x01\x7f\x01\x7f\x03\x93\x80\x80\x80\x00\x12\x00\x00\x00\x00\x01\x00\x00\x00\x00\x01\x01\x00\x00\x00\x00\x00\x00\x00\x07\x9a\x81\x80\x80\x00\x12\x05\x62\x6c\x6f\x63\x6b\x00\x00\x05\x6c\x6f\x6f\x70\x31\x00\x01\x05\x6c\x6f\x6f\x70\x32\x00\x02\x05\x6c\x6f\x6f\x70\x33\x00\x03\x05\x6c\x6f\x6f\x70\x34\x00\x04\x05\x6c\x6f\x6f\x70\x35\x00\x05\x05\x6c\x6f\x6f\x70\x36\x00\x06\x02\x69\x66\x00\x07\x03\x69\x66\x32\x00\x08\x06\x73\x77\x69\x74\x63\x68\x00\x09\x06\x72\x65\x74\x75\x72\x6e\x00\x0a\x06\x62\x72\x5f\x69\x66\x30\x00\x0b\x06\x62\x72\x5f\x69\x66\x31\x00\x0c\x06\x62\x72\x5f\x69\x66\x32\x00\x0d\x06\x62\x72\x5f\x69\x66\x33\x00\x0e\x02\x62\x72\x00\x0f\x09\x73\x68\x61\x64\x6f\x77\x69\x6e\x67\x00\x10\x0c\x72\x65\x64\x65\x66\x69\x6e\x69\x74\x69\x6f\x6e\x00\x11\x0a\xc9\x86\x80\x80\x00\x12\x8b\x80\x80\x80\x00\x00\x02\x7f\x41\x01\x0c\x00\x41\x00\x0b\x0b\xa3\x80\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x7f\x03\x7f\x20\x00\x41\x01\x6a\x21\x00\x20\x00\x41\x05\x46\x04\x40\x20\x00\x0c\x02\x0b\x0c\x00\x0b\x0b\x0b\xb4\x80\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x7f\x03\x7f\x20\x00\x41\x01\x6a\x21\x00\x20\x00\x41\x05\x46\x04\x40\x0c\x01\x0b\x20\x00\x41\x08\x46\x04\x40\x20\x00\x0c\x02\x0b\x20\x00\x41\x01\x6a\x21\x00\x0c\x00\x0b\x0b\x0b\xa3\x80\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x7f\x03\x7f\x20\x00\x41\x01\x6a\x21\x00\x20\x00\x41\x05\x46\x04\x40\x20\x00\x0c\x02\x0b\x20\x00\x0b\x0b\x0b\xa3\x80\x80\x80\x00\x01\x01\x7f\x41\x01\x21\x01\x02\x7f\x03\x7f\x20\x01\x20\x01\x6a\x21\x01\x20\x01\x20\x00\x4b\x04\x40\x20\x01\x0c\x02\x0b\x0c\x00\x0b\x0b\x0b\x8a\x80\x80\x80\x00\x00\x03\x7f\x41\x01\x0b\x41\x01\x6a\x0b\x8b\x80\x80\x80\x00\x00\x03\x7f\x41\x00\x0d\x00\x41\x03\x0b\x0b\x84\x81\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x40\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x05\x41\xf8\x06\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x05\x41\xf8\x06\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x00\x04\x40\x41\xf8\x06\x21\x00\x05\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x00\x04\x40\x41\xf8\x06\x21\x00\x05\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x0b\x20\x00\x0b\x84\x81\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x40\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x05\x41\xf8\x06\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x01\x04\x40\x0c\x00\x41\x9a\x05\x21\x00\x05\x41\xf8\x06\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x00\x04\x40\x41\xf8\x06\x21\x00\x05\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x41\x00\x04\x40\x41\xf8\x06\x21\x00\x05\x0c\x00\x41\x9a\x05\x21\x00\x0b\x20\x00\x41\x01\x6a\x21\x00\x0b\x20\x00\x0b\xad\x80\x80\x80\x00\x00\x02\x7f\x41\x0a\x02\x7f\x02\x40\x02\x40\x02\x40\x02\x40\x02\x40\x20\x00\x0e\x04\x04\x00\x01\x02\x03\x0b\x0b\x41\x02\x0c\x03\x0b\x41\x03\x0c\x03\x0b\x0b\x41\x05\x0b\x6c\x0b\x0b\x98\x80\x80\x80\x00\x00\x02\x40\x02\x40\x02\x40\x20\x00\x0e\x01\x00\x01\x0c\x02\x0b\x41\x00\x0f\x0b\x0b\x41\x02\x0b\xd6\x80\x80\x80\x00\x01\x01\x7f\x41\x00\x21\x00\x02\x7f\x02\x40\x41\x00\x0d\x00\x20\x00\x41\x01\x72\x21\x00\x41\x01\x0d\x00\x20\x00\x41\x02\x72\x21\x00\x0b\x02\x7f\x20\x00\x41\x04\x72\x21\x00\x20\x00\x0b\x41\x00\x0d\x00\x1a\x20\x00\x41\x08\x72\x21\x00\x02\x7f\x20\x00\x41\x10\x72\x21\x00\x20\x00\x0b\x41\x01\x0d\x00\x1a\x20\x00\x41\x20\x72\x21\x00\x20\x00\x0b\x0b\x93\x80\x80\x80\x00\x00\x02\x7f\x02\x7f\x41\x01\x0c\x00\x0b\x41\x01\x0d\x00\x1a\x41\x00\x0b\x0b\x98\x80\x80\x80\x00\x00\x02\x7f\x41\x01\x04\x40\x02\x7f\x41\x01\x0c\x00\x0b\x41\x01\x0d\x01\x1a\x0b\x41\x00\x0b\x0b\xa4\x80\x80\x80\x00\x01\x01\x7f\x02\x7f\x02\x7f\x41\x01\x21\x00\x20\x00\x0b\x02\x7f\x41\x02\x21\x00\x20\x00\x0b\x0d\x00\x1a\x41\x00\x0b\x41\x00\x6a\x1a\x20\x00\x0b\xa1\x80\x80\x80\x00\x00\x02\x7f\x41\x01\x04\x40\x02\x7f\x41\x01\x0c\x00\x0b\x0c\x01\x05\x02\x40\x02\x7f\x41\x01\x0c\x00\x0b\x1a\x0b\x0b\x41\x01\x0b\x0b\x8c\x80\x80\x80\x00\x00\x02\x7f\x41\x01\x0c\x00\x41\x02\x73\x0b\x0b\x92\x80\x80\x80\x00\x00\x02\x7f\x02\x7f\x41\x02\x0b\x02\x7f\x41\x03\x0c\x00\x0b\x6a\x0b\x0b");

// labels.wast:1
let $1 = instance($$1);

// labels.wast:291
assert_return(() => call($1, "block", []), 1);

// labels.wast:292
assert_return(() => call($1, "loop1", []), 5);

// labels.wast:293
assert_return(() => call($1, "loop2", []), 8);

// labels.wast:294
assert_return(() => call($1, "loop3", []), 1);

// labels.wast:295
assert_return(() => call($1, "loop4", [8]), 16);

// labels.wast:296
assert_return(() => call($1, "loop5", []), 2);

// labels.wast:297
assert_return(() => call($1, "loop6", []), 3);

// labels.wast:298
assert_return(() => call($1, "if", []), 5);

// labels.wast:299
assert_return(() => call($1, "if2", []), 5);

// labels.wast:300
assert_return(() => call($1, "switch", [0]), 50);

// labels.wast:301
assert_return(() => call($1, "switch", [1]), 20);

// labels.wast:302
assert_return(() => call($1, "switch", [2]), 20);

// labels.wast:303
assert_return(() => call($1, "switch", [3]), 3);

// labels.wast:304
assert_return(() => call($1, "switch", [4]), 50);

// labels.wast:305
assert_return(() => call($1, "switch", [5]), 50);

// labels.wast:306
assert_return(() => call($1, "return", [0]), 0);

// labels.wast:307
assert_return(() => call($1, "return", [1]), 2);

// labels.wast:308
assert_return(() => call($1, "return", [2]), 2);

// labels.wast:309
assert_return(() => call($1, "br_if0", []), 29);

// labels.wast:310
assert_return(() => call($1, "br_if1", []), 1);

// labels.wast:311
assert_return(() => call($1, "br_if2", []), 1);

// labels.wast:312
assert_return(() => call($1, "br_if3", []), 2);

// labels.wast:313
assert_return(() => call($1, "br", []), 1);

// labels.wast:314
assert_return(() => call($1, "shadowing", []), 1);

// labels.wast:315
assert_return(() => call($1, "redefinition", []), 5);

// labels.wast:317
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x91\x80\x80\x80\x00\x01\x8b\x80\x80\x80\x00\x00\x02\x40\x41\x01\x0d\x00\x8c\x01\x0b\x0b");

// labels.wast:321
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x02\x40\x43\x00\x00\x00\x00\x41\x01\x0d\x00\x0b\x0b");

// labels.wast:325
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x94\x80\x80\x80\x00\x01\x8e\x80\x80\x80\x00\x00\x02\x40\x43\x00\x00\x00\x00\x41\x01\x0d\x00\x0b\x0b");
