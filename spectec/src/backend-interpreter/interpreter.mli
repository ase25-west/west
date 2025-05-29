open Al.Ast

val eval_expr: Ds.env -> expr -> value

val instantiate: value list -> value
val invoke: value list -> value

val set_timeout: float option -> unit
val set_step_limit: int option -> unit
