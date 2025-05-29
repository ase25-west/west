
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

// address0.wast:3
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x01\x7f\x00\x03\x9f\x80\x80\x80\x00\x1e\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x01\x01\x01\x01\x05\x85\x80\x80\x80\x00\x02\x00\x00\x00\x01\x07\xcd\x82\x80\x80\x00\x1e\x08\x38\x75\x5f\x67\x6f\x6f\x64\x31\x00\x00\x08\x38\x75\x5f\x67\x6f\x6f\x64\x32\x00\x01\x08\x38\x75\x5f\x67\x6f\x6f\x64\x33\x00\x02\x08\x38\x75\x5f\x67\x6f\x6f\x64\x34\x00\x03\x08\x38\x75\x5f\x67\x6f\x6f\x64\x35\x00\x04\x08\x38\x73\x5f\x67\x6f\x6f\x64\x31\x00\x05\x08\x38\x73\x5f\x67\x6f\x6f\x64\x32\x00\x06\x08\x38\x73\x5f\x67\x6f\x6f\x64\x33\x00\x07\x08\x38\x73\x5f\x67\x6f\x6f\x64\x34\x00\x08\x08\x38\x73\x5f\x67\x6f\x6f\x64\x35\x00\x09\x09\x31\x36\x75\x5f\x67\x6f\x6f\x64\x31\x00\x0a\x09\x31\x36\x75\x5f\x67\x6f\x6f\x64\x32\x00\x0b\x09\x31\x36\x75\x5f\x67\x6f\x6f\x64\x33\x00\x0c\x09\x31\x36\x75\x5f\x67\x6f\x6f\x64\x34\x00\x0d\x09\x31\x36\x75\x5f\x67\x6f\x6f\x64\x35\x00\x0e\x09\x31\x36\x73\x5f\x67\x6f\x6f\x64\x31\x00\x0f\x09\x31\x36\x73\x5f\x67\x6f\x6f\x64\x32\x00\x10\x09\x31\x36\x73\x5f\x67\x6f\x6f\x64\x33\x00\x11\x09\x31\x36\x73\x5f\x67\x6f\x6f\x64\x34\x00\x12\x09\x31\x36\x73\x5f\x67\x6f\x6f\x64\x35\x00\x13\x08\x33\x32\x5f\x67\x6f\x6f\x64\x31\x00\x14\x08\x33\x32\x5f\x67\x6f\x6f\x64\x32\x00\x15\x08\x33\x32\x5f\x67\x6f\x6f\x64\x33\x00\x16\x08\x33\x32\x5f\x67\x6f\x6f\x64\x34\x00\x17\x08\x33\x32\x5f\x67\x6f\x6f\x64\x35\x00\x18\x06\x38\x75\x5f\x62\x61\x64\x00\x19\x06\x38\x73\x5f\x62\x61\x64\x00\x1a\x07\x31\x36\x75\x5f\x62\x61\x64\x00\x1b\x07\x31\x36\x73\x5f\x62\x61\x64\x00\x1c\x06\x33\x32\x5f\x62\x61\x64\x00\x1d\x0a\xa0\x83\x80\x80\x00\x1e\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\x19\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\x19\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2f\x41\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2f\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2f\x40\x01\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2f\x41\x01\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2f\x41\x01\x19\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2e\x41\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2e\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2e\x40\x01\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2e\x41\x01\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x2e\x41\x01\x19\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x28\x42\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x28\x40\x01\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x28\x40\x01\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x28\x41\x01\x02\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x28\x42\x01\x19\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x2d\x40\x01\xff\xff\xff\xff\x0f\x1a\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x2c\x40\x01\xff\xff\xff\xff\x0f\x1a\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x2f\x41\x01\xff\xff\xff\xff\x0f\x1a\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x2e\x41\x01\xff\xff\xff\xff\x0f\x1a\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x28\x42\x01\xff\xff\xff\xff\x0f\x1a\x0b\x0b\xa1\x80\x80\x80\x00\x01\x02\x01\x41\x00\x0b\x1a\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a");

// address0.wast:3
let $1 = instance($$1);

// address0.wast:105
assert_return(() => call($1, "8u_good1", [0]), 97);

// address0.wast:106
assert_return(() => call($1, "8u_good2", [0]), 97);

// address0.wast:107
assert_return(() => call($1, "8u_good3", [0]), 98);

// address0.wast:108
assert_return(() => call($1, "8u_good4", [0]), 99);

// address0.wast:109
assert_return(() => call($1, "8u_good5", [0]), 122);

// address0.wast:111
assert_return(() => call($1, "8s_good1", [0]), 97);

// address0.wast:112
assert_return(() => call($1, "8s_good2", [0]), 97);

// address0.wast:113
assert_return(() => call($1, "8s_good3", [0]), 98);

// address0.wast:114
assert_return(() => call($1, "8s_good4", [0]), 99);

// address0.wast:115
assert_return(() => call($1, "8s_good5", [0]), 122);

// address0.wast:117
assert_return(() => call($1, "16u_good1", [0]), 25_185);

// address0.wast:118
assert_return(() => call($1, "16u_good2", [0]), 25_185);

// address0.wast:119
assert_return(() => call($1, "16u_good3", [0]), 25_442);

// address0.wast:120
assert_return(() => call($1, "16u_good4", [0]), 25_699);

// address0.wast:121
assert_return(() => call($1, "16u_good5", [0]), 122);

// address0.wast:123
assert_return(() => call($1, "16s_good1", [0]), 25_185);

// address0.wast:124
assert_return(() => call($1, "16s_good2", [0]), 25_185);

// address0.wast:125
assert_return(() => call($1, "16s_good3", [0]), 25_442);

// address0.wast:126
assert_return(() => call($1, "16s_good4", [0]), 25_699);

// address0.wast:127
assert_return(() => call($1, "16s_good5", [0]), 122);

// address0.wast:129
assert_return(() => call($1, "32_good1", [0]), 1_684_234_849);

// address0.wast:130
assert_return(() => call($1, "32_good2", [0]), 1_684_234_849);

// address0.wast:131
assert_return(() => call($1, "32_good3", [0]), 1_701_077_858);

// address0.wast:132
assert_return(() => call($1, "32_good4", [0]), 1_717_920_867);

// address0.wast:133
assert_return(() => call($1, "32_good5", [0]), 122);

// address0.wast:135
assert_return(() => call($1, "8u_good1", [65_507]), 0);

// address0.wast:136
assert_return(() => call($1, "8u_good2", [65_507]), 0);

// address0.wast:137
assert_return(() => call($1, "8u_good3", [65_507]), 0);

// address0.wast:138
assert_return(() => call($1, "8u_good4", [65_507]), 0);

// address0.wast:139
assert_return(() => call($1, "8u_good5", [65_507]), 0);

// address0.wast:141
assert_return(() => call($1, "8s_good1", [65_507]), 0);

// address0.wast:142
assert_return(() => call($1, "8s_good2", [65_507]), 0);

// address0.wast:143
assert_return(() => call($1, "8s_good3", [65_507]), 0);

// address0.wast:144
assert_return(() => call($1, "8s_good4", [65_507]), 0);

// address0.wast:145
assert_return(() => call($1, "8s_good5", [65_507]), 0);

// address0.wast:147
assert_return(() => call($1, "16u_good1", [65_507]), 0);

// address0.wast:148
assert_return(() => call($1, "16u_good2", [65_507]), 0);

// address0.wast:149
assert_return(() => call($1, "16u_good3", [65_507]), 0);

// address0.wast:150
assert_return(() => call($1, "16u_good4", [65_507]), 0);

// address0.wast:151
assert_return(() => call($1, "16u_good5", [65_507]), 0);

// address0.wast:153
assert_return(() => call($1, "16s_good1", [65_507]), 0);

// address0.wast:154
assert_return(() => call($1, "16s_good2", [65_507]), 0);

// address0.wast:155
assert_return(() => call($1, "16s_good3", [65_507]), 0);

// address0.wast:156
assert_return(() => call($1, "16s_good4", [65_507]), 0);

// address0.wast:157
assert_return(() => call($1, "16s_good5", [65_507]), 0);

// address0.wast:159
assert_return(() => call($1, "32_good1", [65_507]), 0);

// address0.wast:160
assert_return(() => call($1, "32_good2", [65_507]), 0);

// address0.wast:161
assert_return(() => call($1, "32_good3", [65_507]), 0);

// address0.wast:162
assert_return(() => call($1, "32_good4", [65_507]), 0);

// address0.wast:163
assert_return(() => call($1, "32_good5", [65_507]), 0);

// address0.wast:165
assert_return(() => call($1, "8u_good1", [65_508]), 0);

// address0.wast:166
assert_return(() => call($1, "8u_good2", [65_508]), 0);

// address0.wast:167
assert_return(() => call($1, "8u_good3", [65_508]), 0);

// address0.wast:168
assert_return(() => call($1, "8u_good4", [65_508]), 0);

// address0.wast:169
assert_return(() => call($1, "8u_good5", [65_508]), 0);

// address0.wast:171
assert_return(() => call($1, "8s_good1", [65_508]), 0);

// address0.wast:172
assert_return(() => call($1, "8s_good2", [65_508]), 0);

// address0.wast:173
assert_return(() => call($1, "8s_good3", [65_508]), 0);

// address0.wast:174
assert_return(() => call($1, "8s_good4", [65_508]), 0);

// address0.wast:175
assert_return(() => call($1, "8s_good5", [65_508]), 0);

// address0.wast:177
assert_return(() => call($1, "16u_good1", [65_508]), 0);

// address0.wast:178
assert_return(() => call($1, "16u_good2", [65_508]), 0);

// address0.wast:179
assert_return(() => call($1, "16u_good3", [65_508]), 0);

// address0.wast:180
assert_return(() => call($1, "16u_good4", [65_508]), 0);

// address0.wast:181
assert_return(() => call($1, "16u_good5", [65_508]), 0);

// address0.wast:183
assert_return(() => call($1, "16s_good1", [65_508]), 0);

// address0.wast:184
assert_return(() => call($1, "16s_good2", [65_508]), 0);

// address0.wast:185
assert_return(() => call($1, "16s_good3", [65_508]), 0);

// address0.wast:186
assert_return(() => call($1, "16s_good4", [65_508]), 0);

// address0.wast:187
assert_return(() => call($1, "16s_good5", [65_508]), 0);

// address0.wast:189
assert_return(() => call($1, "32_good1", [65_508]), 0);

// address0.wast:190
assert_return(() => call($1, "32_good2", [65_508]), 0);

// address0.wast:191
assert_return(() => call($1, "32_good3", [65_508]), 0);

// address0.wast:192
assert_return(() => call($1, "32_good4", [65_508]), 0);

// address0.wast:193
assert_trap(() => call($1, "32_good5", [65_508]));

// address0.wast:195
assert_trap(() => call($1, "8u_good3", [-1]));

// address0.wast:196
assert_trap(() => call($1, "8s_good3", [-1]));

// address0.wast:197
assert_trap(() => call($1, "16u_good3", [-1]));

// address0.wast:198
assert_trap(() => call($1, "16s_good3", [-1]));

// address0.wast:199
assert_trap(() => call($1, "32_good3", [-1]));

// address0.wast:200
assert_trap(() => call($1, "32_good3", [-1]));

// address0.wast:202
assert_trap(() => call($1, "8u_bad", [0]));

// address0.wast:203
assert_trap(() => call($1, "8s_bad", [0]));

// address0.wast:204
assert_trap(() => call($1, "16u_bad", [0]));

// address0.wast:205
assert_trap(() => call($1, "16s_bad", [0]));

// address0.wast:206
assert_trap(() => call($1, "32_bad", [0]));

// address0.wast:208
assert_trap(() => call($1, "8u_bad", [1]));

// address0.wast:209
assert_trap(() => call($1, "8s_bad", [1]));

// address0.wast:210
assert_trap(() => call($1, "16u_bad", [1]));

// address0.wast:211
assert_trap(() => call($1, "16s_bad", [1]));

// address0.wast:212
assert_trap(() => call($1, "32_bad", [1]));
