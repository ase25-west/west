(module
  (type $t (sub (func (result f32)))) ;; sub is important
  (func (export "f") (type $t) (f32.const 0))
)
(assert_return (invoke "f") (f32.const 0))
