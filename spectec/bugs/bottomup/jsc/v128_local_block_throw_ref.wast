;; results in runtime crash

(module
  (type $t (func (result (ref null exn))))
  (func (export "f")
    (local v128)
    (block (type $t)
      (ref.null exn)
      (ref.as_non_null)
    )
    (throw_ref)
  )
)
(assert_trap (invoke "f") "")
