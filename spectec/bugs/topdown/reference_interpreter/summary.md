# Bugs of reference interpreter error found by top-down west

## 1. Missing const instructions
`any.convert_extern` and `extern.convert_any` are constant instructions according to the spec,
but the validation code does not consider it as valid.

* fuzzer info
    - commit: 7182be20780e8b2aca7f8009747252ecfcb0813f
    - seed: 27, ...
* [minimal](const.wast)
```wat
(module
  (global externref (ref.null any) (extern.convert_any))
  (global anyref (ref.null extern) (any.convert_extern))
)
```
* Status: [Reported and Fixed](https://github.com/WebAssembly/spec/issues/1889)

## 2. Signature mismatch when using float type appears as subtype

* fuzzer info
    - commit: 8edfccf4702452cbfe4eef530bbe7a6d52364321
    - seed: 1, 6, 8, ...
* [minimal](float_signature_mismatch.wast)
```wast
(module
  (type $t (sub (func (result f32)))) ;; sub is important
  (func (export "f") (type $t) (f32.const 0))
)
(assert_return (invoke "f") (f32.const 0))
```
* Status: [Reported](https://github.com/WebAssembly/spec/issues/1902) and [Fixed](https://github.com/WebAssembly/spec/pull/1903)
