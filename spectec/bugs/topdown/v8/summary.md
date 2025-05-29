# Bugs of v8 found by top-down west

* runtime info
    - version: V8 version 13.8.0 (candidate)
    - commit: 4c7d4354137c6500153317d5e562970dfd1fef78
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. nullexnref (ref null noexn)

* fuzzer info
    - command: ./watsup spec/wasm-v8/*.watsup --test --test:target v8 --test:approach top-down
    - approach: top-down
    - commit: f55c4cbabb0e9b4c68f6011925ce2cd96e9ef207
    - seed: 30, 183, ...
* [minimal](nullexnref.wast)
```wast
(module
  (func (export "f") (result nullexnref)
    unreachable
  )
)
(assert_trap (invoke "f") "")
```
* Status: [Reported](https://issues.chromium.org/issues/417604765)
