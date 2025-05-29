# Bugs of jsc found by bottom-up west

* runtime info
    - commit: 9d02067f5de4b0402f58d6c83039e206439a8a8c
    - system: Ubuntu 20.04.6 LTS, x86\_64

## 1-1,2,3. array.new\_[data/elem/fixed] after return [JSC-01]

`return` followed by `array.return` results in a invalid module (despite being valid)

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 351, ... / 552, ...
* [minimal1](return_array.new_data.wat) [minimal2](return_array.new_elem.wat)

```wat
;; return_array.new_data.wat
(module
  (type $t (array i32))
  (data $d)

  (func
    (return)
    (array.new_data $t $d)
    (drop)
  )
)
```
```wat
;; return_array.new_elem.wat
(module
  (type $t (array funcref))
  (elem $e funcref)

  (func
    (return)
    (array.new_elem $t $e)
    (drop)
  )
)
```
```wat
;; return_array.new_fixed.wast
(module
  (type $t (array i32))

  (func
    (return)
    (array.new_fixed $t 0)
    (drop)
  )
)
```

## 1-4,5. any.convert\_extern, extern.convert\_any after return [JSC-01]

Similar to 1

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 366, ... / 6021, ...
* [minimal1](return_any.convert_extern.wat), [minimal2](return_extern.convert_any.wat)
```wat
;; return_any.convert_extern.wat
(module
  (func
    (return)
    (any.convert_extern)
    (drop)
  )
)
```
```wat
;; return_extern.convert_any.wat
(module
  (func
    (return)
    (extern.convert_any)
    (drop)
  )
)
```

## 1-6,7. br\_on\_cast after return [JSC-01]

Similar to 1.
(or br\_on\_cast\_fail)

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 2035, 2642, 2813, ...
* [minimal](return_br_on_cast.wat)
```wat
(module
  (func
    (block
      (result i31ref)
      (unreachable)
      (br_on_cast 0 i31ref i31ref)
    )
    (drop)
  )
)
```

## 2. ref.null (tidx >= 2) after return [JSC-02]

Similar to 1.
ref.null with tidx >= 2 is requried.

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 6a6ca2ed9244157043cc1afa9a0937890295f9c1
    - seed: 1042158
* [minimal](return_ref.null.wat)
```wat
(module
  (type $0 (func))
  (type $1 (func))
  (type $2 (func))
  (func
    (return)
    (ref.null $2)
    (drop)
  )
)
```

## 3. (dummy to match tag number and markdown number)

## 4. Getting v128 field from null struct/array results in runtime crash [JSC-04]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 32, 143, ... / 883, ...
* [minimal1](null_struct.get_v128.wast), [minimal2](null_array.get_v128.wast)
```wast
(module
  (type $t (struct (field v128)))
  (func (export "f") (result v128)
    (ref.null $t)
    (struct.get $t 0)
  )
)
(assert_trap (invoke "f") "")
```
```wast
(module
  (type $t (array v128))
  (func (export "f") (result v128)
    (ref.null $t)
    (i32.const 0)
    (array.get $t)
  )
)
(assert_trap (invoke "f") "")
```

## 5. as\_non\_null + throw\_ref [JSC-05]

(Root cause: throw\_ref with non-null reference)

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 32, 143, ... / 883, ...
* [minimal](as_non_null_throw_ref.wat)

```wat
(module
  (func
    (ref.null exn)
    (ref.as_non_null)
    (throw_ref)
  )
)
```

## 6-1. Using large i31 ref with v128 parameter together results in executing unreachable code [JSC-06]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 7940, 10419, 14570, 18145, ...
* [minimal](large_i31_ref_v128_param.wast)

```wast
(module
  (func (export "f")
    (param v128)
    (result i32)

    (ref.i31 (i32.const 0x40000000))
    (call $cmp)
  )

  (func $cmp
    (param i31ref)
    (result i32)

    (ref.eq
      (local.get 0)
      (ref.i31 (i32.const 0x40000000))
    )
  )
)
(assert_return
  (invoke "f" (v128.const i32x4 0 0 0 0))
  (i32.const 1)
)
```

## 6-2. Using large i31 ref with v128 parameter together results in wrong comparison result

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 11582, 18694, ...
* [minimal](wrap_large_i31_ref_v128_param.wast)

```wast
(module
  (func $f
    (param v128)
    (result i32)

    (ref.i31 (i32.const 0x40000000))
    (call $cmp)
  )

  (func $cmp
    (param i31ref)
    (result i32)

    (ref.eq
      (local.get 0)
      (ref.i31 (i32.const 0x40000000))
    )
  )

  (func (export "wrapper")
    (result i32)

    (v128.const i32x4 0 0 0 0)
    (call $f)
  )
)
(assert_return
  (invoke "wrapper")
  (i32.const 1)
)
```



## 6. relaxed SIMD does not work, despite turning on the flag `--useWasmRelaxedSIMD=true`

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - approach: bottom-up
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 77, 877, ...



## 7-1,2. Using v128 as local/param, block instructions, and throw\_ref results in runtime crash [JSC-07]

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 75957, ...
    /
    - commit: 68d32ef3f3180d0579abd91b99828cfb53053e22
    - seed: 32134, ...

* [minimal](v128_local_block_throw_ref.wast)
```wast
(module
  (type $t (func (result (ref null exn))))
  (func (export "f")
    (local v128)
    (block (type $t)
      (ref.null exn)
      (ref.as_non_null)
    )
    (throw_ref)
  )
)
(assert_trap (invoke "f") "")
```

## 7-3. Using v128 as result, block instructions, and throw\_ref results in runtime crash

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 76963, ...
* [minimal](v128_result_block_throw_ref.wast)
```wast
TODO
```

## X. Executing unreachable code on asserting arithmetic nans

* fuzzer info
    - command: ./watsup spec/wasm-jsc/*.watsup --test --test:target jsc --test:approach bottom-up
    - commit: 58efbe27fcd4c92d1f29690f4ec7f63c4ac35750
    - seed: 51730, 95782, ...
* [minimal](assert_arith_nan_unreachable.wast)
```wast
(module
  (func (export "f") (result f32)
    (f32.const -nan:0x40_0001)
    (f32.const nan:0x40_0001)
    (f32.add)
  )
)
(assert_return
  (invoke "f0")
  (f32.const nan:0x40_0001)
)
```
