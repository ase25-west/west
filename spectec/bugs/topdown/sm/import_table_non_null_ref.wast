(module
  (table (export "t") 0 0 (ref any)
    (i32.const 0) (ref.i31)
  )
)
(register "M")
(module
  (import "M" "t" (table 0 0 (ref any)))
)
