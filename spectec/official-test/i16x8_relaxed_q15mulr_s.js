
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

// i16x8_relaxed_q15mulr_s.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x87\x80\x80\x80\x00\x01\x60\x02\x7b\x7b\x01\x7b\x03\x83\x80\x80\x80\x00\x02\x00\x00\x07\xb9\x80\x80\x80\x00\x02\x17\x69\x31\x36\x78\x38\x2e\x72\x65\x6c\x61\x78\x65\x64\x5f\x71\x31\x35\x6d\x75\x6c\x72\x5f\x73\x00\x00\x1b\x69\x31\x36\x78\x38\x2e\x72\x65\x6c\x61\x78\x65\x64\x5f\x71\x31\x35\x6d\x75\x6c\x72\x5f\x73\x5f\x63\x6d\x70\x00\x01\x0a\xa6\x80\x80\x80\x00\x02\x89\x80\x80\x80\x00\x00\x20\x00\x20\x01\xfd\x91\x02\x0b\x92\x80\x80\x80\x00\x00\x20\x00\x20\x01\xfd\x91\x02\x20\x00\x20\x01\xfd\x91\x02\xfd\x2d\x0b");

// i16x8_relaxed_q15mulr_s.wast:3
let $1 = instance($$1);

// i16x8_relaxed_q15mulr_s.wast:13
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xc7\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x17\x69\x31\x36\x78\x38\x2e\x72\x65\x6c\x61\x78\x65\x64\x5f\x71\x31\x35\x6d\x75\x6c\x72\x5f\x73\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xa4\x81\x80\x80\x00\x01\x9e\x81\x80\x80\x00\x01\x01\x7b\x02\x40\xfd\x0c\x00\x80\x01\x80\xff\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x0c\x00\x80\x00\x80\xff\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x10\x00\x21\x00\x02\x40\x02\x40\x20\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\x00\x80\xff\x7f\xfe\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0c\x01\x0b\x02\x40\x20\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xff\x7f\xff\x7f\xfe\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x23\xfd\x63\x45\x0d\x00\x0c\x01\x0b\x0c\x01\x0b\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i16x8.relaxed_q15mulr_s", [v128("-2_147_385_344 32_767 0 0"), v128("-2_147_450_880 32_767 0 0")]), [v128("-32_768 32_767 32_766 0 0 0 0 0"), v128("32_767 32_767 32_766 0 0 0 0 0")])

// i16x8_relaxed_q15mulr_s.wast:22
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x95\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x02\x7b\x7b\x01\x7b\x02\xcb\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x1b\x69\x31\x36\x78\x38\x2e\x72\x65\x6c\x61\x78\x65\x64\x5f\x71\x31\x35\x6d\x75\x6c\x72\x5f\x73\x5f\x63\x6d\x70\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\xe0\x80\x80\x80\x00\x01\xda\x80\x80\x80\x00\x00\x02\x40\xfd\x0c\x00\x80\x01\x80\xff\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xfd\x0c\x00\x80\x00\x80\xff\x7f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x10\x00\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x4e\xfd\x0c\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xfd\x23\xfd\x63\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "i16x8.relaxed_q15mulr_s_cmp", [v128("-2_147_385_344 32_767 0 0"), v128("-2_147_450_880 32_767 0 0")]), v128("-1 -1 -1 -1 -1 -1 -1 -1"))
