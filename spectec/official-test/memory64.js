
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

// memory64.wast:4
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x84\x80\x80\x80\x00\x01\x05\x00\x00");

// memory64.wast:4
let $1 = instance($$1);

// memory64.wast:5
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x84\x80\x80\x80\x00\x01\x05\x00\x01");

// memory64.wast:5
let $2 = instance($$2);

// memory64.wast:6
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x85\x80\x80\x80\x00\x01\x05\x01\x80\x02");

// memory64.wast:6
let $3 = instance($$3);

// memory64.wast:7
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x86\x80\x80\x80\x00\x01\x05\x00\x80\x80\x04");

// memory64.wast:7
let $4 = instance($$4);

// memory64.wast:9
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7e\x03\x82\x80\x80\x80\x00\x01\x00\x05\x84\x80\x80\x80\x00\x01\x05\x00\x00\x07\x8b\x80\x80\x80\x00\x01\x07\x6d\x65\x6d\x73\x69\x7a\x65\x00\x00\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x3f\x00\x0b\x0b\x86\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x00");

// memory64.wast:9
let $5 = instance($$5);

// memory64.wast:10
assert_return(() => call($5, "memsize", []), 0n);

// memory64.wast:11
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7e\x03\x82\x80\x80\x80\x00\x01\x00\x05\x84\x80\x80\x80\x00\x01\x05\x00\x00\x07\x8b\x80\x80\x80\x00\x01\x07\x6d\x65\x6d\x73\x69\x7a\x65\x00\x00\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x3f\x00\x0b\x0b\x86\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x00");

// memory64.wast:11
let $6 = instance($$6);

// memory64.wast:12
assert_return(() => call($6, "memsize", []), 0n);

// memory64.wast:13
let $$7 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7e\x03\x82\x80\x80\x80\x00\x01\x00\x05\x84\x80\x80\x80\x00\x01\x05\x01\x01\x07\x8b\x80\x80\x80\x00\x01\x07\x6d\x65\x6d\x73\x69\x7a\x65\x00\x00\x0a\x8a\x80\x80\x80\x00\x01\x84\x80\x80\x80\x00\x00\x3f\x00\x0b\x0b\x87\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x01\x78");

// memory64.wast:13
let $7 = instance($$7);

// memory64.wast:14
assert_return(() => call($7, "memsize", []), 1n);

// memory64.wast:16
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x0b\x86\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x00");

// memory64.wast:17
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x0b\x86\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x00");

// memory64.wast:18
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x0b\x87\x80\x80\x80\x00\x01\x00\x42\x00\x0b\x01\x78");

// memory64.wast:20
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x42\x00\x2a\x02\x00\x1a\x0b");

// memory64.wast:24
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x92\x80\x80\x80\x00\x01\x8c\x80\x80\x80\x00\x00\x42\x00\x43\x00\x00\x00\x00\x38\x02\x00\x0b");

// memory64.wast:28
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x42\x00\x2c\x00\x00\x1a\x0b");

// memory64.wast:32
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\x42\x00\x41\x00\x3a\x00\x00\x0b");

// memory64.wast:36
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\x3f\x00\x1a\x0b");

// memory64.wast:40
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x42\x00\x40\x00\x1a\x0b");

// memory64.wast:46
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x84\x80\x80\x80\x00\x01\x05\x01\x00");

// memory64.wast:51
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x89\x80\x80\x80\x00\x01\x04\x81\x80\x80\x80\x80\x80\x40");

// memory64.wast:55
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x05\x8a\x80\x80\x80\x00\x01\x05\x00\x81\x80\x80\x80\x80\x80\x40");

// memory64.wast:60
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x8e\x80\x80\x80\x00\x01\x01\x4d\x01\x6d\x02\x04\x81\x80\x80\x80\x80\x80\x40");

// memory64.wast:64
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x02\x8f\x80\x80\x80\x00\x01\x01\x4d\x01\x6d\x02\x05\x00\x81\x80\x80\x80\x80\x80\x40");

// memory64.wast:69
let $$8 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x01\x7f\x60\x00\x01\x7c\x60\x01\x7f\x01\x7f\x60\x01\x7e\x01\x7e\x03\x8d\x80\x80\x80\x00\x0c\x00\x01\x02\x02\x02\x02\x03\x03\x03\x03\x03\x03\x05\x83\x80\x80\x80\x00\x01\x04\x01\x07\xa1\x81\x80\x80\x00\x0c\x04\x64\x61\x74\x61\x00\x00\x04\x63\x61\x73\x74\x00\x01\x0b\x69\x33\x32\x5f\x6c\x6f\x61\x64\x38\x5f\x73\x00\x02\x0b\x69\x33\x32\x5f\x6c\x6f\x61\x64\x38\x5f\x75\x00\x03\x0c\x69\x33\x32\x5f\x6c\x6f\x61\x64\x31\x36\x5f\x73\x00\x04\x0c\x69\x33\x32\x5f\x6c\x6f\x61\x64\x31\x36\x5f\x75\x00\x05\x0b\x69\x36\x34\x5f\x6c\x6f\x61\x64\x38\x5f\x73\x00\x06\x0b\x69\x36\x34\x5f\x6c\x6f\x61\x64\x38\x5f\x75\x00\x07\x0c\x69\x36\x34\x5f\x6c\x6f\x61\x64\x31\x36\x5f\x73\x00\x08\x0c\x69\x36\x34\x5f\x6c\x6f\x61\x64\x31\x36\x5f\x75\x00\x09\x0c\x69\x36\x34\x5f\x6c\x6f\x61\x64\x33\x32\x5f\x73\x00\x0a\x0c\x69\x36\x34\x5f\x6c\x6f\x61\x64\x33\x32\x5f\x75\x00\x0b\x0a\xcf\x82\x80\x80\x00\x0c\xce\x80\x80\x80\x00\x00\x42\x00\x2d\x00\x00\x41\xc1\x00\x46\x42\x03\x2d\x00\x00\x41\xa7\x01\x46\x71\x42\x06\x2d\x00\x00\x41\x00\x46\x42\x13\x2d\x00\x00\x41\x00\x46\x71\x71\x42\x14\x2d\x00\x00\x41\xd7\x00\x46\x42\x17\x2d\x00\x00\x41\xcd\x00\x46\x71\x42\x18\x2d\x00\x00\x41\x00\x46\x42\xff\x07\x2d\x00\x00\x41\x00\x46\x71\x71\x71\x0b\xb8\x80\x80\x80\x00\x00\x42\x08\x42\xc7\x9f\x7f\x37\x03\x00\x42\x08\x2b\x03\x00\x42\xc7\x9f\x7f\xbf\x61\x04\x40\x44\x00\x00\x00\x00\x00\x00\x00\x00\x0f\x0b\x42\x09\x42\x00\x37\x00\x00\x42\x0f\x41\xc5\x80\x01\x3b\x00\x00\x42\x09\x2b\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3a\x00\x00\x42\x08\x2c\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3a\x00\x00\x42\x08\x2d\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3b\x01\x00\x42\x08\x2e\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3b\x01\x00\x42\x08\x2f\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3c\x00\x00\x42\x08\x30\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3c\x00\x00\x42\x08\x31\x00\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3d\x01\x00\x42\x08\x32\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3d\x01\x00\x42\x08\x33\x01\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3e\x02\x00\x42\x08\x34\x02\x00\x0b\x8e\x80\x80\x80\x00\x00\x42\x08\x20\x00\x3e\x02\x00\x42\x08\x35\x02\x00\x0b\x0b\x94\x80\x80\x80\x00\x02\x00\x42\x00\x0b\x05\x41\x42\x43\xa7\x44\x00\x42\x14\x0b\x04\x57\x41\x53\x4d");

// memory64.wast:69
let $8 = instance($$8);

// memory64.wast:157
assert_return(() => call($8, "data", []), 1);

// memory64.wast:158
run(() => call(instance(module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x93\x80\x80\x80\x00\x04\x60\x00\x00\x60\x01\x7f\x01\x6e\x60\x02\x6d\x6d\x01\x7f\x60\x00\x01\x7c\x02\xb4\x80\x80\x80\x00\x03\x06\x6d\x6f\x64\x75\x6c\x65\x04\x63\x61\x73\x74\x00\x03\x08\x73\x70\x65\x63\x74\x65\x73\x74\x07\x68\x6f\x73\x74\x72\x65\x66\x00\x01\x08\x73\x70\x65\x63\x74\x65\x73\x74\x06\x65\x71\x5f\x72\x65\x66\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x87\x80\x80\x80\x00\x01\x03\x72\x75\x6e\x00\x03\x0a\x9e\x80\x80\x80\x00\x01\x98\x80\x80\x80\x00\x00\x02\x40\x10\x00\xbd\x44\x00\x00\x00\x00\x00\x00\x45\x40\xbd\x51\x45\x0d\x00\x0f\x0b\x00\x0b"), exports($8)),  "run", []));  // assert_return(() => call($8, "cast", []), 42.)

// memory64.wast:160
assert_return(() => call($8, "i32_load8_s", [-1]), -1);

// memory64.wast:161
assert_return(() => call($8, "i32_load8_u", [-1]), 255);

// memory64.wast:162
assert_return(() => call($8, "i32_load16_s", [-1]), -1);

// memory64.wast:163
assert_return(() => call($8, "i32_load16_u", [-1]), 65_535);

// memory64.wast:165
assert_return(() => call($8, "i32_load8_s", [100]), 100);

// memory64.wast:166
assert_return(() => call($8, "i32_load8_u", [200]), 200);

// memory64.wast:167
assert_return(() => call($8, "i32_load16_s", [20_000]), 20_000);

// memory64.wast:168
assert_return(() => call($8, "i32_load16_u", [40_000]), 40_000);

// memory64.wast:170
assert_return(() => call($8, "i32_load8_s", [-19_110_589]), 67);

// memory64.wast:171
assert_return(() => call($8, "i32_load8_s", [878_104_047]), -17);

// memory64.wast:172
assert_return(() => call($8, "i32_load8_u", [-19_110_589]), 67);

// memory64.wast:173
assert_return(() => call($8, "i32_load8_u", [878_104_047]), 239);

// memory64.wast:174
assert_return(() => call($8, "i32_load16_s", [-19_110_589]), 25_923);

// memory64.wast:175
assert_return(() => call($8, "i32_load16_s", [878_104_047]), -12_817);

// memory64.wast:176
assert_return(() => call($8, "i32_load16_u", [-19_110_589]), 25_923);

// memory64.wast:177
assert_return(() => call($8, "i32_load16_u", [878_104_047]), 52_719);

// memory64.wast:179
assert_return(() => call($8, "i64_load8_s", [-1n]), -1n);

// memory64.wast:180
assert_return(() => call($8, "i64_load8_u", [-1n]), 255n);

// memory64.wast:181
assert_return(() => call($8, "i64_load16_s", [-1n]), -1n);

// memory64.wast:182
assert_return(() => call($8, "i64_load16_u", [-1n]), 65_535n);

// memory64.wast:183
assert_return(() => call($8, "i64_load32_s", [-1n]), -1n);

// memory64.wast:184
assert_return(() => call($8, "i64_load32_u", [-1n]), 4_294_967_295n);

// memory64.wast:186
assert_return(() => call($8, "i64_load8_s", [100n]), 100n);

// memory64.wast:187
assert_return(() => call($8, "i64_load8_u", [200n]), 200n);

// memory64.wast:188
assert_return(() => call($8, "i64_load16_s", [20_000n]), 20_000n);

// memory64.wast:189
assert_return(() => call($8, "i64_load16_u", [40_000n]), 40_000n);

// memory64.wast:190
assert_return(() => call($8, "i64_load32_s", [20_000n]), 20_000n);

// memory64.wast:191
assert_return(() => call($8, "i64_load32_u", [40_000n]), 40_000n);

// memory64.wast:193
assert_return(() => call($8, "i64_load8_s", [-81_985_529_755_441_853n]), 67n);

// memory64.wast:194
assert_return(() => call($8, "i64_load8_s", [3_771_275_841_602_506_223n]), -17n);

// memory64.wast:195
assert_return(() => call($8, "i64_load8_u", [-81_985_529_755_441_853n]), 67n);

// memory64.wast:196
assert_return(() => call($8, "i64_load8_u", [3_771_275_841_602_506_223n]), 239n);

// memory64.wast:197
assert_return(() => call($8, "i64_load16_s", [-81_985_529_755_441_853n]), 25_923n);

// memory64.wast:198
assert_return(() => call($8, "i64_load16_s", [3_771_275_841_602_506_223n]), -12_817n);

// memory64.wast:199
assert_return(() => call($8, "i64_load16_u", [-81_985_529_755_441_853n]), 25_923n);

// memory64.wast:200
assert_return(() => call($8, "i64_load16_u", [3_771_275_841_602_506_223n]), 52_719n);

// memory64.wast:201
assert_return(() => call($8, "i64_load32_s", [-81_985_529_755_441_853n]), 1_446_274_371n);

// memory64.wast:202
assert_return(() => call($8, "i64_load32_s", [3_771_275_841_602_506_223n]), -1_732_588_049n);

// memory64.wast:203
assert_return(() => call($8, "i64_load32_u", [-81_985_529_755_441_853n]), 1_446_274_371n);

// memory64.wast:204
assert_return(() => call($8, "i64_load32_u", [3_771_275_841_602_506_223n]), 2_562_379_247n);
