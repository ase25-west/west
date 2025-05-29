
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

// memory_grow64.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x91\x80\x80\x80\x00\x04\x60\x00\x01\x7f\x60\x00\x00\x60\x01\x7e\x01\x7e\x60\x00\x01\x7e\x03\x87\x80\x80\x80\x00\x06\x00\x01\x00\x01\x02\x03\x05\x83\x80\x80\x80\x00\x01\x04\x00\x07\xd7\x80\x80\x80\x00\x06\x0c\x6c\x6f\x61\x64\x5f\x61\x74\x5f\x7a\x65\x72\x6f\x00\x00\x0d\x73\x74\x6f\x72\x65\x5f\x61\x74\x5f\x7a\x65\x72\x6f\x00\x01\x11\x6c\x6f\x61\x64\x5f\x61\x74\x5f\x70\x61\x67\x65\x5f\x73\x69\x7a\x65\x00\x02\x12\x73\x74\x6f\x72\x65\x5f\x61\x74\x5f\x70\x61\x67\x65\x5f\x73\x69\x7a\x65\x00\x03\x04\x67\x72\x6f\x77\x00\x04\x04\x73\x69\x7a\x65\x00\x05\x0a\xcd\x80\x80\x80\x00\x06\x87\x80\x80\x80\x00\x00\x42\x00\x28\x02\x00\x0b\x89\x80\x80\x80\x00\x00\x42\x00\x41\x02\x36\x02\x00\x0b\x89\x80\x80\x80\x00\x00\x42\x80\x80\x04\x28\x02\x00\x0b\x8b\x80\x80\x80\x00\x00\x42\x80\x80\x04\x41\x03\x36\x02\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x40\x00\x0b\x84\x80\x80\x80\x00\x00\x3f\x00\x0b");

// memory_grow64.wast:1
let $1 = instance($$1);

// memory_grow64.wast:14
assert_return(() => call($1, "size", []), 0n);

// memory_grow64.wast:15
assert_trap(() => call($1, "store_at_zero", []));

// memory_grow64.wast:16
assert_trap(() => call($1, "load_at_zero", []));

// memory_grow64.wast:17
assert_trap(() => call($1, "store_at_page_size", []));

// memory_grow64.wast:18
assert_trap(() => call($1, "load_at_page_size", []));

// memory_grow64.wast:19
assert_return(() => call($1, "grow", [1n]), 0n);

// memory_grow64.wast:20
assert_return(() => call($1, "size", []), 1n);

// memory_grow64.wast:21
assert_return(() => call($1, "load_at_zero", []), 0);

// memory_grow64.wast:22
assert_return(() => call($1, "store_at_zero", []));

// memory_grow64.wast:23
assert_return(() => call($1, "load_at_zero", []), 2);

// memory_grow64.wast:24
assert_trap(() => call($1, "store_at_page_size", []));

// memory_grow64.wast:25
assert_trap(() => call($1, "load_at_page_size", []));

// memory_grow64.wast:26
assert_return(() => call($1, "grow", [4n]), 1n);

// memory_grow64.wast:27
assert_return(() => call($1, "size", []), 5n);

// memory_grow64.wast:28
assert_return(() => call($1, "load_at_zero", []), 2);

// memory_grow64.wast:29
assert_return(() => call($1, "store_at_zero", []));

// memory_grow64.wast:30
assert_return(() => call($1, "load_at_zero", []), 2);

// memory_grow64.wast:31
assert_return(() => call($1, "load_at_page_size", []), 0);

// memory_grow64.wast:32
assert_return(() => call($1, "store_at_page_size", []));

// memory_grow64.wast:33
assert_return(() => call($1, "load_at_page_size", []), 3);

// memory_grow64.wast:36
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7e\x01\x7e\x03\x82\x80\x80\x80\x00\x01\x00\x05\x83\x80\x80\x80\x00\x01\x04\x00\x07\x88\x80\x80\x80\x00\x01\x04\x67\x72\x6f\x77\x00\x00\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x20\x00\x40\x00\x0b");

// memory_grow64.wast:36
let $2 = instance($$2);

// memory_grow64.wast:41
assert_return(() => call($2, "grow", [0n]), 0n);

// memory_grow64.wast:42
assert_return(() => call($2, "grow", [1n]), 0n);

// memory_grow64.wast:43
assert_return(() => call($2, "grow", [0n]), 1n);

// memory_grow64.wast:44
assert_return(() => call($2, "grow", [2n]), 1n);

// memory_grow64.wast:45
assert_return(() => call($2, "grow", [800n]), 3n);

// memory_grow64.wast:46
assert_return(() => call($2, "grow", [1n]), 803n);

// memory_grow64.wast:48
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7e\x01\x7e\x03\x82\x80\x80\x80\x00\x01\x00\x05\x84\x80\x80\x80\x00\x01\x05\x00\x0a\x07\x88\x80\x80\x80\x00\x01\x04\x67\x72\x6f\x77\x00\x00\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x20\x00\x40\x00\x0b");

// memory_grow64.wast:48
let $3 = instance($$3);

// memory_grow64.wast:53
assert_return(() => call($3, "grow", [0n]), 0n);

// memory_grow64.wast:54
assert_return(() => call($3, "grow", [1n]), 0n);

// memory_grow64.wast:55
assert_return(() => call($3, "grow", [1n]), 1n);

// memory_grow64.wast:56
assert_return(() => call($3, "grow", [2n]), 2n);

// memory_grow64.wast:57
assert_return(() => call($3, "grow", [6n]), 4n);

// memory_grow64.wast:58
assert_return(() => call($3, "grow", [0n]), 10n);

// memory_grow64.wast:59
assert_return(() => call($3, "grow", [1n]), -1n);

// memory_grow64.wast:60
assert_return(() => call($3, "grow", [65_536n]), -1n);

// memory_grow64.wast:64
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8c\x80\x80\x80\x00\x02\x60\x01\x7e\x01\x7e\x60\x02\x7e\x7e\x01\x7f\x03\x83\x80\x80\x80\x00\x02\x00\x01\x05\x83\x80\x80\x80\x00\x01\x04\x01\x07\x9c\x80\x80\x80\x00\x02\x04\x67\x72\x6f\x77\x00\x00\x11\x63\x68\x65\x63\x6b\x2d\x6d\x65\x6d\x6f\x72\x79\x2d\x7a\x65\x72\x6f\x00\x01\x0a\xc4\x80\x80\x80\x00\x02\x86\x80\x80\x80\x00\x00\x20\x00\x40\x00\x0b\xb3\x80\x80\x80\x00\x01\x01\x7f\x41\x01\x21\x02\x02\x40\x03\x40\x20\x00\x2d\x00\x00\x21\x02\x20\x02\x41\x00\x47\x0d\x01\x20\x00\x20\x01\x5a\x0d\x01\x20\x00\x42\x01\x7c\x21\x00\x20\x00\x20\x01\x58\x0d\x00\x0b\x0b\x20\x02\x0b");

// memory_grow64.wast:64
let $4 = instance($$4);

// memory_grow64.wast:85
assert_return(() => call($4, "check-memory-zero", [0n, 65_535n]), 0);

// memory_grow64.wast:86
assert_return(() => call($4, "grow", [1n]), 1n);

// memory_grow64.wast:87
assert_return(() => call($4, "check-memory-zero", [65_536n, 131_071n]), 0);

// memory_grow64.wast:88
assert_return(() => call($4, "grow", [1n]), 2n);

// memory_grow64.wast:89
assert_return(() => call($4, "check-memory-zero", [131_072n, 196_607n]), 0);

// memory_grow64.wast:90
assert_return(() => call($4, "grow", [1n]), 3n);

// memory_grow64.wast:91
assert_return(() => call($4, "check-memory-zero", [196_608n, 262_143n]), 0);

// memory_grow64.wast:92
assert_return(() => call($4, "grow", [1n]), 4n);

// memory_grow64.wast:93
assert_return(() => call($4, "check-memory-zero", [262_144n, 327_679n]), 0);

// memory_grow64.wast:94
assert_return(() => call($4, "grow", [1n]), 5n);

// memory_grow64.wast:95
assert_return(() => call($4, "check-memory-zero", [327_680n, 393_215n]), 0);
