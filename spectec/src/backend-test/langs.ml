let el: El.Ast.script ref = ref []
let il: Il.Ast.script ref = ref []
let al: Al.Ast.script ref = ref []

let orig_il: Il.Ast.script ref = ref []

let el_env: Frontend.Elab.env option ref = ref None
let il_env: Il.Env.t ref = ref Il.Env.empty
