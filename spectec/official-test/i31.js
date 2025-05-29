
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

// i31.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x99\x80\x80\x80\x00\x05\x60\x01\x7f\x01\x64\x6c\x60\x01\x7f\x01\x7f\x60\x00\x01\x7f\x60\x00\x02\x7f\x7f\x60\x01\x7f\x00\x03\x88\x80\x80\x80\x00\x07\x00\x01\x01\x02\x02\x03\x04\x06\x91\x80\x80\x80\x00\x02\x64\x6c\x00\x41\x02\xfb\x1c\x0b\x64\x6c\x01\x41\x03\xfb\x1c\x0b\x07\xcc\x80\x80\x80\x00\x07\x03\x6e\x65\x77\x00\x00\x05\x67\x65\x74\x5f\x75\x00\x01\x05\x67\x65\x74\x5f\x73\x00\x02\x0a\x67\x65\x74\x5f\x75\x2d\x6e\x75\x6c\x6c\x00\x03\x0a\x67\x65\x74\x5f\x73\x2d\x6e\x75\x6c\x6c\x00\x04\x0b\x67\x65\x74\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x00\x05\x0a\x73\x65\x74\x5f\x67\x6c\x6f\x62\x61\x6c\x00\x06\x0a\xd8\x80\x80\x80\x00\x07\x86\x80\x80\x80\x00\x00\x20\x00\xfb\x1c\x0b\x88\x80\x80\x80\x00\x00\x20\x00\xfb\x1c\xfb\x1e\x0b\x88\x80\x80\x80\x00\x00\x20\x00\xfb\x1c\xfb\x1d\x0b\x86\x80\x80\x80\x00\x00\xd0\x6c\xfb\x1e\x0b\x86\x80\x80\x80\x00\x00\xd0\x6c\xfb\x1e\x0b\x8a\x80\x80\x80\x00\x00\x23\x00\xfb\x1e\x23\x01\xfb\x1e\x0b\x88\x80\x80\x80\x00\x00\x20\x00\xfb\x1c\x24\x01\x0b");

// i31.wast:1
let $1 = instance($$1);

// i31.wast:33
assert_return(() => call($1, "new", [1]), "ref.i31");

// i31.wast:35
assert_return(() => call($1, "get_u", [0]), 0);

// i31.wast:36
assert_return(() => call($1, "get_u", [100]), 100);

// i31.wast:37
assert_return(() => call($1, "get_u", [-1]), 2_147_483_647);

// i31.wast:38
assert_return(() => call($1, "get_u", [1_073_741_823]), 1_073_741_823);

// i31.wast:39
assert_return(() => call($1, "get_u", [1_073_741_824]), 1_073_741_824);

// i31.wast:40
assert_return(() => call($1, "get_u", [2_147_483_647]), 2_147_483_647);

// i31.wast:41
assert_return(() => call($1, "get_u", [-1_431_655_766]), 715_827_882);

// i31.wast:42
assert_return(() => call($1, "get_u", [-894_784_854]), 1_252_698_794);

// i31.wast:44
assert_return(() => call($1, "get_s", [0]), 0);

// i31.wast:45
assert_return(() => call($1, "get_s", [100]), 100);

// i31.wast:46
assert_return(() => call($1, "get_s", [-1]), -1);

// i31.wast:47
assert_return(() => call($1, "get_s", [1_073_741_823]), 1_073_741_823);

// i31.wast:48
assert_return(() => call($1, "get_s", [1_073_741_824]), -1_073_741_824);

// i31.wast:49
assert_return(() => call($1, "get_s", [2_147_483_647]), -1);

// i31.wast:50
assert_return(() => call($1, "get_s", [-1_431_655_766]), 715_827_882);

// i31.wast:51
assert_return(() => call($1, "get_s", [-894_784_854]), -894_784_854);

// i31.wast:53
assert_trap(() => call($1, "get_u-null", []));

// i31.wast:54
assert_trap(() => call($1, "get_s-null", []));

// i31.wast:56
assert_return(() => call($1, "get_globals", []), 2, 3);

// i31.wast:58
run(() => call($1, "set_global", [1_234]));

// i31.wast:59
assert_return(() => call($1, "get_globals", []), 2, 1_234);

// i31.wast:61
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x96\x80\x80\x80\x00\x04\x60\x00\x01\x7f\x60\x01\x7f\x01\x7f\x60\x02\x7f\x7f\x01\x7f\x60\x03\x7f\x7f\x7f\x00\x03\x87\x80\x80\x80\x00\x06\x00\x01\x02\x03\x03\x03\x04\x85\x80\x80\x80\x00\x01\x6c\x01\x03\x0a\x07\xaa\x80\x80\x80\x00\x06\x04\x73\x69\x7a\x65\x00\x00\x03\x67\x65\x74\x00\x01\x04\x67\x72\x6f\x77\x00\x02\x04\x66\x69\x6c\x6c\x00\x03\x04\x63\x6f\x70\x79\x00\x04\x04\x69\x6e\x69\x74\x00\x05\x09\xaf\x80\x80\x80\x00\x02\x06\x00\x41\x00\x0b\x6c\x03\x41\xe7\x07\xfb\x1c\x0b\x41\xf8\x06\xfb\x1c\x0b\x41\x89\x06\xfb\x1c\x0b\x05\x6c\x03\x41\xfb\x00\xfb\x1c\x0b\x41\xc8\x03\xfb\x1c\x0b\x41\x95\x06\xfb\x1c\x0b\x0a\xdc\x80\x80\x80\x00\x06\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x1e\x0b\x8b\x80\x80\x80\x00\x00\x20\x01\xfb\x1c\x20\x00\xfc\x0f\x00\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x20\x01\xfb\x1c\x20\x02\xfc\x11\x00\x0b\x8c\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x0e\x00\x00\x0b\x8c\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x0c\x01\x00\x0b");
let $tables_of_i31ref = $$2;

// i31.wast:61
let $2 = instance($tables_of_i31ref);
let tables_of_i31ref = $2;

// i31.wast:96
assert_return(() => call($2, "size", []), 3);

// i31.wast:97
assert_return(() => call($2, "get", [0]), 999);

// i31.wast:98
assert_return(() => call($2, "get", [1]), 888);

// i31.wast:99
assert_return(() => call($2, "get", [2]), 777);

// i31.wast:102
assert_return(() => call($2, "grow", [2, 333]), 3);

// i31.wast:103
assert_return(() => call($2, "size", []), 5);

// i31.wast:104
assert_return(() => call($2, "get", [3]), 333);

// i31.wast:105
assert_return(() => call($2, "get", [4]), 333);

// i31.wast:108
run(() => call($2, "fill", [2, 111, 2]));

// i31.wast:109
assert_return(() => call($2, "get", [2]), 111);

// i31.wast:110
assert_return(() => call($2, "get", [3]), 111);

// i31.wast:113
run(() => call($2, "copy", [3, 0, 2]));

// i31.wast:114
assert_return(() => call($2, "get", [3]), 999);

// i31.wast:115
assert_return(() => call($2, "get", [4]), 888);

// i31.wast:118
run(() => call($2, "init", [1, 0, 3]));

// i31.wast:119
assert_return(() => call($2, "get", [1]), 123);

// i31.wast:120
assert_return(() => call($2, "get", [2]), 456);

// i31.wast:121
assert_return(() => call($2, "get", [3]), 789);

// i31.wast:123
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x06\x86\x80\x80\x80\x00\x01\x7f\x00\x41\x2a\x0b\x07\x85\x80\x80\x80\x00\x01\x01\x67\x03\x00");
let $env = $$3;

// i31.wast:123
let $3 = instance($env);
let env = $3;

// i31.wast:126
register("env", $3)

// i31.wast:128
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x02\x8a\x80\x80\x80\x00\x01\x03\x65\x6e\x76\x01\x67\x03\x7f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x8d\x80\x80\x80\x00\x01\x40\x00\x64\x6c\x01\x03\x03\x23\x00\xfb\x1c\x0b\x07\x87\x80\x80\x80\x00\x01\x03\x67\x65\x74\x00\x00\x0a\x8e\x80\x80\x80\x00\x01\x88\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x1e\x0b");
let $i31ref_of_global_table_initializer = $$4;

// i31.wast:128
let $4 = instance($i31ref_of_global_table_initializer);
let i31ref_of_global_table_initializer = $4;

// i31.wast:136
assert_return(() => call($4, "get", [0]), 42);

// i31.wast:137
assert_return(() => call($4, "get", [1]), 42);

// i31.wast:138
assert_return(() => call($4, "get", [2]), 42);

// i31.wast:140
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x02\x8a\x80\x80\x80\x00\x01\x03\x65\x6e\x76\x01\x67\x03\x7f\x00\x03\x82\x80\x80\x80\x00\x01\x00\x06\x88\x80\x80\x80\x00\x01\x6c\x00\x23\x00\xfb\x1c\x0b\x07\x87\x80\x80\x80\x00\x01\x03\x67\x65\x74\x00\x00\x0a\x8c\x80\x80\x80\x00\x01\x86\x80\x80\x80\x00\x00\x23\x01\xfb\x1e\x0b");
let $i31ref_of_global_global_initializer = $$5;

// i31.wast:140
let $5 = instance($i31ref_of_global_global_initializer);
let i31ref_of_global_global_initializer = $5;

// i31.wast:148
assert_return(() => call($5, "get", []), 42);

// i31.wast:150
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8a\x80\x80\x80\x00\x02\x60\x00\x02\x7f\x7f\x60\x01\x7f\x00\x03\x83\x80\x80\x80\x00\x02\x00\x01\x06\x91\x80\x80\x80\x00\x02\x6e\x00\x41\xd2\x09\xfb\x1c\x0b\x6e\x01\x41\xae\x2c\xfb\x1c\x0b\x07\x9c\x80\x80\x80\x00\x02\x0b\x67\x65\x74\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x00\x00\x0a\x73\x65\x74\x5f\x67\x6c\x6f\x62\x61\x6c\x00\x01\x0a\xa3\x80\x80\x80\x00\x02\x90\x80\x80\x80\x00\x00\x23\x00\xfb\x17\x6c\xfb\x1e\x23\x01\xfb\x17\x6c\xfb\x1e\x0b\x88\x80\x80\x80\x00\x00\x20\x00\xfb\x1c\x24\x01\x0b");
let $anyref_global_of_i31ref = $$6;

// i31.wast:150
let $6 = instance($anyref_global_of_i31ref);
let anyref_global_of_i31ref = $6;

// i31.wast:164
assert_return(() => call($6, "get_globals", []), 1_234, 5_678);

// i31.wast:165
run(() => call($6, "set_global", [0]));

// i31.wast:166
assert_return(() => call($6, "get_globals", []), 1_234, 0);

// i31.wast:168
let $$7 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x96\x80\x80\x80\x00\x04\x60\x00\x01\x7f\x60\x01\x7f\x01\x7f\x60\x02\x7f\x7f\x01\x7f\x60\x03\x7f\x7f\x7f\x00\x03\x87\x80\x80\x80\x00\x06\x00\x01\x02\x03\x03\x03\x04\x85\x80\x80\x80\x00\x01\x6e\x01\x03\x0a\x07\xaa\x80\x80\x80\x00\x06\x04\x73\x69\x7a\x65\x00\x00\x03\x67\x65\x74\x00\x01\x04\x67\x72\x6f\x77\x00\x02\x04\x66\x69\x6c\x6c\x00\x03\x04\x63\x6f\x70\x79\x00\x04\x04\x69\x6e\x69\x74\x00\x05\x09\xaf\x80\x80\x80\x00\x02\x06\x00\x41\x00\x0b\x6c\x03\x41\xe7\x07\xfb\x1c\x0b\x41\xf8\x06\xfb\x1c\x0b\x41\x89\x06\xfb\x1c\x0b\x05\x6c\x03\x41\xfb\x00\xfb\x1c\x0b\x41\xc8\x03\xfb\x1c\x0b\x41\x95\x06\xfb\x1c\x0b\x0a\xdf\x80\x80\x80\x00\x06\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b\x8b\x80\x80\x80\x00\x00\x20\x00\x25\x00\xfb\x17\x6c\xfb\x1e\x0b\x8b\x80\x80\x80\x00\x00\x20\x01\xfb\x1c\x20\x00\xfc\x0f\x00\x0b\x8d\x80\x80\x80\x00\x00\x20\x00\x20\x01\xfb\x1c\x20\x02\xfc\x11\x00\x0b\x8c\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x0e\x00\x00\x0b\x8c\x80\x80\x80\x00\x00\x20\x00\x20\x01\x20\x02\xfc\x0c\x01\x00\x0b");
let $anyref_table_of_i31ref = $$7;

// i31.wast:168
let $7 = instance($anyref_table_of_i31ref);
let anyref_table_of_i31ref = $7;

// i31.wast:203
assert_return(() => call($7, "size", []), 3);

// i31.wast:204
assert_return(() => call($7, "get", [0]), 999);

// i31.wast:205
assert_return(() => call($7, "get", [1]), 888);

// i31.wast:206
assert_return(() => call($7, "get", [2]), 777);

// i31.wast:209
assert_return(() => call($7, "grow", [2, 333]), 3);

// i31.wast:210
assert_return(() => call($7, "size", []), 5);

// i31.wast:211
assert_return(() => call($7, "get", [3]), 333);

// i31.wast:212
assert_return(() => call($7, "get", [4]), 333);

// i31.wast:215
run(() => call($7, "fill", [2, 111, 2]));

// i31.wast:216
assert_return(() => call($7, "get", [2]), 111);

// i31.wast:217
assert_return(() => call($7, "get", [3]), 111);

// i31.wast:220
run(() => call($7, "copy", [3, 0, 2]));

// i31.wast:221
assert_return(() => call($7, "get", [3]), 999);

// i31.wast:222
assert_return(() => call($7, "get", [4]), 888);

// i31.wast:225
run(() => call($7, "init", [1, 0, 3]));

// i31.wast:226
assert_return(() => call($7, "get", [1]), 123);

// i31.wast:227
assert_return(() => call($7, "get", [2]), 456);

// i31.wast:228
assert_return(() => call($7, "get", [3]), 789);
