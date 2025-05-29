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
