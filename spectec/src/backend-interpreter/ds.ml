open Al
open Ast
open Al_util
open Print
open Util
open Source


(* Map *)

module InfoMap = Map.Make (Int)
module Env = Map.Make (String)
module Map = Map.Make (String)


(* Program *)

type rule_map = algorithm Map.t
type func_map = algorithm Map.t

let rule_map: rule_map ref = ref Map.empty
let func_map: func_map ref = ref Map.empty

let to_map algos =
  let f acc algo =
    let rmap, fmap = acc in
    match algo.it with
    | RuleA (atom, _, _, _) ->
        let name = Print.string_of_atom atom in
        Map.add name algo rmap, fmap
    | FuncA (name, _, _) -> rmap, Map.add name algo fmap
  in
  List.fold_left f (Map.empty, Map.empty) algos

let bound_rule name = Map.mem name !rule_map
let bound_func name = Map.mem name !func_map

let lookup_algo name =
  if bound_rule name then
    Map.find name !rule_map
  else if bound_func name then
    Map.find name !func_map
  else failwith ("Algorithm not found: " ^ name)


(* Store *)

module Store = struct
  let store = ref Record.empty

  let init () =
    store :=
      Record.empty
      |> Record.add "FUNCS" (listV [||])
      |> Record.add "GLOBALS" (listV [||])
      |> Record.add "TABLES" (listV [||])
      |> Record.add "MEMS" (listV [||])
      |> Record.add "TAGS" (listV [||])
      |> Record.add "ELEMS" (listV [||])
      |> Record.add "DATAS" (listV [||])
      |> Record.add "STRUCTS" (listV [||])
      |> Record.add "ARRAYS" (listV [||])
      |> Record.add "EXNS" (listV [||])

  let get () = strV !store

  let access field = Record.find field !store

  let set store_ = store := unwrap_strv store_
end


(* Environment *)

type env = value Env.t

let string_of_env env =
  "\n{" ^
  Print.string_of_list
    (fun (k, v) ->
      k ^ ": " ^ Print.string_of_value v)
    ",\n  "
    (Env.bindings env) ^
  "\n}"

let lookup_env key env =
  try Env.find key env
  with Not_found ->
    let freeVar s = Exception.FreeVar s in
    env
    |> string_of_env
    |> Printf.sprintf "The key '%s' is not in the map: %s.\n%!" key
    |> freeVar
    |> raise

let lookup_env_opt key env = Env.find_opt key env

(* Info *)

module Info = struct
  type info = { algo_name: string; instr: instr; mutable covered: bool }
  let info_map : info InfoMap.t ref = ref InfoMap.empty

  let make_info algo_name instr =
    { algo_name; instr; covered = false }

  let rec partition_by_algo info_map =
    match InfoMap.choose_opt info_map with
    | None -> []
    | Some (_, info) ->
      let f _ v = v.algo_name = info.algo_name in
      let im1, im2 = InfoMap.partition f info_map in
      im1 :: partition_by_algo im2

  let print im =
    partition_by_algo im
    |> List.iter
      (fun im ->
        let _, v = InfoMap.choose im in
        Printf.printf "\n[%s]\n" v.algo_name;
        InfoMap.iter
          (fun _ v' ->
            Al.Print.string_of_instr v'.instr
            |> print_endline)
          im)

  let get_coverage () = InfoMap.(cardinal (filter (fun _ v -> v.covered) !info_map), cardinal !info_map)

  let print_all () = print !info_map
  let print_uncovered () =
    print (InfoMap.filter (fun _ v -> not v.covered) !info_map);
    let covered, total = get_coverage () in
    print_endline @@ Printf.sprintf "Covered: %d/%d" covered total;
    print_endline @@ Printf.sprintf "Uncovered: %d/%d" (total - covered) total

  let add k i = info_map := InfoMap.add k i !info_map

  let find k = InfoMap.find k !info_map

  let init () = InfoMap.iter (fun _ info -> info.covered <- false) !info_map
end


(* Register *)

module Register = struct
  let _register : value Map.t ref = ref Map.empty
  let _latest = ""

  let add name moduleinst = _register := Map.add name moduleinst !_register

  let add_with_var var moduleinst =
    let open Reference_interpreter.Source in
    add _latest moduleinst;
    match var with
    | Some name -> add name.it moduleinst
    | _ -> ()

  exception ModuleNotFound of string

  let find name =
    match Map.find_opt name !_register with
    | Some x -> x
    | None -> raise @@ ModuleNotFound name

  let get_module_name var =
    let open Reference_interpreter.Source in
    match var with
    | Some name -> name.it
    | None -> _latest

  let init () = _register := Map.empty
end


module Modules = struct
  let _register : Reference_interpreter.Ast.module_ Map.t ref = ref Map.empty
  let _latest = ""

  let add name module_ = _register := Map.add name module_ !_register

  let add_with_var var module_ =
    let open Reference_interpreter.Source in
    add _latest module_;
    match var with
    | Some name -> add name.it module_
    | _ -> ()

  let find name = Map.find name !_register

  let get_module_name var =
    let open Reference_interpreter.Source in
    match var with
    | Some name -> name.it
    | None -> _latest
end


(* AL Context *)

module AlContext = struct
  type mode =
    (* Al context *)
    | Al of string * arg list * instr list * env
    (* Wasm context *)
    | Wasm of int
    (* Special context for enter/execute *)
    | Enter of string * instr list * env
    | Execute of value
    (* Return register *)
    | Return of value

  let al (name, args, il, env) = Al (name, args, il, env)
  let wasm n = Wasm n
  let enter (name, il, env) = Enter (name, il, env)
  let execute v = Execute v
  let return v = Return v

  type t = mode list

  let string_of_context = function
    | Al (s, args, il, _) ->
      Printf.sprintf "Al %s (%s):%s"
        s
        (args |> List.map string_of_arg |> String.concat ", ")
        (string_of_instrs il)
    | Wasm i -> "Wasm " ^ string_of_int i
    | Enter (s, il, _) ->
      Printf.sprintf "Enter %s:%s" s (string_of_instrs il)
    | Execute v -> "Execute " ^ string_of_value v
    | Return v -> "Return " ^ string_of_value v

  let tl = List.tl

  let is_reducible = function
    | [] | [ Return _ ] -> false
    | _ -> true

  let can_tail_call instr =
    match instr.it with
    | IfI _ | EitherI _ | PopI _ | LetI _ | ReturnI _ -> false
    | _ -> true

  let get_name ctx =
    match ctx with
    | [] -> ""
    | Al (name, _, _, _) :: _ -> name
    | Wasm _ :: _ -> "Wasm"
    | Execute _ :: _ -> "Execute"
    | Enter _ :: _ -> "Enter"
    | Return _ :: _ -> "Return"

  let add_instrs il = function
    | Al (name, args, il', env) :: t -> Al (name, args, il @ il', env) :: t
    | Enter (name, il', env) :: t -> Enter (name, il @ il', env) :: t
    | _ -> failwith "Not in AL context"

  let get_env = function
    | Al (_, _, _, env) :: _ -> env
    | Enter (_, _, env) :: _ -> env
    | _ -> failwith "Not in AL context"

  let set_env env = function
    | Al (name, args, il, _) :: t -> Al (name, args, il, env) :: t
    | Enter (name, il, _) :: t -> Enter (name, il, env) :: t
    | _ -> failwith "Not in AL context"

  let update_env k v = function
    | Al (name, args, il, env) :: t -> Al (name, args, il, Env.add k v env) :: t
    | Enter (name, il, env) :: t -> Enter (name, il, Env.add k v env) :: t
    | _ -> failwith "Not in AL context"

  let get_return_value = function
    | [ Return v ] -> Some v
    | [] -> None
    | _ -> failwith "AL context not in return"

  let rec decrease_depth = function
    | Wasm 1 :: t -> t
    | Wasm n :: t -> Wasm (n - 1) :: t
    | Al _ as mode :: t -> mode :: decrease_depth t
    | _ -> failwith "Not in AL or Wasm context"
end


(* Wasm Context *)

module WasmContext = struct
  type t = value * value list * value list

  let top_level_context = TextV "TopLevelContext", [], []
  let context_stack: t list ref = ref [top_level_context]
  let context_stack_length = ref 1

  let get_context () =
    match !context_stack with
    | h :: _ -> h
    | _ -> failwith "Wasm context stack underflow"

  let init_context () =
    context_stack := [top_level_context];
    context_stack_length := 1

  let push_context ctx =
    context_stack := ctx :: !context_stack;
    context_stack_length := !context_stack_length + 1;
    if !context_stack_length > 1024 then
      raise Exception.Exhaustion

  let pop_context () =
    match !context_stack with
    | h :: t -> context_stack := t; context_stack_length := !context_stack_length - 1; h
    | _ -> failwith "Wasm context stack underflow"

  (* Print *)

  let string_of_context ctx =
    let v, vs, vs_instr = ctx in
    (* TODO: Generalize context *)
    let ctx_kind =
      match v with
      | TextV s -> s
      | _ -> Printf.sprintf "Unknown_context: %s" (string_of_value v)
    in
    Printf.sprintf "(%s; %s; %s)"
      ctx_kind
      (string_of_list string_of_value ", " vs)
      (string_of_list string_of_value ", " vs_instr)

  let string_of_context_stack () =
    !context_stack
    |> List.map string_of_context
    |> String.concat "\n"

  (* Context *)

  let get_value_with_condition f =
    match List.find_opt (fun (v, _, _) -> f v) !context_stack with
    | Some (v, _, _) -> v
    | None -> failwith "Wasm context stack underflow"

  let get_top_context () =
    let ctx, _, _ = get_context () in
    ctx

  let get_current_context typ =
    let match_context = function
      | CaseV (t, _) when t = typ -> true
      | _ -> false
    in get_value_with_condition match_context

  let get_module_instance () =
    match get_current_context "FRAME_" with
    | CaseV (_, [_; mm]) -> mm
    | _ -> failwith "Invalid frame"

  (* Value stack *)

  let is_value = function
    | CaseV ("CONST", _) -> true
    | CaseV ("VCONST", _) -> true
    | CaseV (ref, _)
      when String.starts_with ~prefix:"REF." ref -> true
    | _ -> false

  let get_value_stack () =
    let _, vs, _ = get_context () in
    vs

  let pop_value_stack () =
    let v, vs, ws = pop_context () in
    push_context (v, [], ws);
    vs

  let push_value v =
    let v_ctx, vs, vs_instr = pop_context () in
    if is_value v then
      push_context (v_ctx, v :: vs, vs_instr)
    else
      string_of_value v
      |> Printf.sprintf "%s is not a Wasm value"
      |> failwith

  let pop_value () =
    let v_ctx, vs, vs_instr = pop_context () in
    match vs with
    | h :: t -> push_context (v_ctx, t, vs_instr); h
    | _ -> failwith "Wasm value stack underflow"

  (* Instr stack *)

  let pop_instr () =
    let v_ctx, vs, vs_instr = pop_context () in
    match vs_instr with
    | h :: t -> push_context (v_ctx, vs, t); h
    | _ -> failwith "Wasm instr stack underflow"
end


(* Initialization *)

let init algos =

  (* Initialize info_map *)
  let init_info algo =
    let algo_name = name_of_algo algo in
    let pre_instr = (fun i ->
      let info = Info.make_info algo_name i in
      Info.add i.note info;
      [i])
    in
    let walk_instr walker instr =
      let instr1 = pre_instr instr in
      List.concat_map (Al.Walk.base_walker.walk_instr walker) instr1
    in
    let walker = { Walk.base_walker with
      walk_instr = walk_instr;
    }
    in
    walker.walk_algo walker algo
  in
  List.map init_info algos |> ignore;

  (* Initialize algo_map *)

  let rmap, fmap = to_map algos in
  rule_map := rmap;
  func_map := fmap;

  (* Initialize store *)
  Store.init ()
