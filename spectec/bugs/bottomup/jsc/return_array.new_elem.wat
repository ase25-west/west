(module
  (type $t (array funcref))
  (elem $e funcref)

  (func
    (return)
    (array.new_elem $t $e)
    (drop)
  )
)
