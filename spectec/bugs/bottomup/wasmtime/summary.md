# Bugs of wasmtime found by bottom-up west

* runtime info
    - version: 30.0.2 (398694a59 2025-02-25)
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1. Thread panic when v128 array reference is used as table initializer [WT-01]

When the reference for v128 array is used as as table initializer,
the instantiation results in a thread panic.

* fuzzer info
    - approach: bottom-up
    - commit: 6a5095741cf0708a934714983c292768b1393bea
    - seed: 547, 576, ...
* [minimal](v128_array_ref_table_initializer.wast)
```wat
(module
  (type $t (array v128))
  (table 0 (ref array)
    (i32.const 0)
    (array.new_default $t)
  )
)
```
* Status: Duplicated, [Fixed](https://github.com/bytecodealliance/wasmtime/pull/10349)

## 2. Out of bounds table access does not trap for none reference [WT-02]

Accessing out of bounds element from the table should result in trap,
but if the table uses `none` reference type,
the access does not trap.

* fuzzer info
    - approach: bottom-up
    - commit: 6a5095741cf0708a934714983c292768b1393bea
    - seed: 4213, ...
* [minimal](out_of_bound_table_none_reference.wast)
```wat
(module
  (table $t 10 (ref null none))
  (func (export "f") (result (ref null none))
    (i32.const 99)
    (table.get $t)
  )
)
(assert_trap (invoke "f") "out of bounds table access")
```
* Status: [Reported](https://github.com/bytecodealliance/wasmtime/issues/10353), [Fixed](https://github.com/bytecodealliance/wasmtime/pull/10372)

## 3. `global.set` or `table.set` with large i31 reference [WT-03]

There are some specific requirements for triggering this bug:

1. `global.set` or `table.set` is required. The bug is not triggered for `global.get` or `table.get`.
2. There are two ref.i31 values for each module: the initializer value, and the new value being set. At least one number that goes into the ref.i31 should be larger than or equal to 262,136.
3. The global type or table type must be anyref or eqref. The bug is not triggered for non-nullable references (ref any, ref eq), or i31 references (i31ref)

* fuzzer info
    - approach: bottom-up
    - commit: defc94faedf3324f4cc22c45b26f0da28a3f318d
    - seed: 267224, 602285, ...
* [minimal1](global.set_large_i31.wast), [minimal2](global.set_large_i31.wast)
```wat
;; global
(module
  (global $g (mut anyref) ;; or eqref
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
  )
  (func (export "f")
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
    (global.set $g)
  )
)
(assert_return (invoke "f"))

;; table
(module
  (table $t i32 1 anyref ;; or eqref
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
  )
  (func (export "f")
    (i32.const 0)
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
    (table.set $t)
  )
)
(assert_return (invoke "f"))

```
* Status: [Reported](https://github.com/bytecodealliance/wasmtime/issues/10407), duplicated


## 4. exporting function with large result type [WT-04]

* runtime info
    - version: wasmtime 34.0.0 (303b836 2025-05-06)
    - system: Ubuntu 20.04.6 LTS, x86\_64

When exporting a function with a reult type with length greater than or equal to 254, this bug is triggered.

* fuzzer info
    - command: ./watsup spec/wasm-wasmtime/*.watsup --test --test:target wasmtime
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 103158, ...
* [minimal](export_long_result_func.wast)

```wat
(module
  (type $t
    (func
      (result
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 10
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 20
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 30
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 40
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 50
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 60
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 70
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 80
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 90
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 100
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 110
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 120
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 130
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 140
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 150
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 160
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 170
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 180
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 190
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 200
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 210
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 220
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 230
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 240
        i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 ;; 250
        i32 i32 i32 i32                         ;; 254
      )
    )
  )
  (export "f" (func $f))
  (func $f (type $t) (unreachable))
)
```

* Status: [Reported](https://github.com/bytecodealliance/wasmtime/issues/10741)

# Nondeterminism

## Nondeterministic `relaxed_laneselect`

* fuzzer info
    - approach: bottom-up
    - commit: 6a5095741cf0708a934714983c292768b1393bea
    - seed: 1159, ...
* [minimal](relaxed_laneselect.wast)
```wat
(module
  (func (export "f") (result v128)
    (v128.const i64x2 0 0)
    (v128.const i64x2 1 0)
    (v128.const i64x2 1 0)
    (v128.not)
    ;; 00000000   (select this if flag is 1)
    ;; 00000001   (select this if flag is 0)
    ;; 11111110   (this is flag)
    (i64x2.relaxed_laneselect)
    ;; either
    ;; 00000001   (normal bitwise select)
    ;; 00000000   (select first entirely)
  )
)
(assert_return
  (invoke "f")
  (v128.const i64x2 1 0)
)
```
