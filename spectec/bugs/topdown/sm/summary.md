# Bugs of spidermonkey found by top-down west

* runtime info
    - version: 4d00b50c42a788c51ac4c5fe92b684569ba6c3a5
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. nullexnref (ref null noexn) [SM-01]

* fuzzer info
    - command: ./watsup spec/wasm-sm/*.watsup --test --test:target sm --test:approach top-down
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
* Status: [Reported](https://bugzilla.mozilla.org/show_bug.cgi?id=1966316)

## 2. Importing a table with a non-nullable reference type [SM-02]

* fuzzer info
    - command: ./watsup spec/wasm-sm/*.watsup --test --test:target sm --test:approach top-down
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 11, 28, 36, 52, 68, ...
* [minimal](import_table_non_null_ref.wast)
```wast
;; should be valid
(module
  (table (export "t") 0 0 (ref any) (i32.const 0) (ref.i31))
)
(register "M")
(module
  (import "M" "t" (table 0 0 (ref any)))
)
```
* Status: [Reported](https://bugzilla.mozilla.org/show_bug.cgi?id=1966552)

## 3. catch\_ref with non-null exn ref is invalid [SM-03]

type mismatch: expression has type exnref but expected (ref exn)

* fuzzer info
    - command: ./watsup spec/wasm-sm/*.watsup --test --test:target sm --test:approach top-down --test:module-num 2
    - commit: 6a6ca2ed9244157043cc1afa9a0937890295f9c1
    - seed: 1000066, ...
* [minimal](non_null_catch_ref.wat)

```wat
(module
  (type $ft (func))
  (tag $tag (type $ft))
  (func
    (param (ref exn))
    (result (ref exn))

    (try_table
      (catch_ref $tag 0)
    )

    (local.get 0)
  )
)
```

* Status: [Reported](https://bugzilla.mozilla.org/show_bug.cgi?id=1967661)
