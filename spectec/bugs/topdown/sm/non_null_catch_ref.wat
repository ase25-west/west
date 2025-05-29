(module
  (type $ft (func))
  (tag $tag (type $ft))
  (func
    (param (ref exn))
    (result (ref exn))

    (try_table
      (catch_ref $tag 0)
    )

    (local.get 0)
  )
)
