(module
  (type $t (array i32))
  (data $d)

  (func
    (return)
    (array.new_data $t $d)
    (drop)
  )
)
