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
