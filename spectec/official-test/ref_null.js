
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

// ref_null.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x99\x80\x80\x80\x00\x06\x60\x00\x00\x60\x00\x01\x6e\x60\x00\x01\x70\x60\x00\x01\x69\x60\x00\x01\x6f\x60\x00\x01\x63\x00\x03\x86\x80\x80\x80\x00\x05\x01\x02\x03\x04\x05\x06\x9b\x80\x80\x80\x00\x05\x6e\x00\xd0\x6e\x0b\x70\x00\xd0\x70\x0b\x69\x00\xd0\x69\x0b\x6f\x00\xd0\x6f\x0b\x63\x00\x00\xd0\x00\x0b\x07\xaf\x80\x80\x80\x00\x05\x06\x61\x6e\x79\x72\x65\x66\x00\x00\x07\x66\x75\x6e\x63\x72\x65\x66\x00\x01\x06\x65\x78\x6e\x72\x65\x66\x00\x02\x09\x65\x78\x74\x65\x72\x6e\x72\x65\x66\x00\x03\x03\x72\x65\x66\x00\x04\x0a\xae\x80\x80\x80\x00\x05\x84\x80\x80\x80\x00\x00\xd0\x6e\x0b\x84\x80\x80\x80\x00\x00\xd0\x70\x0b\x84\x80\x80\x80\x00\x00\xd0\x69\x0b\x84\x80\x80\x80\x00\x00\xd0\x6f\x0b\x84\x80\x80\x80\x00\x00\xd0\x00\x0b");

// ref_null.wast:1
let $1 = instance($$1);

// ref_null.wast:16
assert_return(() => call($1, "anyref", []), null);

// ref_null.wast:17
assert_return(() => call($1, "funcref", []), null);

// ref_null.wast:18
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x00\x01\x69\x02\xb6\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x06\x65\x78\x6e\x72\x65\x66\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x93\x80\x80\x80\x00\x01\x8d\x80\x80\x80\x00\x00\x02\x40\x10\x00\xd1\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($1)),  "run", []));  // assert_return(() => call($1, "exnref", []), null)

// ref_null.wast:19
assert_return(() => call($1, "externref", []), null);

// ref_null.wast:20
assert_return(() => call($1, "ref", []), "ref.null");

// ref_null.wast:23
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xa9\x80\x80\x80\x00\x0a\x60\x00\x00\x60\x00\x01\x6e\x60\x00\x01\x71\x60\x00\x01\x70\x60\x00\x01\x73\x60\x00\x01\x69\x60\x00\x01\x74\x60\x00\x01\x6f\x60\x00\x01\x72\x60\x00\x01\x63\x00\x03\x8a\x80\x80\x80\x00\x09\x01\x02\x03\x04\x05\x06\x07\x08\x09\x06\xdd\x80\x80\x80\x00\x12\x71\x00\xd0\x71\x0b\x73\x00\xd0\x73\x0b\x74\x00\xd0\x74\x0b\x72\x00\xd0\x72\x0b\x6e\x00\xd0\x6e\x0b\x6e\x00\xd0\x71\x0b\x70\x00\xd0\x70\x0b\x70\x00\xd0\x73\x0b\x69\x00\xd0\x69\x0b\x69\x00\xd0\x74\x0b\x6f\x00\xd0\x6f\x0b\x6f\x00\xd0\x72\x0b\x71\x00\xd0\x71\x0b\x73\x00\xd0\x73\x0b\x74\x00\xd0\x74\x0b\x72\x00\xd0\x72\x0b\x63\x00\x00\xd0\x00\x0b\x63\x00\x00\xd0\x73\x0b\x07\xe4\x80\x80\x80\x00\x09\x06\x61\x6e\x79\x72\x65\x66\x00\x00\x07\x6e\x75\x6c\x6c\x72\x65\x66\x00\x01\x07\x66\x75\x6e\x63\x72\x65\x66\x00\x02\x0b\x6e\x75\x6c\x6c\x66\x75\x6e\x63\x72\x65\x66\x00\x03\x06\x65\x78\x6e\x72\x65\x66\x00\x04\x0a\x6e\x75\x6c\x6c\x65\x78\x6e\x72\x65\x66\x00\x05\x09\x65\x78\x74\x65\x72\x6e\x72\x65\x66\x00\x06\x0d\x6e\x75\x6c\x6c\x65\x78\x74\x65\x72\x6e\x72\x65\x66\x00\x07\x03\x72\x65\x66\x00\x08\x0a\xd2\x80\x80\x80\x00\x09\x84\x80\x80\x80\x00\x00\x23\x00\x0b\x84\x80\x80\x80\x00\x00\x23\x00\x0b\x84\x80\x80\x80\x00\x00\x23\x01\x0b\x84\x80\x80\x80\x00\x00\x23\x01\x0b\x84\x80\x80\x80\x00\x00\x23\x02\x0b\x84\x80\x80\x80\x00\x00\x23\x02\x0b\x84\x80\x80\x80\x00\x00\x23\x03\x0b\x84\x80\x80\x80\x00\x00\x23\x03\x0b\x84\x80\x80\x80\x00\x00\x23\x01\x0b");

// ref_null.wast:23
let $2 = instance($$2);

// ref_null.wast:55
assert_return(() => call($2, "anyref", []), null);

// ref_null.wast:56
assert_return(() => call($2, "anyref", []), null);

// ref_null.wast:57
assert_return(() => call($2, "anyref", []), "ref.null");

// ref_null.wast:58
assert_return(() => call($2, "nullref", []), null);

// ref_null.wast:59
assert_return(() => call($2, "nullref", []), null);

// ref_null.wast:60
assert_return(() => call($2, "nullref", []), "ref.null");

// ref_null.wast:61
assert_return(() => call($2, "funcref", []), null);

// ref_null.wast:62
assert_return(() => call($2, "funcref", []), null);

// ref_null.wast:63
assert_return(() => call($2, "funcref", []), "ref.null");

// ref_null.wast:64
assert_return(() => call($2, "nullfuncref", []), null);

// ref_null.wast:65
assert_return(() => call($2, "nullfuncref", []), null);

// ref_null.wast:66
assert_return(() => call($2, "nullfuncref", []), "ref.null");

// ref_null.wast:67
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x00\x01\x69\x02\xb6\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x06\x65\x78\x6e\x72\x65\x66\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x93\x80\x80\x80\x00\x01\x8d\x80\x80\x80\x00\x00\x02\x40\x10\x00\xd1\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($2)),  "run", []));  // assert_return(() => call($2, "exnref", []), null)

// ref_null.wast:68
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x00\x01\x69\x02\xb6\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x06\x65\x78\x6e\x72\x65\x66\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x93\x80\x80\x80\x00\x01\x8d\x80\x80\x80\x00\x00\x02\x40\x10\x00\xd1\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($2)),  "run", []));  // assert_return(() => call($2, "exnref", []), null)

// ref_null.wast:69
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x00\x01\x69\x02\xb6\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x06\x65\x78\x6e\x72\x65\x66\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x93\x80\x80\x80\x00\x01\x8d\x80\x80\x80\x00\x00\x02\x40\x10\x00\xd1\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($2)),  "run", []));  // assert_return(() => call($2, "exnref", []), "ref.null")

// ref_null.wast:70
assert_return(() => call($2, "nullexnref", []), null);

// ref_null.wast:71
assert_return(() => call($2, "nullexnref", []), null);

// ref_null.wast:72
assert_return(() => call($2, "nullexnref", []), "ref.null");

// ref_null.wast:73
assert_return(() => call($2, "externref", []), null);

// ref_null.wast:74
assert_return(() => call($2, "externref", []), null);

// ref_null.wast:75
assert_return(() => call($2, "externref", []), "ref.null");

// ref_null.wast:76
assert_return(() => call($2, "nullexternref", []), null);

// ref_null.wast:77
assert_return(() => call($2, "nullexternref", []), null);

// ref_null.wast:78
assert_return(() => call($2, "nullexternref", []), "ref.null");

// ref_null.wast:79
assert_return(() => call($2, "ref", []), null);

// ref_null.wast:80
assert_return(() => call($2, "ref", []), null);

// ref_null.wast:81
assert_return(() => call($2, "ref", []), "ref.null");
