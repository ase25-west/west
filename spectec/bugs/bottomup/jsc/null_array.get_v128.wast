(module
  (type $t (array v128))
  (func (export "f") (result v128)
    (ref.null $t)
    (i32.const 0)
    (array.get $t)
  )
)
(assert_trap (invoke "f") "")
