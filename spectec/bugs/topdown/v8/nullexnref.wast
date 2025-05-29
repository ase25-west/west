(module
  (func (export "f") (result nullexnref)
    unreachable
  )
)
(assert_trap (invoke "f") "")
