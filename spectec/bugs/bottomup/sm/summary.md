# Bugs of spidermonkey found by bottom-up west

* runtime info
    - version: 4d00b50c42a788c51ac4c5fe92b684569ba6c3a5
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. Executing unreachable code on assert failure on float values

* fuzzer info
    - command: ./watsup spec/wasm-sm/*.watsup --test --test:target sm --test:approach bottom-up
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
