# Bugs of v8 found by bottom-up west

* runtime info
    - version: V8 version 13.8.0 (candidate)
    - commit: 4c7d4354137c6500153317d5e562970dfd1fef78
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. Executing unreachable code on assert failure on float values [V8-01]

* fuzzer info
    - command: ./watsup spec/wasm-v8/*.watsup --test --test:target v8 --test:approach bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 51730, 88848, ...
* [minimal](float_assert_fail_unreachable.wast)
```wast
;; expected: assertion failure
;; actulal: wasm runtime unreachable executed

(module
  (func (export "f") (result f32)
    (f32.const 0.0)
  )
)
(assert_return
  (invoke "f")
  (f32.const 1.0)
)
```
* Status: Not a bug due to nondeterminism
