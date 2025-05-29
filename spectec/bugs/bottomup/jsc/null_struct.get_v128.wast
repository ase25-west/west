(module
  (type $t (struct (field v128)))
  (func (export "f") (result v128)
    (ref.null $t)
    (struct.get $t 0)
  )
)
(assert_trap (invoke "f") "")
