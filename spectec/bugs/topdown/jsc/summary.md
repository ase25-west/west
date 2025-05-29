# Bugs of jsc found by top-down west

* runtime info
    - commit: 9d02067f5de4b0402f58d6c83039e206439a8a8c
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. return & try\_table is invalid [JSC-03]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach top-down --test:module-num 2
    - approach: top-down
    - commit: 712d7a3ecbb2c49f0017390e2cfef6b4333f349c
    - seed: 35, (42?), ...
* [minimal](return_try_table.wat)
```wat
(module
  (func
    (return)
    (try_table)
  )
)
```
* Status: [Reported](https://bugs.webkit.org/show_bug.cgi?id=293106)

## 2. importing non-nullable table is invalid [JSC-08]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach top-down --test:module-num 2
    - approach: top-down
    - commit: 712d7a3ecbb2c49f0017390e2cfef6b4333f349c
    - seed: 36, ...
* [minimal](import_table_non_null_ref.wast)
```wast
(module
  (table (export "t") 0 0 (ref any)
    (i32.const 0) (ref.i31)
  )
)
(register "M")
(module
  (import "M" "t" (table 0 0 (ref any)))
)

```
* Status: [Reported](https://bugs.webkit.org/show_bug.cgi?id=293030)

## 3. throw\_ref with non-null ref is invalid [JSC-05]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach top-down --test:module-num 2
    - approach: top-down
    - commit: 634804d29d1412ed011cd77fff8915e7de7e6fd1
    - seed: 1000707, ...
* [minimal](local.get_throw_ref.wat)
```wat
(module
  (func (param (ref exn)) (local.get 0) (throw_ref))
)
```
* Status: Duplicate (same root cause with bottomup: as\_non\_null + throw\_ref)

## 4. exnref global [JSC-09]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach top-down --test:module-num 2
    - approach: top-down
    - commit: 634804d29d1412ed011cd77fff8915e7de7e6fd1
    - seed: 1000130, 1000216, ...
* [minimal](import_exnref_global.wast)
```wast
(module
  (global (export "g") (ref null exn) (ref.null exn))
)
(register "M")
(module
  (import "M" "g" (global (ref null exn)))
)
```
* Status: [Reported](https://bugs.webkit.org/show_bug.cgi?id=293340)
