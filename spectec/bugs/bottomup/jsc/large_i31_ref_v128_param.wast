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
