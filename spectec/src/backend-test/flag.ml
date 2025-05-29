let out = ref "out"
let n = ref 1
let time = ref (-1)
let seed = ref 0
let log = ref 3
let swarm = ref false
let clean = ref false
type approach = TopDown | BottomUp | Hybrid
let approach = ref Hybrid
let set_approach = function
  | "top-down"  -> approach := TopDown
  | "bottom-up" -> approach := BottomUp
  | "hybrid" -> approach := Hybrid
  | s -> failwith @@ "Unknown approach: " ^ s
let module_num = ref 1
let seeds = ref ""
let version = Backend_interpreter.Construct.version
let cov = ref false

type target =
  | Ref
  | Wasmtime
  | Wasmer
  | Wasmedge
  | Sm
  | V8
  | Jsc
let target = ref Ref
let set_target = function
  | "ref"      -> target := Ref
  | "wasmtime" -> target := Wasmtime
  | "wasmer"   -> target := Wasmer
  | "wasmedge" -> target := Wasmedge
  | "sm"       -> target := Sm
  | "v8"       -> target := V8
  | "jsc"      -> target := Jsc
  | s          -> failwith @@ "Unknown target: " ^ s

let cur_seed = ref 0
