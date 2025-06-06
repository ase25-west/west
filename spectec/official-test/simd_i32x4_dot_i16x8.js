
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

// simd_i32x4_dot_i16x8.wast:4
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x87\x80\x80\x80\x00\x01\x60\x02\x7b\x7b\x01\x7b\x03\x82\x80\x80\x80\x00\x01\x00\x07\x95\x80\x80\x80\x00\x01\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\x20\x00\x20\x01\xfd\xba\x01\x0b");

// simd_i32x4_dot_i16x8.wast:4
let $1 = instance($$1);

// simd_i32x4_dot_i16x8.wast:10
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("0 0 0 0"), v128("0 0 0 0")]), v128("0 0 0 0"))

// simd_i32x4_dot_i16x8.wast:13
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("0 0 0 0"), v128("65_537 65_537 65_537 65_537")]), v128("0 0 0 0"))

// simd_i32x4_dot_i16x8.wast:16
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("65_537 65_537 65_537 65_537"), v128("65_537 65_537 65_537 65_537")]), v128("2 2 2 2"))

// simd_i32x4_dot_i16x8.wast:19
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("0 0 0 0"), v128("-1 -1 -1 -1")]), v128("0 0 0 0"))

// simd_i32x4_dot_i16x8.wast:22
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfe\xff\xff\xff\xfe\xff\xff\xff\xfe\xff\xff\xff\xfe\xff\xff\xff\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("65_537 65_537 65_537 65_537"), v128("-1 -1 -1 -1")]), v128("-2 -2 -2 -2"))

// simd_i32x4_dot_i16x8.wast:25
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("-1 -1 -1 -1")]), v128("2 2 2 2"))

// simd_i32x4_dot_i16x8.wast:28
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\x3f\xff\x3f\xff\x3f\xff\x3f\xff\x3f\xff\x3f\xff\x3f\xff\x3f\xfd\x0c\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x80\xff\x1f\x00\x80\xff\x1f\x00\x80\xff\x1f\x00\x80\xff\x1f\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("1_073_692_671 1_073_692_671 1_073_692_671 1_073_692_671"), v128("1_073_758_208 1_073_758_208 1_073_758_208 1_073_758_208")]), v128("536_838_144 536_838_144 536_838_144 536_838_144"))

// simd_i32x4_dot_i16x8.wast:31
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\xfd\x0c\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x00\x40\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x20\x00\x00\x00\x20\x00\x00\x00\x20\x00\x00\x00\x20\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("1_073_758_208 1_073_758_208 1_073_758_208 1_073_758_208"), v128("1_073_758_208 1_073_758_208 1_073_758_208 1_073_758_208")]), v128("536_870_912 536_870_912 536_870_912 536_870_912"))

// simd_i32x4_dot_i16x8.wast:34
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x01\xc0\x01\xc0\x01\xc0\x01\xc0\x01\xc0\x01\xc0\x01\xc0\x01\xc0\xfd\x0c\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x80\xff\x1f\x00\x80\xff\x1f\x00\x80\xff\x1f\x00\x80\xff\x1f\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1_073_627_135 -1_073_627_135 -1_073_627_135 -1_073_627_135"), v128("-1_073_692_672 -1_073_692_672 -1_073_692_672 -1_073_692_672")]), v128("536_838_144 536_838_144 536_838_144 536_838_144"))

// simd_i32x4_dot_i16x8.wast:37
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\xfd\x0c\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x20\x00\x00\x00\x20\x00\x00\x00\x20\x00\x00\x00\x20\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1_073_692_672 -1_073_692_672 -1_073_692_672 -1_073_692_672"), v128("-1_073_692_672 -1_073_692_672 -1_073_692_672 -1_073_692_672")]), v128("536_870_912 536_870_912 536_870_912 536_870_912"))

// simd_i32x4_dot_i16x8.wast:40
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xbf\xff\xbf\xff\xbf\xff\xbf\xff\xbf\xff\xbf\xff\xbf\xff\xbf\xfd\x0c\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x00\xc0\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x80\x00\x20\x00\x80\x00\x20\x00\x80\x00\x20\x00\x80\x00\x20\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1_073_758_209 -1_073_758_209 -1_073_758_209 -1_073_758_209"), v128("-1_073_692_672 -1_073_692_672 -1_073_692_672 -1_073_692_672")]), v128("536_903_680 536_903_680 536_903_680 536_903_680"))

// simd_i32x4_dot_i16x8.wast:43
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x7f\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfa\xff\x00\x00\xfa\xff\x00\x00\xfa\xff\x00\x00\xfa\xff\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("2_147_319_805 2_147_319_805 2_147_319_805 2_147_319_805"), v128("65_537 65_537 65_537 65_537")]), v128("65_530 65_530 65_530 65_530"))

// simd_i32x4_dot_i16x8.wast:46
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xfe\x7f\xfe\x7f\xfe\x7f\xfe\x7f\xfe\x7f\xfe\x7f\xfe\x7f\xfe\x7f\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfc\xff\x00\x00\xfc\xff\x00\x00\xfc\xff\x00\x00\xfc\xff\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("2_147_385_342 2_147_385_342 2_147_385_342 2_147_385_342"), v128("65_537 65_537 65_537 65_537")]), v128("65_532 65_532 65_532 65_532"))

// simd_i32x4_dot_i16x8.wast:49
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\xff\xff\x00\x00\xff\xff\x00\x00\xff\xff\x00\x00\xff\xff\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880"), v128("65_537 65_537 65_537 65_537")]), v128("-65_536 -65_536 -65_536 -65_536"))

// simd_i32x4_dot_i16x8.wast:52
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x02\x80\x02\x80\x02\x80\x02\x80\x02\x80\x02\x80\x02\x80\x02\x80\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfc\xff\x00\x00\xfc\xff\x00\x00\xfc\xff\x00\x00\xfc\xff\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_319_806 -2_147_319_806 -2_147_319_806 -2_147_319_806"), v128("-1 -1 -1 -1")]), v128("65_532 65_532 65_532 65_532"))

// simd_i32x4_dot_i16x8.wast:55
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfe\xff\x00\x00\xfe\xff\x00\x00\xfe\xff\x00\x00\xfe\xff\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_385_343 -2_147_385_343 -2_147_385_343 -2_147_385_343"), v128("-1 -1 -1 -1")]), v128("65_534 65_534 65_534 65_534"))

// simd_i32x4_dot_i16x8.wast:58
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x01\x00\x00\x00\x01\x00\x00\x00\x01\x00\x00\x00\x01\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880"), v128("-1 -1 -1 -1")]), v128("65_536 65_536 65_536 65_536"))

// simd_i32x4_dot_i16x8.wast:61
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xfd\x0c\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\xfe\x7f\x02\x00\xfe\x7f\x02\x00\xfe\x7f\x02\x00\xfe\x7f\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("2_147_450_879 2_147_450_879 2_147_450_879 2_147_450_879"), v128("2_147_450_879 2_147_450_879 2_147_450_879 2_147_450_879")]), v128("2_147_352_578 2_147_352_578 2_147_352_578 2_147_352_578"))

// simd_i32x4_dot_i16x8.wast:64
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x80\x00\x00\x00\x80\x00\x00\x00\x80\x00\x00\x00\x80\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880"), v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880")]), v128("-2_147_483_648 -2_147_483_648 -2_147_483_648 -2_147_483_648"))

// simd_i32x4_dot_i16x8.wast:67
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\xfd\x0c\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x01\x80\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\xff\x7f\x00\x00\xff\x7f\x00\x00\xff\x7f\x00\x00\xff\x7f\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880"), v128("-2_147_385_343 -2_147_385_343 -2_147_385_343 -2_147_385_343")]), v128("2_147_418_112 2_147_418_112 2_147_418_112 2_147_418_112"))

// simd_i32x4_dot_i16x8.wast:70
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("0 0 0 0")]), v128("0 0 0 0"))

// simd_i32x4_dot_i16x8.wast:73
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x01\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xfe\xff\xff\xff\xfe\xff\xff\xff\xfe\xff\xff\xff\xfe\xff\xff\xff\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("65_537 65_537 65_537 65_537")]), v128("-2 -2 -2 -2"))

// simd_i32x4_dot_i16x8.wast:76
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("-1 -1 -1 -1")]), v128("2 2 2 2"))

// simd_i32x4_dot_i16x8.wast:79
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\xff\x7f\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\xff\xff\x02\x00\xff\xff\x02\x00\xff\xff\x02\x00\xff\xff\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("2_147_450_879 2_147_450_879 2_147_450_879 2_147_450_879")]), v128("-65_534 -65_534 -65_534 -65_534"))

// simd_i32x4_dot_i16x8.wast:82
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x00\x80\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x00\x01\x00\x00\x00\x01\x00\x00\x00\x01\x00\x00\x00\x01\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("-2_147_450_880 -2_147_450_880 -2_147_450_880 -2_147_450_880")]), v128("65_536 65_536 65_536 65_536"))

// simd_i32x4_dot_i16x8.wast:85
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc1\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x11\x69\x33\x32\x78\x34\x2e\x64\x6f\x74\x5f\x69\x31\x36\x78\x38\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\x02\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i32x4.dot_i16x8_s", [v128("-1 -1 -1 -1"), v128("-1 -1 -1 -1")]), v128("2 2 2 2"))

// simd_i32x4_dot_i16x8.wast:90
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7b\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x92\x80\x80\x80\x00\x01\x8c\x80\x80\x80\x00\x00\x41\x00\x43\x00\x00\x00\x00\xfd\xba\x01\x0b");

// simd_i32x4_dot_i16x8.wast:94
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7b\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x9d\x80\x80\x80\x00\x01\x97\x80\x80\x80\x00\x00\xfd\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\xba\x01\x0b");

// simd_i32x4_dot_i16x8.wast:102
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7b\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfd\xba\x01\x0b");
