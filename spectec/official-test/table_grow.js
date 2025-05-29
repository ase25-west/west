
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

// table_grow.wast:1
let $$1 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\xa9\x80\x80\x80\x00\x08\x60\x01\x7f\x01\x6f\x60\x02\x7f\x6f\x00\x60\x02\x7f\x6f\x01\x7f\x60\x00\x01\x7f\x60\x01\x7e\x01\x6f\x60\x02\x7e\x6f\x00\x60\x02\x7e\x6f\x01\x7e\x60\x00\x01\x7e\x03\x8a\x80\x80\x80\x00\x09\x00\x01\x02\x02\x03\x04\x05\x06\x07\x04\x87\x80\x80\x80\x00\x02\x6f\x00\x00\x6f\x04\x00\x07\xd3\x80\x80\x80\x00\x09\x03\x67\x65\x74\x00\x00\x03\x73\x65\x74\x00\x01\x04\x67\x72\x6f\x77\x00\x02\x0b\x67\x72\x6f\x77\x2d\x61\x62\x62\x72\x65\x76\x00\x03\x04\x73\x69\x7a\x65\x00\x04\x07\x67\x65\x74\x2d\x74\x36\x34\x00\x05\x07\x73\x65\x74\x2d\x74\x36\x34\x00\x06\x08\x67\x72\x6f\x77\x2d\x74\x36\x34\x00\x07\x08\x73\x69\x7a\x65\x2d\x74\x36\x34\x00\x08\x0a\xef\x80\x80\x80\x00\x09\x86\x80\x80\x80\x00\x00\x20\x00\x25\x00\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x20\x01\x26\x00\x0b\x89\x80\x80\x80\x00\x00\x20\x01\x20\x00\xfc\x0f\x00\x0b\x89\x80\x80\x80\x00\x00\x20\x01\x20\x00\xfc\x0f\x00\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b\x86\x80\x80\x80\x00\x00\x20\x00\x25\x01\x0b\x88\x80\x80\x80\x00\x00\x20\x00\x20\x01\x26\x01\x0b\x89\x80\x80\x80\x00\x00\x20\x01\x20\x00\xfc\x0f\x01\x0b\x85\x80\x80\x80\x00\x00\xfc\x10\x01\x0b");

// table_grow.wast:1
let $1 = instance($$1);

// table_grow.wast:25
assert_return(() => call($1, "size", []), 0);

// table_grow.wast:26
assert_trap(() => call($1, "set", [0, hostref(2)]));

// table_grow.wast:27
assert_trap(() => call($1, "get", [0]));

// table_grow.wast:29
assert_return(() => call($1, "grow", [1, null]), 0);

// table_grow.wast:30
assert_return(() => call($1, "size", []), 1);

// table_grow.wast:31
assert_return(() => call($1, "get", [0]), null);

// table_grow.wast:32
assert_return(() => call($1, "set", [0, hostref(2)]));

// table_grow.wast:33
assert_return(() => call($1, "get", [0]), hostref(2));

// table_grow.wast:34
assert_trap(() => call($1, "set", [1, hostref(2)]));

// table_grow.wast:35
assert_trap(() => call($1, "get", [1]));

// table_grow.wast:37
assert_return(() => call($1, "grow-abbrev", [4, hostref(3)]), 1);

// table_grow.wast:38
assert_return(() => call($1, "size", []), 5);

// table_grow.wast:39
assert_return(() => call($1, "get", [0]), hostref(2));

// table_grow.wast:40
assert_return(() => call($1, "set", [0, hostref(2)]));

// table_grow.wast:41
assert_return(() => call($1, "get", [0]), hostref(2));

// table_grow.wast:42
assert_return(() => call($1, "get", [1]), hostref(3));

// table_grow.wast:43
assert_return(() => call($1, "get", [4]), hostref(3));

// table_grow.wast:44
assert_return(() => call($1, "set", [4, hostref(4)]));

// table_grow.wast:45
assert_return(() => call($1, "get", [4]), hostref(4));

// table_grow.wast:46
assert_trap(() => call($1, "set", [5, hostref(2)]));

// table_grow.wast:47
assert_trap(() => call($1, "get", [5]));

// table_grow.wast:50
assert_return(() => call($1, "size-t64", []), 0n);

// table_grow.wast:51
assert_trap(() => call($1, "set-t64", [0n, hostref(2)]));

// table_grow.wast:52
assert_trap(() => call($1, "get-t64", [0n]));

// table_grow.wast:54
assert_return(() => call($1, "grow-t64", [1n, null]), 0n);

// table_grow.wast:55
assert_return(() => call($1, "size-t64", []), 1n);

// table_grow.wast:56
assert_return(() => call($1, "get-t64", [0n]), null);

// table_grow.wast:57
assert_return(() => call($1, "set-t64", [0n, hostref(2)]));

// table_grow.wast:58
assert_return(() => call($1, "get-t64", [0n]), hostref(2));

// table_grow.wast:59
assert_trap(() => call($1, "set-t64", [1n, hostref(2)]));

// table_grow.wast:60
assert_trap(() => call($1, "get-t64", [1n]));

// table_grow.wast:62
assert_return(() => call($1, "grow-t64", [4n, hostref(3)]), 1n);

// table_grow.wast:63
assert_return(() => call($1, "size-t64", []), 5n);

// table_grow.wast:64
assert_return(() => call($1, "get-t64", [0n]), hostref(2));

// table_grow.wast:65
assert_return(() => call($1, "set-t64", [0n, hostref(2)]));

// table_grow.wast:66
assert_return(() => call($1, "get-t64", [0n]), hostref(2));

// table_grow.wast:67
assert_return(() => call($1, "get-t64", [1n]), hostref(3));

// table_grow.wast:68
assert_return(() => call($1, "get-t64", [4n]), hostref(3));

// table_grow.wast:69
assert_return(() => call($1, "set-t64", [4n, hostref(4)]));

// table_grow.wast:70
assert_return(() => call($1, "get-t64", [4n]), hostref(4));

// table_grow.wast:71
assert_trap(() => call($1, "set-t64", [5n, hostref(2)]));

// table_grow.wast:72
assert_trap(() => call($1, "get-t64", [5n]));

// table_grow.wast:75
let $$2 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x10\x07\x88\x80\x80\x80\x00\x01\x04\x67\x72\x6f\x77\x00\x00\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd2\x00\x41\x70\xfc\x0f\x00\x0b");

// table_grow.wast:75
let $2 = instance($$2);

// table_grow.wast:83
assert_return(() => call($2, "grow", []), -1);

// table_grow.wast:86
let $$3 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x07\x88\x80\x80\x80\x00\x01\x04\x67\x72\x6f\x77\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x00\x0b");

// table_grow.wast:86
let $3 = instance($$3);

// table_grow.wast:93
assert_return(() => call($3, "grow", [0]), 0);

// table_grow.wast:94
assert_return(() => call($3, "grow", [1]), 0);

// table_grow.wast:95
assert_return(() => call($3, "grow", [0]), 1);

// table_grow.wast:96
assert_return(() => call($3, "grow", [2]), 1);

// table_grow.wast:97
assert_return(() => call($3, "grow", [800]), 3);

// table_grow.wast:100
let $$4 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x7f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x85\x80\x80\x80\x00\x01\x6f\x01\x00\x0a\x07\x88\x80\x80\x80\x00\x01\x04\x67\x72\x6f\x77\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x6f\x20\x00\xfc\x0f\x00\x0b");

// table_grow.wast:100
let $4 = instance($$4);

// table_grow.wast:107
assert_return(() => call($4, "grow", [0]), 0);

// table_grow.wast:108
assert_return(() => call($4, "grow", [1]), 0);

// table_grow.wast:109
assert_return(() => call($4, "grow", [1]), 1);

// table_grow.wast:110
assert_return(() => call($4, "grow", [2]), 2);

// table_grow.wast:111
assert_return(() => call($4, "grow", [6]), 4);

// table_grow.wast:112
assert_return(() => call($4, "grow", [0]), 10);

// table_grow.wast:113
assert_return(() => call($4, "grow", [1]), -1);

// table_grow.wast:114
assert_return(() => call($4, "grow", [65_536]), -1);

// table_grow.wast:117
let $$5 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x8c\x80\x80\x80\x00\x02\x60\x01\x7f\x01\x7f\x60\x02\x7f\x7f\x01\x70\x03\x83\x80\x80\x80\x00\x02\x00\x01\x04\x84\x80\x80\x80\x00\x01\x70\x00\x0a\x07\x9b\x80\x80\x80\x00\x02\x04\x67\x72\x6f\x77\x00\x00\x10\x63\x68\x65\x63\x6b\x2d\x74\x61\x62\x6c\x65\x2d\x6e\x75\x6c\x6c\x00\x01\x09\x85\x80\x80\x80\x00\x01\x03\x00\x01\x01\x0a\xc5\x80\x80\x80\x00\x02\x89\x80\x80\x80\x00\x00\xd0\x70\x20\x00\xfc\x0f\x00\x0b\xb1\x80\x80\x80\x00\x01\x01\x70\xd2\x01\x21\x02\x02\x40\x03\x40\x20\x00\x25\x00\x21\x02\x20\x02\xd1\x45\x0d\x01\x20\x00\x20\x01\x4f\x0d\x01\x20\x00\x41\x01\x6a\x21\x00\x20\x00\x20\x01\x4d\x0d\x00\x0b\x0b\x20\x02\x0b");

// table_grow.wast:117
let $5 = instance($$5);

// table_grow.wast:139
assert_return(() => call($5, "check-table-null", [0, 9]), null);

// table_grow.wast:140
assert_return(() => call($5, "grow", [10]), 10);

// table_grow.wast:141
assert_return(() => call($5, "check-table-null", [0, 19]), null);

// table_grow.wast:144
let $$6 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x01\x07\x90\x80\x80\x80\x00\x02\x05\x74\x61\x62\x6c\x65\x01\x00\x04\x67\x72\x6f\x77\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x70\x41\x01\xfc\x0f\x00\x0b");
let $Tgt = $$6;

// table_grow.wast:144
let $6 = instance($Tgt);
let Tgt = $6;

// table_grow.wast:148
register("grown-table", Tgt)

// table_grow.wast:149
assert_return(() => call(Tgt, "grow", []), 1);

// table_grow.wast:150
let $$7 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x02\x97\x80\x80\x80\x00\x01\x0b\x67\x72\x6f\x77\x6e\x2d\x74\x61\x62\x6c\x65\x05\x74\x61\x62\x6c\x65\x01\x70\x00\x02\x03\x82\x80\x80\x80\x00\x01\x00\x07\x90\x80\x80\x80\x00\x02\x05\x74\x61\x62\x6c\x65\x01\x00\x04\x67\x72\x6f\x77\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x70\x41\x01\xfc\x0f\x00\x0b");
let $Tgit1 = $$7;

// table_grow.wast:150
let $7 = instance($Tgit1);
let Tgit1 = $7;

// table_grow.wast:155
register("grown-imported-table", Tgit1)

// table_grow.wast:156
assert_return(() => call(Tgit1, "grow", []), 2);

// table_grow.wast:157
let $$8 = module("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x02\xa0\x80\x80\x80\x00\x01\x14\x67\x72\x6f\x77\x6e\x2d\x69\x6d\x70\x6f\x72\x74\x65\x64\x2d\x74\x61\x62\x6c\x65\x05\x74\x61\x62\x6c\x65\x01\x70\x00\x03\x03\x82\x80\x80\x80\x00\x01\x00\x07\x88\x80\x80\x80\x00\x01\x04\x73\x69\x7a\x65\x00\x00\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfc\x10\x00\x0b");
let $Tgit2 = $$8;

// table_grow.wast:157
let $8 = instance($Tgit2);
let Tgit2 = $8;

// table_grow.wast:162
assert_return(() => call(Tgit2, "size", []), 3);

// table_grow.wast:167
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x8b\x80\x80\x80\x00\x01\x85\x80\x80\x80\x00\x00\xfc\x0f\x00\x0b");

// table_grow.wast:176
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\xd0\x6f\xfc\x0f\x00\x0b");

// table_grow.wast:185
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x8d\x80\x80\x80\x00\x01\x87\x80\x80\x80\x00\x00\x41\x01\xfc\x0f\x00\x0b");

// table_grow.wast:194
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x00\x0a\x92\x80\x80\x80\x00\x01\x8c\x80\x80\x80\x00\x00\xd0\x6f\x43\x00\x00\x80\x3f\xfc\x0f\x00\x0b");

// table_grow.wast:203
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x86\x80\x80\x80\x00\x01\x60\x01\x6f\x01\x7f\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x70\x00\x00\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\x20\x00\x41\x01\xfc\x0f\x00\x0b");

// table_grow.wast:213
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x84\x80\x80\x80\x00\x01\x60\x00\x00\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x01\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x6f\x41\x00\xfc\x0f\x00\x0b");

// table_grow.wast:222
assert_invalid("\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x85\x80\x80\x80\x00\x01\x60\x00\x01\x7d\x03\x82\x80\x80\x80\x00\x01\x00\x04\x84\x80\x80\x80\x00\x01\x6f\x00\x01\x0a\x8f\x80\x80\x80\x00\x01\x89\x80\x80\x80\x00\x00\xd0\x6f\x41\x00\xfc\x0f\x00\x0b");
