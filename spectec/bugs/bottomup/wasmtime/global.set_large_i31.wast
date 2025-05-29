(module
  (global $g (mut anyref) ;; or eqref
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
  )
  (func (export "f")
    ;;(i32.const 262135)
    (i32.const 262136)
    (ref.i31)
    (global.set $g)
  )
)
(assert_return (invoke "f"))
