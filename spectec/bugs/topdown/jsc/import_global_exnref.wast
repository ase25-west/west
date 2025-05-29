(module
  (global (export "g") (ref null exn) (ref.null exn))
)
(register "M")
(module
  (import "M" "g" (global (ref null exn)))
)
