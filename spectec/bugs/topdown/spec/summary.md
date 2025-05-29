# Bugs of spec error found by top-down west

## 1. Incorrect Syntax Condtion

Following is the syntax of the Wasm instruction `VEXTRACT_LANE`:
```
| VEXTRACT_LANE shape sx? laneidx
    -- if sx? = eps <=> $lanetype(shape) = numtype
```

The intention of the premise here is that:

* If the shape is either `I8 X 16` or `I16 X 8` (packtype), then `sx?` must be present.
* If the shape is either `I32 X 4` or `I64 X 2` (numtype) then `sx?` must be absent.

However, the variable `numtype` is free variable in this example, and can be instantiated with any numtype.
This means that the current rule allows `sx?` to be present with any `numtype` by making the premise true,
simply by instantiating the vairable `numtype` with any different numtype.

* fuzzer info
    - approach: top-down
    - commit: e37e3683de080ad5bbf08225ec00bd47faf0ca7a
    - seed: 45, 49, ...
* Status: [Reported & Fixed](https://github.com/Wasm-DSL/spectec/issues/157)

## 1. Incorrect Syntax Condtion (VCVTOP, EXTEND)

Following is the syntax of the Wasm instruction `VCVTOP`:
```
| VCVTOP shape_1 shape_2 vcvtop__(shape_2, shape_1) half__(shape_2, shape_1)? zero__(shape_2, shape_1)?
```

There should be a depenncy between the variable `vcvtop__` and `half__`.
If vcvtop is `EXTEND`, then `half` must be present.
However, this dependency is not demonstrated in spec,
resulting in generation of syntactically incorrect instrution.

* fuzzer info
    - approach: top-down, --test:disable-exn
    - commit: dda2c44a4bbca83d3bf95ed9b7f78f22d6337abc
    - seed: 486, ...
* Status: [Reported](https://github.com/Wasm-DSL/spectec/issues/163)

## 2. Incorrect Syntax Condtion (VCVTOP, TRUNC\_SAT)
Similarly to 1, if vcvtop is `TRUNC_SAT`, then `zero` must be present.

* fuzzer info
    - approach: top-down, --test:disable-exn
    - commit: 42708bf3558825ffb68d1e875113f07191beb56c
    - seed: 287, ...
* Status: [Reported](https://github.com/Wasm-DSL/spectec/issues/163)

## 3. Incorrect Syntax Condtion (VCVTOP, DEMOTE)
Similarly to 1, if vcvtop is `DEMOTE`, then `zero` must be present.

* fuzzer info
    - approach: top-down, --test:disable-exn
    - commit: 42708bf3558825ffb68d1e875113f07191beb56c
    - seed: 3469, ...
* Status: [Reported](https://github.com/Wasm-DSL/spectec/issues/163)

## 4. Incorrect Syntax: VLOADOP, SHAPE
64x1 should be permitted

* fuzzer info
    - approach: --test:approach top-down, --test:module-num 2
    - commit: 3b0da81c46bb2b07adc4c97afe9daff6de5a2d4c
    - seed: 0, 13, ...
* Status: Not Reported
